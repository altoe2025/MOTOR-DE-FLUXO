import type { ExecutionRecord, PortfolioSource, ScenarioDocument } from '../model';

const STATUS_LABELS: Record<ExecutionRecord['status'], string> = {
  PREPARING: 'Preparando',
  RUNNING: 'Em execução',
  SUCCEEDED: 'Concluída',
  FAILED: 'Falhou',
  INTERRUPTED: 'Interrompida',
};

function sourceLabel(source: PortfolioSource): string {
  switch (source.kind) {
    case 'OBSERVED_CASE': return `Caso observado · revisão ${source.caseRevision}`;
    case 'AUTHORED': return 'Carteira manual';
    case 'SYNTHETIC': return `Carteira sintética · ${source.recipe.exampleId}`;
  }
}

function instant(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC',
  }).format(new Date(value));
}

export function ExecutionHistory({
  executions,
  scenarios,
  selectedId = null,
  onSelect,
}: {
  executions: readonly ExecutionRecord[];
  scenarios: readonly ScenarioDocument[];
  selectedId?: string | null;
  onSelect(execution: ExecutionRecord): void;
}) {
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const terminalRequests = new Set(executions
    .filter((execution) => execution.status !== 'PREPARING' && execution.status !== 'RUNNING')
    .map((execution) => execution.requestSnapshot.request_id));
  const visibleExecutions = executions.filter((execution) =>
    (execution.status !== 'PREPARING' && execution.status !== 'RUNNING')
    || !terminalRequests.has(execution.requestSnapshot.request_id));
  if (visibleExecutions.length === 0) return <p>Nenhuma execução registrada.</p>;
  return (
    <ol aria-label="Histórico de execuções">
      {[...visibleExecutions].reverse().map((execution) => {
        const scenario = scenariosById.get(execution.scenarioId);
        return (
          <li key={execution.id}>
            <button
              type="button"
              aria-label={`Abrir execução ${execution.id}`}
              aria-current={selectedId === execution.id ? 'true' : undefined}
              onClick={() => onSelect(execution)}
            >
              <strong>{STATUS_LABELS[execution.status]}</strong>
              <span>{instant(execution.finishedAt ?? execution.createdAt)}</span>
              <span>cenário r{execution.scenarioRevision}</span>
              <span>{scenario === undefined ? 'Origem indisponível' : sourceLabel(scenario.sourceSnapshot.source)}</span>
              <span>{execution.engineVersion} · contrato {execution.contractVersion}</span>
              <code title={execution.inputFingerprint}>{execution.inputFingerprint.slice(0, 12)}…</code>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
