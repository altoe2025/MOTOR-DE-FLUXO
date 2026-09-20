import Decimal from 'decimal.js';
import { useMemo, useState } from 'react';

import type { PreparationRequest } from '../../api/client';
import type { CompanyRecord, FieldProvenance, ObservedCase } from '../../cases/domain';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { authoredDefinitionFromObservedCase } from '../../preparation/resolvePortfolioSource';
import type {
  AuthoredGroup,
  AuthoredParameters,
  AuthoredPortfolioDefinition,
  ScenarioDocument,
  StudyDocument,
} from '../model';
import { requiredBuildSha } from '../sourceConfiguration';

export type PortfolioSourceKind = 'SYNTHETIC' | 'AUTHORED' | 'OBSERVED_CASE';
export type PortfolioSourceDraft =
  | Readonly<{ kind: 'SYNTHETIC'; exampleId: string; preparation: PreparationRequest }>
  | Readonly<{
      kind: 'AUTHORED';
      authoredPortfolioId: string;
      definition: AuthoredPortfolioDefinition;
      preparation?: PreparationRequest;
    }>
  | Readonly<{ kind: 'OBSERVED_CASE'; caseId: string; caseRevision: number }>;

type Direction = 'OUT' | 'IN' | 'MIXED';
type Profile = PreparationRequest['input']['participants'][number]['profile'];
type Parameters = AuthoredParameters;
type Participant = AuthoredGroup['participants'][number];
type Group = AuthoredGroup;

const PURPOSE_OUT = 'ANEXO_V_REMESSA_TERCEIRO';
const PURPOSE_IN = 'ANEXO_V_DISPONIBILIDADE';
const DEFAULTS: Parameters = {
  frequency: '10', ticket: '100000', direction: 'MIXED', deadline: '7',
  purpose: PURPOSE_OUT, profile: 'tesouraria_corporativa',
};

const EXAMPLES: readonly { id: string; label: string; parameters: Parameters }[] = [
  { id: 'equilibrado', label: 'Mix equilibrado', parameters: DEFAULTS },
  { id: 'outbound-massivo', label: 'Remessas outbound', parameters: { ...DEFAULTS, direction: 'OUT', profile: 'remessa_outbound_massiva', frequency: '40', ticket: '25000' } },
  { id: 'psp-inbound', label: 'PSP inbound', parameters: { ...DEFAULTS, direction: 'IN', profile: 'psp_inbound', frequency: '60', ticket: '18000', purpose: PURPOSE_IN } },
  { id: 'exportadores', label: 'Exportadores', parameters: { ...DEFAULTS, direction: 'IN', profile: 'exportador', frequency: '8', ticket: '150000', purpose: PURPOSE_IN } },
  { id: 'tesourarias', label: 'Tesourarias corporativas', parameters: { ...DEFAULTS, profile: 'tesouraria_corporativa', frequency: '16', ticket: '90000' } },
];

function uuid(): string { return crypto.randomUUID(); }
function expectedBuildSha(scenario: ScenarioDocument): string {
  const recipeSha = scenario.sourceSnapshot.source.kind === 'SYNTHETIC'
    ? scenario.sourceSnapshot.source.recipe.motorBuildSha
    : undefined;
  return requiredBuildSha(import.meta.env.VITE_MOTOR_BUILD_SHA, recipeSha);
}
function participant(parameters = DEFAULTS): Participant {
  return { id: uuid(), name: 'Participante 1', override: false, parameters: { ...parameters } };
}
function group(): Group {
  return { id: uuid(), name: 'Grupo 1', parameters: { ...DEFAULTS }, participants: [participant()] };
}

function decimal(text: string, label: string, allowZero = false): Decimal {
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(`${label}: Use ponto como separador decimal.`);
  const value = new Decimal(text);
  if (!value.isFinite() || (allowZero ? value.isNegative() : !value.isPositive())) {
    throw new Error(`${label}: informe um número ${allowZero ? 'não negativo' : 'maior que zero'}.`);
  }
  return value;
}

