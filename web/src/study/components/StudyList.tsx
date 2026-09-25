import { useState } from 'react';

import { Button } from '../../ui/Button';
import type { StudyDocument } from '../model';

export type StudyListProps = Readonly<{
  studies: readonly StudyDocument[]; selectedId: string | null; onCreate(): void;
  onOpen(id: string): void; onRename(study: StudyDocument): void; onDuplicate(study: StudyDocument): void;
  onRestore(study: StudyDocument): void; onDelete(study: StudyDocument): void;
}>;

function sourceLabel(study: StudyDocument): string {
  const source = study.scenarios.find((item) => item.id === study.baseScenarioId)?.sourceSnapshot.source;
  if (source?.kind === 'OBSERVED_CASE') return 'Caso observado';
  if (source?.kind === 'AUTHORED') return 'Carteira manual';
  return 'Exemplo sintético';
}

export function StudyList({ studies, selectedId, onCreate, onOpen, onRename, onDuplicate, onRestore, onDelete }: StudyListProps) {
  const [showTrash, setShowTrash] = useState(false);
  const visibleStudies = studies.filter((study) => (study.deletedAt !== null) === showTrash);
  return <>
    <div className="list-toolbar">
      {!showTrash && <Button onClick={onCreate}>Novo estudo</Button>}
      <Button variant="secondary" onClick={() => setShowTrash((current) => !current)}>
        {showTrash ? 'Voltar aos estudos' : 'Lixeira de estudos'}
      </Button>
    </div>
    {visibleStudies.length === 0
      ? <p className="empty-list">{showTrash ? 'A lixeira está vazia.' : 'Nenhum estudo salvo nesta conta.'}</p>
      : <ul className="study-list" aria-label={showTrash ? 'Lixeira de estudos' : 'Estudos'}>
        {visibleStudies.map((study) => <li key={study.id} className="study-list__item">
          {showTrash
            ? <div className="study-list__open"><strong>{study.name}</strong><span>{sourceLabel(study)} · {new Date(study.updatedAt).toLocaleDateString('pt-BR')}</span><small>Na lixeira</small></div>
            : <button type="button" className="study-list__open" aria-label={`Abrir ${study.name}`}
              aria-current={selectedId === study.id ? 'true' : undefined} onClick={() => onOpen(study.id)}>
              <strong>{study.name}</strong><span>{sourceLabel(study)} · {new Date(study.updatedAt).toLocaleDateString('pt-BR')}</span>
              <small>{study.executions.length === 0 ? 'Sem resultado' : 'Resultado disponível'}</small>
            </button>}
          <div className="study-list__actions">
            {showTrash
              ? <Button variant="secondary" aria-label={`Restaurar ${study.name}`} onClick={() => onRestore(study)}>Restaurar</Button>
              : <><Button variant="secondary" aria-label={`Renomear ${study.name}`} onClick={() => onRename(study)}>Renomear</Button>
                <Button variant="secondary" aria-label={`Duplicar ${study.name}`} onClick={() => onDuplicate(study)}>Duplicar</Button>
                <Button variant="secondary" aria-label={`Excluir ${study.name}`} onClick={() => onDelete(study)}>Excluir</Button></>}
          </div>
        </li>)}
      </ul>}
  </>;
}
