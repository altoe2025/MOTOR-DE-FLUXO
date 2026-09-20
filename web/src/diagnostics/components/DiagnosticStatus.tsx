export type DiagnosticProgress = Readonly<{
  completed: number;
  failed: number;
  total: number;
  phase: 'QUEUED' | 'EXECUTING' | 'AGGREGATING' | 'TERMINAL';
}>;

type ActiveKind = 'QUEUED' | 'RUNNING' | 'AGGREGATING' | 'CANCEL_REQUESTED';
type ActiveState = { [Kind in ActiveKind]: Readonly<{
  kind: Kind; jobId: string; progress: DiagnosticProgress;
}> }[ActiveKind];

export type DiagnosticViewState =
  | Readonly<{ kind: 'UNAVAILABLE'; reason: string }>
  | ActiveState
  | Readonly<{ kind: 'FAILED'; attemptId: string; publicMessage: string }>
  | Readonly<{ kind: 'CANCELLED' | 'INTERRUPTED' | 'SUCCEEDED'; attemptId: string }>
  | Readonly<{ kind: 'STORAGE_FAILURE'; message: string }>;

const labels: Record<DiagnosticViewState['kind'], string> = {
  UNAVAILABLE: 'Diagnóstico indisponível', QUEUED: 'Na fila', RUNNING: 'Executando',
  AGGREGATING: 'Agregando resultados', CANCEL_REQUESTED: 'Cancelamento solicitado',
  FAILED: 'Falha no diagnóstico', CANCELLED: 'Diagnóstico cancelado',
  INTERRUPTED: 'Execução interrompida', STORAGE_FAILURE: 'Falha ao salvar',
  SUCCEEDED: 'Diagnóstico concluído',
};

export function DiagnosticStatus({ state, onCancel, onRetry }: Readonly<{
  state: DiagnosticViewState;
  onCancel?: (jobId: string) => void;
  onRetry?: (attemptId: string) => void;
}>) {
  if (state.kind === 'FAILED') {
    return <section className="diagnostic-status diagnostic-status--error" aria-label="Estado do diagnóstico">
      <h2>{labels[state.kind]}</h2>
      <p role="alert">{state.publicMessage}</p>
      <p className="technical-reference">Tentativa anterior: <code>{state.attemptId}</code></p>
      {onRetry === undefined ? null : <button className="button" type="button" onClick={() => onRetry(state.attemptId)}>Tentar novamente</button>}
    </section>;
  }
  if (state.kind === 'STORAGE_FAILURE') {
    return <section className="diagnostic-status diagnostic-status--error" aria-label="Estado do diagnóstico">
      <h2>{labels[state.kind]}</h2><p role="alert">{state.message}</p>
    </section>;
  }
  if (state.kind === 'UNAVAILABLE') {
    return <section className="diagnostic-status" aria-label="Estado do diagnóstico"><h2>{labels[state.kind]}</h2><p>{state.reason}</p></section>;
  }
  if (state.kind === 'QUEUED' || state.kind === 'RUNNING' || state.kind === 'AGGREGATING' || state.kind === 'CANCEL_REQUESTED') {
    const active = state;
    return <section className="diagnostic-status" aria-label="Estado do diagnóstico">
      <h2>{labels[state.kind]}</h2>
      <p role="status">{active.progress.completed} de {active.progress.total} repetições concluídas · fase {active.progress.phase}</p>
      <progress aria-label="Progresso do diagnóstico" max={active.progress.total} value={active.progress.completed} />
      {onCancel === undefined || state.kind === 'CANCEL_REQUESTED' ? null : <button className="button button--secondary" type="button" onClick={() => {
        if (window.confirm(`Cancelar o diagnóstico do job ${active.jobId}?`)) onCancel(active.jobId);
      }}>Cancelar diagnóstico</button>}
    </section>;
  }
  return <section className="diagnostic-status" aria-label="Estado do diagnóstico"><h2>{labels[state.kind]}</h2>{state.kind === 'SUCCEEDED' ? null : <p>Tentativa {state.attemptId}</p>}
    {state.kind === 'CANCELLED' && onRetry !== undefined ? <button className="button" type="button" onClick={() => onRetry(state.attemptId)}>Tentar novamente</button> : null}
  </section>;
}
