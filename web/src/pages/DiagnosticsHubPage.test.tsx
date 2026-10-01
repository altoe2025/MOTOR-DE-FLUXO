// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStudy } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { DiagnosticsHubPage } from './DiagnosticsHubPage';

const controller = {
  listStudies: vi.fn<() => Promise<StudyDocument[]>>(),
};

vi.mock('../app/providers', () => ({ useStudyController: () => controller }));

async function study(id: string, name: string): Promise<StudyDocument> {
  return createStudy({
    id,
    ownerSub: FIXTURE_OWNER,
    name,
    baseScenario: makeScenarioDraft({ id: `${id}-scenario`, name: `Cenário de ${name}` }),
    now: FIXTURE_NOW,
  });
}

describe('DiagnosticsHubPage', () => {
  beforeEach(async () => {
    controller.listStudies.mockResolvedValue([
      await study('study-a', 'Estudo A'),
      await study('study-b', 'Estudo B'),
    ]);
  });

  it('só monta os cenários do estudo que o usuário expandiu', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DiagnosticsHubPage /></MemoryRouter>);

    const firstToggle = await screen.findByRole('button', {
      name: 'Mostrar diagnósticos de Estudo A',
    });
    const secondToggle = screen.getByRole('button', {
      name: 'Mostrar diagnósticos de Estudo B',
    });
    expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
    expect(secondToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Cenários de Estudo A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cenários de Estudo B' })).not.toBeInTheDocument();

    await user.click(firstToggle);

    expect(screen.getByRole('region', { name: 'Cenários de Estudo A' })).toBeInTheDocument();
    expect(screen.getByText('Cenário de Estudo A')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cenários de Estudo B' })).not.toBeInTheDocument();
    expect(firstToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(firstToggle);

    expect(screen.queryByRole('region', { name: 'Cenários de Estudo A' })).not.toBeInTheDocument();
    expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
  });
});
