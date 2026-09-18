import type {
  CanonicalClient,
  ClientAlias,
  ClientIdentityState,
} from './domain';

export type ClientResolution = {
  state: ClientIdentityState;
  client: CanonicalClient;
  created: boolean;
};

const COMBINING_MARKS = /\p{M}+/gu;
const WHITESPACE = /\s+/gu;

function displayName(name: string): string {
  const normalized = name.trim().replace(WHITESPACE, ' ');
  if (normalized === '') {
    throw new Error('CLIENT_NAME_REQUIRED: nome do cliente é obrigatório');
  }
  return normalized;
}

export function normalizeClientNameKey(name: string): string {
  return name
    .normalize('NFKC')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(WHITESPACE, ' ');
}

function activeAlias(
  aliases: readonly ClientAlias[],
  normalizedName: string,
): ClientAlias | undefined {
  const active = aliases.filter(
    (alias) => alias.normalizedName === normalizedName
      && alias.revokedAt === null,
  );
  if (active.length > 1) {
    throw new Error(
      `ALIAS_STATE_CONFLICT: múltiplos aliases ativos para ${normalizedName}`,
    );
  }
  return active[0];
}

function clientById(
  state: ClientIdentityState,
  id: string,
): CanonicalClient {
  const client = state.clients.find((candidate) => candidate.id === id);
  if (client === undefined) {
    throw new Error(`CLIENT_NOT_FOUND: cliente canônico ${id} não existe`);
  }
  return client;
}

export function resolveClient(
  state: ClientIdentityState,
  name: string,
  nowUtc: string,
  idFactory: () => string,
): ClientResolution {
  const variant = displayName(name);
  const normalizedName = normalizeClientNameKey(variant);
  const alias = activeAlias(state.aliases, normalizedName);
  if (alias !== undefined) {
    return {
      state,
      client: clientById(state, alias.canonicalClientId),
      created: false,
    };
  }

  const client: CanonicalClient = {
    id: idFactory(),
    displayName: variant,
    createdAt: nowUtc,
  };
  const newAlias: ClientAlias = {
    normalizedName,
    canonicalClientId: client.id,
    displayVariant: variant,
    confirmedByUser: false,
    createdAt: nowUtc,
    revokedAt: null,
  };
  return {
    client,
    created: true,
    state: {
      ...state,
      revision: state.revision + 1,
      clients: [...state.clients, client],
      aliases: [...state.aliases, newAlias],
    },
  };
}

export function mergeClientAlias(
  state: ClientIdentityState,
  displayVariant: string,
  canonicalClientId: string,
  nowUtc: string,
  idFactory: () => string,
): ClientIdentityState {
  clientById(state, canonicalClientId);
  const variant = displayName(displayVariant);
  const normalizedName = normalizeClientNameKey(variant);
  const current = activeAlias(state.aliases, normalizedName);
  if (current?.canonicalClientId === canonicalClientId) {
    return state;
  }

  const aliases = state.aliases.map((alias) => (
    alias.normalizedName === normalizedName && alias.revokedAt === null
      ? { ...alias, revokedAt: nowUtc }
      : alias
  ));
  aliases.push({
    normalizedName,
    canonicalClientId,
    displayVariant: variant,
    confirmedByUser: true,
    createdAt: nowUtc,
    revokedAt: null,
  });

  return {
    ...state,
    revision: state.revision + 1,
    aliases,
    events: [...state.events, {
      kind: 'CLIENT_ALIAS_MERGED',
      id: idFactory(),
      occurredAtUtc: nowUtc,
      normalizedName,
      displayVariant: variant,
      canonicalClientId,
    }],
    resultsStale: true,
  };
}

export function unmergeClientAlias(
  state: ClientIdentityState,
  displayVariant: string,
  nowUtc: string,
  idFactory: () => string,
): ClientResolution {
  const variant = displayName(displayVariant);
  const normalizedName = normalizeClientNameKey(variant);
  const current = activeAlias(state.aliases, normalizedName);
  if (current === undefined) {
    throw new Error(
      `ACTIVE_ALIAS_NOT_FOUND: alias ativo ${normalizedName} não existe`,
    );
  }

  const client: CanonicalClient = {
    id: idFactory(),
    displayName: variant,
    createdAt: nowUtc,
  };
  const aliases = state.aliases.map((alias) => (
    alias === current ? { ...alias, revokedAt: nowUtc } : alias
  ));
  aliases.push({
    normalizedName,
    canonicalClientId: client.id,
    displayVariant: variant,
    confirmedByUser: true,
    createdAt: nowUtc,
    revokedAt: null,
  });

  return {
    client,
    created: true,
    state: {
      ...state,
      revision: state.revision + 1,
      clients: [...state.clients, client],
      aliases,
      events: [...state.events, {
        kind: 'CLIENT_ALIAS_UNMERGED',
        id: idFactory(),
        occurredAtUtc: nowUtc,
        normalizedName,
        displayVariant: variant,
        previousCanonicalClientId: current.canonicalClientId,
        newCanonicalClientId: client.id,
      }],
      resultsStale: true,
    },
  };
}
