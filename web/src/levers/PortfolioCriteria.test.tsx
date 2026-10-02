// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { PortfolioCriteria } from './PortfolioCriteria';
import { emptyFilters } from './portfolioSelection';

it('searches without accents, preserves hidden selections and supports keyboard selection', async () => {
  function Subject() {
    const [filters, setFilters] = useState(emptyFilters);
    return <PortfolioCriteria objective="savings" filters={filters} errors={{}}
      companies={[{ id: 'export', name: 'Exportação' }, { id: 'psp', name: 'PSP' }]}
      onObjectiveChange={() => undefined} onFiltersChange={setFilters} />;
  }
  render(<Subject />);
  const user = userEvent.setup();
  const search = screen.getByRole('searchbox', { name: 'Buscar empresa' });
  await user.type(search, 'exportacao');
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  screen.getByRole('checkbox', { name: 'Exportação' }).focus();
  await user.keyboard(' ');
  expect(screen.getByRole('checkbox', { name: 'Exportação' })).toBeChecked();
  await user.clear(search);
  await user.type(search, 'PSP');
  expect(screen.getByText('1 de 2 obrigatórias')).toBeInTheDocument();
  await user.clear(search);
  expect(screen.getByRole('checkbox', { name: 'Exportação' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  expect(screen.getByRole('checkbox', { name: 'Exportação' })).not.toBeChecked();
  await user.type(search, 'inexistente');
  expect(screen.getByRole('status')).toHaveTextContent('Nenhuma empresa encontrada');
});

it('uses company IDs for homonymous names and reports validation beside its field', async () => {
  const change = vi.fn();
  render(<PortfolioCriteria objective="savings" filters={emptyFilters} errors={{ maxWaitDays: 'Número inválido' }}
    companies={[{ id: 'one', name: 'Igual' }, { id: 'two', name: 'Igual' }]}
    onObjectiveChange={vi.fn()} onFiltersChange={change} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Número inválido');
  expect(screen.getByRole('textbox', { name: /Espera média máxima/ })).toHaveAttribute('aria-invalid', 'true');
  await userEvent.setup().click(screen.getByRole('checkbox', { name: /Igual.*two/ }));
  expect(change).toHaveBeenCalledWith({ ...emptyFilters, requiredCompanyIds: ['two'] });
});

it('keeps malformed maximum-company text visible while the pure layer rejects it', async () => {
  const change = vi.fn();
  render(<PortfolioCriteria objective="savings" filters={emptyFilters} errors={{}}
    companies={[]} onObjectiveChange={vi.fn()} onFiltersChange={change} />);
  const field = screen.getByRole('textbox', { name: 'Máximo de empresas' });
  await userEvent.setup().type(field, '1,5');
  expect(field).toHaveValue('1,5');
  expect(change).toHaveBeenLastCalledWith({ ...emptyFilters, maxCompanies: NaN });
});

it.each(['0x10', '1e2'])('rejects non-decimal integer syntax %s', async (text) => {
  const change = vi.fn();
  render(<PortfolioCriteria objective="savings" filters={emptyFilters} errors={{}}
    companies={[]} onObjectiveChange={vi.fn()} onFiltersChange={change} />);
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Máximo de empresas' }), text);
  expect(change).toHaveBeenLastCalledWith({ ...emptyFilters, maxCompanies: NaN });
});
