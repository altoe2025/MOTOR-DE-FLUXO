import { describe, expect, it } from 'vitest';

import demoJson from '../demo/generated/demo-study.v1.json';
import type { DemoStudyPackageV1 } from '../demo/domain';
import { compareMvpDiagnostics } from '../hypotheses/comparison';
import { canonical } from '../study/fingerprints';
import { assertValidStudy } from '../study/validation';
import type { DeepMutable, DiagnosticExecutionRecord } from '../study/model';
import { buildCommunicationDocument } from './buildCommunicationDocument';
import { observedInput, comparisonInput, refreshSourceFingerprints } from './testFixtures';

function fixture() {
  const demo = structuredClone(demoJson) as DeepMutable<DemoStudyPackageV1>;
  const study = demo.study;
  const execution = study.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED')! as DeepMutable<DiagnosticExecutionRecord>;
  return { study, execution, scenarioId: execution.scenarioId, diagnosticExecutionId: execution.id,
    comparisonExecutionId: null, replay: null, replayDay: null, demo };
}

describe('buildCommunicationDocument', () => {
  it('projeta fonte observada canônica, execução única e distribuição indisponível', async () => {
    const input = await observedInput();
    const document = await buildCommunicationDocument(input);
    expect(document.source).toMatchObject({ family: 'OBSERVED', synthetic: false });
    expect(document.executiveMetrics.find((item) => item.code === 'GROSS_BRL')?.value).toBe('140.02');
    expect(document.robustness.metrics).toHaveLength(4);
    expect(document.robustness.metrics.every((item) => item.value === null && item.availability === 'UNAVAILABLE')).toBe(true);
  });

  it('projeta comparação já calculada e preserva deltas e indisponíveis', async () => {
    const input = await comparisonInput();
    const document = await buildCommunicationDocument(input);
    expect(document.comparison?.metrics).toHaveLength(input.comparison.value.axes.length * 3);
    for (const row of input.comparison.value.axes) for (const side of ['base', 'hypothesis', 'delta'] as const) {
      expect(document.comparison?.metrics.find((item) => item.code === `${row.axis}.${row.metric}.${side}`)?.value).toBe(row[side]);
    }
    expect(document.limitations.some((item) => item.statement === 'UNPAIRED_DIAGNOSTICS')).toBe(true);
  });

  it('não mascara famílias autorais/legadas como simulação por Perfil', async () => {
    const input = await observedInput();
    input.study.scenarios[0]!.sourceSnapshot.source = { kind: 'AUTHORED', authoredPortfolioId: 'authored' };
    await refreshSourceFingerprints(input);
    await expect(buildCommunicationDocument(input)).rejects.toThrow('Família');
  });

  it.each(['ausente', 'duplicada'])('rejeita referência diagnóstica %s', async (kind) => {
    const input = fixture();
    input.execution.envelope!.axes.structural_potential.gross_out_brl.evidence = kind === 'ausente'
      ? ['/selected_execution/ausente'] : ['/statistics/count', '/statistics/count'];
    await expect(buildCommunicationDocument(input)).rejects.toThrow(/Evidência ausente|duplicada/);
  });

  it('rejeita comparação com valor base adulterado', async () => {
    const input = await comparisonInput();
    input.comparison.value.axes[0]!.base = '999';
    await expect(buildCommunicationDocument(input)).rejects.toThrow('Valores da comparação');
  });

  it.each(['preparationVersion', 'generatorVersion', 'motorBuildSha'] as const)(
    'rejeita comparação publicada antes da divergência de recipe.%s', async (field) => {
      const input = await comparisonInput(fixture());
      const hypothesis = input.study.executions.find((item) => item.id === input.comparisonExecutionId)! as DeepMutable<DiagnosticExecutionRecord>;
      if (hypothesis.sourceSnapshot.source.kind !== 'SYNTHETIC') throw new Error('Receita sintética esperada.');
      hypothesis.sourceSnapshot.source.recipe[field] = field === 'motorBuildSha' ? 'f'.repeat(40) : '9.9.9';
      for (const record of input.study.executions) {
        if (record.kind === 'DIAGNOSTIC' && record.attemptId === hypothesis.attemptId) {
          record.sourceSnapshot = structuredClone(hypothesis.sourceSnapshot);
        }
      }
      await assertValidStudy(input.study);
      expect(compareMvpDiagnostics(input.execution, hypothesis)).toMatchObject({ ok: false });
      await expect(buildCommunicationDocument(input)).rejects.toThrow(/incompatíveis/);
    },
  );

  it.each([
    { unit: 'DAYS' as const },
    { label: 'Prazo' },
  ])('rejeita semântica adulterada da métrica de comparação: %j', async (change) => {
    const input = await comparisonInput();
    Object.assign(input.comparison.value.axes[0]!, change);
    await expect(buildCommunicationDocument(input)).rejects.toThrow('Métrica de comparação');
  });

  it('rejeita chave não canônica mesmo quando a métrica está indisponível', async () => {
    const input = await comparisonInput();
    input.comparison.value.axes.find((row) => row.metric === 'baseline_brl.p50')!.metric += '.extra';
    await expect(buildCommunicationDocument(input)).rejects.toThrow('Métrica de comparação');
  });

  it('preserva os bytes do delta publicado sem recalcular a comparação', async () => {
    const input = await comparisonInput();
    input.comparison.value.axes[0]!.delta = '12345678901234567890.012345678900';
    const document = await buildCommunicationDocument(input);
    expect(document.comparison?.metrics.find((item) => item.code === 'STRUCTURAL_POTENTIAL.gross_out_brl.delta')?.value)
      .toBe('12345678901234567890.012345678900');
  });

  it('comparisonExecutionId precisa identificar a outra execução', async () => {
    const input = await comparisonInput();
    await expect(buildCommunicationDocument({ ...input, comparisonExecutionId: input.diagnosticExecutionId })).rejects.toThrow('Identidade');
  });

  it('rejeita rótulo de repetição diferente da execução publicada', async () => {
    const input = fixture();
    input.execution.envelope!.statistics.selected_repetition_id = input.execution.envelope!.repetitions[1]!.repetition_id;
    await expect(buildCommunicationDocument(input)).rejects.toThrow('Repetição');
  });

  it('rejeita totais de Replay divergentes apesar dos IDs corretos', async () => {
    const input = fixture();
    const replay = input.demo.replays[input.scenarioId]!;
    replay.totals.measured_gross_brl = '999';
    await expect(buildCommunicationDocument({ ...input, replay, replayDay: 31 })).rejects.toThrow('totais');
  });

  it('aceita igualdade decimal de totais com escalas textuais diferentes', async () => {
    const input = fixture();
    const replay = input.demo.replays[input.scenarioId]!;
    replay.totals.measured_gross_brl += '0';
    const document = await buildCommunicationDocument({ ...input, replay, replayDay: 31 });
    expect(document.selection.replayDay).toBe(31);
  });

  it('a ordem das chaves JSON de entrada não altera a projeção ou fingerprint', async () => {
    const input = fixture();
    const reversed = JSON.parse(JSON.stringify(input), (_key, value: unknown) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse()) : value) as typeof input;
    expect(await buildCommunicationDocument(reversed)).toEqual(await buildCommunicationDocument(input));
  });
  it('projeta métricas publicadas sem arredondar e destaca origem sintética', async () => {
    const input = fixture();
    const before = canonical(input);
    const document = await buildCommunicationDocument(input);
    const aggregate = input.execution.envelope!.selected_execution.result.agregado;
    expect(document.executiveMetrics.find((metric) => metric.code === 'SAVINGS_BRL')?.value)
      .toBe(aggregate.economia_periodo_brl);
    expect(document.executiveMetrics.find((metric) => metric.code === 'NETABILITY')?.value)
      .toBe(aggregate.taxa_netabilidade_periodo);
    expect(document.source).toMatchObject({ family: 'PROFILE_SIMULATION', synthetic: true });
    expect(document.source.label).toContain('não calibrada');
    expect(document.comparison).toBeNull();
    expect(document.replaySnapshot).toBeNull();
    expect(canonical(input)).toBe(before);
    expect(Object.isFrozen(document.executiveMetrics[0])).toBe(true);
  });

  it('cada evidência resolve exatamente no envelope ou snapshot publicado', async () => {
    const input = fixture();
    const document = await buildCommunicationDocument(input);
    for (const evidence of Object.values(document.evidenceIndex)) {
      const root = evidence.source === 'STUDY' ? input.study : input.execution.envelope;
      const value = evidence.path.slice(1).split('/').reduce<unknown>((node, part) =>
        (node as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')], root);
      if (value !== null && typeof value === 'object') expect(JSON.parse(evidence.value!)).toEqual(value);
      else expect(evidence.value).toBe(typeof value === 'string' ? value : String(value));
    }
    expect(document.limitations.map((item) => item.statement))
      .toEqual(expect.arrayContaining(input.execution.envelope!.limitations.map((item) => item.condition)));
    expect(document.versions.length).toBeGreaterThanOrEqual(4);
    expect(document.assumptions.length).toBeGreaterThan(0);
    expect(document.provenance.length).toBeGreaterThan(0);
  });

  it('preserva indisponibilidade e motivo sem fabricar zero', async () => {
    const input = fixture();
    input.execution.envelope!.axes.temporal_compatibility.deadline_days = {
      state: 'NOT_COLLECTED', reason: 'PRAZO_NAO_COLETADO', evidence: [],
    };
    const document = await buildCommunicationDocument(input);
    expect(document.mechanism.metrics.find((metric) => metric.code === 'temporal_compatibility.deadline_days'))
      .toMatchObject({ availability: 'UNAVAILABLE', value: null, meaning: 'PRAZO_NAO_COLETADO' });
  });

  it('copia o dia publicado, volta e reload preservam fingerprint exceto generatedAt', async () => {
    const input = fixture();
    const replay = input.demo.replays[input.scenarioId]!;
    const first = await buildCommunicationDocument({ ...input, replay, replayDay: 31, generatedAt: '2026-09-23T12:00:00Z' });
    const other = await buildCommunicationDocument({ ...input, replay, replayDay: 32 });
    const again = await buildCommunicationDocument({ ...JSON.parse(JSON.stringify(input)), replay, replayDay: 31, generatedAt: '2026-09-23T13:00:00Z' });
    expect(first.replaySnapshot?.metrics.find((metric) => metric.code === 'open_out_brl')?.value)
      .toBe(replay.days[31]!.end_state.open_out_brl);
    expect(first.contextFingerprint).toBe(again.contextFingerprint);
    expect(first.contextFingerprint).not.toBe(other.contextFingerprint);
    expect({ ...first, generatedAt: '' }).toEqual({ ...again, generatedAt: '' });
  });

  it.each(['diagnostic_execution_id', 'scenario_id', 'repetition_id', 'execution_fingerprint', 'result_fingerprint', 'motor_version'] as const)(
    'rejeita Replay de outro contexto: %s', async (field) => {
      const input = fixture();
      const replay = input.demo.replays[input.scenarioId]!;
      replay[field] = field.endsWith('fingerprint') ? 'f'.repeat(64) : '00000000-0000-4000-8000-000000000000';
      await expect(buildCommunicationDocument({ ...input, replay, replayDay: 31 })).rejects.toThrow();
    },
  );

  it.each([-1, 999, 1.5, null])('rejeita dia inválido/ausente com Replay: %s', async (replayDay) => {
    const input = fixture();
    await expect(buildCommunicationDocument({ ...input, replay: input.demo.replays[input.scenarioId]!, replayDay })).rejects.toThrow();
  });

  it('rejeita execução que pertence a outro cenário e comparação sem fonte calculada', async () => {
    const input = fixture();
    await expect(buildCommunicationDocument({ ...input, scenarioId: input.study.scenarios[1]!.id })).rejects.toThrow();
    await expect(buildCommunicationDocument({ ...input, comparisonExecutionId: input.study.executions[3]!.id })).rejects.toThrow();
  });
});
