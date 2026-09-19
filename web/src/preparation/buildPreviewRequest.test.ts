import { describe, expect, it } from 'vitest';

import { validatePreviaRequest } from '../api/validators';
import { makeSyntheticSnapshot } from '../study/fixtures';
import type { PremisesDocument, PeriodDocument } from '../study/model';
import {
  buildPreviewRequest,
  PreviewRequestTooLargeError,
} from './buildPreviewRequest';

const identity = {
  requestId: '00000000-0000-4000-8000-000000000001',
  studyId: '00000000-0000-4000-8000-000000000002',
  scenarioId: '00000000-0000-4000-8000-000000000003',
  scenarioRevision: 1,
};

const premises: PremisesDocument = {
  costs: {
    iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
    custo_fixo_remessa: '40', custo_oportunidade_aa: '0', spread_rail_bps: '25',
    ptax: '5.40', iof_por_finalidade: [],
  },
  windowDays: 7,
};

const naturalPeriod: PeriodDocument = {
  httpPeriod: { modo: 'NATURAL', dias_aquecimento: 2, periodo_medicao_dias: 30 },
};

describe('buildPreviewRequest', () => {
  it('constrói e valida o request canônico com ordens, premissas e período', () => {
    const snapshot = makeSyntheticSnapshot();

    const request = buildPreviewRequest(snapshot, premises, naturalPeriod, identity);

    expect(validatePreviaRequest(request)).toBe(true);
    expect(request).toMatchObject({
      api_version: '1.0.0', request_id: identity.requestId, study_id: identity.studyId,
      scenario_id: identity.scenarioId, scenario_revision: 1,
      periodo: naturalPeriod.httpPeriod,
      cenario: { janela_dias: 7, horizonte_dias: 32, custo: premises.costs },
    });
    expect(request.cenario.ordens.map((order) => order.id)).toEqual(['order-a', 'order-b']);
  });

  it('preserva o horizonte executável local do período legado sem inventá-lo no DTO HTTP', () => {
    const legacyPeriod: PeriodDocument = {
      httpPeriod: { modo: 'LEGADO' }, executableHorizonDays: 31,
    };

    const request = buildPreviewRequest(makeSyntheticSnapshot(), premises, legacyPeriod, identity);

    expect(request.periodo).toEqual({ modo: 'LEGADO' });
    expect(request.cenario.horizonte_dias).toBe(31);
  });

  it('rejeita o limite de tamanho antes de qualquer rede e não serializa dados internos', () => {
    const snapshot = makeSyntheticSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(() => buildPreviewRequest(snapshot, premises, naturalPeriod, identity, { maxBytes: 1 }))
      .toThrow(PreviewRequestTooLargeError);

    const request = buildPreviewRequest(snapshot, premises, naturalPeriod, identity);
    expect(JSON.stringify(request)).not.toMatch(/filename|corrections|sourceManifest|arquivo|Blob|history/i);
    expect(serialized).toContain('generationFingerprint');
    expect(JSON.stringify(request)).not.toContain('generationFingerprint');
  });
});
