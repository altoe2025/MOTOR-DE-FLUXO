// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient, AuthSession } from '../auth/types';
import type { ApiClient } from '../api/client';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type {
  ApplicationRepository,
  AppendProfileVersionMutation,
  CASMutation,
  ConfirmObservedCaseMutation,
} from '../storage/applicationRepository';
import { createStudy } from '../study/domain';
import { makeObservedCase, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { ApplicationProviders } from './providers';
import { AppRoutes } from './router';

function session(userId = 'user-a'): AuthSession {
  return { access_token: `token-${userId}`, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId } };
}

function client(initial: AuthSession | null, options: { loginError?: string } = {}): AuthClient {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      signInWithPassword: vi.fn(async () => options.loginError === undefined
        ? { data: { session: session() }, error: null }
        : { data: { session: null }, error: { message: options.loginError } }),
      signOut: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ data: { session: session() }, error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

class RepositoryDouble implements ApplicationRepository {
  constructor(
    readonly companies: CompanyRecord[] = [],
    readonly cases: ObservedCase[] = [],
    readonly profiles: OperationalProfileVersion[] = [],
    readonly studies: StudyDocument[] = [],
  ) {}
  async listCompanies() { return this.companies; }
  async listObservedCases(companyId?: string) { return companyId === undefined ? this.cases : this.cases.filter((item) => item.companyId === companyId); }
  async getObservedCase(id: string) { return this.cases.find((item) => item.id === id) ?? null; }
  async confirmObservedCase(input: ConfirmObservedCaseMutation) { return input.observedCase; }
  async listOperationalProfileVersions(companyId?: string) { return companyId === undefined ? this.profiles : this.profiles.filter((item) => item.companyId === companyId); }
  async getOperationalProfileVersion(id: string) { return this.profiles.find((item) => item.id === id) ?? null; }
  async appendOperationalProfileVersion(input: AppendProfileVersionMutation) {
    this.profiles.push(input.document);
    return input.document;
  }
  async listStudies() { return this.studies; }
  async getStudy(id: string) { return this.studies.find((item) => item.id === id) ?? null; }
  async saveStudy(input: CASMutation<StudyDocument>) {
    const index = this.studies.findIndex((item) => item.id === input.document.id);
    if (index >= 0) this.studies[index] = input.document; else this.studies.push(input.document);
    return input.document;
  }
  async restoreStudy(): Promise<StudyDocument> { throw new Error('não usado'); }
  async purgeStudy() {}
  close() {}
}

function renderAppAt(
  path: string,
  authClient: AuthClient = client(session()),
  repository: ApplicationRepository | null = null,
) {
  const apiClient: ApiClient = {
    getReferenceExample: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    runPreview: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
  };
  return render(
    <AuthProvider client={authClient}>
      <ApplicationProviders client={apiClient} {...(repository === null ? {} : { repositoryFactory: () => repository })}>
        <MemoryRouter initialEntries={[path]}><AppRoutes /><LocationProbe /></MemoryRouter>
      </ApplicationProviders>
    </AuthProvider>,
  );
}

describe('application routes', () => {
  it.each([
    ['/empresas', 'Empresas'], ['/estudos', 'Estudos'],
  ])('protege %s e marca o destino ativo', async (path, destination) => {
    renderAppAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: destination })).toBeVisible();
    expect(screen.getByRole('link', { name: destination })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
  });

  it('redireciona visitante para login', async () => {
    renderAppAt('/carteira', client(null));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('faz login por e-mail e senha', async () => {
    const authClient = client(null);
    const user = userEvent.setup();
    renderAppAt('/login', authClient);
    await screen.findByRole('heading', { name: 'Entrar' });
    await user.type(screen.getByLabelText('E-mail'), 'gabriel@example.com');
    await user.type(screen.getByLabelText('Senha'), 'password-1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Carteira' })).toBeVisible();
    expect(authClient.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'gabriel@example.com', password: 'password-1234' });
  });

  it('preserva e exibe erro de credencial', async () => {
    const user = userEvent.setup();
    renderAppAt('/login', client(null, { loginError: 'Invalid login credentials' }));
    await user.type(await screen.findByLabelText('E-mail'), 'gabriel@example.com');
    await user.type(screen.getByLabelText('Senha'), 'incorreta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveValue('gabriel@example.com');
  });

  it('define senha depois da sessão validada', async () => {
    const authClient = client(session());
    const user = userEvent.setup();
    renderAppAt('/auth/definir-senha', authClient);
    await user.type(await screen.findByLabelText('Nova senha'), 'password-1234');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'password-1234');
    await user.click(screen.getByRole('button', { name: 'Definir senha' }));
    expect(await screen.findByRole('heading', { name: 'Carteira' })).toBeVisible();
    expect(authClient.auth.updateUser).toHaveBeenCalledWith({ password: 'password-1234' });
  });

  it('não envia senhas divergentes', async () => {
    const authClient = client(session());
    const user = userEvent.setup();
    renderAppAt('/auth/definir-senha', authClient);
    await user.type(await screen.findByLabelText('Nova senha'), 'password-1234');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'password-5678');
    await user.click(screen.getByRole('button', { name: 'Definir senha' }));
    expect(await screen.findByText('As senhas informadas não coincidem.')).toBeVisible();
    expect(authClient.auth.updateUser).not.toHaveBeenCalled();
  });

  it('salva o nome por usuário e não restaura em outra conta', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const first = renderAppAt('/carteira', client(session('user-a')));
    const field = await screen.findByLabelText('Nome do estudo');
    await user.type(field, 'Carteira A');
    await waitFor(() => expect(localStorage.getItem('motor-fluxo:draft:v1:user-a')).toContain('Carteira A'));
    first.unmount();

    renderAppAt('/carteira', client(session('user-b')));
    expect(await screen.findByLabelText('Nome do estudo')).toHaveValue('');
  });

  it('renderiza callback inválido como erro recuperável', async () => {
    renderAppAt('/auth/callback', client(null));
    expect(await screen.findByRole('heading', { name: 'Confirmando acesso' })).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(/inválido/);
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toBeVisible();
  });

  it('processa callback somente uma vez sob StrictMode e limpa token da URL', async () => {
    const authClient = client(null);
    window.history.replaceState({}, '', '/auth/callback?token_hash=hash-valido&type=invite');
    render(
      <StrictMode>
        <AuthProvider client={authClient}>
          <MemoryRouter initialEntries={['/auth/callback']}><AppRoutes /></MemoryRouter>
        </AuthProvider>
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'Definir senha' })).toBeVisible();
    expect(authClient.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it.each([
    ['/carteira', 'Carteira'], ['/diagnostico', 'Diagnóstico'], ['/comparar', 'Comparar cenários'],
    ['/replay', 'Replay'], ['/premissas', 'Dados e premissas'],
  ])('preserva a rota protegida %s fora da navegação global', async (path, heading) => {
    renderAppAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(screen.queryByRole('link', { name: heading })).not.toBeInTheDocument();
  });

  it('expõe somente Empresas e Estudos na navegação global', async () => {
    renderAppAt('/empresas', client(session('user-a')), new RepositoryDouble());
    const navigation = await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(navigation).toHaveTextContent('Empresas');
    expect(navigation).toHaveTextContent('Estudos');
    expect(navigation.querySelectorAll('a')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Empresas' })).toHaveAttribute('aria-current', 'page');
  });

  it('navega pelo catálogo e pelas quatro áreas da empresa com foco no título', async () => {
    const company: CompanyRecord = {
      id: 'company-1', ownerSub: 'user-a', displayName: 'Câmbio Exemplo', aliases: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
    };
    const repository = new RepositoryDouble([company]);
    const user = userEvent.setup();
    renderAppAt('/empresas', client(session('user-a')), repository);
    await user.click(await screen.findByRole('link', { name: 'Câmbio Exemplo' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Câmbio Exemplo' })).toHaveFocus();
    for (const [label, path, heading] of [
      ['Casos', '/empresas/company-1/casos', 'Casos de Câmbio Exemplo'],
      ['Perfis', '/empresas/company-1/perfis', 'Perfis de Câmbio Exemplo'],
      ['Estudos', '/empresas/company-1/estudos', 'Estudos de Câmbio Exemplo'],
    ] as const) {
      const link = within(screen.getByRole('navigation', { name: 'Áreas da empresa' })).getByRole('link', { name: label });
      link.focus();
      await user.keyboard('{Enter}');
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toHaveFocus();
      expect(screen.getByTestId('location')).toHaveTextContent(path);
    }
  });

  it('não revela empresa de outro owner nem rota inexistente', async () => {
    const foreign: CompanyRecord = {
      id: 'secret-company', ownerSub: 'user-b', displayName: 'Empresa secreta', aliases: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
    };
    renderAppAt('/empresas/secret-company', client(session('user-a')), new RepositoryDouble([foreign]));
    expect(await screen.findByRole('heading', { name: 'Empresa não encontrada' })).toBeVisible();
    expect(screen.queryByText('Empresa secreta')).not.toBeInTheDocument();
  });

  it('não representa qualidade ausente como zero quando a empresa não tem casos', async () => {
    const company: CompanyRecord = {
      id: 'company-empty', ownerSub: 'user-a', displayName: 'Empresa sem casos', aliases: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
    };
    renderAppAt('/empresas/company-empty', client(session('user-a')), new RepositoryDouble([company]));
    const quality = (await screen.findByText('Qualidade')).closest('div');
    expect(quality).toHaveTextContent('não coletado');
    expect(quality).not.toHaveTextContent('0 bloqueios');
  });

  it('renderiza casos em tabela semântica e aponta estudo pelo snapshot histórico', async () => {
    const company: CompanyRecord = {
      id: 'company-1', ownerSub: 'user-a', displayName: 'Câmbio Exemplo', aliases: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
    };
    const caseRecord: ObservedCase = {
      ...makeObservedCase(), id: 'case-1', ownerSub: 'user-a', companyId: company.id,
      orders: [], sourceManifest: { ...makeObservedCase().sourceManifest, sourceKind: 'XLSX' },
    };
    const historical = {
      schemaVersion: '3.0.0', id: 'study-linked', ownerSub: 'user-a', name: 'Estudo vinculado',
      revision: 1, baseScenarioId: 'scenario-1', scenarios: [], evidenceSnapshots: [],
      executions: [{ kind: 'PREVIEW', sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 3 } } }],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null,
    } as unknown as StudyDocument;
    renderAppAt('/empresas/company-1/casos?tipo=XLSX', client(session('user-a')), new RepositoryDouble([company], [caseRecord], [], [historical]));
    expect(await screen.findByRole('table', { name: 'Histórico de casos' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Janela' })).toBeVisible();
    expect(screen.getAllByRole('cell', { name: 'não coletado' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Estudo vinculado.*revisão 3/ })).toHaveAttribute('href', '/estudos/study-linked');
    expect(screen.getByLabelText('Tipo de fonte')).toHaveValue('XLSX');
  });

  it('mantém o deep link legado e abre o mesmo estudo na carteira', async () => {
    const study = await createStudy({
      id: 'study-deep-link', ownerSub: 'user-a', name: 'Estudo profundo',
      baseScenario: makeScenarioDraft(), now: '2026-01-01T00:00:00Z',
    });
    renderAppAt('/estudos/study-deep-link', client(session('user-a')), new RepositoryDouble([], [], [], [study]));
    expect(await screen.findByRole('heading', { level: 1, name: 'Estudo profundo' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/carteira/study-deep-link');
  });

  it('confirma perfil e anexa o snapshot integral sem alterar a origem da carteira', async () => {
    const company: CompanyRecord = {
      id: 'company-1', ownerSub: 'user-a', displayName: 'Câmbio Exemplo', aliases: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
    };
    const observed = { ...makeObservedCase(), ownerSub: 'user-a', companyId: company.id };
    const study = await createStudy({
      id: 'study-profile', ownerSub: 'user-a', name: 'Estudo com perfil',
      baseScenario: makeScenarioDraft(), now: '2026-01-01T00:00:00Z',
    });
    const originalSource = structuredClone(study.scenarios[0]?.sourceSnapshot);
    const repository = new RepositoryDouble([company], [observed], [], [study]);
    const user = userEvent.setup();
    renderAppAt('/empresas/company-1/perfis', client(session('user-a')), repository);

    await user.click(await screen.findByRole('checkbox', { name: /case-1.*revisão 4/i }));
    expect(await screen.findByRole('region', { name: 'Prévia do Perfil Operacional' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirmar versão' }));
    expect(await screen.findByRole('heading', { name: 'Versão 1' })).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Estudo para receber a evidência'), study.id);
    await user.click(screen.getByRole('button', { name: 'Usar como evidência em estudo' }));

    await waitFor(() => expect(repository.studies[0]?.evidenceSnapshots).toHaveLength(1));
    expect(repository.studies[0]?.evidenceSnapshots[0]?.profile).toEqual(repository.profiles[0]);
    expect(repository.studies[0]?.scenarios[0]?.sourceSnapshot).toEqual(originalSource);
  });
});
