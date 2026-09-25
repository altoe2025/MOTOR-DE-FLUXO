// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import { observedInput } from '../communication/testFixtures';
import { PrintMetadata } from './PrintMetadata';

it('imprime identificadores públicos da publicação sem owner ou sessão', async () => {
  const input = await observedInput();
  const document = await buildCommunicationDocument(input);
  render(<PrintMetadata document={document} scenarioName="Caso observado" buildSha="abc1234" />);
  const metadata = screen.getByRole('contentinfo');
  expect(metadata).toHaveTextContent(document.study.name);
  expect(metadata).toHaveTextContent('Caso observado');
  expect(metadata).toHaveTextContent(document.selection.diagnosticExecutionId);
  expect(metadata).toHaveTextContent(document.generatedAt);
  expect(metadata).toHaveTextContent(document.presentationVersion);
  expect(metadata).toHaveTextContent('abc1234');
  expect(metadata).not.toHaveTextContent(input.study.ownerSub);
  expect(metadata).not.toHaveTextContent('token');
});
