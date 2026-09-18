// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, PreviaRequest, PreviewEnvelope, ReferenceExample } from '../api/client';
import { ApiError } from '../api/errors';
import { createUserQueryClient } from '../app/queryClient';
import { PreviewProvider, usePreview } from './PreviewProvider';

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

function matchingEnvelope(input: PreviaRequest): PreviewEnvelope {
  return {
    ...structuredClone(envelopeFixture),
    request_id: input.request_id,
    study_id: input.study_id,
    scenario_id: input.scenario_id,
    scenario_revision: input.scenario_revision,
  };
}

function Probe() {
  const preview = usePreview();
  return (
    <div>
      <button type="button" disabled={preview.status === 'running'} onClick={() => void preview.executeReference()}>executar</button>
      <button
        type="button"
        disabled={preview.status === 'running'}
        onClick={() => { void preview.executeRequest(requestFixture).catch(() => undefined); }}
      >
        executar request
      </button>
      <button type="button" onClick={() => preview.restoreEnvelope(envelopeFixture)}>
        restaurar
      </button>
      <button
        type="button"
        onClick={() => preview.restoreEnvelope({
          ...envelopeFixture,
          api_version: '2.0.0',
        } as unknown as PreviewEnvelope)}
      >
        restaurar inválido
      </button>
      <output data-testid="status">{preview.status}</output>
      <output data-testid="economia">{preview.envelope?.result.agregado.economia_periodo_brl ?? '-'}</output>
      <output data-testid="erro">{preview.error?.code ?? '-'}</output>
      <output data-testid="imutavel">{String(preview.envelope !== null && Object.isFrozen(preview.envelope.input_snapshot))}</output>
    </div>
  );
}

function Harness({ client, initialOwner = 'user-a' }: { client: ApiClient; initialOwner?: string }) {
  const [owner, setOwner] = useState(initialOwner);
  return (
    <QueryClientProvider client={createUserQueryClient()}>
      <button type="button" onClick={() => setOwner((value) => value === 'user-a' ? 'user-b' : 'user-a')}>trocar conta</button>
      <PreviewProvider client={client} ownerId={owner}><Probe /></PreviewProvider>
    </QueryClientProvider>
  );
}

function api(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getReferenceExample: vi.fn(async () => structuredClone(referenceFixture)),
    getImportCatalog: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    runPreview: vi.fn(async (input) => matchingEnvelope(input)),
    ...overrides,
  };
}

describe('PreviewProvider', () => {
  it('executa request genérico e aceita somente a identidade enviada', async () => {
    const client = api({
      runPreview: vi.fn(async (input) => matchingEnvelope(input)),
    });
    const user = userEvent.setup();
    render(<Harness client={client} />);

    await user.click(screen.getByRole('button', { name: 'executar request' }));

    expect(await screen.findByText('1026000.000000')).toBeVisible();
    expect(client.getReferenceExample).not.toHaveBeenCalled();
    expect(client.runPreview).toHaveBeenCalledOnce();
  });

  it('restaura envelope validado sem executar request', async () => {
    const client = api();
    const user = userEvent.setup();
    render(<Harness client={client} />);

    await user.click(screen.getByRole('button', { name: 'restaurar' }));

    expect(screen.getByTestId('economia')).toHaveTextContent('1026000.000000');
    expect(screen.getByTestId('imutavel')).toHaveTextContent('true');
    expect(client.runPreview).not.toHaveBeenCalled();
  });

  it('recusa envelope salvo que não passa no schema', async () => {
    const client = api();
    const user = userEvent.setup();
    render(<Harness client={client} />);

    await user.click(screen.getByRole('button', { name: 'restaurar inválido' }));

    expect(screen.getByTestId('erro')).toHaveTextContent('RESPOSTA_INVALIDA');
    expect(screen.getByTestId('economia')).toHaveTextContent('-');
    expect(client.runPreview).not.toHaveBeenCalled();
  });

  it('executa somente por ação explícita e preserva o envelope imutável', async () => {
    const client = api();
    const user = userEvent.setup();
    render(<Harness client={client} />);

    expect(client.getReferenceExample).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'executar' }));

    expect(await screen.findByText('1026000.000000')).toBeVisible();
    expect(client.getReferenceExample).toHaveBeenCalledOnce();
    expect(client.runPreview).toHaveBeenCalledOnce();
    expect(screen.getByTestId('imutavel')).toHaveTextContent('true');
  });

  it('impede envio duplicado enquanto a execução está ativa', async () => {
    let resolve!: (value: PreviewEnvelope) => void;
    let sent!: PreviaRequest;
    const client = api({
      runPreview: vi.fn((input) => {
        sent = input;
        return new Promise<PreviewEnvelope>((next) => { resolve = next; });
      }),
    });
    render(<Harness client={client} />);

    const button = screen.getByRole('button', { name: 'executar' });
    await act(async () => { button.click(); button.click(); });
    expect(client.runPreview).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    await act(async () => resolve(matchingEnvelope(sent)));
    expect(await screen.findByText('1026000.000000')).toBeVisible();
  });

  it.each([
    ['request_id', '00000000-0000-4000-8000-000000000099'],
    ['study_id', '00000000-0000-4000-8000-000000000099'],
    ['scenario_id', '00000000-0000-4000-8000-000000000099'],
    ['scenario_revision', 99],
  ] as const)('rejeita resposta com %s de outro contexto', async (field, value) => {
    const client = api({
      runPreview: vi.fn(async (input) => ({ ...matchingEnvelope(input), [field]: value })),
    });
    const user = userEvent.setup();
    render(<Harness client={client} />);

    await user.click(screen.getByRole('button', { name: 'executar' }));

    expect(await screen.findByText('CONTEXTO_DIVERGENTE')).toBeVisible();
    expect(screen.getByTestId('economia')).toHaveTextContent('-');
  });

  it('descarta resposta tardia depois da troca de conta', async () => {
    let resolve!: (value: PreviewEnvelope) => void;
    let sent!: PreviaRequest;
    const client = api({
      runPreview: vi.fn((input) => {
        sent = input;
        return new Promise<PreviewEnvelope>((next) => { resolve = next; });
      }),
    });
    const user = userEvent.setup();
    render(<Harness client={client} />);
    await user.click(screen.getByRole('button', { name: 'executar' }));

    await user.click(screen.getByRole('button', { name: 'trocar conta' }));
    await act(async () => resolve(matchingEnvelope(sent)));

    expect(screen.getByTestId('economia')).toHaveTextContent('-');
    await user.click(screen.getByRole('button', { name: 'trocar conta' }));
    expect(screen.getByTestId('economia')).toHaveTextContent('-');
  });

  it('preserva o resultado anterior quando uma nova tentativa falha', async () => {
    let attempts = 0;
    const client = api({
      runPreview: vi.fn(async (input) => {
        attempts += 1;
        if (attempts === 2) throw new ApiError({ status: 503, code: 'AUTH_INDISPONIVEL', message: 'indisponível' });
        return matchingEnvelope(input);
      }),
    });
    const user = userEvent.setup();
    render(<Harness client={client} />);
    const button = screen.getByRole('button', { name: 'executar' });
    await user.click(button);
    expect(await screen.findByText('1026000.000000')).toBeVisible();

    await user.click(button);

    expect(await screen.findByText('AUTH_INDISPONIVEL')).toBeVisible();
    expect(screen.getByTestId('economia')).toHaveTextContent('1026000.000000');
    expect(client.runPreview).toHaveBeenCalledTimes(2);
  });
});
