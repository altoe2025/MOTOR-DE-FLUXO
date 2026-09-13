// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, PreviaRequest, PreviewEnvelope, ReferenceExample } from '../api/client';
import { ApiError } from '../api/errors';
import { AppRoutes } from '../app/router';
import { ApplicationProviders } from '../app/providers';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient, AuthSession } from '../auth/types';

const requestFixture = JSON.parse(readFileSync(
  resolve(process.cwd(), '../contracts/fixtures/reference-request.json'), 'utf8',
)) as PreviaRequest;
const envelopeFixture = JSON.parse(readFileSync(
  resolve(process.cwd(), '../contracts/fixtures/reference-result.json'), 'utf8',
)) as PreviewEnvelope;
const referenceFixture: ReferenceExample = {
  cenario: requestFixture.cenario,
  periodo: requestFixture.periodo,
  proveniencia: requestFixture.proveniencia,
};

function session(): AuthSession {
  return { access_token: 'token-controlado', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user-a' } };
}

function authClient(): AuthClient {
  const current = session();
  return { auth: {
    getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { session: current }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ data: { session: current }, error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  } };
}

function matchingEnvelope(input: PreviaRequest): PreviewEnvelope {
  return { ...structuredClone(envelopeFixture), request_id: input.request_id, study_id: input.study_id,
    scenario_id: input.scenario_id, scenario_revision: input.scenario_revision };
}

function renderFlow(apiClient: ApiClient) {
  return render(
    <AuthProvider client={authClient()}>
      <ApplicationProviders client={apiClient}>
        <MemoryRouter initialEntries={['/carteira']}><AppRoutes /></MemoryRouter>
      </ApplicationProviders>
    </AuthProvider>,
  );
}

function api(runPreview: ApiClient['runPreview'] = async (input) => matchingEnvelope(input)): ApiClient {
  return {
    getReferenceExample: vi.fn(async () => structuredClone(referenceFixture)),
    runPreview: vi.fn(runPreview),
  };
}

describe('percurso de prévia', () => {
  it('mostra no Diagnóstico somente os valores canônicos do servidor', async () => {
    localStorage.clear();
    const client = api();
    const user = userEvent.setup();
    renderFlow(client);
    await user.type(await screen.findByLabelText('Nome do estudo'), 'Carteira piloto');

    await user.click(screen.getByRole('button', { name: 'Executar exemplo de referência' }));
    await user.click(screen.getByRole('link', { name: 'Diagnóstico' }));

    expect(await screen.findByText('Prévia — uma execução')).toBeVisible();
    expect(screen.getByTestId('economia-brl')).toHaveTextContent('R$ 1.026.000,00');
    expect(screen.getByTestId('netabilidade')).toHaveTextContent('58,82%');
    expect(screen.getByText('Exemplo sintético de validação')).toBeVisible();
    expect(screen.getByText(/não calibrados/i)).toBeVisible();
    expect(screen.getByText(envelopeFixture.execution_fingerprint)).toBeVisible();
    expect(client.runPreview).toHaveBeenCalledOnce();
  });

  it('preserva nome e resultado anterior após falha e só repete por novo clique', async () => {
    localStorage.clear();
    let attempts = 0;
    const client = api(async (input) => {
      attempts += 1;
      if (attempts === 2) throw new ApiError({ status: 503, code: 'AUTH_INDISPONIVEL', message: 'Autenticação indisponível.' });
      return matchingEnvelope(input);
    });
    const user = userEvent.setup();
    renderFlow(client);
    const name = await screen.findByLabelText('Nome do estudo');
    await user.type(name, 'Carteira preservada');
    const execute = screen.getByRole('button', { name: 'Executar exemplo de referência' });
    await user.click(execute);
    expect(client.runPreview).toHaveBeenCalledOnce();

    await user.click(execute);

    expect(await screen.findByRole('alert')).toHaveTextContent('Autenticação indisponível.');
    expect(screen.getByRole('alert')).toHaveTextContent(/resultado anterior continua disponível/i);
    expect(screen.getByLabelText('Nome do estudo')).toHaveValue('Carteira preservada');
    expect(client.runPreview).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('link', { name: 'Diagnóstico' }));
    expect(await screen.findByTestId('economia-brl')).toHaveTextContent('R$ 1.026.000,00');
  });
});
