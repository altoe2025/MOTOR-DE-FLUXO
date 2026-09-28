import Decimal from 'decimal.js';

import { breakdownByCompany, type Breakdown, type CompanyBreakdown } from '../pages/comparisonBoardBreakdown';
import type { DiagnosticExecutionRecord, PreviewEnvelope, ScenarioDocument, StudyDocument } from '../study/model';
import { companyResolver } from './companies';

export type ScenarioRow = Readonly<{
  scenario: ScenarioDocument;
  execution: DiagnosticExecutionRecord | null;
  envelope: PreviewEnvelope | null;
  breakdown: Breakdown | null;
}>;

export type OriginEntry = Readonly<{ item: CompanyBreakdown; solo: CompanyBreakdown | undefined }>;

/** Último diagnóstico concluído que ainda corresponde à revisão atual do cenário. */
export function currentDiagnostic(study: StudyDocument, scenario: ScenarioDocument): DiagnosticExecutionRecord | null {
  return [...study.executions].reverse().find((item): item is DiagnosticExecutionRecord =>
    item.kind === 'DIAGNOSTIC' && item.scenarioId === scenario.id && item.status === 'SUCCEEDED'
    && item.envelope !== null && item.scenarioRevision === scenario.revision
    && item.inputFingerprint === scenario.inputFingerprint) ?? null;
}

export function scenarioRow(study: StudyDocument, scenario: ScenarioDocument): ScenarioRow {
  const execution = currentDiagnostic(study, scenario);
  const envelope = (execution?.envelope?.selected_execution ?? null) as PreviewEnvelope | null;
  let breakdown: Breakdown | null = null;
  if (execution !== null && envelope !== null) {
    try {
      breakdown = breakdownByCompany(envelope, companyResolver(execution.sourceSnapshot.source));
    } catch {
      breakdown = null;
    }
  }
  return { scenario, execution, envelope, breakdown };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Variação "empresa sozinha" gerada a partir da referência exata: mesma base e versão das
 * ordens, mesmas premissas e período, sem nenhuma outra alteração. Uma variação de alavanca
 * com uma só empresa (ex.: "A volume ×2") não conta.
 */
function isAloneOf(row: ScenarioRow, reference: ScenarioRow, company: string): boolean {
  const derivation = row.scenario.derivation;
  return derivation?.kind === 'COMPANY_ALONE'
    && derivation.baseScenarioId === reference.scenario.id
    && derivation.baseSourceFingerprint === reference.scenario.sourceSnapshot.sourceFingerprint
    && derivation.companies.length === 1 && derivation.companies[0] === company
    && sameJson(row.scenario.premises, reference.scenario.premises)
    && sameJson(row.scenario.period, reference.scenario.period)
    && row.breakdown?.companies.length === 1 && row.breakdown.companies[0]!.group === company;
}

/**
 * Para cada empresa do cenário de referência, a mesma empresa rodada sozinha a partir da mesma
 * base, quando existir. Sem equivalente exato, não atribui.
 */
export function savingsOrigin(rows: readonly ScenarioRow[], reference: ScenarioRow): OriginEntry[] {
  const alone = (company: string) => rows.find((row) => row !== reference && isAloneOf(row, reference, company))
    ?.breakdown?.companies[0];
  return (reference.breakdown?.companies ?? []).map((item) => ({ item, solo: alone(item.group) }));
}

/**
 * Separa o volume casado entre clientes do cenário de referência: o que cada empresa já casa
 * entre as próprias linhas (medido rodando-a sozinha) e o restante, que só existe porque as
 * empresas estão juntas. Exige a rodada sozinha de todas as empresas.
 */
export function interClientSplit(entries: readonly OriginEntry[]): Readonly<{
  total: string; sameCompany: string; betweenCompanies: string;
}> | null {
  if (entries.length < 2 || entries.some((entry) => entry.solo === undefined)) return null;
  const total = entries.reduce((sum, entry) => sum.plus(entry.item.matchedOthers), new Decimal(0));
  const sameCompany = entries.reduce((sum, entry) => sum.plus(entry.solo!.matchedOthers), new Decimal(0));
  return { total: total.toFixed(), sameCompany: sameCompany.toFixed(), betweenCompanies: total.minus(sameCompany).toFixed() };
}