function directionFraction(direction: Direction): string {
  if (direction === 'OUT') return '1';
  if (direction === 'IN') return '0';
  return '0.5';
}

function request(study: StudyDocument, scenario: ScenarioDocument, groups: readonly Group[], sourceKind: 'PADRAO_SINTETICO' | 'ESTIMATIVA_USUARIO'): PreparationRequest {
  const participants = groups.flatMap((item) => item.participants.map((member) => {
    const values = member.override ? member.parameters : item.parameters;
    const frequency = decimal(values.frequency, 'Frequência mensal');
    const ticket = decimal(values.ticket, 'Ticket médio');
    const deadline = decimal(values.deadline, 'Prazo', true);
    if (!deadline.isInteger()) throw new Error('Prazo: informe um número inteiro de dias.');
    return {
      id: member.id,
      profile: values.profile,
      monthly_volume_brl: frequency.times(ticket).toString(),
      ticket_median_brl: ticket.toString(),
      out_fraction: directionFraction(values.direction),
      purpose_out: values.direction === 'IN' ? PURPOSE_OUT : values.purpose,
      purpose_in: values.direction === 'OUT' ? PURPOSE_IN : values.purpose,
      eh_efx: false,
      deadline: { mode: 'FIXED' as const, days: deadline.toNumber() },
      seed: String(BigInt.asIntN(63, BigInt(`0x${member.id.replaceAll('-', '').slice(0, 15)}`))),
    };
  }));
  if (participants.length === 0) throw new Error('Inclua ao menos um participante.');
  const sourcePaths = [
    '/warmup_days', '/measurement_days', '/window_days',
    '/costs/iof_out', '/costs/iof_in', '/costs/carry_cnr', '/costs/spread_rail_bps',
    '/costs/custo_fixo_remessa', '/costs/custo_oportunidade_aa', '/costs/ptax',
    ...participants.flatMap((item) => {
      const prefix = `/participants/${item.id}`;
      return [
        `${prefix}/profile`, `${prefix}/seed`, `${prefix}/monthly_volume_brl`,
        `${prefix}/ticket_median_brl`, `${prefix}/out_fraction`, `${prefix}/deadline/mode`,
        `${prefix}/deadline/days`, `${prefix}/eh_efx`, `${prefix}/purpose_out`,
        `${prefix}/purpose_in`,
      ];
    }),
  ];
  const period = scenario.period.httpPeriod;
  const recordedAt = new Date().toISOString();
  return {
    preparation_version: '1.0.0', request_id: uuid(), study_id: study.id,
    scenario_id: scenario.id, scenario_revision: scenario.revision,
    expected_build_sha: expectedBuildSha(scenario),
    input: {
      participants,
      warmup_days: period.modo === 'NATURAL' ? period.dias_aquecimento : 0,
      measurement_days: period.modo === 'NATURAL' ? period.periodo_medicao_dias : ('executableHorizonDays' in scenario.period ? scenario.period.executableHorizonDays : 30),
      window_days: scenario.premises.windowDays,
      costs: { ...scenario.premises.costs, iof_por_finalidade: scenario.premises.costs.iof_por_finalidade.map((item) => ({ ...item })) },
      sources: Object.fromEntries(sourcePaths.map((path) => [path, {
        kind: sourceKind,
        source: sourceKind === 'PADRAO_SINTETICO'
          ? 'catálogo oficial de exemplos'
          : 'autoria manual no editor',
        recorded_at: recordedAt,
      }])),
    },
  };
}

