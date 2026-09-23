// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient, AuthSession } from '../auth/types';
import type { ApiClient, DiagnosticRequest, JobSnapshot } from '../api/client';
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
import { parseCanonicalXlsx } from '../importer/workerClient';
import { ApplicationProviders } from './providers';
import { AppRoutes } from './router';

vi.mock('../importer/workerClient', () => ({ parseCanonicalXlsx: vi.fn(async () => ({
  layout: 'xlsx-operacoes/1.0.0', sha256: 'a'.repeat(64), byteSize: 128,
  rows: [{ operacao_id: 'OP-1', cliente_nome: 'Cliente da fonte', classificacao_perfil: null,
    direcao: 'OUT', data_conhecida: '2026-09-22', data_limite: '2026-09-23', valor_brl: '100', finalidade_codigo: null }],
})) }));

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

function RouteSwitch({ to }: Readonly<{ to: string }>) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to)}>Trocar rota de teste</button>;
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
  async confirmObservedCase(input: ConfirmObservedCaseMutation) { this.cases.push(input.observedCase); return input.observedCase; }
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
  extra: ReactNode = null,
  providedApiClient?: ApiClient,
) {
  const apiClient: ApiClient = providedApiClient ?? {
    getReferenceExample: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    getImportCatalog: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    runPreview: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    submitDiagnostic: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    getDiagnosticJob: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    getDiagnosticResult: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    cancelDiagnostic: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    retryDiagnostic: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
    buildReplay: vi.fn(async () => { throw new Error('não chamado neste teste'); }),
  };
  return render(
    <AuthProvider client={authClient}>
      <ApplicationProviders client={apiClient} {...(repository === null ? {} : { repositoryFactory: () => repository })}>
        <MemoryRouter initialEntries={[path]}><AppRoutes /><LocationProbe />{extra}</MemoryRouter>
      </ApplicationProviders>
    </AuthProvider>,
  );
}

function diagnosticSnapshot(request: DiagnosticRequest, status: JobSnapshot['status']): JobSnapshot {
  const terminal = status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED';
  return {
    api_version: '1.0.0', job_id: request.idempotency_key, request_id: request.request_id, status,
    progress: {
      completed: terminal ? request.sampling.count : 0,
      failed: 0,
      total: request.sampling.count,
      current_repetition_id: null,
      phase: terminal ? 'TERMINAL' : status === 'QUEUED' ? 'QUEUED' : 'EXECUTING',
      created_at: '2026-09-20T12:00:00Z',
      started_at: status === 'QUEUED' ? null : '2026-09-20T12:00:00Z',
      updated_at: '2026-09-20T12:00:00Z',
      finished_at: terminal ? '2026-09-20T12:01:00Z' : null,
    },
    retry_of_job_id: null,
    error: null,
  };
}

