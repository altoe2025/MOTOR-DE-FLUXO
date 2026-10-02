import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApiClient, useStudyController } from '../app/providers';
import { useAuth } from '../auth/AuthProvider';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { NewStudyChooser } from '../study/components/NewStudyChooser';
import { StudyList } from '../study/components/StudyList';
import { duplicateStudy, moveStudyToTrash, renameStudy } from '../study/domain';
import type { StudyDocument } from '../study/model';
import { studyFromObservedCases, syntheticStudy } from '../study/newStudy';
import { buildStudyExport, parseStudyExport, prepareStudyImport, studyExportFileName } from '../study/studyTransfer';
import { Button } from '../ui/Button';

function download(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = fileName;
  document.body.append(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

export function StudiesPage() {
  const controller = useStudyController(); const api = useApiClient(); const { userId } = useAuth(); const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null); const [studies, setStudies] = useState<StudyDocument[]>([]); const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); const [restoringDemo, setRestoringDemo] = useState(false);
  const [loadingPortfolioShowcase, setLoadingPortfolioShowcase] = useState(false);
  const [demoStatus, setDemoStatus] = useState<'INSTALLED' | 'REMOVED' | null>(null);
  const [notice, setNotice] = useState<string | null>(null); const importInput = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState<{ cases: ObservedCase[]; companies: CompanyRecord[] } | null>(null); const [creating, setCreating] = useState(false);
  const openChooser = async () => {
    setError(null);
    try { const [cases, companies] = await Promise.all([controller.listObservedCases(), controller.listCompanies()]); setChoosing({ cases, companies }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível listar os casos importados.'); }
  };
  const create = async (build: (ownerSub: string) => Promise<StudyDocument>) => {
    setCreating(true); setError(null);
    try {
      if (userId === null) throw new Error('Sessão necessária.');
      const created = await build(userId);
      controller.startNewStudy(); controller.edit(created); await controller.flush();
      navigate(`/carteira/${created.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o estudo.');
    } finally { setCreating(false); }
  };
  const context = (ownerSub: string) => ({ ownerSub, now: new Date().toISOString(), ids: () => crypto.randomUUID() });
  const refresh = async () => { try { const [nextStudies, nextDemoStatus] = await Promise.all([controller.listStudies(true), controller.demoInstallationStatus()]); setStudies(nextStudies); setDemoStatus(nextDemoStatus); setLoaded(true); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os estudos.'); } };
  const storageError = controller.snapshot.status === 'STORAGE_FAILURE'
    ? controller.snapshot.error instanceof Error ? controller.snapshot.error.message : 'Não foi possível salvar os dados locais.'
    : null;
  const visibleError = error ?? storageError;
  const restoreDemo = async () => {
    setRestoringDemo(true);
    setError(null);
    try {
      const restored = await controller.restoreDemoStudy();
      if (restored !== null) navigate(`/estudos/${restored.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o estudo demonstrativo.');
    } finally {
      setRestoringDemo(false);
    }
  };
  const loadPortfolioShowcase = async () => {
    const seed = window.__MOTOR_E2E__?.seedPortfolioShowcase;
    if (seed === undefined || loadingPortfolioShowcase) return;
    setLoadingPortfolioShowcase(true);
    setError(null);
    setNotice(null);
    try {
      const result = await seed();
      setNotice(`${result.companyIds.length} empresas sintéticas carregadas. Abra “Nova combinação de carteiras” e selecione as empresas.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as empresas sintéticas.');
    } finally {
      setLoadingPortfolioShowcase(false);
    }
  };
  const exportStudy = (study: StudyDocument) => {
    const now = new Date().toISOString();
    download(studyExportFileName(study, now), JSON.stringify(buildStudyExport(study, { now, buildSha: import.meta.env.VITE_MOTOR_BUILD_SHA ?? null }), null, 2));
  };
  const importStudy = async (file: File) => {
    setError(null); setNotice(null);
    try {
      if (userId === null) throw new Error('Sessão necessária.');
      const parsed = await parseStudyExport(await file.text(), userId);
      if (!parsed.ok) { setError(parsed.error); return; }
      const prepared = await prepareStudyImport(parsed.study, { ownerSub: userId, existing: await controller.listStudies(true), now: new Date().toISOString(), ids: () => crypto.randomUUID() });
      await controller.saveDetachedStudy(prepared.study, 0);
      await refresh();
      const otherBuild = parsed.buildSha !== null && parsed.buildSha !== (import.meta.env.VITE_MOTOR_BUILD_SHA ?? null)
        ? ' O arquivo veio de outra versão do motor; os resultados guardados continuam como foram calculados.' : '';
      setNotice(prepared.asCopy
        ? `Este estudo já existe neste navegador. Importado como cópia “${prepared.study.name}”, sem os resultados — rode o diagnóstico de novo na cópia.${otherBuild}`
        : `Estudo “${prepared.study.name}” importado com premissas, cenários e resultados.${otherBuild}`);
    } catch (reason) {
      setError(reason instanceof Error ? `Não foi possível importar o estudo: ${reason.message}` : 'Não foi possível importar o estudo.');
    }
  };
  useEffect(() => { heading.current?.focus(); void refresh(); return controller.subscribe(() => void refresh()); }, [controller]);
  const editExisting = async (study: StudyDocument, update: (loaded: StudyDocument) => Promise<StudyDocument>) => { const loaded = await controller.loadStudy(study.id); if (loaded === null) throw new Error('Estudo não encontrado.'); controller.edit(await update(loaded)); await controller.flush(); await refresh(); };
  const remove = async (study: StudyDocument) => { if (!window.confirm(`Mover o estudo “${study.name}” para a lixeira?`)) return; try { await editExisting(study, (loaded) => moveStudyToTrash(loaded, new Date().toISOString())); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o estudo.'); } };
  return <article className="destination-page"><p className="eyebrow">Estudos</p><h1 ref={heading} tabIndex={-1}>Estudos</h1><p className="page-introduction">Crie ou abra uma carteira salva para revisar sua origem, premissas e resultado.</p><div className="storage-notice"><p><strong>Salvo neste navegador.</strong> Os estudos ficam só aqui: limpar os dados do navegador apaga tudo. Use “Exportar” para guardar uma cópia de segurança.</p><Button variant="secondary" onClick={() => importInput.current?.click()}>Importar estudo</Button><input ref={importInput} type="file" accept="application/json,.json" hidden aria-label="Arquivo do estudo para importar" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file !== undefined) void importStudy(file); }} /></div>{visibleError ? <p role="alert" className="inline-notice inline-notice--error">{visibleError}</p> : null}{notice ? <p role="status" className="inline-notice">{notice}</p> : null}{choosing === null ? null : <NewStudyChooser cases={choosing.cases} companies={choosing.companies} busy={creating}
    onCreateFromCases={(caseIds) => void create((ownerSub) => studyFromObservedCases(choosing.cases.filter((item) => caseIds.includes(item.id)), { ...context(ownerSub), companies: choosing.companies }))}
    onCreateSynthetic={() => void create((ownerSub) => syntheticStudy(api, context(ownerSub)))} onCancel={() => setChoosing(null)} />}{loaded && demoStatus !== 'INSTALLED' ? <Button variant="secondary" disabled={restoringDemo} onClick={() => void restoreDemo()}>{restoringDemo ? 'Carregando demonstração…' : 'Carregar estudo demonstrativo'}</Button> : null}{window.__MOTOR_E2E__?.seedPortfolioShowcase === undefined ? null : <Button variant="secondary" disabled={loadingPortfolioShowcase} onClick={() => void loadPortfolioShowcase()}>Carregar empresas sintéticas para análise de carteiras</Button>}<StudyList studies={studies} selectedId={controller.snapshot.document?.id ?? null} onCreate={() => void openChooser()} onCreateCombinations={() => void create((ownerSub) => syntheticStudy(api, context(ownerSub), 'PORTFOLIO_COMBINATIONS'))} onOpen={(id) => navigate(`/estudos/${id}`)} onRename={(study) => void (async () => { const name = window.prompt(`Novo nome para “${study.name}”:`, study.name)?.trim(); if (!name || name === study.name) return; try { await editExisting(study, (loaded) => renameStudy(loaded, name, new Date().toISOString())); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível renomear o estudo.'); } })()} onDuplicate={(study) => void (async () => { try { const loaded = await controller.loadStudy(study.id); if (loaded === null) throw new Error('Estudo não encontrado.'); const copy = await duplicateStudy(loaded, new Date().toISOString(), () => crypto.randomUUID()); controller.startNewStudy(); controller.edit(copy); await controller.flush(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o estudo.'); } })()} onRestore={(study) => void controller.restoreStudy(study.id, study.revision).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível restaurar o estudo.'))} onDelete={remove} onExport={exportStudy} /></article>;
}
