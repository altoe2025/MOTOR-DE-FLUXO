import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ObservedCase } from '../../cases/domain';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import type { StudyDocument } from '../model';
import { PortfolioSourceSelector, type PortfolioSourceKind } from './PortfolioSourceSelector';

export type StudyEditorProps = Readonly<{ study: StudyDocument; observedCases: readonly ObservedCase[]; status: string; error?: string | null; onRename(name: string): Promise<void> | void; onDuplicate(): Promise<void> | void; onSourceChange(kind: PortfolioSourceKind, observedCase?: ObservedCase): Promise<void> | void }>;
export function StudyEditor({ study, observedCases, status, error = null, onRename, onDuplicate, onSourceChange }: StudyEditorProps) {
  const heading = useRef<HTMLHeadingElement>(null); const [name, setName] = useState(study.name);
  const source = study.scenarios.find((item) => item.id === study.baseScenarioId)?.sourceSnapshot.source;
  const kind: PortfolioSourceKind = source?.kind ?? 'SYNTHETIC';
  useEffect(() => { setName(study.name); heading.current?.focus(); }, [study.id, study.name]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (name.trim().length > 0) await onRename(name); };
  const nameProps = name.trim() ? {} : { error: 'Informe um nome para o estudo.' };
  const selectedProps = source?.kind === 'OBSERVED_CASE' ? { selectedCaseId: source.caseId } : {};
  return <article className="study-editor" aria-busy={status === 'SAVING' || undefined}><p className="eyebrow">Editor de estudo</p><h1 tabIndex={-1} ref={heading}>{study.name}</h1>{status === 'CONFLICT' ? <p className="inline-notice inline-notice--error" role="alert">Este estudo foi alterado em outra aba. Recarregue antes de continuar.</p> : null}{error ? <p className="inline-notice inline-notice--error" role="alert">{error}</p> : null}<p className="save-status" role="status">{status === 'SAVING' ? 'Salvando…' : status === 'STORAGE_FAILURE' ? 'Não foi possível salvar. As alterações continuam nesta aba.' : status === 'DIRTY' ? 'Alterações não salvas.' : 'Alterações salvas.'}</p><form onSubmit={(event) => void submit(event)}><TextField id="study-editor-name" label="Nome do estudo" value={name} maxLength={120} {...nameProps} onChange={(event) => setName(event.currentTarget.value)} /><Button type="submit" disabled={!name.trim()}>Salvar nome</Button> <Button variant="secondary" onClick={() => void onDuplicate()}>Duplicar estudo</Button></form><PortfolioSourceSelector value={kind} observedCases={observedCases} {...selectedProps} dirty={status === 'DIRTY'} onChange={(next, item) => void onSourceChange(next, item)} />{kind === 'OBSERVED_CASE' ? <section className="readonly-source"><h2>Fonte observada</h2><p>As ordens observadas não podem ser alteradas aqui. Crie uma autoria manual para testar alterações sem modificar a fonte.</p></section> : <section className="authored-fields"><h2>{kind === 'AUTHORED' ? 'Carteira manual' : 'Exemplo sintético'}</h2><p>Grupos, participantes, herança, overrides, frequência, ticket, direção, prazo e finalidade são preparados pela origem selecionada.</p></section>}</article>;
}
