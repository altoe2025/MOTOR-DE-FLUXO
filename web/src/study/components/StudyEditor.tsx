import Decimal from 'decimal.js';
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
import {
  fractionToPercentText, parseBrlInput, parseDecimalInput, parsePercentInput, plainToBrText, type ParsedInput,
} from '../numberInput';
import { describeSource } from '../sourceSummary';
import { PortfolioSourceSelector, type PortfolioSourceDraft, type PortfolioSourceKind } from './PortfolioSourceSelector';

export type StudyEditorProps = Readonly<{
  study: StudyDocument; observedCases: readonly ObservedCase[]; companies: readonly CompanyRecord[];
  status: string; error?: string | null; onRename(name: string): Promise<void> | void;
  onDuplicate(): Promise<void> | void; onSourceChange(source: PortfolioSourceDraft): Promise<void> | void;
  onConvertObserved(caseId: string): Promise<void> | void;
  onScenarioChange(update: ScenarioUpdate): Promise<void> | void;
}>;

type CostKey = Exclude<keyof PremisesDocument['costs'], 'iof_por_finalidade'>;
type CostField = Readonly<{ key: CostKey; label: string; hint: string; parse(text: string): ParsedInput; show(stored: string): string }>;

const percent = { parse: parsePercentInput, show: fractionToPercentText };
const plain = { parse: (text: string) => parseDecimalInput(text), show: plainToBrText };
const COST_FIELDS: readonly CostField[] = [
  { key: 'iof_out', label: 'IOF OUT', hint: 'Em % do valor remetido. Ex.: 3,5', ...percent },
  { key: 'iof_in', label: 'IOF IN', hint: 'Em % do valor remetido. Ex.: 0,38', ...percent },
  { key: 'carry_cnr', label: 'Carry CNR', hint: 'Em % do valor casado. Ex.: 0,04', ...percent },
  { key: 'custo_fixo_remessa', label: 'Custo fixo por remessa', hint: 'Em R$ por remessa. Ex.: 40,00', parse: parseBrlInput, show: plainToBrText },
  { key: 'custo_oportunidade_aa', label: 'Custo de oportunidade anual', hint: 'Em % ao ano. Ex.: 10,5 (0 desliga a espera)', ...percent },
  { key: 'spread_rail_bps', label: 'Spread do rail em bps', hint: 'Em pontos-base (1 bp = 0,01%). Ex.: 25', ...plain },
  { key: 'ptax', label: 'PTAX', hint: 'Em R$ por US$. Ex.: 5,40', ...plain },
];

function costTexts(premises: PremisesDocument): Record<CostKey, string> {
  return Object.fromEntries(COST_FIELDS.map((field) => [field.key, field.show(premises.costs[field.key])])) as Record<CostKey, string>;
}

