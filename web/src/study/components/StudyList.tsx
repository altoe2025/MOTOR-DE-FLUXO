import { useState } from 'react';

import { Button } from '../../ui/Button';
import type { StudySummary } from '../../storage/applicationRepository';
import type { StudyDocument } from '../model';
import { describeSource, SOURCE_LABELS } from '../sourceSummary';

export type StudyListProps<T extends StudySummary | StudyDocument = StudySummary> = Readonly<{
  studies: readonly T[]; selectedId: string | null; onCreate(): void; onCreateCombinations?(): void;
  createCombinationsDisabled?: boolean;
  onOpen(id: string): void; onRename(study: T): void; onDuplicate(study: T): void;
  onRestore(study: T): void; onDelete(study: T): void;
  onExport?(study: T): void;
}>;

function sourceLabel(study: StudySummary | StudyDocument): string {
  if (study.studyType === 'PORTFOLIO_COMBINATIONS') return 'Combinação de carteiras';
  if ('scenarios' in study) {
    const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId);
    return scenario === undefined ? 'Sem origem' : describeSource(scenario, [], []).label;
  }
  if (study.baseSourceKind === 'OBSERVED_CASE') return SOURCE_LABELS.IMPORTED;
  if (study.baseSourceKind === 'SYNTHETIC') return SOURCE_LABELS.SYNTHETIC;
  if (study.baseSourceKind === 'AUTHORED_MULTI_COMPANY') return SOURCE_LABELS.COMPANIES;
  return SOURCE_LABELS.MANUAL;
}

function hasResult(study: StudySummary | StudyDocument): boolean {
  return 'hasExecutions' in study ? study.hasExecutions : study.executions.length > 0;
}

export function StudyList<T extends StudySummary | StudyDocument>({ studies, selectedId, onCreate, onCreateCombinations, createCombinationsDisabled = false, onOpen, onRename, onDuplicate, onRestore, onDelete, onExport }: StudyListProps<T>) {
  const [showTrash, setShowTrash] = useState(false);
  const visibleStudies = studies.filter((study) => (study.deletedAt !== null) === showTrash);
  return <>
    {showTrash ? null : <div className="create-options">
      <div className="create-option">
        <Button data-chat-help-id="control.estudos.novo" onClick={onCreate}>Novo estudo</Button>
        <p className="field-hint">Rode o que quiser: escolha as empresas, mexa nas alavancas e compare os cenários.</p>
      </div>
      {onCreateCombinations === undefined ? null : <div className="create-option">
        <Button variant="secondary" data-chat-help-id="control.estudos.nova-combinacao" disabled={createCombinationsDisabled} onClick={onCreateCombinations}>Nova combinação de carteiras</Button>
        <p className="field-hint">Escolha as empresas e ajuste as alavancas; todas as combinações entre elas são testadas e a tela diz qual carteira atende melhor.</p>
      </div>}
    </div>}
    <div className="list-toolbar">
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
              <small>{hasResult(study) ? 'Resultado disponível' : 'Sem resultado'}</small>
            </button>}
          <div className="study-list__actions">
            {showTrash
              ? <Button variant="secondary" aria-label={`Restaurar ${study.name}`} onClick={() => onRestore(study)}>Restaurar</Button>
              : <><Button variant="secondary" aria-label={`Renomear ${study.name}`} onClick={() => onRename(study)}>Renomear</Button>
                <Button variant="secondary" aria-label={`Duplicar ${study.name}`} onClick={() => onDuplicate(study)}>Duplicar</Button>
                {onExport === undefined ? null : <Button variant="secondary" data-chat-help-id="control.estudos.exportar" aria-label={`Exportar ${study.name}`} onClick={() => onExport(study)}>Exportar</Button>}
                <Button variant="secondary" aria-label={`Excluir ${study.name}`} onClick={() => onDelete(study)}>Excluir</Button></>}
          </div>
        </li>)}
      </ul>}
  </>;
}
