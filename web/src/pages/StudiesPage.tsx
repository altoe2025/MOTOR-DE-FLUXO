import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ApiClient, PreparationRequest } from '../api/client';
import { useApiClient, useStudyController } from '../app/providers';
import { useAuth } from '../auth/AuthProvider';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { StudyList } from '../study/components/StudyList';
import { createStudy, duplicateStudy, moveStudyToTrash, renameStudy } from '../study/domain';
import type { CostPremises, ScenarioDraft, StudyDocument } from '../study/model';
import { requiredBuildSha } from '../study/sourceConfiguration';
import { Button } from '../ui/Button';

const DEFAULT_COSTS: CostPremises = {
  iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '25',
  custo_fixo_remessa: '40', custo_oportunidade_aa: '0', ptax: '5.40', iof_por_finalidade: [],
};

async function initialStudy(api: ApiClient, ownerSub: string): Promise<StudyDocument> {
  if (api.preparePortfolio === undefined) throw new Error('A preparação de carteira não está disponível.');
  const studyId = crypto.randomUUID(); const scenarioId = crypto.randomUUID(); const now = new Date().toISOString();
  const participantId = crypto.randomUUID();
  const participantPrefix = `/participants/${participantId}`;
  const sourcePaths = [
    '/warmup_days', '/measurement_days', '/window_days',
    '/costs/iof_out', '/costs/iof_in', '/costs/carry_cnr', '/costs/spread_rail_bps',
    '/costs/custo_fixo_remessa', '/costs/custo_oportunidade_aa', '/costs/ptax',
    `${participantPrefix}/profile`, `${participantPrefix}/seed`,
    `${participantPrefix}/monthly_volume_brl`, `${participantPrefix}/ticket_median_brl`,
    `${participantPrefix}/out_fraction`, `${participantPrefix}/deadline/mode`,
    `${participantPrefix}/deadline/days`, `${participantPrefix}/eh_efx`,
    `${participantPrefix}/purpose_out`, `${participantPrefix}/purpose_in`,
  ];
  const preparation: PreparationRequest = {
    preparation_version: '1.0.0', request_id: crypto.randomUUID(), study_id: studyId,
    scenario_id: scenarioId, scenario_revision: 1,
    expected_build_sha: requiredBuildSha(import.meta.env.VITE_MOTOR_BUILD_SHA, undefined),
    input: {
      participants: [{ id: participantId, profile: 'tesouraria_corporativa', monthly_volume_brl: '1000000', ticket_median_brl: '100000', out_fraction: '0.5', purpose_out: 'ANEXO_V_REMESSA_TERCEIRO', purpose_in: 'ANEXO_V_DISPONIBILIDADE', eh_efx: false, deadline: { mode: 'FIXED', days: 7 }, seed: '1' }],
      warmup_days: 0, measurement_days: 30, window_days: 7,
      costs: { ...DEFAULT_COSTS, iof_por_finalidade: DEFAULT_COSTS.iof_por_finalidade.map((item) => ({ ...item })) },
      sources: Object.fromEntries(sourcePaths.map((path) => [path, {
        kind: 'PADRAO_SINTETICO' as const,
        source: 'catálogo oficial de exemplos',
        recorded_at: now,
      }])),
    },
  };
  const sourceSnapshot = await resolvePortfolioSource({ kind: 'SYNTHETIC', exampleId: 'equilibrado', preparation }, { getObservedCase: async () => null, preparePortfolio: (input) => api.preparePortfolio!(input), now: () => now });
  const baseScenario: ScenarioDraft = { id: scenarioId, revision: 1, name: 'Cenário base', sourceSnapshot, premises: { costs: DEFAULT_COSTS, windowDays: 7 }, period: { httpPeriod: { modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 30 } } };
  return createStudy({ id: studyId, ownerSub, name: 'Novo estudo', baseScenario, now });
}

export function StudiesPage() {
  const controller = useStudyController(); const api = useApiClient(); const { userId } = useAuth(); const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null); const [studies, setStudies] = useState<StudyDocument[]>([]); const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); const [restoringDemo, setRestoringDemo] = useState(false);
  const refresh = async () => { try { setStudies(await controller.listStudies(true)); setLoaded(true); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os estudos.'); } };
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
  useEffect(() => { heading.current?.focus(); void refresh(); return controller.subscribe(() => void refresh()); }, [controller]);
  const editExisting = async (study: StudyDocument, update: (loaded: StudyDocument) => Promise<StudyDocument>) => { const loaded = await controller.loadStudy(study.id); if (loaded === null) throw new Error('Estudo não encontrado.'); controller.edit(await update(loaded)); await controller.flush(); await refresh(); };
  const remove = async (study: StudyDocument) => { if (!window.confirm(`Mover o estudo “${study.name}” para a lixeira?`)) return; try { await editExisting(study, (loaded) => moveStudyToTrash(loaded, new Date().toISOString())); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o estudo.'); } };
  return <article className="destination-page"><p className="eyebrow">Estudos</p><h1 ref={heading} tabIndex={-1}>Estudos</h1><p className="page-introduction">Crie ou abra uma carteira salva para revisar sua origem, premissas e resultado.</p>{visibleError ? <p role="alert" className="inline-notice inline-notice--error">{visibleError}</p> : null}{loaded && studies.length === 0 ? <Button variant="secondary" disabled={restoringDemo} onClick={() => void restoreDemo()}>{restoringDemo ? 'Carregando demonstração…' : 'Carregar estudo demonstrativo'}</Button> : null}<StudyList studies={studies} selectedId={controller.snapshot.document?.id ?? null} onCreate={() => void (async () => { try { if (userId === null) throw new Error('Sessão necessária.'); const created = await initialStudy(api, userId); controller.startNewStudy(); controller.edit(created); await controller.flush(); navigate(`/estudos/${created.id}`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o estudo.'); } })()} onOpen={(id) => navigate(`/estudos/${id}`)} onRename={(study) => void (async () => { const name = window.prompt(`Novo nome para “${study.name}”:`, study.name)?.trim(); if (!name || name === study.name) return; try { await editExisting(study, (loaded) => renameStudy(loaded, name, new Date().toISOString())); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível renomear o estudo.'); } })()} onDuplicate={(study) => void (async () => { try { const loaded = await controller.loadStudy(study.id); if (loaded === null) throw new Error('Estudo não encontrado.'); const copy = await duplicateStudy(loaded, new Date().toISOString(), () => crypto.randomUUID()); controller.startNewStudy(); controller.edit(copy); await controller.flush(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o estudo.'); } })()} onRestore={(study) => void controller.restoreStudy(study.id, study.revision).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível restaurar o estudo.'))} onDelete={remove} /></article>;
}
