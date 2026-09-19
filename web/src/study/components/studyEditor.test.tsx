// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createStudy } from '../domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeScenarioDraft } from '../fixtures';
import { StudyEditor } from './StudyEditor';

async function subject(status = 'SAVED') {
  const study = await createStudy({ id: '00000000-0000-4000-8000-000000000099', ownerSub: FIXTURE_OWNER, name: 'Estudo teste', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
  const onRename = vi.fn(); const onSourceChange = vi.fn();
  render(<StudyEditor study={study} observedCases={[makeObservedCase()]} status={status} onRename={onRename} onDuplicate={vi.fn()} onSourceChange={onSourceChange} />);
  return { onRename, onSourceChange };
}

describe('StudyEditor', () => {
  it('salva nome com teclado e mantém foco no título ao trocar estudo', async () => {
    const { onRename } = await subject(); const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Nome do estudo')); await user.type(screen.getByLabelText('Nome do estudo'), 'Novo estudo{enter}');
    expect(onRename).toHaveBeenCalledWith('Novo estudo');
  });
  it('pede confirmação antes de trocar uma autoria não salva', async () => {
    const { onSourceChange } = await subject('DIRTY'); const user = userEvent.setup(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByLabelText('Caso observado'));
    expect(confirm).toHaveBeenCalled(); expect(onSourceChange).not.toHaveBeenCalled();
  });
  it('pede a resolução da origem observada sem alterar suas ordens no editor', async () => {
    const { onSourceChange } = await subject(); const user = userEvent.setup(); await user.click(screen.getByLabelText('Caso observado'));
    expect(onSourceChange).toHaveBeenCalledWith('OBSERVED_CASE', undefined);
  });
  it('comunica conflito como alerta e permanece legível em zoom de layout fluido', async () => {
    await subject('CONFLICT'); expect(screen.getByRole('alert')).toHaveTextContent(/outra aba/); expect(screen.getByRole('heading', { name: 'Estudo teste' })).toBeVisible();
  });
});
