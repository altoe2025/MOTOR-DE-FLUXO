import { describe, expect, it } from 'vitest';

import productHelp from '../../../../servidor/catalogs/product_help.v1.json';
import { validateProductHelpCatalog } from '../../help/catalog';
import { boardCitationDestination, citationDestination } from './ChatCitation';
import { buildCommunicationDocument } from '../../communication/buildCommunicationDocument';
import { comparisonInput, observedInput } from '../../communication/testFixtures';
import { buildBoardChatContext } from '../boardContext';
import type { BoardRow } from '../../pages/ComparisonBoardPage';
import { routeChatContext } from '../routeContext';

const catalog = validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!;
const route = { routeId: 'studies', helpId: null, studyId: null, scenarioId: null,
  diagnosticExecutionId: null, replayDay: null };

describe('citation navigation', () => {
  it('links board evidence back to the selected row without inventing a metric route', async () => {
    const row = { key: 's:c', studyId: 's', scenarioId: 'c', executionId: 'e', studyName: 'Estudo',
      scenarioName: 'Cenário', origin: 'Sintético', windowDays: 7, orderCount: 2, inBrl: '10', outBrl: '20',
      netability: '0.5', baselineTotal: '8', nettedTotal: '3', savings: '5',
      diagnosticExecutionId: 'e', finishedAt: '2026-09-26T12:00:00Z', breakdown: null } satisfies BoardRow;
    const context = await buildBoardChatContext([row]);
    const destination = boardCitationDestination({ kind: 'EVIDENCE', id: 'BOARD:s:c:savingsBrl' },
      context.document.contextFingerprint, context.document);
    expect(destination).toEqual({ label: 'Estudo · Cenário — Economia', href: '/quadro' });
    expect(boardCitationDestination({ kind: 'EVIDENCE', id: 'BOARD:s:c:savingsBrl' },
      '0'.repeat(64), context.document).href).toBeNull();
  });

  it('links only to implemented routes and leaves unresolved placeholders as text', () => {
    expect(citationDestination({ kind: 'HELP', id: 'page.importacao' }, null, catalog, null,
      route, '/estudos').href).toBe('/importar');
    expect(citationDestination({ kind: 'HELP', id: 'concept.replay' }, null, catalog, null,
      route, '/estudos').href).toBeNull();
    expect(citationDestination({ kind: 'HELP', id: 'page.apresentacao' }, null, catalog, null,
      { ...route, studyId: 'study-1' }, '/estudos').href).toBeNull();
    expect(citationDestination({ kind: 'HELP', id: 'missing' }, null, catalog, null,
      route, '/estudos').href).toBeNull();
  });

  it('preserves the explicit presentation selection for HELP and PDF controls without unrelated query values', () => {
    const current = '/estudos/study-1/apresentacao?cenario=scenario-a&execucao=run-a&comparacao=base-a&dia=2&extra=private';
    const selected = routeChatContext(current)!;
    const expected = '/estudos/study-1/apresentacao?cenario=scenario-a&execucao=run-a&comparacao=base-a&dia=2';

    for (const id of ['page.apresentacao', 'page.relatorio', 'control.apresentacao.pdf']) {
      expect(citationDestination({ kind: 'HELP', id }, null, catalog, null, selected, current).href).toBe(expected);
    }
  });

  it('does not invent a presentation selection when scenario or execution is missing', () => {
    for (const current of ['/estudos/study-1/apresentacao',
      '/estudos/study-1/apresentacao?cenario=scenario-a',
      '/estudos/study-1/apresentacao?execucao=run-a', '/carteira/study-1']) {
      expect(citationDestination({ kind: 'HELP', id: 'control.apresentacao.pdf' }, null,
        catalog, null, routeChatContext(current)!, current).href).toBeNull();
    }
  });

  it('refuses ambiguous presentation parameters or a nonlocal current URL', () => {
    for (const current of [
      '/estudos/study-1/apresentacao?cenario=a&cenario=b&execucao=e',
      '/estudos/study-1/apresentacao?cenario=a&execucao=e&dia=2&dia=3',
      '//external.invalid/estudos/study-1/apresentacao?cenario=a&execucao=e',
    ]) {
      expect(citationDestination({ kind: 'HELP', id: 'control.apresentacao.pdf' }, null,
        catalog, null, { ...route, studyId: 'study-1', scenarioId: 'a', diagnosticExecutionId: 'e' }, current).href).toBeNull();
    }
  });

  it('reopens the exact diagnostic execution cited by a metric', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    const href = citationDestination({ kind: 'METRIC', id: 'SAVINGS_BRL' }, document.contextFingerprint,
      catalog, document, { ...route, studyId: document.study.id }, '/estudos').href;
    expect(href).toContain(`executionId=${document.selection.diagnosticExecutionId}`);
    expect(href).toContain(`scenarioId=${document.selection.scenarioId}`);
  });

  it('reopens both executions for comparison evidence and limitations', async () => {
    const input = await comparisonInput();
    const document = await buildCommunicationDocument({ ...input, diagnosticExecutionId: input.comparisonExecutionId!,
      scenarioId: input.study.executions.find((item) => item.id === input.comparisonExecutionId)!.scenarioId,
      comparisonExecutionId: input.diagnosticExecutionId });
    const comparisonEvidence = Object.entries(document.evidenceIndex).find(([, item]) => item.source === 'COMPARISON')![0];
    const expected = `/comparar?studyId=${document.study.id}&baseExecutionId=${document.selection.comparisonExecutionId}`
      + `&hypothesisExecutionId=${document.selection.diagnosticExecutionId}`;
    expect(citationDestination({ kind: 'EVIDENCE', id: comparisonEvidence }, document.contextFingerprint,
      catalog, document, { ...route, studyId: document.study.id }, '/comparar').href).toBe(expected);
    const withLimitation = { ...document, limitations: [...document.limitations, { code: 'COMPARISON_0',
      severity: 'WARNING' as const, statement: 'Limite comparativo', evidenceRefs: [comparisonEvidence] }] };
    expect(citationDestination({ kind: 'LIMITATION', id: 'COMPARISON_0' }, document.contextFingerprint,
      catalog, withLimitation, { ...route, studyId: document.study.id }, '/comparar').href)
      .toBe(`${expected}#comparison-limitations-title`);
  });

  it('leaves comparison evidence unavailable when the historical pair is incomplete', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    const broken = { ...document, evidenceIndex: { ...document.evidenceIndex,
      'COMPARISON:/x': { ...Object.values(document.evidenceIndex)[0]!, source: 'COMPARISON' as const } } };
    expect(citationDestination({ kind: 'EVIDENCE', id: 'COMPARISON:/x' }, document.contextFingerprint,
      catalog, broken, { ...route, studyId: document.study.id }, '/comparar').href).toBeNull();
  });
});
