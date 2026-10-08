import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ApiClient } from '../api/client';
import { ProductHelpCatalogCache, type ProductHelpCatalogV1 } from './catalog';

const MISSING = Symbol('ProductHelpCatalogContext missing');
type HelpContext = ProductHelpCatalogV1 | null | undefined | typeof MISSING;
const ProductHelpCatalogContext = createContext<HelpContext>(MISSING);

/** Carrega ajuda somente para a identidade autenticada e a descarta ao trocá-la. */
export function HelpCatalogProvider({
  client,
  ownerSub,
  children,
}: Readonly<{
  client: Pick<ApiClient, 'getProductHelpCatalog'>;
  ownerSub: string | null;
  children: ReactNode;
}>) {
  const cache = useMemo(() => new ProductHelpCatalogCache(client), [client]);
  const [catalog, setCatalog] = useState<ProductHelpCatalogV1 | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    cache.clear();
    if (ownerSub === null) {
      setCatalog(null);
      return () => { active = false; };
    }
    setCatalog(undefined);
    void cache.get().then((loaded) => {
      if (active) setCatalog(loaded);
    });
    return () => {
      active = false;
      cache.clear();
    };
  }, [cache, ownerSub]);

  return <ProductHelpCatalogContext.Provider value={catalog}>{children}</ProductHelpCatalogContext.Provider>;
}

/** `undefined` indica carregamento; `null`, ajuda indisponível para esta sessão. */
export function useProductHelpCatalog(): ProductHelpCatalogV1 | null | undefined {
  const catalog = useContext(ProductHelpCatalogContext);
  if (catalog === MISSING) throw new Error('useProductHelpCatalog deve ser usado dentro de HelpCatalogProvider');
  return catalog;
}
