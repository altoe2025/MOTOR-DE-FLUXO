// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { buildCommunicationDocument } from '../../communication/buildCommunicationDocument';
import { observedInput } from '../../communication/testFixtures';
import { selectChatContext } from '../contextFragment';
import { ChatCitation } from './ChatCitation';

describe('historical citation', () => {
  it('rebuilds the exact current fragment before linking a stored metric', async () => {
    const document = await buildCommunicationDocument(await observedInput());
    const fragment = await selectChatContext(document, { kind: 'METRIC', id: 'SAVINGS_BRL' });
    render(<MemoryRouter><ChatCitation citation={{ kind: 'METRIC', id: 'SAVINGS_BRL' }}
      fingerprint={fragment!.contextFingerprint} catalog={null} document={document}
      route={{ routeId: 'diagnostic', helpId: null, studyId: document.study.id,
        scenarioId: document.selection.scenarioId, diagnosticExecutionId: document.selection.diagnosticExecutionId,
        replayDay: null }} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Economia simulada' })).toHaveAttribute('href',
      `/estudos/${document.study.id}/diagnostico?scenarioId=${document.selection.scenarioId}`
      + `&executionId=${document.selection.diagnosticExecutionId}#selected-execution-heading`);
  });
});
