// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from './router';

function renderAppAt(path: string, sessionState: 'loading' | 'resolved' = 'resolved') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes sessionState={sessionState} />
    </MemoryRouter>,
  );
}

describe('application routes', () => {
  it.each([
    ['/carteira', 'Carteira'],
    ['/diagnostico', 'Diagnóstico'],
    ['/comparar', 'Comparar cenários'],
    ['/replay', 'Replay'],
    ['/premissas', 'Dados e premissas'],
  ])('marks %s as the active destination without hiding navigation', (path, destination) => {
    renderAppAt(path);

    expect(screen.getByRole('link', { name: destination })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dados e premissas' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: destination })).toBeVisible();
  });

  it('waits for session resolution before redirecting the root to Carteira', () => {
    const { rerender } = renderAppAt('/', 'loading');
    expect(screen.getByText('Verificando sessão…')).toBeVisible();

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes sessionState="resolved" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Carteira' })).toBeVisible();
  });

  it('moves focus to the destination heading after keyboard navigation', async () => {
    const user = userEvent.setup();
    renderAppAt('/carteira');

    await user.click(screen.getByRole('link', { name: 'Diagnóstico' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Diagnóstico' })).toHaveFocus();
  });

  it.each([
    ['/login', 'Entrar'],
    ['/auth/callback', 'Confirmando acesso'],
    ['/auth/definir-senha', 'Definir senha'],
  ])('renders the public route %s', (path, heading) => {
    renderAppAt(path);

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  });
});
