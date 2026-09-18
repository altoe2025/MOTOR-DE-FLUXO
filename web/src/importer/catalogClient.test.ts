import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, ImportCatalog } from '../api/client';
import {
  catalogVersionState,
  createImportStudyParameters,
  InvalidImportStudyParameterError,
  importCatalogQueryOptions,
  updateImportStudyParameter,
} from './catalogClient';

const CATALOG: ImportCatalog = {
  schema_version: '1.0.0', catalog_version: 'b'.repeat(64),
  status: 'CONFIGURADO', publicado_em_utc: '2026-09-17T00:00:00Z',
  finalidades: [{
    codigo: 'SERVICO_FICTICIO', descricao: 'Finalidade fictícia',
    aliquotas: [{ direcao: 'OUT', aliquota: '0.035' }],
  }],
  custos_padrao: {
    iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
    spread_rail_bps: '25', custo_fixo_remessa: '40',
    custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
  },
  custos_origem: {
    tipo: 'PADRAO_SINTETICO', fonte: 'Catálogo fictício de teste',
    registrado_em_utc: '2026-09-17T00:00:00Z',
  },
  custos_calibrados: false,
};

describe('catálogo da sessão', () => {
  it('usa chave por conta e busca uma vez durante a sessão', async () => {
    const getImportCatalog = vi.fn().mockResolvedValue(CATALOG);
    const api: Pick<ApiClient, 'getImportCatalog'> = { getImportCatalog };
    const queryClient = new QueryClient();
    const first = importCatalogQueryOptions(api, 'owner-a');

    expect(first.queryKey).toEqual(['import-catalog', 'owner-a']);
    expect(first.staleTime).toBe(Infinity);
    await queryClient.fetchQuery(first);
    await queryClient.fetchQuery(importCatalogQueryOptions(api, 'owner-a'));

    expect(getImportCatalog).toHaveBeenCalledOnce();
  });

  it('não compartilha cache entre duas contas', async () => {
    const getImportCatalog = vi.fn()
      .mockResolvedValueOnce(CATALOG)
      .mockResolvedValueOnce({ ...CATALOG, catalog_version: 'c'.repeat(64) });
    const api: Pick<ApiClient, 'getImportCatalog'> = { getImportCatalog };
    const queryClient = new QueryClient();

    await queryClient.fetchQuery(importCatalogQueryOptions(api, 'owner-a'));
    await queryClient.fetchQuery(importCatalogQueryOptions(api, 'owner-b'));

    expect(queryClient.getQueryData<ImportCatalog>(['import-catalog', 'owner-a'])?.catalog_version).toBe('b'.repeat(64));
    expect(queryClient.getQueryData<ImportCatalog>(['import-catalog', 'owner-b'])?.catalog_version).toBe('c'.repeat(64));
  });
});

describe('parâmetros do estudo', () => {
  it('copia defaults, usa janela 7 e preserva a origem publicada', () => {
    const parameters = createImportStudyParameters(CATALOG);

    expect(parameters.windowDays).toBe(7);
    expect(parameters.catalogVersion).toBe(CATALOG.catalog_version);
    expect(parameters.costs).toEqual(CATALOG.custos_padrao);
    expect(parameters.costs).not.toBe(CATALOG.custos_padrao);
    expect(parameters.fieldOrigins.iof_out).toEqual(CATALOG.custos_origem);
    expect(parameters.fieldOrigins.iof_out).not.toBe(CATALOG.custos_origem);
  });

  it('marca somente o campo editado e não modifica catálogo nem estado anterior', () => {
    const beforeCatalog = structuredClone(CATALOG);
    const original = createImportStudyParameters(CATALOG);
    const edited = updateImportStudyParameter(original, {
      field: 'spread_rail_bps', value: '30',
      changedAtUtc: '2026-09-18T12:00:00Z',
    });

    expect(edited.costs.spread_rail_bps).toBe('30');
    expect(edited.fieldOrigins.spread_rail_bps).toEqual({
      tipo: 'ESTIMATIVA_USUARIO', fonte: 'Valor informado pelo usuário',
      registrado_em_utc: '2026-09-18T12:00:00Z',
    });
    expect(edited.fieldOrigins.iof_out).toEqual(original.fieldOrigins.iof_out);
    expect(original.costs.spread_rail_bps).toBe('25');
    expect(CATALOG).toEqual(beforeCatalog);
  });

  it('rejeita janela, custo e data inválidos antes de alterar o estudo', () => {
    const original = createImportStudyParameters(CATALOG);

    expect(() => updateImportStudyParameter(original, {
      field: 'windowDays', value: 0,
      changedAtUtc: '2026-09-18T12:00:00Z',
    })).toThrow(InvalidImportStudyParameterError);
    expect(() => updateImportStudyParameter(original, {
      field: 'iof_out', value: 'NaN',
      changedAtUtc: '2026-09-18T12:00:00Z',
    })).toThrow(InvalidImportStudyParameterError);
    expect(() => updateImportStudyParameter(original, {
      field: 'iof_out', value: '0.04', changedAtUtc: 'sem-data',
    })).toThrow(InvalidImportStudyParameterError);
    expect(original.costs).toEqual(CATALOG.custos_padrao);
  });

  it('marca resultado stale por versão sem reescrever o registro histórico', () => {
    const historical = { request: { id: 'request-antigo' }, catalogVersion: 'a'.repeat(64) };
    const state = catalogVersionState(historical.catalogVersion, CATALOG);

    expect(state).toEqual({ resultsStale: true, revalidatePurposes: true });
    expect(historical).toEqual({
      request: { id: 'request-antigo' }, catalogVersion: 'a'.repeat(64),
    });
    expect(catalogVersionState(CATALOG.catalog_version, CATALOG)).toEqual({
      resultsStale: false, revalidatePurposes: false,
    });
  });
});
