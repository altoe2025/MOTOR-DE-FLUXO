// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import type { CommunicationDocumentV1 } from '../communication/domain';
import { observedInput } from '../communication/testFixtures';
import { PresentationPage } from './PresentationPage';
import { matchesPresentationSelection, type PresentationSelection } from './domain';

let document: CommunicationDocumentV1;

function selection(value: CommunicationDocumentV1): PresentationSelection {
  return {
    studyId: value.study.id,
    scenarioId: value.selection.scenarioId,
    diagnosticExecutionId: value.selection.diagnosticExecutionId,
    comparisonExecutionId: value.selection.comparisonExecutionId,
    replayDay: value.selection.replayDay,
  };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

beforeAll(async () => {
  document = await buildCommunicationDocument(await observedInput());
});

describe('Painel A enxuto', () => {
  it('mostra só o resumo executivo e a composição e mecanismo', () => {
    render(<PresentationPage state={{ kind: 'ready', document, selection: selection(document), scenarioName: 'Cenário base' }} />);
    expect(screen.getByRole('heading', { level: 1, name: document.study.name })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((item) => item.textContent))
      .toEqual(['Resumo executivo', 'Composição e mecanismo']);
    expect(screen.getByText(/Caso observado · Cenário base/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Seções da apresentação' })).not.toBeInTheDocument();
  });

  it('não exibe IDs, códigos de fonte nem identificadores técnicos', () => {
    const { container } = render(<PresentationPage state={{ kind: 'ready', document, selection: selection(document) }} />);
    expect(container.textContent).not.toMatch(UUID);
    expect(container.textContent).not.toMatch(/Fonte:|DIAGNOSTIC|STUDY ·|Valor publicado|processamento \(ms\)/);
    expect(container.querySelector('code')).toBeNull();
  });

  it('usa nomes legíveis dos participantes', () => {
    const [first] = document.composition.metrics.filter((item) => /^participant\.\d+\.volume$/.test(item.code));
    const id = first!.label.replace(/^Volume /, '');
    render(<PresentationPage state={{ kind: 'ready', document, selection: selection(document),
      participantNames: { [id]: 'AstroPay' } }} />);
    const table = within(screen.getByRole('region', { name: 'Composição e mecanismo' })).getByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'AstroPay' })).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader').map((item) => item.textContent))
      .toEqual(['Participante', 'Volume', 'Participação']);
  });

  it('usa formatter canônico e mantém a evidência nos atributos', () => {
    const original = document.executiveMetrics.find((item) => item.code === 'SAVINGS_BRL')!;
    const modified = { ...document, executiveMetrics: document.executiveMetrics.map((item) => item.code === 'SAVINGS_BRL'
      ? { ...item, value: '-12345678901234567890.125' } : item) };
    render(<PresentationPage state={{ kind: 'ready', document: modified, selection: selection(modified) }} />);
    const row = screen.getByText('Economia simulada').closest('[data-evidence-refs]');
    expect(row?.querySelector('dd')?.textContent).toBe('R$ -12.345.678.901.234.567.890,13');
    expect(row).toHaveAttribute('data-evidence-refs', original.evidenceRefs.join(' '));
  });

  it('mantém os cinco números principais quando o documento reordena métricas executivas', () => {
    const reordered = { ...document, executiveMetrics: [...document.executiveMetrics].reverse() };
    render(<PresentationPage state={{ kind: 'ready', document: reordered, selection: selection(reordered) }} />);
    const summary = screen.getByRole('region', { name: 'Resumo executivo' });
    for (const label of ['Custo baseline', 'Custo netado', 'Economia simulada',
      'Taxa de netabilidade', 'Volume bruto medido']) {
      expect(within(summary).getByText(label)).toBeInTheDocument();
    }
    expect(within(summary).queryByText('Volume remetido')).not.toBeInTheDocument();
  });

  it('recusa seleção divergente sem reaproveitar números de outro documento', () => {
    const stale = { ...selection(document), scenarioId: 'outro-cenario' };
    expect(matchesPresentationSelection(document, stale)).toBe(false);
    render(<PresentationPage state={{ kind: 'ready', document, selection: stale }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/seleção/);
    expect(screen.queryByText('Economia simulada')).not.toBeInTheDocument();
  });

  it('não mostra valor quando a referência de evidência publicada desaparece', () => {
    const savings = document.executiveMetrics.find((item) => item.code === 'SAVINGS_BRL')!;
    const missing = { ...document, evidenceIndex: Object.fromEntries(Object.entries(document.evidenceIndex)
      .filter(([ref]) => !savings.evidenceRefs.includes(ref))) };
    render(<PresentationPage state={{ kind: 'ready', document: missing, selection: selection(missing) }} />);
    const row = screen.getByText('Economia simulada').closest('[data-evidence-refs]');
    expect(row).toHaveTextContent('Não disponível');
    expect(row).not.toHaveTextContent('R$');
  });

  it('mantém loading estável, oferece regeneração se ausente e limpa números em erro', () => {
    const regenerate = vi.fn();
    const { rerender } = render(<PresentationPage state={{ kind: 'loading' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Carregando/);
    rerender(<PresentationPage state={{ kind: 'missing', onRegenerate: regenerate }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar documento' }));
    expect(regenerate).toHaveBeenCalledOnce();
    rerender(<PresentationPage state={{ kind: 'ready', document, selection: selection(document) }} />);
    expect(screen.getByText('Economia simulada')).toBeInTheDocument();
    rerender(<PresentationPage state={{ kind: 'error', message: 'Falha de leitura', onRetry: regenerate }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falha de leitura');
    expect(screen.queryByText('Economia simulada')).not.toBeInTheDocument();
  });
});
