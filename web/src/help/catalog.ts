import { validateProductHelpCatalogV1 } from '../api/validators';
import { allHelpIds, type HelpId } from './helpIds';

export type ProductHelpItem = Readonly<{
  id: HelpId;
  routePattern: string;
  elementKind: 'PAGE' | 'SECTION' | 'CONTROL' | 'METRIC' | 'MESSAGE';
  label: string;
  purpose: string;
  changes: string;
  doesNotChange: string;
  disabledWhen: readonly string[];
  recovery: readonly string[];
  relatedConceptIds: readonly HelpId[];
}>;

export type ProductHelpCatalogV1 = Readonly<{
  apiVersion: '1.0.0';
  catalogVersion: string;
  items: readonly ProductHelpItem[];
}>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateProductHelpCatalog(value: unknown): ProductHelpCatalogV1 | null {
  if (!validateProductHelpCatalogV1(value)) return null;
  const candidate = value as ProductHelpCatalogV1;
  const declaredIds = new Set(allHelpIds);
  if (candidate.items.some((item) => (
    !declaredIds.has(item.id)
    || item.relatedConceptIds.some((related) => !declaredIds.has(related))
  ))) return null;
  return deepFreeze(candidate);
}

type ProductHelpCatalogSource = Readonly<{
  getProductHelpCatalog(signal?: AbortSignal): Promise<unknown>;
}>;

/** Cache efêmero de uma sessão; a indisponibilidade só remove ajuda contextual. */
export class ProductHelpCatalogCache {
  private value: ProductHelpCatalogV1 | null | undefined;
  private pending: Promise<ProductHelpCatalogV1 | null> | null = null;
  private generation = 0;

  constructor(private readonly source: ProductHelpCatalogSource) {}

  get(signal?: AbortSignal): Promise<ProductHelpCatalogV1 | null> {
    if (this.value !== undefined) return Promise.resolve(this.value);
    if (this.pending !== null) return this.pending;
    const generation = this.generation;
    const pending = this.source.getProductHelpCatalog(signal)
      .then(validateProductHelpCatalog)
      .catch(() => null)
      .then((catalog) => {
        if (generation !== this.generation) return null;
        this.value = catalog;
        return catalog;
      });
    this.pending = pending;
    void pending.finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    return pending;
  }

  clear(): void {
    this.generation += 1;
    this.value = undefined;
    this.pending = null;
  }
}
