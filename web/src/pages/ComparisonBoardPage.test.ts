import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import type { PreviewExecutionRecord } from '../study/model';
import { buildRows, sortRows } from './ComparisonBoardPage';
import { savingsBps } from './comparisonBoardMetrics';

describe('comparison board execution identity', () => {
  it('uses the selected repetition instead of the originally prepared portfolio', async () => {
    const { study, execution } = await observedInput();
    const selected = execution.envelope!.selected_execution;
    const actual = selected.input_snapshot.cenario.ordens;
    // Generated diagnostics retain the initial portfolio in sourceSnapshot, while
    // selected_execution contains orders regenerated with the selected seed.
    execution.sourceSnapshot.orders = [{ ...actual[0]!, valor_brl: '999999999' }];
    const [row] = buildRows([study], [], []);
    expect(row!.orderCount).toBe(actual.length);
    expect(row!.inBrl).toBe(actual.filter((order) => order.direcao === 'IN')
      .reduce((sum, order) => sum.plus(order.valor_brl), new Decimal(0)).toFixed());
    expect(row!.breakdown!.reconciled).toBe(true);
  });

  it('chooses a newer preview over an older diagnostic', async () => {
    const { study, execution } = await observedInput();
    const preview: PreviewExecutionRecord = {
      kind: 'PREVIEW', id: 'newer-preview', scenarioId: execution.scenarioId,
      scenarioRevision: execution.scenarioRevision, inputFingerprint: execution.inputFingerprint,
      requestSnapshot: execution.requestSnapshot.sampling.kind === 'FIXED_INPUT'
        ? execution.requestSnapshot.sampling.preview_request : (() => { throw new Error('fixed fixture required'); })(),
      engineVersion: 'test', contractVersion: '1.0.0', status: 'SUCCEEDED',
      envelope: execution.envelope!.selected_execution, observedComparison: null,
      createdAt: '2026-09-24T12:00:00Z', finishedAt: '2026-09-24T12:00:00Z',
    };
    const [row] = buildRows([{ ...study, executions: [...study.executions, preview] }], [], []);
    expect(row!.finishedAt).toBe(preview.finishedAt);
    expect(row!.diagnosticExecutionId).toBeNull();
  });

  it('does not present an obsolete execution as the current scenario', async () => {
    const { study } = await observedInput();
    study.scenarios[0]!.revision += 1;
    expect(buildRows([study], [], [])).toEqual([]);
    study.scenarios[0]!.revision -= 1;
    study.scenarios[0]!.inputFingerprint = 'changed-input';
    expect(buildRows([study], [], [])).toEqual([]);
  });

  it('expõe economia em bps sobre o volume bruto medido, período e premissas da linha', async () => {
    const { study, execution } = await observedInput();
    const aggregate = execution.envelope!.selected_execution.result.agregado;
    const [row] = buildRows([study], [], []);
    expect(row!.grossVolume).toBe(aggregate.volume_bruto_periodo_brl);
    expect(row!.savingsBps).toBe(savingsBps(aggregate.economia_periodo_brl, aggregate.volume_bruto_periodo_brl));
    expect(row!.periodLabel).toMatch(/dias? medidos?|horizonte/);
    expect(row!.premises).toEqual(study.scenarios[0]!.premises);
  });

  it('ordena por bps, com linhas sem volume no fim', async () => {
    const { study } = await observedInput();
    const [row] = buildRows([study], [], []);
    const rows = [
      { ...row!, key: 'baixo', savingsBps: '10' },
      { ...row!, key: 'sem-volume', savingsBps: null },
      { ...row!, key: 'alto', savingsBps: '125.15' },
    ];
    expect(sortRows(rows, 'bps').map((item) => item.key)).toEqual(['alto', 'baixo', 'sem-volume']);
  });
});
