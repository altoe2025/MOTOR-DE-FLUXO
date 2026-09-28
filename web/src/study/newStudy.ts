import type { ApiClient, PreparationRequest } from '../api/client';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { combineObservedCases } from '../levers/companies';
import { periodCovering } from '../levers/leverScenario';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { createStudy, updateScenario } from './domain';
import type { CostPremises, IdFactory, PeriodDocument, PortfolioSourceSnapshot, ScenarioDraft, StudyDocument } from './model';
import { DEFAULT_STUDY_NAME, suggestStudyName } from './naming';
import { requiredBuildSha } from './sourceConfiguration';
import { assertValidStudy } from './validation';

export const DEFAULT_COSTS: CostPremises = {
  iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '25',
  custo_fixo_remessa: '40', custo_oportunidade_aa: '0', ptax: '5.40', iof_por_finalidade: [],
};
const DEFAULT_PERIOD: PeriodDocument = { httpPeriod: { modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 30 } };

type NewStudyContext = Readonly<{ ownerSub: string; now: string; ids: IdFactory }>;

function costs(): CostPremises {
  return { ...DEFAULT_COSTS, iof_por_finalidade: DEFAULT_COSTS.iof_por_finalidade.map((item) => ({ ...item })) };
}

function horizonOf(snapshot: PortfolioSourceSnapshot): number {
  return snapshot.orders.length === 0 ? 1 : Math.max(...snapshot.orders.map((order) => order.dia_limite)) + 1;
}

async function studyFromSnapshot(snapshot: PortfolioSourceSnapshot, name: string, context: NewStudyContext & { studyId?: string; scenarioId?: string }): Promise<StudyDocument> {
  const baseScenario: ScenarioDraft = {
    id: context.scenarioId ?? context.ids(), revision: 1, name: 'Cenário base', sourceSnapshot: snapshot,
    premises: { costs: costs(), windowDays: 7 }, period: periodCovering(DEFAULT_PERIOD, horizonOf(snapshot)),
  };
  return createStudy({ id: context.studyId ?? context.ids(), ownerSub: context.ownerSub, name, baseScenario, now: context.now });
}

async function snapshotOfCases(cases: readonly ObservedCase[], companies: readonly CompanyRecord[], now: string, ids: IdFactory): Promise<PortfolioSourceSnapshot> {
  const dependencies = {
    getObservedCase: async (caseId: string) => cases.find((item) => item.id === caseId) ?? null,
    preparePortfolio: async () => { throw new Error('Dados importados não usam preparação.'); },
    now: () => now,
  };
  if (cases.length === 1) {
    const [only] = cases;
    return resolvePortfolioSource({ kind: 'OBSERVED_CASE', caseId: only!.id, caseRevision: only!.revision }, dependencies);
  }
  const { definition } = combineObservedCases(cases, companies);
  return resolvePortfolioSource({ kind: 'AUTHORED', authoredPortfolioId: ids(), definition }, dependencies);
}

/** Estudo com dados importados como origem: um caso, ou vários de empresas diferentes. Não chama a API. */
export async function studyFromObservedCases(
  cases: readonly ObservedCase[],
  context: NewStudyContext & Readonly<{ companies: readonly CompanyRecord[] }>,
): Promise<StudyDocument> {
  if (cases.length === 0) throw new Error('Escolha pelo menos um caso importado.');
  const snapshot = await snapshotOfCases(cases, context.companies, context.now, context.ids);
  return studyFromSnapshot(snapshot, suggestStudyName(cases, context.companies) ?? DEFAULT_STUDY_NAME, context);
}

/** Estudo com carteira gerada pelo exemplo sintético; é a única origem que depende da API. */
export async function syntheticStudy(api: ApiClient, context: NewStudyContext): Promise<StudyDocument> {
  if (api.preparePortfolio === undefined) throw new Error('A preparação de carteira não está disponível.');
  const studyId = context.ids(); const scenarioId = context.ids(); const participantId = context.ids();
  const participantPrefix = `/participants/${participantId}`;
  const sourcePaths = [
    '/warmup_days', '/measurement_days', '/window_days',
    '/costs/iof_out', '/costs/iof_in', '/costs/carry_cnr', '/costs/spread_rail_bps',
    '/costs/custo_fixo_remessa', '/costs/custo_oportunidade_aa', '/costs/ptax',
    `${participantPrefix}/profile`, `${participantPrefix}/seed`,
    `${participantPrefix}/monthly_volume_brl`, `${participantPrefix}/ticket_median_brl`,
    `${participantPrefix}/out_fraction`, `${participantPrefix}/deadline/mode`,
    `${participantPrefix}/deadline/days`, `${participantPrefix}/eh_efx`,
    `${participantPrefix}/purpose_out`, `${participantPrefix}/purpose_in`,
  ];
  const preparation: PreparationRequest = {
    preparation_version: '1.0.0', request_id: context.ids(), study_id: studyId,
    scenario_id: scenarioId, scenario_revision: 1,
    expected_build_sha: requiredBuildSha(import.meta.env.VITE_MOTOR_BUILD_SHA, undefined),
    input: {
      participants: [{ id: participantId, profile: 'tesouraria_corporativa', monthly_volume_brl: '1000000', ticket_median_brl: '100000', out_fraction: '0.5', purpose_out: 'ANEXO_V_REMESSA_TERCEIRO', purpose_in: 'ANEXO_V_DISPONIBILIDADE', eh_efx: false, deadline: { mode: 'FIXED', days: 7 }, seed: '1' }],
      warmup_days: 0, measurement_days: 30, window_days: 7,
      costs: { ...DEFAULT_COSTS, iof_por_finalidade: DEFAULT_COSTS.iof_por_finalidade.map((item) => ({ ...item })) },
      sources: Object.fromEntries(sourcePaths.map((path) => [path, {
        kind: 'PADRAO_SINTETICO' as const,
        source: 'catálogo oficial de exemplos',
        recorded_at: context.now,
      }])),
    },
  };
  const snapshot = await resolvePortfolioSource({ kind: 'SYNTHETIC', exampleId: 'equilibrado', preparation }, { getObservedCase: async () => null, preparePortfolio: (input) => api.preparePortfolio!(input), now: () => context.now });
  const baseScenario: ScenarioDraft = { id: scenarioId, revision: 1, name: 'Cenário base', sourceSnapshot: snapshot, premises: { costs: costs(), windowDays: 7 }, period: DEFAULT_PERIOD };
  return createStudy({ id: studyId, ownerSub: context.ownerSub, name: DEFAULT_STUDY_NAME, baseScenario, now: context.now });
}

