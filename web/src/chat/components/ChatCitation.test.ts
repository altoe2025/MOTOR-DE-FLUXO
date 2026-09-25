import { describe, expect, it } from 'vitest';

import productHelp from '../../../../servidor/catalogs/product_help.v1.json';
import { validateProductHelpCatalog } from '../../help/catalog';
import { citationDestination } from './ChatCitation';
import { buildCommunicationDocument } from '../../communication/buildCommunicationDocument';
import { comparisonInput, observedInput } from '../../communication/testFixtures';

const catalog = validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!;
const route = { routeId: 'studies', helpId: null, studyId: null, scenarioId: null,
  diagnosticExecutionId: null, replayDay: null };

describe('citation navigation', () => {
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
