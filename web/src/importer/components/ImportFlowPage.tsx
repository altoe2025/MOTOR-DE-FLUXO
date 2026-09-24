import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';

import { useApiClient, useStudyController } from '../../app/providers';
import { useAuth } from '../../auth/AuthProvider';
import type { CompanyRecord } from '../../cases/domain';
import { loadImportCatalog } from '../catalogClient';
import { ImportFlowController } from '../controller';
import type { ImportCommand } from '../eligibility';
import { parseCanonicalXlsx } from '../workerClient';
import { CaseConfirmation } from './CaseConfirmation';
import { ReviewStep } from './ReviewStep';
import { UploadStep } from './UploadStep';
import { AskAboutThis } from '../../help/AskAboutThis';
import { HELP_IDS } from '../../help/helpIds';

export function ImportFlowPage() {
  const { companyId } = useParams();
  const { userId } = useAuth();
  const studyController = useStudyController();
  const api = useApiClient();
  const flow = useMemo(() => new ImportFlowController({ parse: parseCanonicalXlsx, publish: (review, operationId) => studyController.confirmImportedCase(review, operationId) }), [studyController, userId, companyId]);
  const snapshot = useSyncExternalStore((listener) => flow.subscribe(listener), () => flow.snapshot);
  const [companies, setCompanies] = useState<readonly CompanyRecord[] | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId ?? '');
  const [pendingCompany, setPendingCompany] = useState<CompanyRecord | null>(null);
  const [positionIdentified, setPositionIdentified] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lifecycle = useRef({ flow, generation: 0 });

  useEffect(() => {
    const generation = lifecycle.current.generation + 1;
    lifecycle.current = { flow, generation };
    return () => queueMicrotask(() => {
      if (lifecycle.current.flow !== flow || lifecycle.current.generation === generation) flow.dispose();
    });
  }, [flow]);
  useEffect(() => heading.current?.focus(), [companyId, companies]);
  useEffect(() => { setSelectedCompanyId(companyId ?? ''); setPendingCompany(null); setPositionIdentified(false); }, [companyId]);
  useEffect(() => {
    let current = true;
    setCompanies(null);
    void studyController.listCompanies().then((items) => {
      if (current) setCompanies(items.filter((item) => item.ownerSub === userId));
    }).catch((error: unknown) => {
      if (current) { setCompanies([]); setUiError(error instanceof Error ? error.message : 'Não foi possível carregar as empresas.'); }
    });
    return () => { current = false; };
  }, [studyController, userId]);
  useEffect(() => {
    const abort = new AbortController();
    void loadImportCatalog(api, abort.signal).then((availability) => {
      if (abort.signal.aborted) return;
      if (availability.kind === 'UNAVAILABLE') setCatalogMessage('Catálogo indisponível: revisão local disponível; confirmação de execução bloqueada.');
      else if (!availability.canConfirmExecution) setCatalogMessage('Catálogo não configurado: revisão local disponível; confirmação de execução bloqueada.');
      else setCatalogMessage(null);
    }).catch(() => { if (!abort.signal.aborted) setCatalogMessage('Catálogo indisponível: revisão local disponível; confirmação de execução bloqueada.'); });
    return () => abort.abort();
  }, [api]);

  const company = companyId !== undefined
    ? companies?.find((item) => item.id === companyId) ?? null
    : [...(companies ?? []), ...(pendingCompany === null ? [] : [pendingCompany])].find((item) => item.id === selectedCompanyId) ?? null;
  if (companyId !== undefined && companies !== null && !companies.some((item) => item.id === companyId)) {
    return <article className="destination-page"><h1 ref={heading} tabIndex={-1}>Empresa não encontrada</h1><p>A empresa não existe ou pertence a outra conta.</p></article>;
  }
  const busy = snapshot.status === 'INSPECTING' || snapshot.status === 'PARSING';
  const onCommand = (command: ImportCommand) => {
    try { flow.applyCommand(command); setUiError(null); }
    catch (error) { setUiError(error instanceof Error ? error.message : 'Não foi possível revisar a operação.'); }
  };
  return <article className="destination-page company-page import-flow">
    <p className="eyebrow">Fonte observada</p>
    <h1 ref={heading} tabIndex={-1}>Importar operações{companyId === undefined || company === null ? '' : ` de ${company.displayName}`}</h1>
    <AskAboutThis helpId={HELP_IDS.IMPORT_PAGE} />
    <p className="page-introduction">Leia uma planilha canônica, revise cada operação e confirme o Caso Observado.</p>
    {catalogMessage === null ? null : <p role="status" className="inline-notice">{catalogMessage}</p>}
    {uiError === null && snapshot.error === null ? null : <p role="alert" className="inline-notice inline-notice--error">{uiError ?? snapshot.error}</p>}
    {companies === null ? <p role="status">Carregando empresas…</p> : snapshot.confirmedCase !== null ? <CaseConfirmation observedCase={snapshot.confirmedCase} /> : <>
      {snapshot.review === null ? <UploadStep file={snapshot.file} selectedCompanyId={companyId ?? selectedCompanyId} companies={pendingCompany === null ? companies : [...companies, pendingCompany]} {...(companyId === undefined ? {} : { lockedCompanyName: company!.displayName })} positionIdentified={positionIdentified} busy={busy}
        onFile={(file) => { flow.selectFile(file); setUiError(null); }}
        onCompany={(id) => { if (companyId === undefined) setSelectedCompanyId(id); }}
        onCreateCompany={(name) => {
          if (companyId !== undefined || userId === null) return;
          if (companies.some((item) => item.displayName.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
            setUiError('Empresa já existente. Selecione-a na lista.'); return;
          }
          const now = new Date().toISOString();
          const prepared: CompanyRecord = { id: crypto.randomUUID(), ownerSub: userId, displayName: name, aliases: [], createdAt: now, updatedAt: now, revision: 1 };
          setPendingCompany(prepared);
          setSelectedCompanyId(prepared.id);
          setUiError(null);
        }} onPosition={setPositionIdentified}
        onRead={() => {
          if (company === null || userId === null) return;
          void flow.read({ company, ownerSub: userId, positionIdentified }).catch(() => undefined);
        }} onCancel={() => flow.cancel()} /> : null}
      {busy ? <p role="status">{snapshot.status === 'INSPECTING' ? 'Inspecionando planilha…' : 'Lendo planilha no worker…'}</p> : null}
      {snapshot.review === null ? null : <>
        <ReviewStep review={snapshot.review} onCommand={onCommand} />
        <div className="import-actions">
          <button className="button button--primary" type="button" disabled={snapshot.status !== 'READY_TO_CONFIRM'} onClick={() => { void flow.confirm().catch(() => undefined); }}>{snapshot.status === 'CONFIRMING' ? 'Confirmando…' : 'Confirmar Caso Observado'}</button>
          <button className="button" type="button" disabled={snapshot.status === 'CONFIRMING'} onClick={() => { flow.cancel(); setPendingCompany(null); setSelectedCompanyId(companyId ?? ''); }}>Cancelar importação</button>
        </div>
      </>}
    </>}
  </article>;
}
