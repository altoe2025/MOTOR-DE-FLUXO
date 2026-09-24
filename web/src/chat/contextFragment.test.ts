import { describe, expect, it } from 'vitest';

import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import { observedInput } from '../communication/testFixtures';
import { validateCommunicationDocument } from '../communication/validation';
import { communicationMatchesRoute, selectChatContext } from './contextFragment';

describe('minimal chat context', () => {
  it('sends only the selected metric and its evidence with a valid new fingerprint', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    const fragment = await selectChatContext(document, { kind: 'METRIC', id: 'SAVINGS_BRL' });
    expect(fragment?.executiveMetrics.map((item) => item.code)).toEqual(['SAVINGS_BRL']);
    expect(fragment?.mechanism.metrics).toEqual([]);
    expect(Object.keys(fragment?.evidenceIndex ?? {})).toEqual(document.executiveMetrics.find((item) => item.code === 'SAVINGS_BRL')?.evidenceRefs);
    expect(fragment?.contextFingerprint).not.toBe(document.contextFingerprint);
    expect((await validateCommunicationDocument(fragment)).ok).toBe(true);
  });

  it('sends no study document for interface help and rejects an unknown metric', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    await expect(selectChatContext(document, { kind: 'HELP', id: 'concept.replay' })).resolves.toBeNull();
    await expect(selectChatContext(document, { kind: 'METRIC', id: 'unknown' })).rejects.toThrow();
  });

  it('does not silently turn a specific data question into a product-only request', async () => {
    await expect(selectChatContext(null, { kind: 'METRIC', id: 'SAVINGS_BRL' })).rejects.toThrow();
    await expect(selectChatContext(null, { kind: 'COMPARISON' })).rejects.toThrow();
    await expect(selectChatContext(null, { kind: 'REPLAY' })).rejects.toThrow();
  });

  it('hides a publication after selection changes even when its route path stays the same', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    const route = { routeId: 'diagnostic', helpId: null, studyId: document.study.id,
      scenarioId: document.selection.scenarioId, diagnosticExecutionId: document.selection.diagnosticExecutionId,
      replayDay: null };
    expect(communicationMatchesRoute(document, route)).toBe(true);
    expect(communicationMatchesRoute(document, { ...route, scenarioId: 'another-scenario' })).toBe(false);
  });

  it('sends only published limitations and their evidence for a limitation question', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    const fragment = await selectChatContext(document, { kind: 'LIMITATIONS' });
    expect(fragment?.limitations).toEqual(document.limitations);
    expect(fragment?.executiveMetrics).toEqual([]);
    expect(fragment?.mechanism.metrics).toEqual([]);
    expect(Object.keys(fragment?.evidenceIndex ?? {})).toEqual(document.limitations.flatMap((item) => item.evidenceRefs));
    expect((await validateCommunicationDocument(fragment)).ok).toBe(true);
  });

  it('rejects a broad document beyond the HTTP budget instead of truncating evidence', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    await expect(selectChatContext(document, { kind: 'BROAD' }, 100)).rejects.toThrow();
  });
});
