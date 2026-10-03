import { useState, type ReactNode } from 'react';

import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
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
  /** Ações extras do menu de criação (importar, demonstração…), antes da lixeira. */
  createActions?: readonly ActionMenuItem[];
  /** Controles que ficam à esquerda de "Novo estudo" (ex.: "Comparar estudos"). */
  toolbarStart?: ReactNode;
  /** Título da página, na mesma linha das ações. */
  heading?: ReactNode;
  /** Avisos e formulários que ficam entre o cabeçalho e a lista (ex.: escolha do novo estudo). */
  beforeList?: ReactNode;
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

export function StudyList<T extends StudySummary | StudyDocument>({ studies, selectedId, onCreate, onCreateCombinations, createCombinationsDisabled = false, onOpen, onRename, onDuplicate, onRestore, onDelete, onExport, createActions = [], toolbarStart, heading, beforeList }: StudyListProps<T>) {
  const [showTrash, setShowTrash] = useState(false);
  const visibleStudies = studies.filter((study) => (study.deletedAt !== null) === showTrash);
  const createMenu: ActionMenuItem[] = [
    ...(onCreateCombinations === undefined ? [] : [{
      label: 'Nova combinação de carteiras', helpId: 'control.estudos.nova-combinacao',
      disabled: createCombinationsDisabled, onSelect: onCreateCombinations,
    }]),
    ...createActions,
    'separator',
    { label: 'Lixeira de estudos', onSelect: () => setShowTrash(true) },
  ];
  return <>
    <div className="page-head">
      {heading}
      <div className="list-toolbar page-head__actions">
        {showTrash
          ? <Button variant="secondary" onClick={() => setShowTrash(false)}>Voltar aos estudos</Button>
          : <>{toolbarStart}<Button data-chat-help-id="control.estudos.novo" onClick={onCreate}>Novo estudo</Button><ActionMenu label="criar" items={createMenu} /></>}
      </div>
    </div>
    {beforeList}
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
              : <ActionMenu label={study.name} items={[
                { label: 'Renomear', ariaLabel: `Renomear ${study.name}`, onSelect: () => onRename(study) },
                { label: 'Duplicar', ariaLabel: `Duplicar ${study.name}`, onSelect: () => onDuplicate(study) },
                ...(onExport === undefined ? [] : [{ label: 'Exportar cópia', ariaLabel: `Exportar ${study.name}`, helpId: 'control.estudos.exportar', onSelect: () => onExport(study) }]),
                'separator',
                { label: 'Excluir', ariaLabel: `Excluir ${study.name}`, danger: true, onSelect: () => onDelete(study) },
              ]} />}
          </div>
        </li>)}
      </ul>}
  </>;
}