function ParameterFields({ prefix, values, onChange }: { prefix: 'grupo' | 'participante'; values: Parameters; onChange(next: Parameters): void }) {
  const title = prefix === 'grupo' ? 'do grupo' : 'do participante';
  const set = <K extends keyof Parameters>(key: K, value: Parameters[K]) => onChange({ ...values, [key]: value });
  return <div className="parameter-grid">
    <TextField id={`${prefix}-frequency`} label={`Frequência mensal ${title}`} value={values.frequency} inputMode="decimal" onChange={(event) => set('frequency', event.currentTarget.value)} />
    <TextField id={`${prefix}-ticket`} label={`Ticket médio ${title}`} value={values.ticket} inputMode="decimal" onChange={(event) => set('ticket', event.currentTarget.value)} />
    <label>Direção {title}<select value={values.direction} onChange={(event) => set('direction', event.currentTarget.value as Direction)}><option value="MIXED">Mista</option><option value="OUT">OUT</option><option value="IN">IN</option></select></label>
    <TextField id={`${prefix}-deadline`} label={`Prazo em dias ${title}`} value={values.deadline} inputMode="numeric" onChange={(event) => set('deadline', event.currentTarget.value)} />
    <TextField id={`${prefix}-purpose`} label={`Finalidade ${title}`} value={values.purpose} onChange={(event) => set('purpose', event.currentTarget.value)} />
    <label>Perfil {title}<select value={values.profile} onChange={(event) => set('profile', event.currentTarget.value as Profile)}>{['remessa_outbound_massiva', 'psp_inbound', 'cripto_native_sem_fiat', 'payroll_fornecedor', 'exportador', 'tesouraria_corporativa'].map((value) => <option key={value}>{value}</option>)}</select></label>
  </div>;
}

