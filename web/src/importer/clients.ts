import type {
  CanonicalClient,
  ClientAlias,
  ClientIdentityState,
} from './domain';

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
  const matches = aliases.filter((alias) => (
    alias.normalizedName === normalizedName && alias.revokedAt === null
  ));
  if (matches.length > 1) {
    throw new Error(`ALIAS_STATE_CONFLICT: múltiplos aliases ativos para ${normalizedName}`);
  }
  return matches[0];
}

function clientById(state: ClientIdentityState, id: string): CanonicalClient {
  const client = state.clients.find((candidate) => candidate.id === id);
  if (client === undefined) {
    throw new Error(`CLIENT_NOT_FOUND: cliente canônico ${id} não existe`);
  }
  return client;
}

export type ClientResolution = Readonly<{
  state: ClientIdentityState;
  client: CanonicalClient;
  created: boolean;
}>;

export function resolveClient(
  state: ClientIdentityState,
  name: string,
  now: string,
  idFactory: () => string,
): ClientResolution {
  const variant = displayName(name);
  const normalizedName = normalizeClientNameKey(variant);
  const alias = activeAlias(state.aliases, normalizedName);
  if (alias !== undefined) {
    return { state, client: clientById(state, alias.canonicalClientId), created: false };
  }

  const client: CanonicalClient = { id: idFactory(), displayName: variant, createdAt: now };
  const createdAlias: ClientAlias = {
    normalizedName,
    canonicalClientId: client.id,
    displayVariant: variant,
    confirmedByUser: false,
    createdAt: now,
    revokedAt: null,
  };
  return {
    client,
    created: true,
    state: {
      revision: state.revision + 1,
      clients: [...state.clients, client],
      aliases: [...state.aliases, createdAlias],
      events: state.events,
    },
  };
}

export function mergeClientAlias(
  state: ClientIdentityState,
  aliasName: string,
  canonicalClientId: string,
  now: string,
  idFactory: () => string,
): ClientIdentityState {
  clientById(state, canonicalClientId);
  const variant = displayName(aliasName);
  const normalizedName = normalizeClientNameKey(variant);
  const current = activeAlias(state.aliases, normalizedName);
  if (current?.canonicalClientId === canonicalClientId) return state;

  const aliases = state.aliases.map((alias) => (
    alias.normalizedName === normalizedName && alias.revokedAt === null
      ? { ...alias, revokedAt: now }
      : alias
  ));
  aliases.push({
    normalizedName,
    canonicalClientId,
    displayVariant: variant,
    confirmedByUser: true,
    createdAt: now,
    revokedAt: null,
  });
  return {
    revision: state.revision + 1,
    clients: state.clients,
    aliases,
    events: [...state.events, {
      kind: 'CLIENT_ALIAS_ASSOCIATED',
      id: idFactory(),
      occurredAt: now,
      normalizedName,
      canonicalClientId,
    }],
  };
}
