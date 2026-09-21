// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { calculateOperationalProfile } from '../../profiles/calculateOperationalProfile';
import type { OperationalProfileVersion } from '../../profiles/domain';
import { FIXTURE_OWNER, makeObservedCase } from '../../study/fixtures';
import { ProfileScenarioBuilder } from './ProfileScenarioBuilder';

let profile: OperationalProfileVersion;

beforeAll(async () => {
  profile = await calculateOperationalProfile({
    id: 'profile-a', ownerSub: FIXTURE_OWNER, companyId: 'company-1', version: 1,
    createdAt: '2026-09-20T12:00:00Z', cases: [makeObservedCase()],
  });
});

describe('ProfileScenarioBuilder', () => {
  it('distingue evidência real de ordens sintéticas e bloqueia finalidade ausente', async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn();
    render(<ProfileScenarioBuilder profiles={[profile]} ownerSub={FIXTURE_OWNER} horizonDays={365} onPrepare={onPrepare} />);

    await user.click(screen.getByRole('checkbox', { name: /company-1/i }));
    expect(screen.getByText('Evidência real agregada')).toBeVisible();
    expect(screen.getByText('As ordens geradas serão sintéticas')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Preparar simulação por Perfil' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a finalidade OUT');
    expect(onPrepare).not.toHaveBeenCalled();
  });

  it('avisa sobre um único Perfil e mostra os valores congelados', async () => {
    const user = userEvent.setup();
    render(<ProfileScenarioBuilder profiles={[profile]} ownerSub={FIXTURE_OWNER} horizonDays={365} onPrepare={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: /company-1/i }));
    const card = screen.getByRole('group', { name: 'company-1' });
    await user.type(within(card).getByLabelText('Finalidade OUT'), 'ANEXO_V_REMESSA_TERCEIRO');
    await user.type(within(card).getByLabelText('Finalidade IN'), 'ANEXO_V_DISPONIBILIDADE');

    expect(screen.getByRole('alert')).toHaveTextContent('não representa uma pool multilateral');
    const frozen = screen.getByRole('group', { name: /Valores congelados/i });
    for (const value of [
      profile.id, profile.documentFingerprint, profile.companyId,
      'tesouraria_corporativa', '1', 'Não',
      'ANEXO_V_REMESSA_TERCEIRO', 'ANEXO_V_DISPONIBILIDADE', '365 dias',
    ]) expect(within(frozen).getByText(value, { exact: true })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Preparar simulação por Perfil' }));
    await waitFor(() => expect(screen.queryByText(/Informe a finalidade/)).not.toBeInTheDocument());
  });
});
