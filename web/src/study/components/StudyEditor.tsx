import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { CompanyRecord, ObservedCase } from '../../cases/domain';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import type { StudyDocument } from '../model';
import { PortfolioSourceSelector, type PortfolioSourceDraft, type PortfolioSourceKind } from './PortfolioSourceSelector';

export type StudyEditorProps = Readonly<{
  study: StudyDocument; observedCases: readonly ObservedCase[]; companies: readonly CompanyRecord[];
  status: string; error?: string | null; onRename(name: string): Promise<void> | void;
  onDuplicate(): Promise<void> | void; onSourceChange(source: PortfolioSourceDraft): Promise<void> | void;
  onConvertObserved(caseId: string): Promise<void> | void;
}>;

export function StudyEditor({ study, observedCases, companies, status, error = null, onRename, onDuplicate, onSourceChange, onConvertObserved }: StudyEditorProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState(study.name);
  const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId) ?? study.scenarios[0];
  if (scenario === undefined) throw new Error('Estudo sem cenário base.');
  const source = scenario.sourceSnapshot.source;
  const kind: PortfolioSourceKind = source.kind;
  useEffect(() => { setName(study.name); heading.current?.focus(); }, [study.id, study.name]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (name.trim()) await onRename(name.trim()); };
  return <article className="study-editor" aria-busy={status === 'SAVING' || undefined}><p className="eyebrow">Editor de estudo</p><h1 tabIndex={-1} ref={heading}>{study.name}</h1>{status === 'CONFLICT' ? <p className="inline-notice inline-notice--error" role="alert">Este estudo foi alterado em outra aba. Recarregue antes de continuar.</p> : null}{error ? <p className="inline-notice inline-notice--error" role="alert">{error}</p> : null}<p className="save-status" role="status">{status === 'SAVING' ? 'Salvando…' : status === 'STORAGE_FAILURE' ? 'Não foi possível salvar. As alterações continuam nesta aba.' : status === 'DIRTY' ? 'Alterações não salvas.' : 'Alterações salvas.'}</p><form className="study-name-form" onSubmit={(event) => void submit(event)}><TextField id="study-editor-name" label="Nome do estudo" value={name} maxLength={120} {...(name.trim() ? {} : { error: 'Informe um nome para o estudo.' })} onChange={(event) => setName(event.currentTarget.value)} /><div className="source-actions"><Button type="submit" disabled={!name.trim()}>Salvar nome</Button><Button variant="secondary" onClick={() => void onDuplicate()}>Duplicar estudo</Button></div></form><PortfolioSourceSelector value={kind} study={study} scenario={scenario} observedCases={observedCases} companies={companies} {...(source.kind === 'OBSERVED_CASE' ? { selectedCaseId: source.caseId } : {})} onChange={(next) => void onSourceChange(next)} onConvertObserved={(caseId) => void onConvertObserved(caseId)} /></article>;
}
