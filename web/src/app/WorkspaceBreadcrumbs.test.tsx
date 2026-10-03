// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceBreadcrumbs, WorkspaceTrailProvider, useWorkspaceTrailLabel } from './WorkspaceBreadcrumbs';

const state = vi.hoisted(() => ({ document: null as { id: string; name: string; executions?: { id: string; scenarioId: string }[] } | null, listeners: new Set<() => void>() }));
vi.mock('./providers', () => ({ useStudyController: () => ({
  get snapshot() { return state; },
  subscribe: (listener: () => void) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; },
}) }));
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output>{location.pathname}{location.search}</output><button onClick={() => navigate('/carteira/study-b')}>Outro estudo</button></>; }
function Creation() {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);
  useWorkspaceTrailLabel(open ? 'Novo estudo' : null, close);
  return <p>{open ? 'Escolher origem' : 'Lista de estudos'}</p>;
}
function Company() { useWorkspaceTrailLabel('Aurora'); return null; }
function mount(path: string, child?: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}><WorkspaceTrailProvider><WorkspaceBreadcrumbs /><Probe />{child}</WorkspaceTrailProvider></MemoryRouter>);
}
const trail = () => within(screen.getByRole('navigation', { name: 'Caminho de navegação' }));
beforeEach(() => { state.document = { id: 'study-a', name: 'Estudo de outubro' }; state.listeners.clear(); });
describe('workspace breadcrumbs', () => {
  it('returns from diagnostic to its own editor using the keyboard', async () => {
    mount('/estudos/study-a/diagnostico');
    expect(trail().getByText('Diagnóstico')).toHaveAttribute('aria-current', 'page');
    const user = userEvent.setup(); await user.tab(); await user.tab();
    expect(trail().getByRole('link', { name: 'Estudo de outubro' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('/carteira/study-a');
    expect(trail().queryByRole('link', { name: 'Estudo de outubro' })).not.toBeInTheDocument();
  });
  it.each([
    ['/estudos/study-a/replay?scenarioId=scenario-a&executionId=execution-a&runAll=1', 'Replay'],
    ['/estudos/study-a/apresentacao?cenario=scenario-a&execucao=execution-a&dia=8', 'Apresentação'],
  ])('preserves selected execution when returning from %s', (path, label) => {
    mount(path);
    expect(trail().getByRole('link', { name: 'Diagnóstico' })).toHaveAttribute('href', '/estudos/study-a/diagnostico?scenarioId=scenario-a&executionId=execution-a');
    expect(trail().getByText(label)).toHaveAttribute('aria-current', 'page');
  });
  it('updates renamed studies without another repository load', () => {
    mount('/carteira/study-a');
    act(() => { state.document = { id: 'study-a', name: 'Novo nome' }; state.listeners.forEach(fn => fn()); });
    expect(trail().getByText('Novo nome')).toBeVisible();
  });
  it('recovers the scenario from the selected replay execution when the URL only has executionId', () => {
    state.document = { id: 'study-a', name: 'Estudo de outubro', executions: [{ id: 'execution-a', scenarioId: 'scenario-a' }] };
    mount('/estudos/study-a/replay?executionId=execution-a');
    expect(trail().getByRole('link', { name: 'Diagnóstico' })).toHaveAttribute('href', '/estudos/study-a/diagnostico?scenarioId=scenario-a&executionId=execution-a');
  });
  it('never shows the previous study name while another study loads', async () => {
    mount('/carteira/study-a'); await userEvent.click(screen.getByRole('button', { name: 'Outro estudo' }));
    expect(trail().queryByText('Estudo de outubro')).not.toBeInTheDocument();
    expect(trail().getByText('Estudo')).toBeVisible();
  });
  it('closes new-study selection through the Estudos parent', async () => {
    mount('/estudos', <Creation />);
    expect(trail().getByText('Novo estudo')).toHaveAttribute('aria-current', 'page');
    await userEvent.click(trail().getByRole('link', { name: 'Estudos' }));
    expect(screen.getByText('Lista de estudos')).toBeVisible();
    expect(trail().queryByText('Novo estudo')).not.toBeInTheDocument();
  });
  it('links company sections to the named company and company list', () => {
    mount('/empresas/company-a/casos', <Company />);
    expect(trail().getByRole('link', { name: 'Aurora' })).toHaveAttribute('href', '/empresas/company-a');
    expect(trail().getByRole('link', { name: 'Empresas' })).toHaveAttribute('href', '/empresas');
    expect(trail().getByText('Casos')).toHaveAttribute('aria-current', 'page');
  });
  it.each([['/quadro','Comparar estudos'],['/importar','Importar'],['/diagnostico','Diagnóstico']])('labels %s', (path, name) => {
    mount(path); expect(trail().getByText(name)).toHaveAttribute('aria-current', 'page');
  });
});