describe('application routes', () => {
  it('espera Ler planilha, revisa e confirma Caso sem executar motor', async () => {
    vi.mocked(parseCanonicalXlsx).mockClear();
    const company: CompanyRecord = { id: 'company-1', ownerSub: 'user-a', displayName: 'Empresa A', aliases: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1 };
    const repository = new RepositoryDouble([company]);
    const user = userEvent.setup();
    const view = renderAppAt('/importar', client(session('user-a')), repository);
    await user.selectOptions(await screen.findByLabelText('Empresa'), company.id);
    await user.upload(screen.getByLabelText('Planilha canônica XLSX'), new File(['planilha'], 'operacoes.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    expect(parseCanonicalXlsx).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /linhas representam operações explícitas/i }));
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Ler planilha' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('table', { name: 'Linhas importadas' })).toHaveTextContent('OP-1');
    expect(parseCanonicalXlsx).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Confirmar Caso Observado' }));
    expect(await screen.findByRole('heading', { name: 'Caso confirmado' })).toBeVisible();
    expect(repository.cases).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Criar Perfil Operacional' })).toHaveAttribute('href', expect.stringContaining('/empresas/company-1/perfis?caseId='));
    expect(screen.getByRole('link', { name: 'Abrir Estudos' })).toHaveAttribute('href', '/empresas/company-1/estudos');
    const caseId = repository.cases[0]!.id;
    view.unmount();
    renderAppAt(`/empresas/company-1/casos#caso-${caseId}`, client(session('user-a')), repository);
    expect(await screen.findByRole('table', { name: 'Histórico de casos' })).toContainElement(document.getElementById(`caso-${caseId}`));
  });
  it('mantém confirmação bloqueada até corrigir uma direção inválida', async () => {
    vi.mocked(parseCanonicalXlsx).mockResolvedValueOnce({ layout: 'xlsx-operacoes/1.0.0', sha256: 'b'.repeat(64), byteSize: 128,
      rows: [{ operacao_id: 'OP-2', cliente_nome: 'Cliente', classificacao_perfil: null, direcao: 'INDEFINIDA', data_conhecida: '2026-09-22', data_limite: '2026-09-23', valor_brl: '100', finalidade_codigo: null }] });
    const company: CompanyRecord = { id: 'company-1', ownerSub: 'user-a', displayName: 'Empresa A', aliases: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1 };
    const user = userEvent.setup();
    renderAppAt('/empresas/company-1/importar', client(session('user-a')), new RepositoryDouble([company]));
    await user.upload(await screen.findByLabelText('Planilha canônica XLSX'), new File(['planilha'], 'operacoes.xlsx'));
    await user.click(screen.getByRole('checkbox', { name: /linhas representam operações explícitas/i }));
    await user.click(screen.getByRole('button', { name: 'Ler planilha' }));
    expect(await screen.findByRole('button', { name: 'Confirmar Caso Observado' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Corrigir' }));
    await user.type(screen.getByLabelText('Valor corrigido'), 'IN');
    await user.click(screen.getByRole('button', { name: 'Aplicar correção' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar Caso Observado' })).toBeEnabled());
  });
  it('associa alias explícito e resolve conflito de versões na revisão', async () => {
    const row = { operacao_id: 'OP-1', cliente_nome: 'Cliente Norte', classificacao_perfil: null, direcao: 'OUT', data_conhecida: '2026-09-22', data_limite: '2026-09-23', valor_brl: '100', finalidade_codigo: null };
    vi.mocked(parseCanonicalXlsx).mockResolvedValueOnce({ layout: 'xlsx-operacoes/1.0.0', sha256: 'c'.repeat(64), byteSize: 128,
      rows: [row, { ...row, operacao_id: 'OP-2', cliente_nome: 'Cliente Norte SA' }, { ...row, valor_brl: '200' }] });
    const company: CompanyRecord = { id: 'company-1', ownerSub: 'user-a', displayName: 'Empresa A', aliases: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1 };
    const user = userEvent.setup();
    renderAppAt('/empresas/company-1/importar', client(session('user-a')), new RepositoryDouble([company]));
    await user.upload(await screen.findByLabelText('Planilha canônica XLSX'), new File(['planilha'], 'operacoes.xlsx'));
    await user.click(screen.getByRole('checkbox', { name: /linhas representam operações explícitas/i }));
    await user.click(screen.getByRole('button', { name: 'Ler planilha' }));
    expect(await screen.findByRole('region', { name: 'Conflitos de versão' })).toHaveTextContent('OP-1');
    await user.type(screen.getByLabelText('Nome na fonte'), 'Cliente Norte SA');
    await user.selectOptions(screen.getByLabelText('Cliente canônico'), screen.getByRole('option', { name: 'Cliente Norte' }));
    await user.click(screen.getByRole('button', { name: 'Associar alias' }));
    expect(within(screen.getByRole('row', { name: /OP-2/ })).getByRole('cell', { name: 'Cliente Norte' })).toBeVisible();
    const conflict = screen.getByRole('region', { name: 'Conflitos de versão' });
    const options = within(conflict).getByLabelText('Versão a manter').querySelectorAll('option');
    await user.selectOptions(within(conflict).getByLabelText('Versão a manter'), options[1]!.value);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Conflitos de versão' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Confirmar Caso Observado' })).toBeEnabled();
  });
  it('oferece importação protegida e predefine apenas empresa do owner', async () => {
    const company: CompanyRecord = { id: 'company-1', ownerSub: 'user-a', displayName: 'Empresa A', aliases: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1 };
    const repository = new RepositoryDouble([company]);
    const view = renderAppAt('/importar', client(session('user-a')), repository);
    expect(await screen.findByRole('heading', { level: 1, name: 'Importar operações' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Ler planilha' })).toBeDisabled();
    view.unmount();
    renderAppAt('/empresas/company-1/importar', client(session('user-a')), repository);
    expect(await screen.findByRole('heading', { level: 1, name: 'Importar operações de Empresa A' })).toBeVisible();
    expect(screen.getByLabelText('Empresa')).toHaveValue(company.id);
  });
  it('recusa importar para empresa de outra conta', async () => {
    const foreign: CompanyRecord = { id: 'foreign', ownerSub: 'user-b', displayName: 'Empresa secreta', aliases: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1 };
    renderAppAt('/empresas/foreign/importar', client(session('user-a')), new RepositoryDouble([foreign]));
    expect(await screen.findByRole('heading', { name: 'Empresa não encontrada' })).toBeVisible();
    expect(screen.queryByLabelText('Planilha canônica XLSX')).not.toBeInTheDocument();
    expect(screen.queryByText('Empresa secreta')).not.toBeInTheDocument();
  });

  it('pré-seleciona em Perfis apenas o Caso e a revisão válidos, sem confirmar versão', async () => {
    const company: CompanyRecord = { id: 'company-1', ownerSub: 'user-a', displayName: 'Empresa A', aliases: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1 };
    const observed = { ...makeObservedCase(), id: 'case-1', revision: 4, ownerSub: 'user-a', companyId: company.id };
    const repository = new RepositoryDouble([company], [observed]);
    const valid = renderAppAt('/empresas/company-1/perfis?caseId=case-1&caseRevision=4', client(session('user-a')), repository);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /case-1.*revisão 4/i })).toBeChecked());
    expect(repository.profiles).toHaveLength(0);
    valid.unmount();
    renderAppAt('/empresas/company-1/perfis?caseId=case-1&caseRevision=3', client(session('user-a')), repository);
    expect(await screen.findByRole('checkbox', { name: /case-1.*revisão 4/i })).not.toBeChecked();
  });
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
    ['/carteira', 'Carteira'], ['/comparar', 'Comparar cenários'],
    ['/replay', 'Replay'], ['/premissas', 'Dados e premissas'],
  ])('preserva a rota protegida %s fora da navegação global', async (path, heading) => {
    renderAppAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(screen.queryByRole('link', { name: heading })).not.toBeInTheDocument();
  });

  it('expõe Empresas, Estudos e Diagnóstico na navegação global', async () => {
    renderAppAt('/empresas', client(session('user-a')), new RepositoryDouble());
    const navigation = await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(navigation).toHaveTextContent('Empresas');
    expect(navigation).toHaveTextContent('Estudos');
    expect(navigation).toHaveTextContent('Diagnóstico');
    expect(navigation).toHaveTextContent('Importar');
    expect(navigation.querySelectorAll('a')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Empresas' })).toHaveAttribute('aria-current', 'page');
  });

  it('abre o diagnóstico robusto no contexto do estudo sem substituir a prévia legada', async () => {
    const draft = makeScenarioDraft();
    const { generationInputSnapshot: _generationInputSnapshot, ...fixedSource } = draft.sourceSnapshot;
    const study = await createStudy({
      id: 'study-diagnostic', ownerSub: 'user-a', name: 'Estudo diagnóstico',
      baseScenario: { ...draft, sourceSnapshot: fixedSource }, now: '2026-01-01T00:00:00Z',
    });
    void _generationInputSnapshot;
    renderAppAt('/estudos/study-diagnostic/diagnostico', client(session('user-a')), new RepositoryDouble([], [], [], [study]));
    expect(await screen.findByRole('heading', { level: 1, name: 'Diagnóstico robusto' }, { timeout: 5000 })).toBeVisible();
    expect(await screen.findByText(/entrada fixa.*uma execução individual/i)).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/estudos/study-diagnostic/diagnostico');
  });

  it('descarta load tardio do estudo anterior ao trocar a rota diagnóstica', async () => {
    const first = await createStudy({ id: 'study-first', ownerSub: 'user-a', name: 'Estudo anterior', baseScenario: makeScenarioDraft(), now: '2026-01-01T00:00:00Z' });
    const second = await createStudy({ id: 'study-second', ownerSub: 'user-a', name: 'Estudo vigente', baseScenario: makeScenarioDraft(), now: '2026-01-01T00:00:00Z' });
    const pending = new Map<string, (study: StudyDocument | null) => void>();
    class DelayedRepository extends RepositoryDouble {
      override async getStudy(id: string) { return new Promise<StudyDocument | null>((resolve) => pending.set(id, resolve)); }
    }
    const user = userEvent.setup();
    renderAppAt('/estudos/study-first/diagnostico', client(session('user-a')), new DelayedRepository([], [], [], [first, second]), <RouteSwitch to="/estudos/study-second/diagnostico" />);
    await waitFor(() => expect(pending.has('study-first')).toBe(true), { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Trocar rota de teste' }));
    await waitFor(() => expect(pending.has('study-second')).toBe(true), { timeout: 5000 });
    await act(async () => pending.get('study-second')?.(second));
    expect(await screen.findByText('Estudo Estudo vigente')).toBeVisible();
    await act(async () => pending.get('study-first')?.(first));
    expect(screen.getByText('Estudo Estudo vigente')).toBeVisible();
    expect(screen.queryByText('Estudo Estudo anterior')).not.toBeInTheDocument();
  });

  it('cancela pelo serviço enquanto a execução continua em polling e preserva o histórico', async () => {
    const studyId = '00000000-0000-4000-8000-000000000901';
    const scenario = makeScenarioDraft();
    scenario.sourceSnapshot.orders.sort((left, right) => left.id.localeCompare(right.id));
    const study = await createStudy({
      id: studyId, ownerSub: 'user-a', name: 'Estudo cancelável',
      baseScenario: scenario, now: '2026-01-01T00:00:00Z',
    });
    let submittedRequest: DiagnosticRequest | null = null;
    let cancellationRequested = false;
    const submitDiagnostic = vi.fn(async (request: DiagnosticRequest) => {
      submittedRequest = request;
      return diagnosticSnapshot(request, 'RUNNING');
    });
    const getDiagnosticJob = vi.fn(async () => {
      if (submittedRequest === null) throw new Error('submit ausente');
      return diagnosticSnapshot(submittedRequest, cancellationRequested ? 'CANCELLED' : 'RUNNING');
    });
    const cancelDiagnostic = vi.fn(async () => {
      if (submittedRequest === null) throw new Error('submit ausente');
      cancellationRequested = true;
      return diagnosticSnapshot(submittedRequest, 'CANCEL_REQUESTED');
    });
    const apiClient: ApiClient = {
      getReferenceExample: vi.fn(async () => { throw new Error('não chamado'); }),
      getImportCatalog: vi.fn(async () => { throw new Error('não chamado'); }),
      runPreview: vi.fn(async () => { throw new Error('não chamado'); }),
      submitDiagnostic,
      getDiagnosticJob,
      getDiagnosticResult: vi.fn(async () => { throw new Error('não chamado'); }),
      cancelDiagnostic,
      retryDiagnostic: vi.fn(async () => { throw new Error('não chamado'); }),
      buildReplay: vi.fn(async () => { throw new Error('não chamado'); }),
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderAppAt(
      `/estudos/${studyId}/diagnostico`, client(session('user-a')),
      new RepositoryDouble([], [], [], [study]), null, apiClient,
    );
    await user.click(await screen.findByRole('button', { name: 'Executar diagnóstico' }, { timeout: 5000 }));
    expect(await screen.findByRole('heading', { name: 'Executando' })).toBeVisible();
    const cancelButton = screen.getByRole('button', { name: 'Cancelar diagnóstico' });
    act(() => { cancelButton.click(); cancelButton.click(); });

    const request = submittedRequest as DiagnosticRequest | null;
    if (request === null) throw new Error('request diagnóstico ausente');
    expect(confirm).toHaveBeenCalledWith(`Cancelar o diagnóstico do job ${request.idempotency_key}?`);
    await waitFor(() => {
      expect(cancelDiagnostic).toHaveBeenCalledWith(request.idempotency_key, expect.any(AbortSignal));
      expect(cancelDiagnostic).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('heading', { name: 'Diagnóstico cancelado' }, { timeout: 5000 })).toBeVisible();
    const history = screen.getByRole('table', { name: 'Histórico de tentativas diagnósticas' });
    expect(history).toHaveTextContent('CANCELLED');
    expect(history).toHaveTextContent(request.idempotency_key);
  }, 15_000);

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

  it('integra a comparação temporal na empresa e mantém Casos e Perfis como fontes sem linguagem da Etapa 4', async () => {
    const company: CompanyRecord = {
      id: 'company-timeline', ownerSub: 'user-a', displayName: 'Empresa temporal', aliases: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
    };
    const first = { ...makeObservedCase(), id: 'case-january', ownerSub: 'user-a', companyId: company.id };
    const second = {
      ...makeObservedCase(), id: 'case-february', ownerSub: 'user-a', companyId: company.id,
      window: { startDate: '2026-02-01', endDate: '2026-02-28', closingDate: '2026-02-28' },
    };
    const repository = new RepositoryDouble([company], [first, second]);

    const companyView = renderAppAt('/empresas/company-timeline', client(session('user-a')), repository);
    expect(await screen.findByRole('heading', { name: 'Comparação temporal' })).toBeVisible();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    const content = document.body.textContent?.toLocaleLowerCase('pt-BR') ?? '';
    expect(content).not.toMatch(/cenário-base|hipótese|marginal|criar variante/);
    companyView.unmount();

    const casesView = renderAppAt('/empresas/company-timeline/casos', client(session('user-a')), repository);
    expect(await screen.findByRole('link', { name: 'Comparar observações no tempo' })).toHaveAttribute('href', '/empresas/company-timeline#comparacao-temporal');
    casesView.unmount();

    renderAppAt('/empresas/company-timeline/perfis', client(session('user-a')), repository);
    expect(await screen.findByRole('link', { name: 'Comparar observações no tempo' })).toHaveAttribute('href', '/empresas/company-timeline#comparacao-temporal');
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