function AuthoredForm({ study, scenario, initialGroups, onApply, onDirty }: { study: StudyDocument; scenario: ScenarioDocument; initialGroups?: readonly Group[]; onApply(source: PortfolioSourceDraft): void; onDirty(dirty: boolean): void }) {
  const [groups, setGroups] = useState<Group[]>(() => initialGroups === undefined
    ? [group()]
    : initialGroups.map((item) => structuredClone(item)));
  const [error, setError] = useState<string | null>(null);
  const changeGroup = (index: number, next: Group) => { setGroups((current) => current.map((item, position) => position === index ? next : item)); onDirty(true); };
  const submit = () => {
    try {
      const preparation = request(study, scenario, groups, 'ESTIMATIVA_USUARIO');
      setError(null); onDirty(false);
      onApply({
        kind: 'AUTHORED',
        authoredPortfolioId: uuid(),
        definition: { kind: 'PARAMETRIC', groups: structuredClone(groups) },
        preparation,
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Autoria manual inválida.'); }
  };
  return <section className="source-panel"><h2>Carteira manual</h2>{error ? <p role="alert" className="field-error">{error}</p> : null}{groups.map((item, groupIndex) => <fieldset key={item.id} className="authoring-group"><legend>Grupo {groupIndex + 1}</legend><TextField id={`group-name-${item.id}`} label="Nome do grupo" value={item.name} onChange={(event) => changeGroup(groupIndex, { ...item, name: event.currentTarget.value })} /><ParameterFields prefix="grupo" values={item.parameters} onChange={(parameters) => changeGroup(groupIndex, { ...item, parameters })} />{item.participants.map((member, participantIndex) => <fieldset key={member.id} className="authoring-participant"><legend>{member.name}</legend><label><input type="checkbox" checked={member.override} onChange={(event) => changeGroup(groupIndex, { ...item, participants: item.participants.map((candidate, position) => position === participantIndex ? { ...candidate, override: event.currentTarget.checked, parameters: { ...item.parameters } } : candidate) })} /> Sobrescrever parâmetros do participante</label>{member.override ? <ParameterFields prefix="participante" values={member.parameters} onChange={(parameters) => changeGroup(groupIndex, { ...item, participants: item.participants.map((candidate, position) => position === participantIndex ? { ...candidate, parameters } : candidate) })} /> : <p className="field-hint">Frequência, ticket, direção, prazo, finalidade e perfil herdados do grupo.</p>}</fieldset>)}<Button variant="secondary" onClick={() => changeGroup(groupIndex, { ...item, participants: [...item.participants, participant(item.parameters)] })}>Adicionar participante</Button></fieldset>)}<div className="source-actions"><Button variant="secondary" onClick={() => { setGroups((current) => [...current, group()]); onDirty(true); }}>Adicionar grupo</Button><Button onClick={submit}>Preparar carteira manual</Button></div></section>;
}

function SyntheticForm({ study, scenario, initialExampleId, onApply }: { study: StudyDocument; scenario: ScenarioDocument; initialExampleId?: string; onApply(source: PortfolioSourceDraft): void }) {
  const [exampleId, setExampleId] = useState(initialExampleId ?? EXAMPLES[0]!.id);
  return <section className="source-panel"><h2>Exemplo sintético</h2><label htmlFor="synthetic-example">Escolha do exemplo sintético</label><select id="synthetic-example" value={exampleId} onChange={(event) => setExampleId(event.currentTarget.value)}>{EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.label}</option>)}</select><p className="field-hint">O exemplo é materializado pela preparação oficial; nenhuma ordem é fabricada no navegador.</p><Button onClick={() => { const example = EXAMPLES.find((item) => item.id === exampleId)!; const syntheticGroup = { ...group(), parameters: example.parameters, participants: [participant(example.parameters)] }; onApply({ kind: 'SYNTHETIC', exampleId, preparation: request(study, scenario, [syntheticGroup], 'PADRAO_SINTETICO') }); }}>Preparar exemplo</Button></section>;
}

function ExplicitOrdersForm({
  definition,
  authoredPortfolioId,
  onApply,
}: {
  definition: Extract<AuthoredPortfolioDefinition, { kind: 'EXPLICIT_ORDERS' }>;
  authoredPortfolioId: string;
  onApply(source: PortfolioSourceDraft): void;
}) {
  const [orders, setOrders] = useState(() => definition.orders.map((order) => structuredClone(order)));
  const [error, setError] = useState<string | null>(null);
  const change = (index: number, patch: Partial<(typeof orders)[number]>) => {
    setOrders((current) => current.map((order, position) => position === index
      ? { ...order, ...patch }
      : order));
  };
  const submit = () => {
    try {
      const actionId = uuid();
      const recordedAt = new Date().toISOString();
      const corrected = (): FieldProvenance => ({
        kind: 'USER_CORRECTED', source: 'autoria manual', version: '1.0.0',
        actionId, recordedAt,
      });
      const provenanceByOrder = Object.fromEntries(orders.map((order, index) => {
        const original = definition.orders[index];
        if (original === undefined) throw new Error(`Operação original ausente para ${order.id}.`);
        const provenance = definition.provenanceByOrder[original.id];
        if (provenance === undefined) throw new Error(`Proveniência ausente para ${order.id}.`);
        const next = { ...structuredClone(provenance) };
        if (order.id !== original.id) next.id = corrected();
        if (order.cliente_id !== original.cliente_id) next.cliente_id = corrected();
        if (order.direcao !== original.direcao) next.direcao = corrected();
        if (order.dia_conhecida !== original.dia_conhecida) next.dia_conhecida = corrected();
        if (order.dia_limite !== original.dia_limite) next.dia_limite = corrected();
        if (order.eh_efx !== original.eh_efx) next.eh_efx = corrected();
        if (order.finalidade !== original.finalidade) next.finalidade = corrected();
        if (order.valor_brl !== original.valor_brl) next.valor_brl = corrected();
        return [order.id, next];
      }));
      orders.forEach((order) => {
        decimal(order.valor_brl, `Valor BRL da operação ${order.id}`);
        if (!Number.isSafeInteger(order.dia_conhecida)
          || !Number.isSafeInteger(order.dia_limite)
          || order.dia_limite < order.dia_conhecida) {
          throw new Error(`Datas relativas inválidas para ${order.id}.`);
        }
      });
      setError(null);
      onApply({
        kind: 'AUTHORED',
        authoredPortfolioId,
        definition: {
          ...definition,
          orders: structuredClone(orders),
          provenanceByOrder,
        },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Operações explícitas inválidas.');
    }
  };
  return <section className="source-panel">
    <h2>Operações explícitas</h2>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    {orders.map((order, index) => <fieldset key={`${index}-${definition.orders[index]!.id}`} className="authoring-participant">
      <legend>Operação {index + 1}</legend>
      <TextField id={`explicit-id-${index}`} label={`ID da operação ${definition.orders[index]!.id}`} value={order.id} onChange={(event) => change(index, { id: event.currentTarget.value })} />
      <TextField id={`explicit-client-${index}`} label={`Cliente da operação ${definition.orders[index]!.id}`} value={order.cliente_id} onChange={(event) => change(index, { cliente_id: event.currentTarget.value })} />
      <label>Direção da operação {definition.orders[index]!.id}<select value={order.direcao} onChange={(event) => change(index, { direcao: event.currentTarget.value as 'OUT' | 'IN' })}><option value="OUT">OUT</option><option value="IN">IN</option></select></label>
      <TextField id={`explicit-known-${index}`} label={`Dia conhecido da operação ${definition.orders[index]!.id}`} value={String(order.dia_conhecida)} inputMode="numeric" onChange={(event) => change(index, { dia_conhecida: Number(event.currentTarget.value) })} />
      <TextField id={`explicit-deadline-${index}`} label={`Dia limite da operação ${definition.orders[index]!.id}`} value={String(order.dia_limite)} inputMode="numeric" onChange={(event) => change(index, { dia_limite: Number(event.currentTarget.value) })} />
      <TextField id={`explicit-value-${index}`} label={`Valor BRL da operação ${definition.orders[index]!.id}`} value={order.valor_brl} inputMode="decimal" onChange={(event) => change(index, { valor_brl: event.currentTarget.value })} />
      <TextField id={`explicit-purpose-${index}`} label={`Finalidade da operação ${definition.orders[index]!.id}`} value={order.finalidade} onChange={(event) => change(index, { finalidade: event.currentTarget.value })} />
      <label><input type="checkbox" checked={order.eh_efx} onChange={(event) => change(index, { eh_efx: event.currentTarget.checked })} /> EFX da operação {definition.orders[index]!.id}</label>
    </fieldset>)}
    <Button onClick={submit}>Salvar operações explícitas</Button>
  </section>;
}

function brlTotal(item: ObservedCase): string {
  return item.orders.reduce((total, order) => total.plus(order.valueBrl), new Decimal(0)).toString();
}

export type PortfolioSourceSelectorProps = Readonly<{
  value: PortfolioSourceKind; study: StudyDocument; scenario: ScenarioDocument;
  observedCases: readonly ObservedCase[]; companies: readonly CompanyRecord[]; selectedCaseId?: string;
  onChange(source: PortfolioSourceDraft): void; onConvertObserved(caseId: string): void;
}>;

export function PortfolioSourceSelector({ value, study, scenario, observedCases, companies, selectedCaseId, onChange, onConvertObserved: notifyConvertObserved }: PortfolioSourceSelectorProps) {
  const [draftKind, setDraftKind] = useState(value);
  const [authoredDirty, setAuthoredDirty] = useState(false);
  const [caseId, setCaseId] = useState(selectedCaseId ?? '');
  const [convertedExplicit, setConvertedExplicit] = useState<Extract<AuthoredPortfolioDefinition, { kind: 'EXPLICIT_ORDERS' }> | undefined>();
  const [conversionError, setConversionError] = useState<string | null>(null);
  const confirmed = useMemo(() => observedCases.filter((item) => item.status === 'CONFIRMED'), [observedCases]);
  const selected = confirmed.find((item) => item.id === caseId);
  const selectKind = (kind: PortfolioSourceKind) => {
    if (kind !== draftKind && authoredDirty && !window.confirm('Trocar a origem descarta a autoria manual não aplicada. Continuar?')) return;
    setAuthoredDirty(false); setDraftKind(kind);
  };
  const onConvertObserved = (id: string) => {
    const caseRecord = confirmed.find((item) => item.id === id);
    if (caseRecord === undefined) return;
    try {
      const converted = authoredDefinitionFromObservedCase(caseRecord);
      setConvertedExplicit(converted);
      setConversionError(null);
      notifyConvertObserved(id);
      setAuthoredDirty(false);
      setDraftKind('AUTHORED');
      onChange({
        kind: 'AUTHORED',
        authoredPortfolioId: uuid(),
        definition: converted,
      });
    } catch (reason) {
      setConversionError(reason instanceof Error ? reason.message : 'Não foi possível converter o caso observado.');
    }
  };
  const currentSource = scenario.sourceSnapshot.source;
  const persistedGroups = currentSource.kind === 'AUTHORED'
    && currentSource.definition?.kind === 'PARAMETRIC'
    ? currentSource.definition.groups
    : undefined;
  const initialGroups = persistedGroups;
  const explicit = convertedExplicit ?? (currentSource.kind === 'AUTHORED'
    && currentSource.definition?.kind === 'EXPLICIT_ORDERS'
    ? currentSource.definition
    : undefined);
  const authoredPortfolioId = currentSource.kind === 'AUTHORED'
    ? currentSource.authoredPortfolioId
    : uuid();
  return <fieldset className="source-selector"><legend>Origem da carteira</legend><div className="source-selector__choices" role="radiogroup" aria-label="Origem da carteira"><label><input type="radio" name="portfolio-source" checked={draftKind === 'SYNTHETIC'} onChange={() => selectKind('SYNTHETIC')} /> Exemplo sintético</label><label><input type="radio" name="portfolio-source" checked={draftKind === 'AUTHORED'} onChange={() => selectKind('AUTHORED')} /> Autoria manual</label><label><input type="radio" name="portfolio-source" checked={draftKind === 'OBSERVED_CASE'} onChange={() => selectKind('OBSERVED_CASE')} /> Caso observado</label></div>{draftKind === 'SYNTHETIC' ? <SyntheticForm study={study} scenario={scenario} {...(currentSource.kind === 'SYNTHETIC' ? { initialExampleId: currentSource.recipe.exampleId } : {})} onApply={onChange} /> : draftKind === 'AUTHORED' ? explicit === undefined ? <AuthoredForm study={study} scenario={scenario} {...(initialGroups === undefined ? {} : { initialGroups })} onApply={onChange} onDirty={setAuthoredDirty} /> : <ExplicitOrdersForm definition={explicit} authoredPortfolioId={authoredPortfolioId} onApply={onChange} /> : <section className="source-panel"><h2>Caso observado</h2>{conversionError ? <p role="alert" className="field-error">{conversionError}</p> : null}<label htmlFor="observed-case">Caso confirmado</label><select id="observed-case" value={caseId} onChange={(event) => setCaseId(event.currentTarget.value)}><option value="">Selecione um caso</option>{confirmed.map((item) => <option key={item.id} value={item.id}>{companies.find((company) => company.id === item.companyId)?.displayName ?? item.companyId} · {item.window.startDate}–{item.window.endDate}</option>)}</select>{selected ? <div className="observed-summary"><h3>{companies.find((company) => company.id === selected.companyId)?.displayName ?? selected.companyId}</h3><dl><div><dt>Janela</dt><dd>{selected.window.startDate} a {selected.window.endDate}</dd></div><div><dt>Ordens</dt><dd>{selected.orders.length} {selected.orders.length === 1 ? 'ordem' : 'ordens'}</dd></div><div><dt>Total</dt><dd>{brlTotal(selected)} BRL</dd></div><div><dt>Qualidade</dt><dd>{selected.quality.blockers.length === 0 ? 'Sem bloqueios' : `${selected.quality.blockers.length} bloqueio(s)`}; {selected.quality.warnings.length} aviso(s)</dd></div><div><dt>Proveniência</dt><dd>{[...new Set(selected.orders.flatMap((order) => order.provenance.map((item) => item.source)))].join(', ')}</dd></div></dl><p className="field-hint">A revisão {selected.revision} será copiada para um snapshot imutável. A fonte não será alterada.</p><div className="source-actions"><Button onClick={() => onChange({ kind: 'OBSERVED_CASE', caseId: selected.id, caseRevision: selected.revision })}>Usar caso confirmado</Button><Button variant="secondary" onClick={() => onConvertObserved(selected.id)}>Converter para autoria manual</Button></div></div> : null}</section>}</fieldset>;
}
