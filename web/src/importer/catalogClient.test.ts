import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, ImportCatalog } from '../api/client';

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
  it('mantém revisão local disponível e bloqueia confirmação quando não configurado', async () => {
    const module = await loadCatalogModule();

    expect(module).toBeDefined();
    expect(module!.catalogAvailability(UNCONFIGURED_CATALOG)).toEqual({
      catalog: UNCONFIGURED_CATALOG,
      localReviewAvailable: true,
      canConfirmExecution: false,
    });
  });

  it('obtém o catálogo pela fronteira ApiClient existente', async () => {
    const module = await loadCatalogModule();
    const signal = new AbortController().signal;
    const getImportCatalog = vi.fn().mockResolvedValue(UNCONFIGURED_CATALOG);
    const api: Required<Pick<ApiClient, 'getImportCatalog'>> = { getImportCatalog };

    expect(module).toBeDefined();
    await expect(module!.loadImportCatalog(api, signal)).resolves.toEqual({
      catalog: UNCONFIGURED_CATALOG,
      localReviewAvailable: true,
      canConfirmExecution: false,
    });
    expect(getImportCatalog).toHaveBeenCalledWith(signal);
  });
});
