import { describe, expect, it } from 'vitest';

import type { ClientIdentityState } from './domain';
import {
  mergeClientAlias,
  normalizeClientNameKey,
  resolveClient,
} from './clients';

const NOW = '2026-09-23T12:00:00.000Z';

function emptyState(): ClientIdentityState {
  return { revision: 0, clients: [], aliases: [], events: [] };
}

function ids(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? 'unexpected-id';
}

describe('normalizeClientNameKey', () => {
  it.each([
    ['  Órbita   Comércio  ', 'orbita comercio'],
    ['O\u0301rbita Come\u0301rcio', 'orbita comercio'],
    ['ＯＲＢＩＴＡ　ＣＯＭÉＲＣＩＯ', 'orbita comercio'],
  ])('removes only mechanical variants from %s', (name, expected) => {
    expect(normalizeClientNameKey(name)).toBe(expected);
  });

  it('keeps similar names separate instead of fuzzy-merging them', () => {
    expect(normalizeClientNameKey('Órbita Comércio Ltda.')).not.toBe(
      normalizeClientNameKey('Órbita Comércio'),
    );
  });
});

describe('resolveClient', () => {
  it('reuses the confirmed identity UUID for mechanical variants', () => {
    const first = resolveClient(emptyState(), 'Órbita Comércio', NOW, ids('client-1'));
    const second = resolveClient(first.state, 'ORBITA   COMERCIO', NOW, ids('must-not-be-used'));

    expect(second).toMatchObject({ created: false, client: { id: 'client-1' } });
    expect(second.state).toBe(first.state);
  });

  it('creates a separate identity until an explicit alias associates it', () => {
    const first = resolveClient(emptyState(), 'Órbita Comércio', NOW, ids('client-1'));
    const second = resolveClient(first.state, 'Órbita Comercial', NOW, ids('client-2'));

    expect(second).toMatchObject({ created: true, client: { id: 'client-2' } });

    const merged = mergeClientAlias(second.state, 'Órbita Comercial', 'client-1', NOW, ids('event-1'));
    const resolved = resolveClient(merged, 'ORBÍTA COMERCIAL', NOW, ids('must-not-be-used'));

    expect(resolved).toMatchObject({ created: false, client: { id: 'client-1' } });
    expect(merged.events).toHaveLength(1);
  });
});
