import { describe, expect, it } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import type { DeepMutable, DiagnosticExecutionRecord, ScenarioDerivation } from '../study/model';
import { savingsOrigin, type ScenarioRow } from './savingsOrigin';

function company(group: string, savings: string) {
  return { group, savings, matchedOwn: '0', matchedOthers: '0', volume: '100', remitted: '100', baseline: savings, netted: '0' };
}

async function fixture() {
  const input = await observedInput();
  const execution = input.execution;
  const orders = execution.envelope!.selected_execution.input_snapshot.cenario.ordens;
  orders[0]!.id = 'A-out';
  orders[1]!.id = 'B-in';
  const base: ScenarioRow = { scenario: input.study.scenarios[0]!, execution,
    envelope: execution.envelope!.selected_execution,
    breakdown: { companies: [company('A', '100'), company('B', '50')], reconciled: true } };
  function solo(derivation?: ScenarioDerivation): ScenarioRow {
    const selected = structuredClone(execution) as DeepMutable<DiagnosticExecutionRecord>;
    const envelope = selected.envelope!.selected_execution;
    envelope.input_snapshot.cenario.ordens = envelope.input_snapshot.cenario.ordens.filter((order) => order.id === 'A-out');
    return { scenario: { ...structuredClone(base.scenario), id: crypto.randomUUID(),
      ...(derivation === undefined ? {} : { derivation }) }, execution: selected, envelope,
      breakdown: { companies: [company('A', '40')], reconciled: true } };
  }
  const alone: ScenarioDerivation = { kind: 'COMPANY_ALONE', baseScenarioId: base.scenario.id,
    baseSourceFingerprint: base.scenario.sourceSnapshot.sourceFingerprint, companies: ['A'] };
  return { base, solo, alone };
}

describe('savingsOrigin', () => {
  it('skips modified single-company executions before an exact company-alone result', async () => {
    const { base, solo, alone } = await fixture();
    const doubled = solo();
    (doubled as DeepMutable<ScenarioRow>).envelope!.input_snapshot.cenario.ordens[0]!.valor_brl = '999';
    const exact = solo(alone);
    expect(savingsOrigin([base, doubled, exact], base)[0]!.solo).toEqual(exact.breakdown!.companies[0]);
    expect(savingsOrigin([base, doubled], base).every((entry) => entry.solo === undefined)).toBe(true);
  });

  it('accepts legacy exact subsets without derivation metadata', async () => {
    const { base, solo } = await fixture();
    expect(savingsOrigin([base, solo()], base)[0]!.solo?.savings).toBe('40');
  });

  it.each(['base', 'fingerprint', 'kind', 'company'])('rejects mismatched %s derivation metadata even for exact orders', async (field) => {
    const { base, solo, alone } = await fixture();
    const derivation = { ...alone, companies: [...alone.companies] };
    if (field === 'base') derivation.baseScenarioId = 'another-base';
    if (field === 'fingerprint') derivation.baseSourceFingerprint = 'stale';
    if (field === 'kind') derivation.kind = 'LEAVE_ONE_OUT';
    if (field === 'company') derivation.companies = ['B'];
    expect(savingsOrigin([base, solo(derivation)], base).every((entry) => entry.solo === undefined)).toBe(true);
  });

  it.each(['premises', 'period', 'envelope', 'execution'])('rejects incompatible or missing %s instead of attributing savings', async (field) => {
    const { base, solo, alone } = await fixture();
    const candidate = solo(alone);
    const mutable = candidate as DeepMutable<ScenarioRow>;
    if (field === 'premises') mutable.scenario.premises.windowDays += 1;
    if (field === 'period') mutable.scenario.period = { httpPeriod: { modo: 'LEGADO' }, executableHorizonDays: 999 };
    if (field === 'envelope') mutable.envelope = null;
    if (field === 'execution') mutable.execution = null;
    expect(savingsOrigin([base, candidate], base).every((entry) => entry.solo === undefined)).toBe(true);
  });
});
