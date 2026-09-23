import type { ApiClient, ImportCatalog } from '../api/client';
import { ApiError } from '../api/errors';

type ImportCatalogApi = Pick<ApiClient, 'getImportCatalog'>;

export type ImportCatalogAvailable = Readonly<{
  kind: 'AVAILABLE';
  catalog: ImportCatalog;
  localReviewAvailable: true;
  canConfirmExecution: boolean;
}>;

export type ImportCatalogUnavailable = Readonly<{
  kind: 'UNAVAILABLE';
  localReviewAvailable: true;
  canConfirmExecution: false;
  error: ApiError;
}>;

export type ImportCatalogAvailability = ImportCatalogAvailable | ImportCatalogUnavailable;

export function catalogAvailability(catalog: ImportCatalog): ImportCatalogAvailable {
  return {
    kind: 'AVAILABLE',
    catalog,
    localReviewAvailable: true,
    canConfirmExecution: catalog.status === 'CONFIGURADO',
  };
}

export async function loadImportCatalog(
  api: ImportCatalogApi,
  signal?: AbortSignal,
): Promise<ImportCatalogAvailability> {
  try {
    return catalogAvailability(await api.getImportCatalog(signal));
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return {
      kind: 'UNAVAILABLE',
      localReviewAvailable: true,
      canConfirmExecution: false,
      error,
    };
  }
}
