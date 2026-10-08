import type { ExecutionRecord, StudyDocument } from '../study/model';
import { EmptyState } from '../ui/EmptyState';

export function StudyResultPage({
  study,
  execution,
}: {
  study: StudyDocument;
  execution: ExecutionRecord | null;
}) {
  const envelope = execution?.envelope ?? null;

  return (
    <article className="destination-page">
      <p className="eyebrow">Estudo salvo</p>
      <h1>Resultado do estudo</h1>
      <p className="page-introduction">{study.name}</p>

      {execution === null || envelope === null ? (
        <EmptyState title="Nenhum resultado disponível">
          Selecione uma execução concluída para inspecionar o resultado preservado.
        </EmptyState>
      ) : null}
    </article>
  );
}