// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import { comparisonInput, observedInput } from '../communication/testFixtures';
import { validateCommunicationDocument } from '../communication/validation';
import { PresentationPage } from './PresentationPage';

async function twoScenarioDocument() {
  const input = await comparisonInput();
  input.study.scenarios[1]!.name = 'Só AstroPay';
  const document = await buildCommunicationDocument({ ...input, comparisonExecutionId: null, comparison: null });
  return { input, document };
}

describe('Original × variações no documento', () => {
  it('cita os totais de cada cenário com diagnóstico atual por ponteiro escalar', async () => {
    const { input, document } = await twoScenarioDocument();
    const facts = Object.fromEntries(document.economics.facts.map((fact) => [fact.code, fact.value]));
    expect(facts.VARIATION_BASE).toBe(input.study.baseScenarioId);
    expect([facts['variation.0.name'], facts['variation.1.name']]).toEqual([input.study.scenarios[0]!.name, 'Só AstroPay']);
    const savings = document.economics.metrics.find((metric) => metric.code === 'variation.1.savings')!;
    const last = input.study.executions.at(-1)!;
    if (last.kind !== 'DIAGNOSTIC' || last.envelope === null) throw new Error('Diagnóstico esperado.');
    expect(savings.value).toBe(last.envelope.selected_execution.result.agregado.economia_periodo_brl);
    for (const ref of Object.keys(document.evidenceIndex)) expect(ref.length).toBeLessThanOrEqual(128);
    for (const evidence of Object.values(document.evidenceIndex)) expect(evidence.value?.length ?? 0).toBeLessThanOrEqual(20_000);
    expect(await validateCommunicationDocument(document, input.study)).toMatchObject({ ok: true });
  });

  it('omite a seção quando só um cenário tem diagnóstico atual', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    expect(document.economics.metrics.some((metric) => metric.code.startsWith('variation.'))).toBe(false);
  });

  it('mostra a tabela Original × variações e os rótulos sem jargão', async () => {
    const { document } = await twoScenarioDocument();
    render(<PresentationPage state={{ kind: 'ready', document, selection: {
      studyId: document.study.id, scenarioId: document.selection.scenarioId,
      diagnosticExecutionId: document.selection.diagnosticExecutionId, comparisonExecutionId: null, replayDay: null,
    } }} />);
    const section = screen.getByRole('region', { name: 'Original × variações' });
    expect(within(section).getByRole('rowheader', { name: 'Só AstroPay' })).toBeInTheDocument();
    expect(within(section).getAllByRole('columnheader').map((item) => item.textContent))
      .toEqual(['Cenário', 'Netabilidade', 'Custo sem pool', 'Custo com pool', 'Economia', 'Δ economia']);
    expect(screen.getByText('Parte do volume que não cruzou a fronteira')).toBeInTheDocument();
    expect(document.executiveMetrics.map((metric) => metric.label)).not.toContain('Custo baseline');
  });
});
