import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { PortfolioSourceSnapshot } from '../study/model';

export class ImportExecutionBlockedError extends Error {
  constructor(available: boolean, missingPair = false) {
    super(`${missingPair ? 'Catálogo da importação não contém um par finalidade/direção da carteira' : `Catálogo da importação ${available ? 'não configurado' : 'indisponível'}`}. A execução das operações importadas está bloqueada; Caso, Perfil e Estudo permanecem salvos.`);
    this.name = 'ImportExecutionBlockedError';
  }
}

/** Authored ancestry survives edits that replace every field's current provenance. */
export async function assertImportExecutionAvailable(
  snapshot: PortfolioSourceSnapshot,
  getImportCatalog?: ApiClient['getImportCatalog'],
  signal?: AbortSignal,
): Promise<void> {
  const provenance = [...snapshot.provenance, ...Object.values(snapshot.provenanceByOrder ?? {}).flatMap((fields) => Object.values(fields))];
  const definition = snapshot.source.kind === 'AUTHORED' ? snapshot.source.definition : undefined;
  const importedAncestor = definition?.kind === 'EXPLICIT_ORDERS'
    && definition.derivedFromObservedCase?.importedFromXlsx === true;
  if (!importedAncestor && !provenance.some((item) => item.source === 'xlsx-operacoes')) return;
  if (getImportCatalog === undefined) throw new ImportExecutionBlockedError(false);
  let catalog;
  try { catalog = await getImportCatalog(signal); }
  catch (error) {
    if (signal?.aborted || (error instanceof ApiError && error.status === 401)) throw error;
    throw new ImportExecutionBlockedError(false);
  }
  if (catalog.status !== 'CONFIGURADO') throw new ImportExecutionBlockedError(true);
  if (snapshot.orders.some((order) => !catalog.finalidades.some((purpose) =>
    purpose.codigo === order.finalidade
    && purpose.aliquotas.some((rate) => rate.direcao === order.direcao)))) {
    throw new ImportExecutionBlockedError(true, true);
  }
}
