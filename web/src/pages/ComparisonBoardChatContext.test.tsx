// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import { ComparisonBoardPage } from './ComparisonBoardPage';

const mocks = vi.hoisted(() => ({
  controller: { listStudies: vi.fn(), listObservedCases: vi.fn(), listCompanies: vi.fn() },
  publishBoardContext: vi.fn(),
}));

vi.mock('../app/providers', () => ({ useStudyController: () => mocks.controller }));
vi.mock('../chat/ChatProvider', () => ({
  useOptionalChat: () => ({ publishBoardContext: mocks.publishBoardContext }),
}));

describe('comparison board chat publication', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.publishBoardContext.mockClear();
    mocks.controller.listObservedCases.mockResolvedValue([]);
    mocks.controller.listCompanies.mockResolvedValue([]);
  });

  it('publishes only rows explicitly selected in the visible board', async () => {
    const { study } = await observedInput();
    mocks.controller.listStudies.mockResolvedValue([study]);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/quadro']}><ComparisonBoardPage /></MemoryRouter>);

    const checkbox = await screen.findByRole('checkbox', { name: new RegExp(study.name) });
    await waitFor(() => expect(mocks.publishBoardContext).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'BOARD', document: expect.objectContaining({ rows: [] }),
    })));
    await user.click(checkbox);
    await waitFor(() => expect(mocks.publishBoardContext).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'BOARD', document: expect.objectContaining({
        rows: [expect.objectContaining({ studyId: study.id, scenarioId: study.scenarios[0]!.id })],
      }),
    })));
  });
});
