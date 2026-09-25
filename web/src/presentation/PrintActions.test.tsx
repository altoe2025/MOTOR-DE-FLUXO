// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { PrintActions } from './PrintActions';

afterEach(() => vi.restoreAllMocks());

it('abre o diálogo nativo de impressão e orienta Salvar como PDF', () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  render(<PrintActions />);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar PDF' }));
  expect(print).toHaveBeenCalledOnce();
  expect(screen.getByText(/Salvar como PDF/)).toBeInTheDocument();
});
