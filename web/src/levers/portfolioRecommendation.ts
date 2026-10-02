import Decimal from 'decimal.js';

import { canonical } from '../study/fingerprints';
import type { DiagnosticExecutionRecord, PreviewEnvelope, StudyDocument } from '../study/model';
import { companyResolver } from './companies';
import type { ScenarioRow } from './savingsOrigin';
import { isCurrentCombinationScenario } from './prepareCombinationStudy';

export type PortfolioCandidate = Readonly<{
  scenarioId: string;
  name: string;
  companies: readonly string[];
  savings: string;
  volume: string;
  waitDays: number;
  eligible: boolean;
}>;

export type PortfolioExclusion = Readonly<{ scenarioId: string; name: string; reason: string }>;
export type PortfolioRecommendation = Readonly<{
  candidates: readonly PortfolioCandidate[];
  winner: PortfolioCandidate | null;
  excluded: readonly PortfolioExclusion[];
}>;

function executionRow(study: StudyDocument, scenario: StudyDocument['scenarios'][number]): ScenarioRow {
  const execution = [...study.executions].reverse().find((item): item is DiagnosticExecutionRecord =>
    item.kind === 'DIAGNOSTIC' && item.scenarioId === scenario.id && item.status === 'SUCCEEDED'
    && item.envelope !== null && item.scenarioRevision === scenario.revision
    && item.inputFingerprint === scenario.inputFingerprint) ?? null;
  return { scenario, execution, envelope: execution?.envelope?.selected_execution ?? null, breakdown: null };
}

function companyIdentity(row: ScenarioRow, orderId: string): string {
  const source = row.execution!.sourceSnapshot.source;
  const map = source.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS'
    ? source.definition.companyByOrder : undefined;
  return map?.[orderId]?.companyId ?? companyResolver(source)(orderId);
}

/** Only a whole-company subset of the same executed portfolio isolates composition. */
export function compositionComparisonReason(reference: ScenarioRow, candidate: ScenarioRow): string | null {
  if (reference.execution === null || reference.envelope === null) return 'O original precisa de um diagnóstico atual concluído.';
  if (candidate.execution === null || candidate.envelope === null) return 'Este cenário precisa de um diagnóstico atual concluído.';
  if (reference.execution.requestSnapshot.sampling.kind !== 'FIXED_INPUT'
    || candidate.execution.requestSnapshot.sampling.kind !== 'FIXED_INPUT') {
    return 'Ordens regeneradas não permitem comparar apenas a composição; execute as mesmas ordens fixas.';
  }
  const baseInput = reference.envelope.input_snapshot;
  const input = candidate.envelope.input_snapshot;
  if (canonical(baseInput.cenario.custo) !== canonical(input.cenario.custo)) return 'As premissas de custo diferem do original.';
  if (baseInput.cenario.janela_dias !== input.cenario.janela_dias) return 'A janela difere do original.';
  if (baseInput.cenario.horizonte_dias !== input.cenario.horizonte_dias) return 'O horizonte difere do original.';
  if (canonical(baseInput.periodo) !== canonical(input.periodo)
    || canonical(reference.execution.periodSnapshot) !== canonical(candidate.execution.periodSnapshot)) {
    return 'O calendário ou período de medição difere do original.';
  }
  if (reference.envelope.motor_build_sha !== candidate.envelope.motor_build_sha) return 'A versão do motor difere do original.';
  const baseOrders = new Map(baseInput.cenario.ordens.map((order) => [order.id, order]));
  const kept = new Set(input.cenario.ordens.map((order) => order.id));
  const companies = new Set<string>();
  if (kept.size === 0) return 'A carteira não contém ordens executadas.';
  for (const order of input.cenario.ordens) {
    const original = baseOrders.get(order.id);
    if (original === undefined || canonical(original) !== canonical(order)) {
      return 'As ordens executadas não são um subconjunto sem alterações do original.';
    }
    if (companyIdentity(reference, order.id) !== companyIdentity(candidate, order.id)
      || companyResolver(reference.execution.sourceSnapshot.source)(order.id)
        !== companyResolver(candidate.execution.sourceSnapshot.source)(order.id)) {
      return 'A identificação da empresa mudou em relação ao original.';
    }
    companies.add(companyIdentity(reference, order.id));
  }
  if (baseInput.cenario.ordens.some((order) => companies.has(companyIdentity(reference, order.id)) && !kept.has(order.id))) {
    return 'A variação retirou apenas parte das ordens de uma empresa; mantenha todas as ordens das empresas escolhidas.';
  }
  return null;
}

