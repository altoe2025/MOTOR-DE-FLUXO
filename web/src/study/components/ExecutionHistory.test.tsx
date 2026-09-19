// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExecutionRecord, ScenarioDocument } from '../model';
import { ExecutionHistory } from './ExecutionHistory';

const scenario = {
  id: 'scenario-1', name: 'Base',
  sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 7 } },
} as ScenarioDocument;

const executions = [{
  id: 'execution-old', scenarioId: scenario.id, scenarioRevision: 3,
  inputFingerprint: 'a'.repeat(64), status: 'SUCCEEDED',
  engineVersion: 'build-123', contractVersion: '1.0.0',
  createdAt: '2026-09-19T12:00:00Z', finishedAt: '2026-09-19T12:01:00Z',
}, {
  id: 'execution-new', scenarioId: scenario.id, scenarioRevision: 4,
  inputFingerprint: 'b'.repeat(64), status: 'FAILED',
  engineVersion: 'unknown', contractVersion: '1.0.0',
  createdAt: '2026-09-19T13:00:00Z', finishedAt: '2026-09-19T13:01:00Z',
}] as ExecutionRecord[];

describe('ExecutionHistory', () => {
  it('lista estado, momento, versão, origem e fingerprint sem alterar autoria ao selecionar', async () => {
    const onSelect = vi.fn();
    const before = structuredClone(scenario);
    render(<ExecutionHistory executions={executions} scenarios={[scenario]} onSelect={onSelect} />);

    expect(screen.getByText('Concluída')).toBeVisible();
    expect(screen.getByText('Falhou')).toBeVisible();
    expect(screen.getAllByText(/Caso observado/)).toHaveLength(2);
    expect(screen.getByText(/build-123 · contrato 1.0.0/)).toBeVisible();
    expect(screen.getByText(`${'a'.repeat(12)}…`)).toBeVisible();

    await userEvent.setup().click(screen.getByRole('button', { name: /execução execution-old/i }));
    expect(onSelect).toHaveBeenCalledWith(executions[0]);
    expect(scenario).toEqual(before);
  });
});
