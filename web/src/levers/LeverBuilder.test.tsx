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
  it('"Cada empresa sozinha" cria uma variação por empresa', async () => {
    const { onCreateCombinations, user } = subject(['A', 'B', 'C']);
    await user.click(screen.getByRole('button', { name: 'Cada empresa sozinha (3)' }));
    expect(onCreateCombinations).toHaveBeenCalledWith([['A'], ['B'], ['C']], ['A', 'B', 'C']);
  });

  it('"Retirar uma por vez" cria a carteira sem cada empresa', async () => {
    const { onCreateCombinations, user } = subject(['A', 'B', 'C']);
    await user.click(screen.getByRole('button', { name: 'Retirar uma por vez (3)' }));
    expect(onCreateCombinations).toHaveBeenCalledWith([['B', 'C'], ['A', 'C'], ['A', 'B']], ['A', 'B', 'C']);
  });

  it('seleção manual cria só a combinação marcada', async () => {
    const { onCreateCombinations, user } = subject(['A', 'B', 'C']);
    const create = screen.getByRole('button', { name: 'Criar com as marcadas' });
    expect(create).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Incluir A' }));
    await user.click(screen.getByRole('checkbox', { name: 'Incluir C' }));
    await user.click(create);
    expect(onCreateCombinations).toHaveBeenCalledWith([['A', 'C']], ['A', 'B', 'C']);
  });

  it('mantém todas as combinações como opção avançada, não como ação primária', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onCreateCombinations, user } = subject(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(screen.queryByRole('button', { name: /Gerar todas as combinações/ })).not.toBeInTheDocument();
    await user.click(screen.getByText('Avançado: todas as combinações (254 variações)'));
    await user.click(screen.getByRole('button', { name: 'Criar as 254 variações' }));
    expect(onCreateCombinations).toHaveBeenCalledOnce();
    expect(onCreateCombinations.mock.calls[0]![0]).toHaveLength(254);
  });

  it('com mais de 8 empresas, a opção avançada explica que todas estão indisponíveis', () => {
    subject(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    expect(screen.getByText('Avançado: todas as combinações (indisponível com 9 empresas; máximo 8)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar as .* variações/ })).not.toBeInTheDocument();
  });
});

describe('LeverBuilder · aplicar à carteira (combinação de carteiras)', () => {
  it('desabilita a aplicação neutra e não chama a persistência', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LeverBuilder base={base(['A', 'B'])} applyToBase onCreate={onCreate} />);
    const apply = screen.getByRole('button', { name: 'Aplicar à carteira' });
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
