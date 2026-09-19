import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { createImportStudyParameters, updateImportStudyParameter } from '../catalogClient';
import type { ImportBatch, ImportStudy, ImportStudyParameters, ISODate, ParameterField } from '../domain';
import { catalogExecutionAvailability, evaluateExecution } from '../eligibility';
import { projectPortfolio } from '../portfolio';
import type { StudyMutation } from '../repository';
import { validateImportedRows } from '../validation';
import type { ParsedWorkbook } from '../xlsxParser';
import { ExecutionConfirmation } from './ExecutionConfirmation';
import { useImportFlow } from './ImportFlowContext';
import { ParametersStep } from './ParametersStep';
import { ReviewStep } from './ReviewStep';
import { UploadStep } from './UploadStep';

type Step = 'upload' | 'review' | 'parameters' | 'confirm';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function batchFromFile(studyId: string, sequence: number, file: ParsedWorkbook): ImportBatch {
  const draft = validateImportedRows(file, new Date().toISOString(), () => crypto.randomUUID());
  const clients = new Map<string, string>();
  return {
    schemaVersion: '1.0.0', id: draft.id, studyId, revision: sequence,
    batchSequence: sequence, importedAtUtc: draft.importedAtUtc, file: draft.file,
    rows: draft.rows.map((row) => {
      const name = row.normalized?.clientName ?? row.raw.cliente_nome ?? `linha-${row.rowNumber}`;
      let clientId = clients.get(name);
      if (clientId === undefined) { clientId = crypto.randomUUID(); clients.set(name, clientId); }
      return { ...row, versionId: crypto.randomUUID(), canonicalClientId: clientId };
    }),
  };
}

export function ImportFlowPage() {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const services = useImportFlow();
  const heading = useRef<HTMLHeadingElement>(null);
  const [study, setStudy] = useState<ImportStudy | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recut, setRecut] = useState<{start: ISODate; end: ISODate} | null>(null);
  const [parameters, setParameters] = useState<ImportStudyParameters | null>(null);
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (studyId === undefined) return;
    if (!UUID.test(studyId)) { setMissing(true); return; }
    let active = true;
    void services.repository.loadStudy(studyId).then((loaded) => {
      if (!active) return;
      if (loaded === null) setMissing(true); else { setStudy(loaded); setStep(loaded.batches.length ? 'review' : 'upload'); }
    }).catch(() => active && setMissing(true));
    return () => { active = false; };
  }, [services.repository, studyId]);
  useEffect(() => {
    if (services.catalog !== null && parameters === null) setParameters(createImportStudyParameters(services.catalog));
  }, [parameters, services.catalog]);
  const projection = useMemo(() => study === null ? null : projectPortfolio(study), [study]);
  const knownDates = useMemo(() => projection?.operations.map((row) => row.operation.knownDate).sort() ?? [], [projection]);
  useEffect(() => {
    if (projection === null || projection.operations.length === 0 || recut !== null) return;
    const dates = projection.operations.map((row) => row.operation.knownDate).sort();
    const start = dates[0]; const end = dates.at(-1);
    if (start !== undefined && end !== undefined) setRecut({ start, end });
  }, [projection, recut]);

  if (missing) return <Navigate to="/carteira" replace />;
  const parse = async (file: File, signal: AbortSignal) => {
    setBusy(true); setError(null);
    try {
      const parsed = await services.worker.parse(file, signal);
      const id = study?.id ?? crypto.randomUUID();
      const now = new Date().toISOString();
      let current = study;
      if (current === null) {
        current = { schemaVersion:'1.0.0', id, revision:0, name:file.name.replace(/\.xlsx$/i,''), createdAtUtc:now, updatedAtUtc:now, batches:[], events:[] };
        await services.repository.createStudy(current);
      }
      const batch = batchFromFile(id, current.batches.length + 1, parsed);
      current = await services.repository.mutateStudy({ studyId:id, expectedRevision:current.revision, operationId:crypto.randomUUID(), mutation:{kind:'INCORPORATE_BATCH', batch} });
      setStudy(current); setStep('review');
      if (studyId === undefined) navigate(`/carteira/${id}/importar`, { replace:true });
    } finally { setBusy(false); }
  };
  const mutate = async (mutation: StudyMutation) => {
    if (study === null) return;
    const next = await services.repository.mutateStudy({ studyId:study.id, expectedRevision:study.revision, operationId:crypto.randomUUID(), mutation });
    setStudy(next);
  };
  const assessment = projection !== null && recut !== null ? evaluateExecution(projection, recut, services.catalog) : null;
  const execute = async () => {
    if (study === null || assessment === null || services.catalog === null || parameters === null || recut === null) return;
    setBusy(true); setError(null);
    const attemptId = crypto.randomUUID();
    try {
      const envelope = await services.controller.execute({ ownerSub:services.ownerSub, study, assessment, catalog:services.catalog, parameters, recut, attemptId, requestId:crypto.randomUUID(), scenarioId:crypto.randomUUID(), nowUtc:new Date().toISOString() });
      if (envelope === null) { setError(services.controller.state.status === 'FAILURE' ? services.controller.state.message : 'A execução não foi concluída.'); return; }
      const query = new URLSearchParams({ study: study.id, execution: envelope.execution_id });
      navigate(`/diagnostico?${query.toString()}`);
    } finally { setBusy(false); }
  };
  const availability = catalogExecutionAvailability(services.catalog, parameters?.catalogVersion ?? null);
  return <article className="destination-page import-flow"><p className="eyebrow">Importação local de operações reais</p><h1 ref={heading} tabIndex={-1}>Importar XLSX</h1>
    <ol className="step-list" aria-label="Etapas"><li aria-current={step === 'upload' ? 'step' : undefined}>Arquivo</li><li aria-current={step === 'review' ? 'step' : undefined}>Revisão</li><li aria-current={step === 'parameters' ? 'step' : undefined}>Parâmetros</li><li aria-current={step === 'confirm' ? 'step' : undefined}>Confirmação</li></ol>
    {step === 'upload' ? <UploadStep busy={busy} onParse={parse} /> : null}
    {step === 'review' && study !== null && projection !== null ? <><ReviewStep study={study} projection={projection} onMutate={mutate} /><button className="button" onClick={() => setStep('parameters')}>Definir recorte e parâmetros</button></> : null}
    {step === 'parameters' && parameters !== null && recut !== null ? <ParametersStep start={recut.start} end={recut.end} knownMin={knownDates[0] ?? recut.start} knownMax={knownDates.at(-1) ?? recut.end} parameters={parameters} onRecut={(start,end) => setRecut({start,end})} onParameter={(field:ParameterField,value) => { try { setParameters((current) => current === null ? current : updateImportStudyParameter(current, { field, value: field === 'windowDays' ? Number(value) : value, changedAtUtc:new Date().toISOString() } as Parameters<typeof updateImportStudyParameter>[1])); setError(null); } catch (caught) { setError(String(caught)); } }} onContinue={() => setStep('confirm')} /> : null}
    {services.catalogLoading ? <p role="status">Carregando catálogo…</p> : null}{services.catalogError === null ? null : <p role="alert">{services.catalogError}</p>}
    {step === 'confirm' && assessment !== null ? <ExecutionConfirmation assessment={assessment} blockedReason={availability.allowed ? null : 'O catálogo de importação não está configurado ou mudou. Revise antes de executar.'} busy={busy} error={error} onExecute={() => void execute()} {...(services.controller.canRetrySave ? { onRetrySave: () => void services.controller.retrySave() } : {})} /> : null}
  </article>;
}
