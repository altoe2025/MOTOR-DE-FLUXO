// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import type { CommunicationDocumentV1 } from '../communication/domain';
import { comparisonInput, observedInput } from '../communication/testFixtures';
import { PresentationPage } from './PresentationPage';
import { matchesPresentationSelection, type PresentationSelection } from './domain';

let document: CommunicationDocumentV1;
let compared: CommunicationDocumentV1;

function selection(value: CommunicationDocumentV1): PresentationSelection {
  return {
    studyId: value.study.id,
    scenarioId: value.selection.scenarioId,
    diagnosticExecutionId: value.selection.diagnosticExecutionId,
    comparisonExecutionId: value.selection.comparisonExecutionId,
    replayDay: value.selection.replayDay,
  };
}

beforeAll(async () => {
  document = await buildCommunicationDocument(await observedInput());
  compared = await buildCommunicationDocument(await comparisonInput());
});

describe('núcleo não roteado do Painel A', () => {
  it('monta as seis seções contínuas e preserva a origem observada', () => {
    render(<PresentationPage state={{ kind: 'ready', document, selection: selection(document) }} />);
    expect(screen.getByRole('heading', { level: 1, name: document.study.name })).toBeInTheDocument();
    for (const name of ['Resumo executivo', 'Composição e mecanismo', 'Consequência econômica e comparação',
      'Destaques do Replay', 'Premissas e proveniência', 'Limitações e versões']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText(document.source.label)).toBeInTheDocument();
    expect(screen.getByText('Caso observado')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Composição e mecanismo' }))
      .toHaveTextContent('Caso observado');
    expect(screen.getByRole('navigation', { name: 'Seções da apresentação' })).toHaveAttribute('aria-label', 'Seções da apresentação');
    expect(screen.getByRole('link', { name: 'Premissas' })).toHaveAttribute('href', '#premissas');
    expect(screen.getByText(/Nenhum quadro do Replay/)).toBeInTheDocument();
  });

  it('usa formatter canônico para decimal grande e negativo, explicita indisponibilidade e aponta à evidência original', () => {
    const original = document.executiveMetrics.find((item) => item.code === 'SAVINGS_BRL')!;
    const modified = { ...document, executiveMetrics: document.executiveMetrics.map((item) => item.code === 'SAVINGS_BRL'
      ? { ...item, value: '-12345678901234567890.125' } : item) };
    render(<PresentationPage state={{ kind: 'ready', document: modified, selection: selection(modified) }} />);
    const row = screen.getByText('Economia simulada').closest('[data-evidence-refs]');
    expect(row?.querySelector('dd')?.firstChild?.textContent).toBe('R$ -12.345.678.901.234.567.890,13');
    expect(row).toHaveAttribute('data-evidence-refs', original.evidenceRefs.join(' '));
    expect(row).toHaveAttribute('data-source-ids', document.evidenceIndex[original.evidenceRefs[0]!]!.sourceId);
    const robustness = screen.getByRole('region', { name: 'Consequência econômica e comparação' });
    expect(within(robustness).getAllByText(/Não disponível/).length).toBeGreaterThan(0);
    expect(within(robustness).getByText(/Distribuição indisponível/)).toBeInTheDocument();
  });

  it('renderiza comparação selecionada e seus deltas sem criar conclusão nova', () => {
    render(<PresentationPage state={{ kind: 'ready', document: compared, selection: selection(compared) }} />);
    const comparison = screen.getByRole('region', { name: 'Consequência econômica e comparação' });
    expect(within(comparison).getByRole('heading', { level: 3, name: 'Comparação selecionada' })).toBeInTheDocument();
    expect(within(comparison).getAllByTestId('presentation-metric').length).toBeGreaterThan(0);
    expect(screen.getByText(compared.source.label)).toBeInTheDocument();
  });

  it('mostra apenas o quadro de Replay incluído no documento', () => {
    const replay = { ...document, selection: { ...document.selection, replayDay: 3 }, replaySnapshot: {
      day: 3, metrics: [{ ...document.executiveMetrics[0]!, label: 'Valor do quadro' }], facts: [],
    } };
    render(<PresentationPage state={{ kind: 'ready', document: replay, selection: selection(replay) }} />);
    const section = screen.getByRole('region', { name: 'Destaques do Replay' });
    expect(within(section).getByRole('heading', { level: 3, name: 'Dia 3' })).toBeInTheDocument();
    expect(within(section).getByText('Valor do quadro')).toBeInTheDocument();
    expect(within(section).queryByText(/Nenhum quadro/)).not.toBeInTheDocument();
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
    expect(within(screen.getByRole('region', { name: 'Consequência econômica e comparação' }))
      .getByText('Volume remetido')).toBeInTheDocument();
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
    expect(row).toHaveTextContent('Referência de evidência ausente');
    expect(row).not.toHaveTextContent('R$');
  });

  it('mantém indisponibilidade e fonte no dd da métrica correspondente', () => {
    const original = document.executiveMetrics.find((item) => item.code === 'SAVINGS_BRL')!;
    const unavailable = {
      ...document,
      executiveMetrics: document.executiveMetrics.map((item) => item.code === original.code
        ? { ...item, availability: 'UNAVAILABLE' as const, value: null }
        : item),
    };
    render(<PresentationPage state={{ kind: 'ready', document: unavailable, selection: selection(unavailable) }} />);
    const term = screen.getAllByText(original.label).find((element) => element.tagName === 'DT');
    if (term === undefined) throw new Error(`Termo da métrica não encontrado: ${original.label}`);
    const definition = term.nextElementSibling;
    expect(definition?.tagName).toBe('DD');
    expect(definition).toHaveTextContent('Não disponível');
    expect(definition).toHaveTextContent(original.meaning);
    expect(definition?.querySelector('.presentation-evidence')).toHaveTextContent('Fonte:');
    expect(definition?.parentElement?.querySelectorAll('dd')).toHaveLength(1);
  });

  it('explicita limitação sem evidência sem publicar a afirmação sem fonte', () => {
    const unsourced = { ...document, limitations: [...document.limitations, {
      code: 'MISSING_TEST', severity: 'WARNING' as const, statement: 'Limitação sentinela',
      evidenceRefs: ['DIAGNOSTIC:/ausente'],
    }] };
    render(<PresentationPage state={{ kind: 'ready', document: unsourced, selection: selection(unsourced) }} />);
    const item = screen.getByRole('region', { name: 'Limitações e versões' })
      .querySelector('[data-evidence-refs="DIAGNOSTIC:/ausente"]');
    expect(item).toHaveTextContent('Referência de evidência ausente');
    expect(item).not.toHaveTextContent('Limitação sentinela');
  });

  it('explica premissas e proveniência sem perder valor canônico ou IDs de fonte', () => {
    const source = document.assumptions[0]!;
    const costs = [
      { ...source, code: 'COST.iof_out', label: 'iof_out', value: '0.035' },
      { ...source, code: 'COST.carry_cnr', label: 'carry_cnr', value: '0.0004' },
      { ...source, code: 'COST.spread_rail_bps', label: 'spread_rail_bps', value: '25' },
    ];
    const provenance = { ...source, code: 'SOURCE_PROVENANCE_0', label: 'SOURCE_PROVENANCE_0',
      value: '{"kind":"SYNTHETIC","source":"receita-perfil","version":"1","recordedAt":"2026-09-23T12:00:00Z"}' };
    const rendered = { ...document, assumptions: costs, provenance: [provenance], limitations: [{
      code: 'COSTS_NOT_OBSERVED', severity: 'WARNING' as const,
      statement: 'COST_PROVENANCE_IS_NOT_OBSERVED', evidenceRefs: source.evidenceRefs,
    }] };
    render(<PresentationPage state={{ kind: 'ready', document: rendered, selection: selection(rendered) }} />);
    const assumptions = screen.getByRole('region', { name: 'Premissas e proveniência' });
    expect(assumptions).toHaveTextContent('IOF de saída');
    expect(assumptions).toHaveTextContent('3,50%');
    expect(assumptions).toHaveTextContent('0.035');
    expect(assumptions).toHaveTextContent('0,04%');
    expect(assumptions).toHaveTextContent('25,00 bps');
    expect(assumptions).toHaveTextContent('receita-perfil');
    expect(assumptions).toHaveTextContent('Valor publicado');
    const row = within(assumptions).getByText('IOF de saída').closest('[data-evidence-refs]');
    expect(row).toHaveAttribute('data-evidence-refs', source.evidenceRefs.join(' '));
    expect(row).toHaveAttribute('data-source-ids', document.evidenceIndex[source.evidenceRefs[0]!]!.sourceId);
    expect(screen.getByRole('region', { name: 'Limitações e versões' }))
      .toHaveTextContent('As premissas de custo não foram observadas na fonte');
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
