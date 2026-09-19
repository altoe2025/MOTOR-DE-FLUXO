import type { StudyDocument } from '../model';

export type StudyListProps = Readonly<{ studies: readonly StudyDocument[]; selectedId: string | null; onOpen(id: string): void; onRestore(study: StudyDocument): void; onDelete(study: StudyDocument): void }>;

function sourceLabel(study: StudyDocument): string {
  const source = study.scenarios.find((item) => item.id === study.baseScenarioId)?.sourceSnapshot.source;
  if (source?.kind === 'OBSERVED_CASE') return 'Caso observado';
  if (source?.kind === 'AUTHORED') return 'Carteira manual';
  return 'Exemplo sintético';
}

export function StudyList({ studies, selectedId, onOpen, onRestore, onDelete }: StudyListProps) {
  if (studies.length === 0) return <p className="empty-list">Nenhum estudo salvo nesta conta.</p>;
  return <ul className="study-list" aria-label="Estudos">{studies.map((study) => {
    const deleted = study.deletedAt !== null;
    return <li key={study.id} className="study-list__item"><button type="button" className="study-list__open" aria-current={selectedId === study.id ? 'true' : undefined} onClick={() => onOpen(study.id)}><strong>{study.name}</strong><span>{sourceLabel(study)} · {new Date(study.updatedAt).toLocaleDateString('pt-BR')}</span><small>{deleted ? 'Na lixeira' : study.executions.length === 0 ? 'Sem resultado' : 'Resultado disponível'}</small></button>{deleted ? <button type="button" className="button button--secondary" onClick={() => onRestore(study)}>Restaurar</button> : <button type="button" className="button button--secondary" onClick={() => onDelete(study)}>Excluir</button>}</li>;
  })}</ul>;
}