function sameNumber(left: string, right: string): boolean {
  try { return new Decimal(left).eq(right); } catch { return false; }
}

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
  const [texts, setTexts] = useState(() => costTexts(premises));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CostKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraftPremises(structuredClone(premises) as DeepMutable<PremisesDocument>);
    setDraftPeriod(structuredClone(period) as DeepMutable<PeriodDocument>);
    setTexts(costTexts(premises));
    setFieldErrors({});
  }, [period, premises]);
  const submit = () => {
    const costs = { ...draftPremises.costs };
    const errors: Partial<Record<CostKey, string>> = {};
    for (const field of COST_FIELDS) {
      const parsed = field.parse(texts[field.key]);
      if (!parsed.ok) { errors[field.key] = parsed.error; continue; }
      // Mesmo número que já estava salvo: mantém o texto salvo para não mudar a impressão digital do cenário.
      const stored = premises.costs[field.key];
      costs[field.key] = sameNumber(parsed.value, stored) ? stored : parsed.value;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { setError('Corrija os campos marcados abaixo.'); return; }
    if (!Number.isSafeInteger(draftPremises.windowDays) || draftPremises.windowDays < 1) {
      setError('Janela deve ser um número inteiro positivo de dias. Ex.: 7.');
      return;
    }
    setError(null);
    void onSave({ premises: { ...draftPremises, costs }, period: draftPeriod });
  };
  return <section className="source-panel" aria-labelledby="scenario-settings-title">
    <h2 id="scenario-settings-title">Premissas e período</h2>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    <div className="parameter-grid">
      {COST_FIELDS.map((field) => <TextField key={field.key} id={`premise-${field.key}`} label={field.label} hint={field.hint} inputMode="decimal" value={texts[field.key]} {...(fieldErrors[field.key] === undefined ? {} : { error: fieldErrors[field.key] })} onChange={(event) => { const value = event.currentTarget.value; setTexts((current) => ({ ...current, [field.key]: value })); }} />)}
      <TextField id="premise-window-days" label="Janela em dias" inputMode="numeric" value={String(draftPremises.windowDays)} onChange={(event) => {
        const windowDays = Number(event.currentTarget.value);
        setDraftPremises((current) => ({ ...current, windowDays }));
      }} />
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
  const summary = describeSource(scenario, observedCases, companies);
  // A origem é escolhida no "Novo estudo"; aqui fica o resumo e o seletor só abre para trocar.
  const [changingSource, setChangingSource] = useState(false);
  // Aplicar uma origem fecha o seletor; "Editar as ordens à mão" também troca a origem, mas a
  // pessoa ainda vai editar as ordens, então essa troca mantém o seletor aberto.
  const keepSourceOpen = useRef(false);
  useEffect(() => {
    if (keepSourceOpen.current) { keepSourceOpen.current = false; return; }
    setChangingSource(false);
  }, [scenario.sourceSnapshot.sourceFingerprint]);
  useEffect(() => { setName(study.name); heading.current?.focus(); }, [study.id, study.name]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (name.trim()) await onRename(name.trim()); };
  const sourceControl = study.studyType === 'PORTFOLIO_COMBINATIONS'
    ? <PortfolioSourceSelector combinationsOnly value={kind} study={study} scenario={scenario} observedCases={observedCases} companies={companies} {...(source.kind === 'OBSERVED_CASE' ? { selectedCaseId: source.caseId } : {})} onChange={(next) => void onSourceChange(next)} onConvertObserved={(caseId) => void onConvertObserved(caseId)} />
    : <><section className="source-summary" aria-labelledby="source-summary-title"><div><h2 id="source-summary-title">Origem da carteira</h2><p><strong>{summary.label}</strong> · {summary.detail}</p></div><Button variant="secondary" data-chat-help-id="control.carteira.trocar-origem" aria-expanded={changingSource} onClick={() => setChangingSource((current) => !current)}>{changingSource ? 'Cancelar troca' : 'Trocar origem'}</Button></section>{changingSource ? <PortfolioSourceSelector value={kind} study={study} scenario={scenario} observedCases={observedCases} companies={companies} {...(source.kind === 'OBSERVED_CASE' ? { selectedCaseId: source.caseId } : {})} onChange={(next) => void onSourceChange(next)} onConvertObserved={(caseId) => { keepSourceOpen.current = true; void onConvertObserved(caseId); }} /> : null}</>;
  return <article className="study-editor" aria-busy={status === 'SAVING' || undefined}><p className="eyebrow">{study.studyType === 'PORTFOLIO_COMBINATIONS' ? 'Combinação de carteiras' : 'Editor de estudo'}</p><h1 tabIndex={-1} ref={heading}>{study.name}</h1>{status === 'CONFLICT' ? <p className="inline-notice inline-notice--error" role="alert">Este estudo foi alterado em outra aba. Recarregue antes de continuar.</p> : null}{error ? <p className="inline-notice inline-notice--error" role="alert">{error}</p> : null}<p className="save-status" role="status">{status === 'SAVING' ? 'Salvando…' : status === 'STORAGE_FAILURE' ? 'Não foi possível salvar. As alterações continuam nesta aba.' : status === 'DIRTY' ? 'Alterações não salvas.' : 'Alterações salvas.'}</p><form className="study-name-form" onSubmit={(event) => void submit(event)}><TextField id="study-editor-name" label="Nome do estudo" value={name} maxLength={120} {...(name.trim() ? {} : { error: 'Informe um nome para o estudo.' })} onChange={(event) => setName(event.currentTarget.value)} /><div className="source-actions"><Button type="submit" disabled={!name.trim()}>Salvar nome</Button><Button variant="secondary" onClick={() => void onDuplicate()}>Duplicar estudo</Button></div></form><p className="eyebrow">Passo 1</p>{sourceControl}<p className="eyebrow">Passo 2</p><ScenarioSettings premises={scenario.premises} period={scenario.period} onSave={onScenarioChange} /></article>;
}
