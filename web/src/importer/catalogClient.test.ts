import { describe, expect, it, vi } from 'vitest';

import { createApiClient, type ApiClient, type ImportCatalog } from '../api/client';
import { ApiError } from '../api/errors';
import { fictionalCatalog } from './__fixtures__/catalog';

const UNCONFIGURED_CATALOG: ImportCatalog = {
  schema_version: '1.0.0',
  catalog_version: 'a'.repeat(64),
  status: 'NAO_CONFIGURADO',
  publicado_em_utc: '2026-09-23T00:00:00Z',
  finalidades: [],
  custos_padrao: {
    iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
    spread_rail_bps: '25', custo_fixo_remessa: '40',
    custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
  },
  custos_origem: {
    tipo: 'PADRAO_SINTETICO',
    fonte: 'Parâmetros técnicos sintéticos não calibrados',
    registrado_em_utc: '2026-09-23T00:00:00Z',
  },
  custos_calibrados: false,
};

async function loadCatalogModule() {
  return import('./catalogClient').catch(() => undefined);
}

describe('catálogo da importação', () => {
  it('informa ausência de regras quando não configurado mantendo revisão local disponível', async () => {
    const module = await loadCatalogModule();

    expect(module).toBeDefined();
    expect(module!.catalogAvailability(UNCONFIGURED_CATALOG)).toEqual({
      kind: 'AVAILABLE',
      catalog: UNCONFIGURED_CATALOG,
      localReviewAvailable: true,
      hasPurposeRules: false,
    });
  });

  it('carrega catálogo por ApiClient tipado sem estreitar o contrato', async () => {
    const module = await loadCatalogModule();
    const signal = new AbortController().signal;
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(UNCONFIGURED_CATALOG), {
      headers: { 'content-type': 'application/json' },
    }));
    const api: ApiClient = createApiClient({ getAccessToken: async () => 'token', fetch });

    expect(module).toBeDefined();
    await expect(module!.loadImportCatalog(api, signal)).resolves.toEqual({
      kind: 'AVAILABLE',
      catalog: UNCONFIGURED_CATALOG,
      localReviewAvailable: true,
      hasPurposeRules: false,
    });
    expect(fetch).toHaveBeenCalledWith('/api/v1/catalogos/importacao', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      signal: expect.any(AbortSignal),
    }));
  });

  it('mantém revisão local e devolve erro uniforme quando o catálogo está indisponível', async () => {
    const module = await loadCatalogModule();
    const unavailable = new ApiError({
      status: 0, code: 'TRANSPORTE_INDISPONIVEL', message: 'Não foi possível alcançar o servidor.',
    });
    const api: Pick<ApiClient, 'getImportCatalog'> = {
      getImportCatalog: vi.fn().mockRejectedValue(unavailable),
    };

    expect(module).toBeDefined();
    await expect(module!.loadImportCatalog(api)).resolves.toEqual({
      kind: 'UNAVAILABLE',
      localReviewAvailable: true,
      hasPurposeRules: false,
      error: unavailable,
    });
  });
  it.each(['CONFIGURADO', 'NAO_CONFIGURADO'] as const)('informa regras pela lista independentemente do status %s', async (status) => {
    const module = await loadCatalogModule();
    const rule = { codigo: 'FICTICIA', descricao: 'Fixture', aliquotas: [{ direcao: 'OUT' as const, aliquota: '0.01' }] };
    expect(module!.catalogAvailability({ ...fictionalCatalog(), status })).toMatchObject({ hasPurposeRules: false });
    expect(module!.catalogAvailability({ ...fictionalCatalog([rule]), status })).toMatchObject({ hasPurposeRules: true });
  });
});
