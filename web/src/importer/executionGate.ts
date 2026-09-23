import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { PortfolioSourceSnapshot } from '../study/model';

export class ImportExecutionBlockedError extends Error {
  constructor(available: boolean) {
    super(`Catálogo da importação ${available ? 'não configurado' : 'indisponível'}. A execução das operações importadas está bloqueada; Caso, Perfil e Estudo permanecem salvos.`);
    this.name = 'ImportExecutionBlockedError';
  }
}

/** The importer stamps immutable field provenance, also retained by authored derivatives. */
export async function assertImportExecutionAvailable(
  snapshot: PortfolioSourceSnapshot,
  getImportCatalog?: ApiClient['getImportCatalog'],
  signal?: AbortSignal,
): Promise<void> {
  const provenance = [...snapshot.provenance, ...Object.values(snapshot.provenanceByOrder ?? {}).flatMap((fields) => Object.values(fields))];
  if (!provenance.some((item) => item.source === 'xlsx-operacoes')) return;
  if (getImportCatalog === undefined) throw new ImportExecutionBlockedError(false);
  let catalog;
  try { catalog = await getImportCatalog(signal); }
  catch (error) {
    if (signal?.aborted || (error instanceof ApiError && error.status === 401)) throw error;
    throw new ImportExecutionBlockedError(false);
  }
  if (catalog.status !== 'CONFIGURADO') throw new ImportExecutionBlockedError(true);
}
