// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DiagnosticExecutionRecord } from '../../study/model';
import { DiagnosticHistory } from './DiagnosticHistory';

function record(attemptId: string, status: DiagnosticExecutionRecord['status'], createdAt: string): DiagnosticExecutionRecord {
  return { kind: 'DIAGNOSTIC', id: `${attemptId}-${status}`, attemptId, status, createdAt,
    finishedAt: status === 'QUEUED' ? null : createdAt } as DiagnosticExecutionRecord;
}

describe('histórico diagnóstico', () => {
  it('preserva tentativas anteriores e colapsa reserva/terminal da mesma tentativa', () => {
    render(<DiagnosticHistory executions={[
      record('attempt-1', 'QUEUED', '2026-09-20T10:00:00Z'),
      record('attempt-1', 'FAILED', '2026-09-20T10:00:00Z'),
      record('attempt-2', 'QUEUED', '2026-09-20T11:00:00Z'),
      record('attempt-2', 'SUCCEEDED', '2026-09-20T11:00:00Z'),
    ]} />);
    const table = screen.getByRole('table', { name: 'Histórico de tentativas diagnósticas' });
    expect(table).toHaveTextContent('attempt-1');
    expect(table).toHaveTextContent('FAILED');
    expect(table).toHaveTextContent('attempt-2');
    expect(table).toHaveTextContent('SUCCEEDED');
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});
