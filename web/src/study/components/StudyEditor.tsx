import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { CompanyRecord, ObservedCase } from '../../cases/domain';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import type {
  DeepMutable,
  PeriodDocument,
  PremisesDocument,
  ScenarioUpdate,
  StudyDocument,
} from '../model';
import { PortfolioSourceSelector, type PortfolioSourceDraft, type PortfolioSourceKind } from './PortfolioSourceSelector';

export type StudyEditorProps = Readonly<{
  study: StudyDocument; observedCases: readonly ObservedCase[]; companies: readonly CompanyRecord[];
  status: string; error?: string | null; onRename(name: string): Promise<void> | void;
  onDuplicate(): Promise<void> | void; onSourceChange(source: PortfolioSourceDraft): Promise<void> | void;
  onConvertObserved(caseId: string): Promise<void> | void;
  onScenarioChange(update: ScenarioUpdate): Promise<void> | void;
}>;

function ScenarioSettings({
  premises,
  period,
  onSave,
}: {
  premises: PremisesDocument;
  period: PeriodDocument;
  onSave(update: ScenarioUpdate): Promise<void> | void;
}) {
  const [draftPremises, setDraftPremises] = useState<DeepMutable<PremisesDocument>>(
    () => structuredClone(premises) as DeepMutable<PremisesDocument>,
  );
  const [draftPeriod, setDraftPeriod] = useState<DeepMutable<PeriodDocument>>(
    () => structuredClone(period) as DeepMutable<PeriodDocument>,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraftPremises(structuredClone(premises) as DeepMutable<PremisesDocument>);
    setDraftPeriod(structuredClone(period) as DeepMutable<PeriodDocument>);
  }, [period, premises]);
  const setCost = (key: Exclude<keyof PremisesDocument['costs'], 'iof_por_finalidade'>, value: string) => {
    setDraftPremises((current) => ({
      ...current,
      costs: { ...current.costs, [key]: value },
    }));
  };
  const submit = () => {
    try {
      for (const [key, value] of Object.entries(draftPremises.costs)) {
        if (key !== 'iof_por_finalidade' && !/^\d+(?:\.\d+)?$/.test(value as string)) {
          throw new Error('Use ponto como separador decimal nas premissas.');
        }
      }
      if (!Number.isSafeInteger(draftPremises.windowDays) || draftPremises.windowDays < 1) {
        throw new Error('Janela deve ser um número inteiro positivo.');
      }
      setError(null);
      void onSave({ premises: draftPremises, period: draftPeriod });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Premissas inválidas.');
    }
  };
  const costFields: ReadonlyArray<[Exclude<keyof PremisesDocument['costs'], 'iof_por_finalidade'>, string]> = [
    ['iof_out', 'IOF OUT'], ['iof_in', 'IOF IN'], ['carry_cnr', 'Carry CNR'],
    ['custo_fixo_remessa', 'Custo fixo por remessa'],
    ['custo_oportunidade_aa', 'Custo de oportunidade anual'],
    ['spread_rail_bps', 'Spread do rail em bps'], ['ptax', 'PTAX'],
  ];
  return <section className="source-panel" aria-labelledby="scenario-settings-title">
    <h2 id="scenario-settings-title">Premissas e período</h2>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    <div className="parameter-grid">
      {costFields.map(([key, label]) => <TextField key={key} id={`premise-${key}`} label={label} inputMode="decimal" value={draftPremises.costs[key]} onChange={(event) => setCost(key, event.currentTarget.value)} />)}
      <TextField id="premise-window-days" label="Janela em dias" inputMode="numeric" value={String(draftPremises.windowDays)} onChange={(event) => setDraftPremises((current) => ({ ...current, windowDays: Number(event.currentTarget.value) }))} />
      {draftPeriod.httpPeriod.modo === 'NATURAL' ? <>
        <TextField id="period-warmup-days" label="Aquecimento em dias" inputMode="numeric" value={String(draftPeriod.httpPeriod.dias_aquecimento)} onChange={(event) => setDraftPeriod({ httpPeriod: { modo: 'NATURAL', dias_aquecimento: Number(event.currentTarget.value), periodo_medicao_dias: draftPeriod.httpPeriod.modo === 'NATURAL' ? draftPeriod.httpPeriod.periodo_medicao_dias : 0 } })} />
        <TextField id="period-measurement-days" label="Período de medição em dias" inputMode="numeric" value={String(draftPeriod.httpPeriod.periodo_medicao_dias)} onChange={(event) => setDraftPeriod({ httpPeriod: { modo: 'NATURAL', dias_aquecimento: draftPeriod.httpPeriod.modo === 'NATURAL' ? draftPeriod.httpPeriod.dias_aquecimento : 0, periodo_medicao_dias: Number(event.currentTarget.value) } })} />
      </> : <TextField id="period-horizon-days" label="Horizonte executável em dias" inputMode="numeric" value={String('executableHorizonDays' in draftPeriod ? draftPeriod.executableHorizonDays : 0)} onChange={(event) => setDraftPeriod({ httpPeriod: { modo: 'LEGADO' }, executableHorizonDays: Number(event.currentTarget.value) })} />}
    </div>
    <Button onClick={submit}>Salvar premissas e período</Button>
  </section>;
}

export function StudyEditor({ study, observedCases, companies, status, error = null, onRename, onDuplicate, onSourceChange, onConvertObserved, onScenarioChange }: StudyEditorProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState(study.name);
  const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId) ?? study.scenarios[0];
  if (scenario === undefined) throw new Error('Estudo sem cenário base.');
  const source = scenario.sourceSnapshot.source;
  const kind: PortfolioSourceKind = source.kind;
  useEffect(() => { setName(study.name); heading.current?.focus(); }, [study.id, study.name]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (name.trim()) await onRename(name.trim()); };
  return <article className="study-editor" aria-busy={status === 'SAVING' || undefined}><p className="eyebrow">Editor de estudo</p><h1 tabIndex={-1} ref={heading}>{study.name}</h1>{status === 'CONFLICT' ? <p className="inline-notice inline-notice--error" role="alert">Este estudo foi alterado em outra aba. Recarregue antes de continuar.</p> : null}{error ? <p className="inline-notice inline-notice--error" role="alert">{error}</p> : null}<p className="save-status" role="status">{status === 'SAVING' ? 'Salvando…' : status === 'STORAGE_FAILURE' ? 'Não foi possível salvar. As alterações continuam nesta aba.' : status === 'DIRTY' ? 'Alterações não salvas.' : 'Alterações salvas.'}</p><form className="study-name-form" onSubmit={(event) => void submit(event)}><TextField id="study-editor-name" label="Nome do estudo" value={name} maxLength={120} {...(name.trim() ? {} : { error: 'Informe um nome para o estudo.' })} onChange={(event) => setName(event.currentTarget.value)} /><div className="source-actions"><Button type="submit" disabled={!name.trim()}>Salvar nome</Button><Button variant="secondary" onClick={() => void onDuplicate()}>Duplicar estudo</Button></div></form><PortfolioSourceSelector value={kind} study={study} scenario={scenario} observedCases={observedCases} companies={companies} {...(source.kind === 'OBSERVED_CASE' ? { selectedCaseId: source.caseId } : {})} onChange={(next) => void onSourceChange(next)} onConvertObserved={(caseId) => void onConvertObserved(caseId)} /><ScenarioSettings premises={scenario.premises} period={scenario.period} onSave={onScenarioChange} /></article>;
}
