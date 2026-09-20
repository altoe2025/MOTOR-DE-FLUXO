// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExecutionRecord, ScenarioDocument } from '../model';
import { ExecutionHistory } from './ExecutionHistory';

const scenario = {
  id: 'scenario-1', revision: 4, inputFingerprint: 'b'.repeat(64), name: 'Base',
  sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 7 } },
} as ScenarioDocument;

const executions = [{
  id: 'execution-old', scenarioId: scenario.id, scenarioRevision: 3,
  inputFingerprint: 'a'.repeat(64), status: 'SUCCEEDED',
  engineVersion: 'build-123', contractVersion: '1.0.0',
  requestSnapshot: { request_id: 'request-old' },
  createdAt: '2026-09-19T12:00:00Z', finishedAt: '2026-09-19T12:01:00Z',
}, {
  id: 'execution-new', scenarioId: scenario.id, scenarioRevision: 4,
  inputFingerprint: 'b'.repeat(64), status: 'FAILED',
  engineVersion: 'unknown', contractVersion: '1.0.0',
  requestSnapshot: { request_id: 'request-new' },
  createdAt: '2026-09-19T13:00:00Z', finishedAt: '2026-09-19T13:01:00Z',
}] as ExecutionRecord[];

describe('ExecutionHistory', () => {
  it('lista estado, momento, versão, origem e fingerprint sem alterar autoria ao selecionar', async () => {
    const onSelect = vi.fn();
    const before = structuredClone(scenario);
    render(<ExecutionHistory executions={executions} scenarios={[scenario]} onSelect={onSelect} />);

    expect(screen.getByText('Concluída')).toBeVisible();
    expect(screen.getByText('Falhou')).toBeVisible();
    expect(screen.getAllByText(/Caso observado/)).toHaveLength(1);
    expect(screen.getByText('Origem indisponível')).toBeVisible();
    expect(screen.getByText(/build-123 · contrato 1.0.0/)).toBeVisible();
    expect(screen.getByText(`${'a'.repeat(12)}…`)).toBeVisible();

    await userEvent.setup().click(screen.getByRole('button', { name: /execução execution-old/i }));
    expect(onSelect).toHaveBeenCalledWith(executions[0]);
    expect(scenario).toEqual(before);
  });

  it('não atribui origem corrente a execução legada após mudança de revisão e origem', () => {
    const changedScenario = {
      ...scenario,
      revision: 5,
      inputFingerprint: 'c'.repeat(64),
      sourceSnapshot: {
        source: {
          kind: 'SYNTHETIC',
          recipe: { exampleId: 'corrente' },
        },
      },
    } as ScenarioDocument;
    const legacy = structuredClone(executions[1]!);

    render(<ExecutionHistory executions={[legacy]} scenarios={[changedScenario]} onSelect={() => undefined} />);

    expect(screen.getByText('Origem indisponível')).toBeVisible();
    expect(screen.queryByText(/Carteira sintética/)).not.toBeInTheDocument();
  });

  it('mostra somente o terminal quando a reserva e a conclusão compartilham request_id', () => {
    const request = { request_id: 'request-1' } as ExecutionRecord['requestSnapshot'];
    const reservation = {
      ...executions[0]!, id: 'reservation-1', status: 'RUNNING',
      requestSnapshot: request, envelope: null, finishedAt: null,
    } as ExecutionRecord;
    const terminal = {
      ...executions[0]!, id: 'terminal-1', status: 'SUCCEEDED', requestSnapshot: request,
    } as ExecutionRecord;

    render(<ExecutionHistory executions={[reservation, terminal]} scenarios={[scenario]} onSelect={() => undefined} />);

    expect(screen.queryByText('Em execução')).not.toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeVisible();
  });
});
