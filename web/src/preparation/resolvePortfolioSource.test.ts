import { describe, expect, it, vi } from 'vitest';

import type { PreparationRequest, PreparationResponse } from '../api/client';
import { makeObservedCase } from '../study/fixtures';
import { fingerprintPortfolioSource } from '../study/fingerprints';
import {
  resolvePortfolioSource,
  type PortfolioSourceResolverDependencies,
} from './resolvePortfolioSource';

const NOW = '2026-09-19T12:00:00Z';
const IDENTIFIERS = {
  request_id: '00000000-0000-4000-8000-000000000010',
  study_id: '00000000-0000-4000-8000-000000000011',
  scenario_id: '00000000-0000-4000-8000-000000000012',
};

function preparationRequest(): PreparationRequest {
  return {
    preparation_version: '1.0.0',
    ...IDENTIFIERS,
    scenario_revision: 1,
    expected_build_sha: 'a'.repeat(40),
    input: {
      participants: [],
      warmup_days: 0,
      measurement_days: 30,
      window_days: 7,
      costs: {
        iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
        spread_rail_bps: '0', custo_fixo_remessa: '0', custo_oportunidade_aa: '0',
        ptax: '5.40', iof_por_finalidade: [],
      },
      sources: {
        '/orders': {
          kind: 'ESTIMATIVA_USUARIO', source: 'autoria manual', recorded_at: NOW,
        },
      },
    },
  };
}

function preparationResponse(request = preparationRequest()): PreparationResponse {
  return {
    preparation_version: '1.0.0',
    preparation_id: '00000000-0000-4000-8000-000000000014',
    request_id: request.request_id,
    study_id: request.study_id,
    scenario_id: request.scenario_id,
    scenario_revision: request.scenario_revision,
    created_at: NOW,
    motor_build_sha: 'a'.repeat(40),
    generator_version: 'dimensionamento-v1',
    generation_fingerprint: 'b'.repeat(64),
    input_snapshot: request.input,
    orders: [
      {
        id: 'order-b', cliente_id: 'client-b', direcao: 'IN', dia_conhecida: 0,
        dia_limite: 2, valor_brl: '70', finalidade: 'ANEXO_V_DISPONIBILIDADE', eh_efx: false,
      },
      {
        id: 'order-a', cliente_id: 'client-a', direcao: 'OUT', dia_conhecida: 0,
        dia_limite: 1, valor_brl: '100', finalidade: 'ANEXO_V_REMESSA_TERCEIRO', eh_efx: true,
      },
    ],
    parameters: [],
    composition: [{
      participant_id: null, order_count: 2, out_brl: '100', in_brl: '70',
      total_brl: '170', out_fraction: '0.588235294118',
    }],
    derived_provenance: {},
  };
}

function dependencies(overrides: Partial<PortfolioSourceResolverDependencies> = {}): PortfolioSourceResolverDependencies {
  return {
    getObservedCase: async () => makeObservedCase(),
    preparePortfolio: async (input) => preparationResponse(input),
    now: () => NOW,
    ...overrides,
  };
}

