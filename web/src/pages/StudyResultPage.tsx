import { compareObservedToMotor } from '../cases/observedComparison';
import type { ExecutionRecord, PortfolioSource, StudyDocument } from '../study/model';
import { ExecutionHistory } from '../study/components/ExecutionHistory';
import { ComparisonSummary } from '../ui/ComparisonSummary';
import { CostTable } from '../ui/CostTable';
import { EmptyState } from '../ui/EmptyState';
import { ObservedComparisonTable } from '../ui/ObservedComparisonTable';

function sourceLabel(source: PortfolioSource): string {
  switch (source.kind) {
    case 'OBSERVED_CASE': return `Caso observado · revisão ${source.caseRevision}`;
    case 'AUTHORED': return 'Carteira manual';
    case 'SYNTHETIC': return `Carteira sintética · ${source.recipe.exampleId}`;
  }
}

export function StudyResultPage({
  study,
  execution,
  onSelectExecution,
}: {
  study: StudyDocument;
  execution: ExecutionRecord | null;
  onSelectExecution(execution: ExecutionRecord): void;
}) {
  const scenario = execution === null
    ? undefined
    : study.scenarios.find((candidate) => candidate.id === execution.scenarioId);
  const envelope = execution?.envelope ?? null;
  const observedOutcome = scenario !== undefined && scenario.revision === execution?.scenarioRevision
    ? scenario.sourceSnapshot.observedOutcome
    : null;
  const comparison = execution?.observedComparison
    ?? (observedOutcome !== null && observedOutcome !== undefined && envelope !== null
      ? compareObservedToMotor(observedOutcome, envelope)
      : null);

  return (
    <article className="destination-page">
      <p className="eyebrow">Estudo salvo</p>
      <h1>Resultado do estudo</h1>
      <p className="page-introduction">{study.name}</p>

      {execution === null || envelope === null ? (
        <EmptyState title="Nenhum resultado disponível">
          Selecione uma execução concluída para inspecionar o resultado preservado.
        </EmptyState>
      ) : (
        <>
          <ComparisonSummary envelope={envelope} />
          <CostTable envelope={envelope} />
          <ObservedComparisonTable comparison={comparison} />
          <section className="technical-identity" aria-labelledby="study-result-identity">
            <h2 id="study-result-identity">Identidade do resultado</h2>
            <dl>
              <div><dt>Origem</dt><dd>{scenario === undefined ? 'Origem indisponível' : sourceLabel(scenario.sourceSnapshot.source)}</dd></div>
              <div><dt>Versões</dt><dd>{execution.engineVersion} · contrato {execution.contractVersion}</dd></div>
              <div><dt>Fingerprint de entrada</dt><dd>{execution.inputFingerprint}</dd></div>
              <div><dt>Fingerprint da execução</dt><dd>{envelope.execution_fingerprint}</dd></div>
            </dl>
          </section>
        </>
      )}

      <section aria-labelledby="execution-history-title">
        <h2 id="execution-history-title">Histórico</h2>
        <ExecutionHistory
          executions={study.executions}
          scenarios={study.scenarios}
          selectedId={execution?.id ?? null}
          onSelect={onSelectExecution}
        />
      </section>
    </article>
  );
}
