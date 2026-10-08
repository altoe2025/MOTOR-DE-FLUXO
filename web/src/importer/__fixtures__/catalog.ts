import type { ImportCatalog } from '../../api/client';

/** Fictional test catalog only; never imported by production code. */
export function fictionalCatalog(finalidades: ImportCatalog['finalidades'] = []): ImportCatalog {
  return {
    schema_version: '1.0.0', catalog_version: 'a'.repeat(64), status: 'CONFIGURADO',
    publicado_em_utc: '2026-09-23T00:00:00Z', finalidades,
    custos_padrao: {
      iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '25',
      custo_fixo_remessa: '40', custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
    },
    custos_origem: { tipo: 'PADRAO_SINTETICO', fonte: 'Catálogo fictício exclusivo de teste', registrado_em_utc: '2026-09-23T00:00:00Z' },
    custos_calibrados: false,
  };
}
