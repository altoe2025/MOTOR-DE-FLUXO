import { describe, expect, it } from 'vitest';

import type { ClientIdentityState } from './domain';
import {
  mergeClientAlias,
  normalizeClientNameKey,
  resolveClient,
  unmergeClientAlias,
} from './clients';

const NOW = '2026-09-18T12:00:00.000Z';
const LATER = '2026-09-18T13:00:00.000Z';

function emptyState(): ClientIdentityState {
  return {
    revision: 0,
    clients: [],
    aliases: [],
    events: [],
    resultsStale: false,
  };
}

function idFactory(...ids: string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (id === undefined) {
      throw new Error('ID de teste não configurado');
    }
    index += 1;
    return id;
  };
}

describe('normalizeClientNameKey', () => {
  it.each([
    ['  Órbita   Comércio  ', 'orbita comercio'],
    ['ORBITA COMERCIO', 'orbita comercio'],
    ['O\u0301rbita Come\u0301rcio', 'orbita comercio'],
    ['ＯＲＢＩＴＡ　ＣＯＭÉＲＣＩＯ', 'orbita comercio'],
    ['Órbita\u00a0\u2003Comércio', 'orbita comercio'],
  ])('produz uma chave mecânica para %s', (name, expected) => {
    expect(normalizeClientNameKey(name)).toBe(expected);
  });

  it('preserva pontuação e sufixos', () => {
    expect(normalizeClientNameKey('Órbita, Comércio')).toBe(
      'orbita, comercio',
    );
    expect(normalizeClientNameKey('Órbita Comércio Ltda.')).toBe(
      'orbita comercio ltda.',
    );
    expect(normalizeClientNameKey('Órbita Comércio Ltda.')).not.toBe(
      normalizeClientNameKey('Órbita Comércio'),
    );
  });
});

describe('resolveClient', () => {
  it('cria cliente e alias persistíveis para uma chave inédita', () => {
    const result = resolveClient(
      emptyState(),
      '  Órbita   Comércio  ',
      NOW,
      idFactory('client-1'),
    );

    expect(result.client).toEqual({
      id: 'client-1',
      displayName: 'Órbita Comércio',
      createdAt: NOW,
    });
    expect(result.created).toBe(true);
    expect(result.state).toMatchObject({
      revision: 1,
      resultsStale: false,
      clients: [result.client],
      aliases: [{
        normalizedName: 'orbita comercio',
        canonicalClientId: 'client-1',
        displayVariant: 'Órbita Comércio',
        confirmedByUser: false,
        createdAt: NOW,
        revokedAt: null,
      }],
      events: [],
    });
  });

  it('reutiliza o UUID de um alias ativo sem consumir outro ID', () => {
    const first = resolveClient(
      emptyState(),
      'Órbita Comércio',
      NOW,
      idFactory('client-1'),
    );
    const unexpectedFactory = () => {
      throw new Error('não deveria criar outro UUID');
    };

    const second = resolveClient(
      first.state,
      'ORBITA   COMERCIO',
      LATER,
      unexpectedFactory,
    );

    expect(second.client.id).toBe('client-1');
    expect(second.created).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('não faz fuzzy matching entre nomes parecidos', () => {
    const first = resolveClient(
      emptyState(),
      'Órbita Comércio',
      NOW,
      idFactory('client-1'),
    );
    const second = resolveClient(
      first.state,
      'Órbita Comercial',
      LATER,
      idFactory('client-2'),
    );

    expect(second.client.id).toBe('client-2');
    expect(second.state.clients).toHaveLength(2);
  });

  it('produz os mesmos UUIDs com os mesmos aliases e a mesma fábrica', () => {
    const run = () => {
      const first = resolveClient(
        emptyState(),
        'Órbita Comércio',
        NOW,
        idFactory('stable-client'),
      );
      return resolveClient(
        first.state,
        'ORBITA COMERCIO',
        LATER,
        idFactory('não-usado'),
      );
    };

    expect(run().client.id).toBe(run().client.id);
    expect(run().state).toEqual(run().state);
  });
});

describe('aliases explícitos', () => {
  it('funde uma variante somente por ação explícita e registra evento', () => {
    const target = resolveClient(
      emptyState(),
      'Órbita Comércio',
      NOW,
      idFactory('client-target'),
    );
    const variant = resolveClient(
      target.state,
      'Órbita Comercial',
      NOW,
      idFactory('client-variant'),
    );

    const merged = mergeClientAlias(
      variant.state,
      'Órbita Comercial',
      'client-target',
      LATER,
      idFactory('event-merge'),
    );
    const activeAlias = merged.aliases.find(
      (alias) => alias.normalizedName === 'orbita comercial'
        && alias.revokedAt === null,
    );

    expect(activeAlias).toMatchObject({
      canonicalClientId: 'client-target',
      displayVariant: 'Órbita Comercial',
      confirmedByUser: true,
    });
    expect(merged.aliases).toContainEqual(expect.objectContaining({
      canonicalClientId: 'client-variant',
      revokedAt: LATER,
    }));
    expect(merged.events).toContainEqual({
      kind: 'CLIENT_ALIAS_MERGED',
      id: 'event-merge',
      occurredAtUtc: LATER,
      normalizedName: 'orbita comercial',
      displayVariant: 'Órbita Comercial',
      canonicalClientId: 'client-target',
    });
    expect(merged.resultsStale).toBe(true);
    expect(variant.state.aliases[1]?.revokedAt).toBeNull();
  });

  it('desfaz o merge, revoga o alias e cria novo UUID para a variante', () => {
    const target = resolveClient(
      emptyState(),
      'Órbita Comércio',
      NOW,
      idFactory('client-target'),
    );
    const merged = mergeClientAlias(
      target.state,
      'Órbita Comercial',
      'client-target',
      NOW,
      idFactory('event-merge'),
    );

    const unmerged = unmergeClientAlias(
      merged,
      'Órbita Comercial',
      LATER,
      idFactory('client-new', 'event-unmerge'),
    );

    expect(unmerged.client).toEqual({
      id: 'client-new',
      displayName: 'Órbita Comercial',
      createdAt: LATER,
    });
    expect(unmerged.state.aliases).toContainEqual(expect.objectContaining({
      normalizedName: 'orbita comercial',
      canonicalClientId: 'client-target',
      revokedAt: LATER,
    }));
    expect(unmerged.state.aliases).toContainEqual(expect.objectContaining({
      normalizedName: 'orbita comercial',
      canonicalClientId: 'client-new',
      confirmedByUser: true,
      revokedAt: null,
    }));
    expect(unmerged.state.events.at(-1)).toEqual({
      kind: 'CLIENT_ALIAS_UNMERGED',
      id: 'event-unmerge',
      occurredAtUtc: LATER,
      normalizedName: 'orbita comercial',
      displayVariant: 'Órbita Comercial',
      previousCanonicalClientId: 'client-target',
      newCanonicalClientId: 'client-new',
    });
    expect(unmerged.state.revision).toBe(3);
    expect(unmerged.state.resultsStale).toBe(true);
  });

  it('rejeita merge para UUID canônico inexistente', () => {
    expect(() => mergeClientAlias(
      emptyState(),
      'Órbita Comercial',
      'missing-client',
      NOW,
      idFactory('event'),
    )).toThrow('CLIENT_NOT_FOUND');
  });

  it('rejeita unmerge sem alias ativo', () => {
    expect(() => unmergeClientAlias(
      emptyState(),
      'Órbita Comercial',
      NOW,
      idFactory('client', 'event'),
    )).toThrow('ACTIVE_ALIAS_NOT_FOUND');
  });
});
