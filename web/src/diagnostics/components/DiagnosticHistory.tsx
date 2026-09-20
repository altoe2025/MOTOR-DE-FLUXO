import type { DiagnosticExecutionRecord } from '../../study/model';

const terminal = new Set<DiagnosticExecutionRecord['status']>(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);

export function DiagnosticHistory({ executions }: Readonly<{ executions: readonly DiagnosticExecutionRecord[] }>) {
  const byAttempt = new Map<string, DiagnosticExecutionRecord>();
  for (const execution of executions) {
    const previous = byAttempt.get(execution.attemptId);
    if (previous === undefined || terminal.has(execution.status)) byAttempt.set(execution.attemptId, execution);
  }
  const attempts = [...byAttempt.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  if (attempts.length === 0) return null;
  return <section className="diagnostic-card" aria-labelledby="diagnostic-history-heading">
    <h2 id="diagnostic-history-heading">Histórico de tentativas</h2>
    <div className="table-scroll"><table className="diagnostic-table" aria-label="Histórico de tentativas diagnósticas">
      <thead><tr><th scope="col">Tentativa</th><th scope="col">Status terminal</th><th scope="col">Criada em</th><th scope="col">Job</th></tr></thead>
      <tbody>{attempts.map((execution) => <tr key={execution.attemptId}><th scope="row">{execution.attemptId}</th><td>{execution.status}</td><td>{execution.createdAt}</td><td>{execution.jobId ?? 'não atribuído'}</td></tr>)}</tbody>
    </table></div>
  </section>;
}
