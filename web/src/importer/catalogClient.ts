import type { ApiClient, ImportCatalog } from '../api/client';

type ImportCatalogApi = Required<Pick<ApiClient, 'getImportCatalog'>>;

export type ImportCatalogAvailability = Readonly<{
  catalog: ImportCatalog;
  localReviewAvailable: true;
  canConfirmExecution: boolean;
}>;

export function catalogAvailability(catalog: ImportCatalog): ImportCatalogAvailability {
  return {
    catalog,
    localReviewAvailable: true,
    canConfirmExecution: catalog.status === 'CONFIGURADO',
  };
}

export async function loadImportCatalog(
  api: ImportCatalogApi,
  signal?: AbortSignal,
): Promise<ImportCatalogAvailability> {
  return catalogAvailability(await api.getImportCatalog(signal));
}