/** Caso observado sozinho não guarda a empresa no snapshot: `companyId` nulo, resolvido pela lista de casos. */
type CaseRef = Readonly<{ caseId: string; companyId: string | null }>;

/** Casos por trás do cenário original: um caso observado ou uma carteira que junta casos. */
function casesBehindStudy(study: StudyDocument): readonly CaseRef[] | null {
  const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId);
  const source = scenario?.sourceSnapshot.source;
  if (source?.kind === 'OBSERVED_CASE') return [{ caseId: source.caseId, companyId: null }];
  if (source?.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS' && source.definition.sourceCases !== undefined) {
    return source.definition.sourceCases.map((item) => ({ caseId: item.caseId, companyId: item.companyId }));
  }
  return null;
}

export type PortfolioCandidate = Readonly<{ study: StudyDocument; caseCount: number; blocked: string | null }>;

/**
 * Estudos que podem receber o caso: carteiras de empresas e estudos de um caso só.
 * `blocked` explica quando a carteira já tem um caso da mesma empresa.
 */
export function portfolioCandidates(
  studies: readonly StudyDocument[],
  observedCase: ObservedCase,
  companies: readonly CompanyRecord[] = [],
  cases: readonly ObservedCase[] = [],
): PortfolioCandidate[] {
  const companyName = companies.find((item) => item.id === observedCase.companyId)?.displayName ?? observedCase.companyId;
  return studies.flatMap((study) => {
    if (study.deletedAt !== null) return [];
    const refs = casesBehindStudy(study);
    if (refs === null) return [];
    const companiesInside = refs.map((ref) => ref.companyId ?? cases.find((item) => item.id === ref.caseId)?.companyId);
    const blocked = refs.some((ref) => ref.caseId === observedCase.id)
      ? 'já contém este caso'
      : companiesInside.includes(observedCase.companyId) ? `já tem um caso de ${companyName}` : null;
    return [{ study, caseCount: refs.length, blocked }];
  });
}

/**
 * Junta o caso ao cenário original do estudo (uma empresa por caso). Variações existentes
 * ficam como estavam; o diagnóstico do original precisa rodar de novo.
 */
export async function addCaseToPortfolio(
  study: StudyDocument,
  observedCase: ObservedCase,
  options: Readonly<{ cases: readonly ObservedCase[]; companies: readonly CompanyRecord[]; now: string; ids?: IdFactory }>,
): Promise<StudyDocument> {
  const refs = casesBehindStudy(study);
  if (refs === null) throw new Error('Este estudo não usa dados importados como origem.');
  const current = refs.map((ref) => {
    const found = options.cases.find((item) => item.id === ref.caseId);
    if (found === undefined) throw new Error('Um dos casos desta carteira não está mais neste navegador; recrie a carteira em Estudos.');
    return found;
  });
  if (current.some((item) => item.companyId === observedCase.companyId)) {
    throw new Error('A carteira já tem um caso desta empresa. Use uma carteira sem ela ou crie um estudo novo.');
  }
  const next = [...current, observedCase];
  const snapshot = await snapshotOfCases(next, options.companies, options.now, options.ids ?? (() => crypto.randomUUID()));
  const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId)!;
  const updated = await updateScenario(study, scenario.id, { sourceSnapshot: snapshot, period: periodCovering(scenario.period, horizonOf(snapshot)) }, options.now);
  // Nome ainda sugerido pela origem acompanha a carteira; nome escolhido pela pessoa fica.
  const suggested = [DEFAULT_STUDY_NAME, suggestStudyName(current, options.companies)];
  if (!suggested.includes(study.name)) return updated;
  const renamed = { ...structuredClone(updated), name: suggestStudyName(next, options.companies) ?? study.name } as StudyDocument;
  await assertValidStudy(renamed);
  return renamed;
}
