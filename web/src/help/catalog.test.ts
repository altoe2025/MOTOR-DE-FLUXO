import { describe, expect, it, vi } from 'vitest';

import productHelp from '../../../servidor/catalogs/product_help.v1.json';
import { HELP_IDS, allHelpIds } from './helpIds';
import {
  ProductHelpCatalogCache,
  validateProductHelpCatalog,
} from './catalog';

const validCatalog = { ...productHelp, catalogVersion: 'a'.repeat(64) };

describe('ProductHelpCatalogV1', () => {
  it('cobre cada helpId contextual com propósito, efeito e limite publicados', () => {
    const catalog = validateProductHelpCatalog(validCatalog);

    expect(catalog).not.toBeNull();
    const ids = new Set(catalog?.items.map((item) => item.id));
    for (const helpId of allHelpIds) expect(ids).toContain(helpId);
    expect(ids).toContain(HELP_IDS.IMPORT_PAGE);
    expect(catalog?.items.every((item) => (
      item.purpose.length > 0 && item.changes.length > 0 && item.doesNotChange.length > 0
    ))).toBe(true);
  });

  it('explica finalidade opcional e IOF padrão por direção sem inferir classificação', () => {
    const item = validateProductHelpCatalog(validCatalog)?.items.find((entry) => entry.id === HELP_IDS.IMPORT_PAGE);

    expect(item?.purpose).toContain('finalidade_codigo é opcional');
    expect(item?.changes).toContain('IOF padrão por direção');
    expect(item?.changes).toContain('combinação exata de finalidade e direção');
    expect(item?.doesNotChange).toContain('não infere classificação');
    expect(item?.disabledWhen.join(' ')).not.toMatch(/finalidade|catálogo/i);
  });

  it('recusa item sem limite ou conceito relacionado ausente', () => {
    const malformed = structuredClone(validCatalog) as {
      items: Array<Record<string, unknown>>;
    };
    delete malformed.items[0]?.doesNotChange;
    malformed.items[1] = {
      ...malformed.items[1],
      relatedConceptIds: ['concept.inexistente'],
    };

    expect(validateProductHelpCatalog(malformed)).toBeNull();
  });

  it('recusa uma resposta que passa no formato mas introduz helpId fora da união publicada', () => {
    const malformed = structuredClone(validCatalog) as {
      items: Array<Record<string, unknown>>;
    };
    malformed.items.push({
      ...malformed.items[0],
      id: 'page.nao-publica',
      relatedConceptIds: [],
    });

    expect(validateProductHelpCatalog(malformed)).toBeNull();
  });

  it('publica padrões que resolvem para as rotas existentes do produto', () => {
    const catalog = validateProductHelpCatalog(validCatalog);
    const routes = new Map(catalog?.items.map((item) => [item.id, item.routePattern]));

    expect(routes.get(HELP_IDS.CASE)).toBe('/empresas/:companyId/casos');
    expect(routes.get(HELP_IDS.PROFILE)).toBe('/empresas/:companyId/perfis');
    expect(routes.get(HELP_IDS.COMPOSITION)).toBe('/carteira/:id');
    expect(routes.get(HELP_IDS.COMPARISON_PAGE)).toBe('/comparar');
  });

  it('descarta ajuda contextual após falha e recarrega após encerrar a sessão', async () => {
    const getCatalog = vi.fn()
      .mockResolvedValueOnce(validCatalog)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(validCatalog);
    const cache = new ProductHelpCatalogCache({ getProductHelpCatalog: getCatalog });

    await expect(cache.get()).resolves.toMatchObject({ apiVersion: '1.0.0' });
    cache.clear();
    await expect(cache.get()).resolves.toBeNull();
    cache.clear();
    await expect(cache.get()).resolves.toMatchObject({ apiVersion: '1.0.0' });
    expect(getCatalog).toHaveBeenCalledTimes(3);
  });

  it('não repovoa a ajuda quando o logout acontece durante o carregamento', async () => {
    let resolveCatalog: ((value: unknown) => void) | undefined;
    const getCatalog = vi.fn(() => new Promise<unknown>((resolve) => { resolveCatalog = resolve; }));
    const cache = new ProductHelpCatalogCache({ getProductHelpCatalog: getCatalog });

    const pending = cache.get();
    cache.clear();
    resolveCatalog?.(validCatalog);

    await expect(pending).resolves.toBeNull();
    expect(getCatalog).toHaveBeenCalledOnce();
  });
});
