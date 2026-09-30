// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FieldProvenance } from '../cases/domain';
import type { CanonicalAuthoredOrder, ScenarioDocument } from '../study/model';
import { LeverBuilder } from './LeverBuilder';

const observed: FieldProvenance = { kind: 'OBSERVED', source: 'xlsx', version: '1', recordedAt: '2026-01-01T00:00:00Z' };
const order = (id: string) => ({
  id, cliente_id: id, direcao: 'OUT', valor_brl: '10', dia_conhecida: 0, dia_limite: 2, eh_efx: false, finalidade: null,
}) as unknown as CanonicalAuthoredOrder;

function base(companies: readonly string[]): ScenarioDocument {
  const orders = companies.map((company) => order(`${company}-1`));
  const provenanceByOrder = Object.fromEntries(orders.map((item) => [item.id, {
    dia_conhecida: observed, dia_limite: observed, eh_efx: observed, finalidade: observed, valor_brl: observed,
  }]));
  return {
    id: 'base', name: 'Original',
    sourceSnapshot: {
      orders, provenanceByOrder,
      source: { kind: 'AUTHORED', authoredPortfolioId: 'p', definition: { kind: 'EXPLICIT_ORDERS', orders, provenanceByOrder } },
    },
  } as unknown as ScenarioDocument;
}

function subject(companies: readonly string[]) {
  const onCreateCombinations = vi.fn().mockResolvedValue(undefined);
  render(<LeverBuilder base={base(companies)} onCreate={vi.fn()} onCreateCombinations={onCreateCombinations} />);
  return { onCreateCombinations, user: userEvent.setup() };
}

afterEach(() => vi.restoreAllMocks());

describe('LeverBuilder · composição', () => {
  it('um só botão faz todas as combinações das empresas (3 empresas → 6)', async () => {
    const { onCreateCombinations, user } = subject(['A', 'B', 'C']);
    expect(screen.queryByRole('button', { name: /Cada empresa sozinha/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirar uma por vez/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar com as marcadas/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fazer composição (6 combinações)' }))
      .toHaveAttribute('data-chat-help-id', 'control.alavancas.combinacoes');
    await user.click(screen.getByRole('button', { name: 'Fazer composição (6 combinações)' }));
    expect(onCreateCombinations).toHaveBeenCalledWith(
      [['A'], ['B'], ['C'], ['A', 'B'], ['A', 'C'], ['B', 'C']], ['A', 'B', 'C'],
    );
  });

  it('clicar no nome tira a empresa e a composição usa só as que sobraram', async () => {
    const { onCreateCombinations, user } = subject(['A', 'B', 'C']);
    await user.click(screen.getByRole('button', { name: 'C', pressed: true }));
    expect(screen.getByRole('button', { name: 'C', pressed: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fazer composição (3 combinações)' }));
    expect(onCreateCombinations).toHaveBeenCalledWith([['A'], ['B'], ['A', 'B']], ['A', 'B', 'C']);
  });

  it('clicar de novo devolve a empresa à composição', async () => {
    const { user } = subject(['A', 'B', 'C']);
    await user.click(screen.getByRole('button', { name: 'B', pressed: true }));
    await user.click(screen.getByRole('button', { name: 'B', pressed: false }));
    expect(screen.getByRole('button', { name: 'Fazer composição (6 combinações)' })).toBeEnabled();
  });

  it('sem nenhuma empresa na composição, o botão fica desabilitado', async () => {
    const { user } = subject(['A', 'B']);
    await user.click(screen.getByRole('button', { name: 'A', pressed: true }));
    await user.click(screen.getByRole('button', { name: 'B', pressed: true }));
    expect(screen.getByRole('button', { name: /Fazer composição/ })).toBeDisabled();
  });

  it('com mais de 8 empresas na composição, pede para tirar empresas', async () => {
    const { user } = subject(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    expect(screen.getByRole('button', { name: /Fazer composição/ })).toBeDisabled();
    expect(screen.getByText(/no máximo 8 empresas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I', pressed: true }));
    expect(screen.getByRole('button', { name: 'Fazer composição (255 combinações)' })).toBeEnabled();
  });
});

describe('LeverBuilder · aplicar à carteira (combinação de carteiras)', () => {
  it('desabilita a aplicação neutra e não chama a persistência', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LeverBuilder base={base(['A', 'B'])} applyToBase onCreate={onCreate} />);
    const apply = screen.getByRole('button', { name: 'Aplicar à carteira' });
    expect(apply).toHaveAttribute('data-chat-help-id', 'control.alavancas.aplicar-carteira');
    expect(apply).toBeDisabled();
    await userEvent.setup().click(apply);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('não oferece composição nem tirar empresa, e aplica a alavanca à carteira', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LeverBuilder base={base(['A', 'B'])} applyToBase onCreate={onCreate} />);
    expect(screen.queryByRole('heading', { name: 'Composição' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Tirar a empresa inteira/ })).not.toBeInTheDocument();
    const user = userEvent.setup();
    const volumeOut = screen.getByLabelText('Volume OUT ×');
    await user.clear(volumeOut);
    await user.type(volumeOut, '2');
    await user.click(screen.getByRole('button', { name: 'Aplicar à carteira' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ group: 'A', volumeOut: '2', removeCompany: false }));
  });
});
