// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import demoJson from '../demo/generated/demo-study.v1.json';
import type { DemoStudyPackageV1 } from '../demo/domain';
import { fictionalCatalog } from '../importer/__fixtures__/catalog';
import { fingerprintPortfolioSource, fingerprintScenarioInput } from '../study/fingerprints';
import type { DeepMutable } from '../study/model';
import { PresentationRoute } from './PresentationRoute';

const mocks = vi.hoisted(() => {
  const loadStudy = vi.fn();
  const buildReplay = vi.fn();
  const getImportCatalog = vi.fn();
  return { loadStudy, buildReplay, getImportCatalog,
    runtime: { ownerSub: '', controller: { loadStudy }, client: { buildReplay, getImportCatalog } } };
});
vi.mock('../app/providers', () => ({ useDiagnosticRuntime: () => mocks.runtime }));

describe('PresentationRoute', () => {
  it.each(['indisponível', 'não configurado'] as const)('abre apresentação com Replay descendente de XLSX e catálogo %s', async (catalogState) => {
    const demo = structuredClone(demoJson) as DeepMutable<DemoStudyPackageV1>;
    const study = demo.study;
    const execution = study.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED')!;
    const scenario = study.scenarios.find((item) => item.id === execution.scenarioId)!;
    scenario.sourceSnapshot.provenance.push({ kind: 'OBSERVED', source: 'xlsx-operacoes', version: '1.0.0', recordedAt: study.updatedAt });
    scenario.sourceSnapshot.sourceFingerprint = await fingerprintPortfolioSource(scenario.sourceSnapshot);
    scenario.inputFingerprint = await fingerprintScenarioInput(scenario);
    for (const item of study.executions) {
      if (item.kind !== 'DIAGNOSTIC' || item.scenarioId !== scenario.id) continue;
      item.sourceSnapshot = structuredClone(scenario.sourceSnapshot);
      item.inputFingerprint = scenario.inputFingerprint;
      item.requestSnapshot.input_fingerprint = scenario.inputFingerprint;
      if (item.envelope !== null) item.envelope.request_fingerprint = scenario.inputFingerprint;
    }
    mocks.runtime.ownerSub = study.ownerSub;
    mocks.loadStudy.mockResolvedValue(study);
    mocks.buildReplay.mockReset().mockResolvedValue(demo.replays[scenario.id]);
    mocks.getImportCatalog.mockReset();
    if (catalogState === 'indisponível') mocks.getImportCatalog.mockRejectedValue(new Error('offline'));
    else mocks.getImportCatalog.mockResolvedValue({ ...fictionalCatalog(), status: 'NAO_CONFIGURADO' });
    render(<MemoryRouter initialEntries={[
      `/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${execution.id}&dia=31`,
    ]}><Routes><Route path="/estudos/:studyId/apresentacao" element={<PresentationRoute />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: study.name }, { timeout: 5_000 })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Resumo executivo' })).toBeVisible();
    expect(mocks.buildReplay).toHaveBeenCalledOnce();
    expect(mocks.getImportCatalog).not.toHaveBeenCalled();
  }, 15_000);
});