function measuredPortfolio(envelope: PreviewEnvelope): Readonly<{ volume: Decimal; wait: Decimal }> | null {
  const aggregate = envelope.result.agregado;
  const measured = new Set(aggregate.ids_ordens_medidas);
  const orders = new Map(envelope.input_snapshot.cenario.ordens.map((order) => [order.id, order]));
  let volume = new Decimal(0);
  let weightedWait = new Decimal(0);
  const allocated = new Map<string, Decimal>();
  for (const cycle of aggregate.execucao_completa.ciclos) {
    for (const allocation of cycle.alocacoes) {
      if (!measured.has(allocation.ordem_id)) continue;
      const order = orders.get(allocation.ordem_id);
      if (order === undefined || allocation.dia < order.dia_conhecida) return null;
      const value = new Decimal(allocation.valor_brl);
      if (!value.isFinite() || value.lte(0)) return null;
      volume = volume.plus(value);
      weightedWait = weightedWait.plus(value.times(allocation.dia - order.dia_conhecida));
      allocated.set(order.id, (allocated.get(order.id) ?? new Decimal(0)).plus(value));
    }
  }
  if (volume.lte(0) || !volume.eq(aggregate.volume_bruto_periodo_brl)) return null;
  for (const id of measured) {
    const order = orders.get(id);
    if (order === undefined || !(allocated.get(id) ?? new Decimal(0)).eq(order.valor_brl)) return null;
  }
  return { volume, wait: weightedWait.div(volume) };
}

/** Greatest total BRL savings among comparable tested portfolios within the optional mean-wait limit. */
export function recommendPortfolios(study: StudyDocument, maxWaitDays: number | null): PortfolioRecommendation {
  // Numa combinação de carteiras, combinações de uma carteira anterior (antes de trocar empresas ou
  // aplicar alavancas) ficam guardadas para reaproveitar resultados, mas não concorrem.
  const scenarios = study.studyType === 'PORTFOLIO_COMBINATIONS'
    ? study.scenarios.filter((scenario) => isCurrentCombinationScenario(study, scenario)) : study.scenarios;
  const rows = scenarios.map((scenario) => executionRow(study, scenario));
  // Na combinação, o cenário base é a carteira inteira; o nome dele descreve as alavancas aplicadas.
  const nameOf = (scenario: StudyDocument['scenarios'][number]) =>
    study.studyType === 'PORTFOLIO_COMBINATIONS' && scenario.id === study.baseScenarioId ? 'Todas as empresas juntas' : scenario.name;
  const reference = rows.find((row) => row.scenario.id === study.baseScenarioId);
  const candidates: PortfolioCandidate[] = [];
  const excluded: PortfolioExclusion[] = [];
  for (const row of rows) {
    let reason: string | null = null;
    if (row.execution === null || row.envelope === null) {
      const previous = study.executions.some((execution) => execution.scenarioId === row.scenario.id
        && execution.kind === 'DIAGNOSTIC' && execution.status === 'SUCCEEDED' && execution.envelope !== null);
      reason = previous ? 'Diagnóstico desatualizado; execute novamente este cenário.' : 'Sem diagnóstico concluído; execute este cenário.';
    } else {
      reason = reference === undefined ? 'O cenário original não está disponível.' : compositionComparisonReason(reference, row);
    }
    if (reason === null && row.execution !== null && row.envelope !== null) {
      const metrics = measuredPortfolio(row.envelope);
      const savings = new Decimal(row.envelope.result.agregado.economia_periodo_brl);
      if (metrics === null || !savings.isFinite()) {
        reason = 'O resultado não tem volume e alocações completas para medir a espera.';
      } else {
        const companyOf = companyResolver(row.execution.sourceSnapshot.source);
        const companies = [...new Set(row.envelope.input_snapshot.cenario.ordens.map((order) => companyOf(order.id)))].sort();
        candidates.push({ scenarioId: row.scenario.id, name: nameOf(row.scenario), companies,
          savings: savings.toFixed(), volume: metrics.volume.toFixed(), waitDays: metrics.wait.toNumber(),
          eligible: maxWaitDays === null || (Number.isFinite(maxWaitDays) && maxWaitDays >= 0 && metrics.wait.lte(maxWaitDays)) });
      }
    }
    if (reason !== null) excluded.push({ scenarioId: row.scenario.id, name: nameOf(row.scenario), reason });
  }
  candidates.sort((left, right) => new Decimal(right.savings).comparedTo(left.savings));
  return { candidates, winner: candidates.find((candidate) => candidate.eligible) ?? null, excluded };
}
