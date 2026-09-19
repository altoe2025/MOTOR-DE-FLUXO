// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createStudy } from '../domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeScenarioDraft } from '../fixtures';
import { requiredBuildSha } from '../sourceConfiguration';
import { StudyEditor } from './StudyEditor';
import { StudyList } from './StudyList';

async function study() {
  return createStudy({
    id: '00000000-0000-4000-8000-000000000099', ownerSub: FIXTURE_OWNER,
    name: 'Estudo teste', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW,
  });
}

async function subject(overrides: Partial<React.ComponentProps<typeof StudyEditor>> = {}) {
  const document = await study();
  const onRename = vi.fn();
  const onSourceChange = vi.fn();
  const onConvertObserved = vi.fn();
  const observedCase = makeObservedCase();
  render(<StudyEditor
    study={document}
    observedCases={[observedCase, { ...makeObservedCase(), id: 'archived', status: 'ARCHIVED' }]}
    companies={[{ id: 'company-1', ownerSub: FIXTURE_OWNER, displayName: 'Empresa Alfa', aliases: [], createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW, revision: 1 }]}
    status="SAVED" onRename={onRename} onDuplicate={vi.fn()}
    onSourceChange={onSourceChange} onConvertObserved={onConvertObserved}
    {...overrides}
  />);
  return { onRename, onSourceChange, onConvertObserved, observedCase };
}

describe('StudyEditor', () => {
  it('bloqueia preparação sem SHA real e aceita somente configuração hexadecimal válida', () => {
    expect(() => requiredBuildSha(undefined, undefined)).toThrow('VITE_MOTOR_BUILD_SHA');
    expect(() => requiredBuildSha('0'.repeat(39), undefined)).toThrow('SHA de build inválido');
    expect(requiredBuildSha('a'.repeat(40), undefined)).toBe('a'.repeat(40));
    expect(requiredBuildSha(undefined, 'b'.repeat(40))).toBe('b'.repeat(40));
  });

  it('salva nome com teclado', async () => {
    const { onRename } = await subject(); const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Nome do estudo'));
    await user.type(screen.getByLabelText('Nome do estudo'), 'Novo estudo{enter}');
    expect(onRename).toHaveBeenCalledWith('Novo estudo');
  });

  it('confirma antes de descartar autoria local e preserva os campos quando cancelado', async () => {
    const user = userEvent.setup(); await subject();
    await user.click(screen.getByLabelText('Autoria manual'));
    await user.clear(screen.getByLabelText('Nome do grupo'));
    await user.type(screen.getByLabelText('Nome do grupo'), 'Tesouraria Sul');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByLabelText('Caso observado'));
    expect(confirm).toHaveBeenCalledWith('Trocar a origem descarta a autoria manual não aplicada. Continuar?');
    expect(screen.getByLabelText('Nome do grupo')).toHaveValue('Tesouraria Sul');
  });

  it('oferece cinco exemplos e envia a receita escolhida para preparação oficial', async () => {
    const { onSourceChange } = await subject(); const user = userEvent.setup();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    await user.selectOptions(screen.getByLabelText('Escolha do exemplo sintético'), 'psp-inbound');
    await user.click(screen.getByRole('button', { name: 'Preparar exemplo' }));
    expect(onSourceChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'SYNTHETIC', exampleId: 'psp-inbound',
      preparation: expect.objectContaining({ input: expect.objectContaining({ participants: expect.any(Array) }) }),
    }));
  });

  it('prepara autoria manual com grupos, participante, herança e overrides como Decimal textual', async () => {
    const { onSourceChange } = await subject(); const user = userEvent.setup();
    await user.click(screen.getByLabelText('Autoria manual'));
    await user.clear(screen.getByLabelText('Frequência mensal do grupo'));
    await user.type(screen.getByLabelText('Frequência mensal do grupo'), '12');
    await user.clear(screen.getByLabelText('Ticket médio do grupo'));
    await user.type(screen.getByLabelText('Ticket médio do grupo'), '1500.50');
    await user.click(screen.getByLabelText('Sobrescrever parâmetros do participante'));
    await user.clear(screen.getByLabelText('Frequência mensal do participante'));
    await user.type(screen.getByLabelText('Frequência mensal do participante'), '3');
    await user.click(screen.getByRole('button', { name: 'Preparar carteira manual' }));
    expect(onSourceChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'AUTHORED', authoredPortfolioId: expect.any(String),
      preparation: expect.objectContaining({ input: expect.objectContaining({ participants: [expect.objectContaining({
        monthly_volume_brl: '4501.5', ticket_median_brl: '1500.5',
      })] }) }),
    }));
  });

  it('valida Decimal localmente antes da rede', async () => {
    const { onSourceChange } = await subject(); const user = userEvent.setup();
    await user.click(screen.getByLabelText('Autoria manual'));
    await user.clear(screen.getByLabelText('Ticket médio do grupo'));
    await user.type(screen.getByLabelText('Ticket médio do grupo'), '1,5');
    await user.click(screen.getByRole('button', { name: 'Preparar carteira manual' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use ponto como separador decimal');
    expect(onSourceChange).not.toHaveBeenCalled();
  });

  it('converte caso observado em autoria preenchida sem modificar o original', async () => {
    const { onSourceChange, onConvertObserved, observedCase } = await subject(); const user = userEvent.setup();
    const originalJson = JSON.stringify(observedCase);
    await user.click(screen.getByLabelText('Caso observado'));
    const selector = screen.getByLabelText('Caso confirmado');
    expect(within(selector).getAllByRole('option')).toHaveLength(2);
    await user.selectOptions(selector, 'case-1');
    expect(screen.getByText('Empresa Alfa')).toBeVisible();
    expect(screen.getByText('100 BRL')).toBeVisible();
    expect(screen.getByText(/1 ordem/)).toBeVisible();
    expect(screen.getByText(/Sem bloqueios/)).toBeVisible();
    expect(screen.getByText(/arquivo-observado/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Usar caso confirmado' }));
    expect(onSourceChange).toHaveBeenCalledWith({ kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 4 });
    await user.click(screen.getByRole('button', { name: 'Converter para autoria manual' }));
    expect(onConvertObserved).toHaveBeenCalledWith('case-1');
    expect(screen.getByLabelText('Ticket médio do participante')).toHaveValue('100');
    expect(screen.getByLabelText('Direção do participante')).toHaveValue('OUT');
    expect(screen.getByLabelText('Finalidade do participante')).toHaveValue('ANEXO_V_REMESSA_TERCEIRO');
    expect(onSourceChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'AUTHORED',
      preparation: expect.objectContaining({ input: expect.objectContaining({ participants: [expect.objectContaining({ ticket_median_brl: '100', out_fraction: '1' })] }) }),
    }));
    expect(JSON.stringify(observedCase)).toBe(originalJson);
  });
});

describe('StudyList', () => {
  it('expõe Novo estudo e preserva as ações da lista', async () => {
    const document = await study(); const onCreate = vi.fn();
    render(<StudyList studies={[document]} selectedId={null} onCreate={onCreate} onOpen={vi.fn()} onRename={vi.fn()} onDuplicate={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Novo estudo' }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Abrir Estudo teste' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Renomear Estudo teste' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Duplicar Estudo teste' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir Estudo teste' })).toBeVisible();
  });
});
