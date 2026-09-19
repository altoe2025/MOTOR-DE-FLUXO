import { describe, expect, it } from 'vitest';

import { validatePreviaRequest } from '../api/validators';
import { makeSyntheticSnapshot } from '../study/fixtures';
import type { FieldProvenance } from '../cases/domain';
import type { PremisesDocument, PeriodDocument } from '../study/model';
import {
  buildPreviewRequest,
  PreviewRequestTooLargeError,
  type PreviewRequestProvenance,
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

const syntheticDefault: FieldProvenance = {
  kind: 'SYNTHETIC_DEFAULT', source: 'catálogo oficial', version: '1.0.0',
  recordedAt: '2026-09-19T12:00:00Z', rule: 'dimensionamento-v1',
};

const provenance: PreviewRequestProvenance = {
  premises: {
    windowDays: syntheticDefault,
    costs: {
      iof_out: syntheticDefault, iof_in: syntheticDefault, carry_cnr: syntheticDefault,
      custo_fixo_remessa: syntheticDefault, custo_oportunidade_aa: syntheticDefault,
      spread_rail_bps: syntheticDefault, ptax: syntheticDefault,
    },
  },
  period: { horizonDays: syntheticDefault },
};

describe('buildPreviewRequest', () => {
  it('constrói e valida o request canônico com ordens, premissas e período', () => {
    const snapshot = makeSyntheticSnapshot();

    const request = buildPreviewRequest(snapshot, premises, naturalPeriod, identity, provenance);

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

    const request = buildPreviewRequest(
      makeSyntheticSnapshot(), premises, legacyPeriod, identity, provenance,
    );

    expect(request.periodo).toEqual({ modo: 'LEGADO' });
    expect(request.cenario.horizonte_dias).toBe(31);
  });

  it('rejeita o limite de tamanho antes de qualquer rede e não serializa dados internos', () => {
    const snapshot = makeSyntheticSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(() => buildPreviewRequest(snapshot, premises, naturalPeriod, identity, provenance, { maxBytes: 1 }))
      .toThrow(PreviewRequestTooLargeError);

    const request = buildPreviewRequest(snapshot, premises, naturalPeriod, identity, provenance);
    expect(JSON.stringify(request)).not.toMatch(/filename|corrections|sourceManifest|arquivo|Blob|history/i);
    expect(serialized).toContain('generationFingerprint');
    expect(JSON.stringify(request)).not.toContain('generationFingerprint');
  });

  it('preserva proveniência explícita por campo e rejeita uma origem agregada ambígua', () => {
    const snapshot = makeSyntheticSnapshot();
    const observed: FieldProvenance = {
      kind: 'OBSERVED', source: 'arquivo confirmado', version: '1',
      recordedAt: '2026-09-19T12:01:00Z',
    };
    snapshot.provenance.push(observed);

    expect(() => buildPreviewRequest(snapshot, premises, naturalPeriod, identity, provenance))
      .toThrow('ambígua');

    const orders = Object.fromEntries(snapshot.orders.map((order) => [order.id, {
      dia_conhecida: observed,
      dia_limite: observed,
      eh_efx: observed,
      finalidade: observed,
      valor_brl: observed,
    }]));
    const request = buildPreviewRequest(snapshot, premises, naturalPeriod, identity, {
      ...provenance,
      orders,
    });

    expect(request.proveniencia['/ordens/0/valor_brl']).toEqual({
      tipo: 'DADO_OBSERVADO', fonte: 'arquivo confirmado', registrado_em_utc: observed.recordedAt,
    });
    expect(request.proveniencia['/custo/iof_out']).toEqual({
      tipo: 'PADRAO_SINTETICO', fonte: 'catálogo oficial', registrado_em_utc: syntheticDefault.recordedAt,
    });
  });
});