describe('resolvePortfolioSource', () => {
  it('cria o fixture dourado observado sem chamar o gerador e sem carregar metadados do arquivo', async () => {
    const preparePortfolio = vi.fn();
    const caseRecord = makeObservedCase();

    const snapshot = await resolvePortfolioSource(
      { kind: 'OBSERVED_CASE', caseId: caseRecord.id, caseRevision: caseRecord.revision },
      dependencies({ getObservedCase: async () => caseRecord, preparePortfolio }),
    );

    expect(snapshot).toMatchObject({
      source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 4 },
      capturedAt: NOW,
      orders: [{ id: 'observed-order-1', dia_conhecida: 0, dia_limite: 2 }],
      provenance: caseRecord.orders[0]!.provenance,
      observedOutcome: caseRecord.observedOutcome,
    });
    expect(snapshot.orders.map((order) => order.id)).toEqual(['observed-order-1']);
    expect(preparePortfolio).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).not.toMatch(/anonimizado\.xlsx|corrections|sourceManifest|Blob/i);
    expect(snapshot.sourceFingerprint).toBe(await fingerprintPortfolioSource(snapshot));
  });

  it('preserva associação heterogênea OBSERVED, USER_CORRECTED e INFERRED por campo', async () => {
    const caseRecord = makeObservedCase();
    const observed = caseRecord.orders[0]!.provenance[0]!;
    const corrected = {
      kind: 'USER_CORRECTED' as const, source: 'correção', version: '2',
      recordedAt: NOW, actionId: 'action-1',
    };
    const inferred = {
      kind: 'INFERRED' as const, source: 'normalizador', version: '3',
      recordedAt: NOW, rule: 'deadline-v3',
    };
    const heterogeneous = {
      ...caseRecord,
      orders: [{
        ...caseRecord.orders[0]!,
        provenance: [observed, corrected, inferred],
        fieldProvenance: {
          knownDate: observed,
          deadlineDate: inferred,
          valueBrl: observed,
          purposeCode: corrected,
          efxStatus: observed,
        },
      }],
    };

    const snapshot = await resolvePortfolioSource(
      { kind: 'OBSERVED_CASE', caseId: heterogeneous.id, caseRevision: heterogeneous.revision },
      dependencies({ getObservedCase: async () => heterogeneous }),
    );

    expect(snapshot.provenanceByOrder?.['observed-order-1']).toEqual({
      dia_conhecida: observed,
      dia_limite: inferred,
      valor_brl: observed,
      finalidade: corrected,
      eh_efx: observed,
    });
  });

  it('rejeita o fixture dourado observado ainda em draft', async () => {
    const draft = { ...makeObservedCase(), status: 'DRAFT' as const, confirmedAt: null };

    await expect(resolvePortfolioSource(
      { kind: 'OBSERVED_CASE', caseId: draft.id, caseRevision: draft.revision },
      dependencies({ getObservedCase: async () => draft as unknown as ReturnType<typeof makeObservedCase> }),
    )).rejects.toThrow('confirmado');
  });

  it('cria o fixture dourado manual somente a partir da preparação validada', async () => {
    const response = preparationResponse();

    const snapshot = await resolvePortfolioSource(
      { kind: 'AUTHORED', authoredPortfolioId: 'portfolio-1', preparation: response },
      dependencies(),
    );

    expect(snapshot).toMatchObject({
      source: { kind: 'AUTHORED', authoredPortfolioId: 'portfolio-1' },
      capturedAt: NOW,
      generationInputSnapshot: response.input_snapshot,
      observedOutcome: null,
      provenance: [{ kind: 'USER_ESTIMATE', source: 'autoria manual', recordedAt: NOW }],
    });
    expect(snapshot.orders.map((order) => order.id)).toEqual(['order-a', 'order-b']);
    expect(snapshot.sourceFingerprint).toBe(await fingerprintPortfolioSource(snapshot));
  });

  it('converte ordens observadas em autoria explícita sem chamar preparação nem reamostrar', async () => {
    const observed = makeObservedCase();
    const preparePortfolio = vi.fn();
    const definition = {
      kind: 'EXPLICIT_ORDERS' as const,
      derivedFromObservedCase: { caseId: observed.id, caseRevision: observed.revision },
      orders: [{
        id: 'observed-order-1', cliente_id: 'client-1', direcao: 'OUT' as const,
        dia_conhecida: 0, dia_limite: 2, valor_brl: '100',
        finalidade: 'ANEXO_V_REMESSA_TERCEIRO', eh_efx: true,
      }],
      provenanceByOrder: {
        'observed-order-1': {
          dia_conhecida: observed.orders[0]!.provenance[0]!,
          dia_limite: observed.orders[0]!.provenance[0]!,
          valor_brl: observed.orders[0]!.provenance[0]!,
          finalidade: observed.orders[0]!.provenance[0]!,
          eh_efx: observed.orders[0]!.provenance[0]!,
        },
      },
    };

    const snapshot = await resolvePortfolioSource(
      { kind: 'AUTHORED', authoredPortfolioId: 'portfolio-explicit', definition },
      dependencies({ preparePortfolio }),
    );

    expect(preparePortfolio).not.toHaveBeenCalled();
    expect(snapshot.orders).toEqual(definition.orders);
    expect(snapshot.source).toMatchObject({ kind: 'AUTHORED', definition });
    expect(snapshot.provenanceByOrder).toEqual(definition.provenanceByOrder);
  });

  it('rejeita cedo uma preparação válida sem fonte projetável', async () => {
    const request = preparationRequest();
    request.input.sources = {};

    await expect(resolvePortfolioSource(
      { kind: 'AUTHORED', authoredPortfolioId: 'portfolio-1', preparation: preparationResponse(request) },
      dependencies(),
    )).rejects.toThrow('proveniência');
  });

  it('cria o fixture dourado sintético pela preparação oficial e registra receita, seed e composição realizada', async () => {
    const request = preparationRequest();
    request.input.participants = [{
      id: '00000000-0000-4000-8000-000000000015', profile: 'exportador',
      monthly_volume_brl: '1000', ticket_median_brl: '100', out_fraction: '0.5',
      purpose_out: 'ANEXO_V_REMESSA_TERCEIRO', purpose_in: 'ANEXO_V_DISPONIBILIDADE',
      eh_efx: false, deadline: { mode: 'PROFILE' }, seed: '9223372036854775807',
    }];
    const participantPrefix = `/participants/${request.input.participants[0]!.id}`;
    request.input.sources = Object.fromEntries([
      `${participantPrefix}/profile`, `${participantPrefix}/seed`,
      `${participantPrefix}/monthly_volume_brl`, `${participantPrefix}/ticket_median_brl`,
      `${participantPrefix}/out_fraction`, `${participantPrefix}/deadline/mode`,
      `${participantPrefix}/eh_efx`, `${participantPrefix}/purpose_out`,
      `${participantPrefix}/purpose_in`,
    ].map((path) => [path, {
      kind: 'PADRAO_SINTETICO' as const, source: 'catálogo oficial', recorded_at: NOW,
    }]));
    const response = preparationResponse(request);
    response.orders = response.orders.map((order) => ({
      ...order,
      cliente_id: request.input.participants[0]!.id,
    }));
    const preparePortfolio = vi.fn(async () => response);

    const snapshot = await resolvePortfolioSource(
      { kind: 'SYNTHETIC', exampleId: 'equilibrado', preparation: request },
      dependencies({ preparePortfolio }),
    );

    expect(preparePortfolio).toHaveBeenCalledWith(request);
    expect(snapshot).toMatchObject({
      source: {
        kind: 'SYNTHETIC', recipe: {
          exampleId: 'equilibrado', seeds: ['9223372036854775807'],
          composition: response.composition, preparationVersion: '1.0.0',
          generatorVersion: 'dimensionamento-v1', motorBuildSha: 'a'.repeat(40),
          generationFingerprint: 'b'.repeat(64),
        },
      },
      generationInputSnapshot: response.input_snapshot,
      observedOutcome: null,
    });
    expect(snapshot.provenance).toHaveLength(9);
    expect(snapshot.provenance.every((item) =>
      item.kind === 'SYNTHETIC_DEFAULT'
      && item.source === 'catálogo oficial'
      && item.recordedAt === NOW)).toBe(true);
    expect(snapshot.orders.map((order) => order.id)).toEqual(['order-a', 'order-b']);
    expect(snapshot.sourceFingerprint).toBe(await fingerprintPortfolioSource(snapshot));
  });

  it('associa proveniência sintética a cada ordem pelo participante responsável', async () => {
    const request = preparationRequest();
    const participantA = '00000000-0000-4000-8000-000000000015';
    const participantB = '00000000-0000-4000-8000-000000000016';
    request.input.participants = [participantA, participantB].map((id, index) => ({
      id,
      profile: index === 0 ? 'exportador' : 'tesouraria_corporativa',
      monthly_volume_brl: '1000', ticket_median_brl: '100', out_fraction: '0.5',
      purpose_out: 'ANEXO_V_REMESSA_TERCEIRO', purpose_in: 'ANEXO_V_DISPONIBILIDADE',
      eh_efx: false, deadline: { mode: 'PROFILE' as const }, seed: String(index + 1),
    }));
    request.input.sources = Object.fromEntries(request.input.participants.flatMap((participant) => {
      const prefix = `/participants/${participant.id}`;
      return [
        `${prefix}/profile`, `${prefix}/seed`, `${prefix}/monthly_volume_brl`,
        `${prefix}/ticket_median_brl`, `${prefix}/out_fraction`, `${prefix}/deadline/mode`,
        `${prefix}/eh_efx`, `${prefix}/purpose_out`, `${prefix}/purpose_in`,
      ].map((path) => [path, {
        kind: 'ESTIMATIVA_USUARIO' as const,
        source: `profile-mvp:profile-${participant.id.slice(-3)}@${participant.id === participantA ? 'a' : 'b'.repeat(64)}:derived`,
        recorded_at: NOW,
      }]);
    }));
    const response = preparationResponse(request);
    response.orders = response.orders.map((order, index) => ({
      ...order,
      cliente_id: index === 0 ? participantA : participantB,
    }));

    const snapshot = await resolvePortfolioSource(
      { kind: 'SYNTHETIC', exampleId: 'perfil-operacional-mvp', preparation: request },
      dependencies({ preparePortfolio: async () => response }),
    );

    expect(Object.keys(snapshot.provenanceByOrder ?? {})).toEqual(['order-a', 'order-b']);
    expect(snapshot.provenanceByOrder?.['order-a']?.cliente_id).toMatchObject({
      kind: 'DERIVED',
      source: request.input.sources[`/participants/${participantB}/profile`]!.source,
      inputs: [`/participants/${participantB}/profile`],
    });
    expect(snapshot.provenanceByOrder?.['order-b']?.finalidade).toEqual({
      kind: 'USER_ESTIMATE',
      source: request.input.sources[`/participants/${participantA}/purpose_in`]!.source,
      version: '1.0.0',
      recordedAt: NOW,
    });
  });
});
