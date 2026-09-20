// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DiagnosticStatus, type DiagnosticViewState } from './DiagnosticStatus';

const progress = { completed: 3, failed: 0, total: 10, phase: 'EXECUTING' as const };

describe('estado visível do diagnóstico', () => {
  it.each([
    [{ kind: 'UNAVAILABLE', reason: 'A origem não possui receita geradora.' }, 'Diagnóstico indisponível'],
    [{ kind: 'QUEUED', jobId: 'job-queued', progress: { ...progress, completed: 0, phase: 'QUEUED' } }, 'Na fila'],
    [{ kind: 'RUNNING', jobId: 'job-running', progress }, 'Executando'],
    [{ kind: 'AGGREGATING', jobId: 'job-aggregating', progress: { ...progress, completed: 10, phase: 'AGGREGATING' } }, 'Agregando resultados'],
    [{ kind: 'CANCEL_REQUESTED', jobId: 'job-cancel', progress }, 'Cancelamento solicitado'],
    [{ kind: 'CANCELLED', attemptId: 'attempt-cancelled' }, 'Diagnóstico cancelado'],
    [{ kind: 'INTERRUPTED', attemptId: 'attempt-restart' }, 'Execução interrompida'],
    [{ kind: 'STORAGE_FAILURE', message: 'quota excedida' }, 'Falha ao salvar'],
    [{ kind: 'SUCCEEDED', attemptId: 'attempt-ok' }, 'Diagnóstico concluído'],
  ] satisfies readonly (readonly [DiagnosticViewState, string])[])('renderiza %s', (state, label) => {
    render(<DiagnosticStatus state={state} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('anuncia progresso sem expor o payload interno de falha', () => {
    const { rerender } = render(<DiagnosticStatus state={{ kind: 'RUNNING', jobId: 'job-running', progress }} />);
    expect(screen.getByRole('status')).toHaveTextContent('3 de 10');
    rerender(<DiagnosticStatus state={{ kind: 'FAILED', attemptId: 'attempt-failed', publicMessage: 'Não foi possível concluir.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível concluir.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('attempt-failed');
  });

  it('confirma o job exato antes de cancelar', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCancel = vi.fn();
    render(<DiagnosticStatus state={{ kind: 'RUNNING', jobId: 'job-123', progress }} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar diagnóstico' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('job-123'));
    expect(onCancel).toHaveBeenCalledWith('job-123');
  });

  it('identifica a tentativa anterior no retry', async () => {
    const onRetry = vi.fn();
    render(<DiagnosticStatus state={{ kind: 'FAILED', attemptId: 'attempt-before', publicMessage: 'Não foi possível concluir.' }} onRetry={onRetry} />);
    expect(screen.getByText(/attempt-before/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledWith('attempt-before');
  });

  it('permite nova tentativa após cancelamento sem apagar a anterior', async () => {
    const onRetry = vi.fn();
    render(<DiagnosticStatus state={{ kind: 'CANCELLED', attemptId: 'attempt-cancelled' }} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledWith('attempt-cancelled');
  });
});
