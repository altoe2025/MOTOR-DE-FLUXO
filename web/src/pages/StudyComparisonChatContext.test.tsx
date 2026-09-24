// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { comparisonInput } from '../communication/testFixtures';
import { StudyComparisonPage } from './StudyComparisonPage';

const mocks = vi.hoisted(() => {
  const loadStudy = vi.fn();
  return { loadStudy, controller: { loadStudy }, publishCommunication: vi.fn(),
    setScenarioId: vi.fn(), setDiagnosticExecutionId: vi.fn() };
});
vi.mock('../app/providers', () => ({ useStudyController: () => mocks.controller }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => ({
  publishCommunication: mocks.publishCommunication, setScenarioId: mocks.setScenarioId,
  setDiagnosticExecutionId: mocks.setDiagnosticExecutionId,
}) }));

describe('comparison communication context', () => {
  it('publishes the selected comparison only after explicit calculation', async () => {
    const user = userEvent.setup();
    const input = await comparisonInput();
    mocks.loadStudy.mockResolvedValue(input.study);
    render(<MemoryRouter initialEntries={[`/comparar?studyId=${input.study.id}`]}><StudyComparisonPage /></MemoryRouter>);
    expect(mocks.publishCommunication).not.toHaveBeenCalledWith(expect.objectContaining({ comparisonExecutionId: input.comparisonExecutionId }));
    const base = input.study.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.scenarioId === input.study.baseScenarioId && item.status === 'SUCCEEDED')!;
    await user.selectOptions(await screen.findByLabelText('Execução base'), base.id);
    await user.selectOptions(screen.getByLabelText('Execução da hipótese'), input.comparisonExecutionId!);
    await user.click(screen.getByRole('button', { name: 'Comparar' }));
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({
      study: expect.objectContaining({ id: input.study.id }), comparisonExecutionId: base.id,
      diagnosticExecutionId: input.comparisonExecutionId,
    })));
  });
});
