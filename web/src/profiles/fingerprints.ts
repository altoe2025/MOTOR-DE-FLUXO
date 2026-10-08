import Decimal from 'decimal.js';

import type { ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion, SelectedProfileCase } from './domain';

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const DECIMAL_KEYS = new Set([
  'value', 'valueBrl', 'outBrl', 'inBrl', 'totalBrl', 'volumeBrl',
  'fraction', 'volumeFraction', 'orderFraction', 'averageVolumePerCoveredDay',
  'averageOrdersPerCoveredDay', 'ordersPerCoveredDay', 'ordersPer30Days',
]);

function normalizedPrimitive(value: unknown, key: string | undefined): string {
  if (typeof value === 'string' && key !== undefined && DECIMAL_KEYS.has(key)
    && /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
    return JSON.stringify(new Decimal(value).toString());
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Valor não serializável para fingerprint.');
  return encoded;
}

function canonical(value: unknown, key?: string): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => ordinal(left, right));
    return `{${entries.map(([itemKey, item]) => `${JSON.stringify(itemKey)}:${canonical(item, itemKey)}`).join(',')}}`;
  }
  return normalizedPrimitive(value, key);
}

export function canonicalProfileJson(value: unknown): string {
  return canonical(value);
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalProfileJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintObservedCase(value: ObservedCase): Promise<string> {
  return sha256({
    ...structuredClone(value),
    orders: [...value.orders].map((item) => structuredClone(item)).sort((left, right) => ordinal(left.id, right.id)),
  });
}

export async function fingerprintProfileSelection(
  selectedCases: readonly SelectedProfileCase[],
): Promise<string> {
  return sha256(selectedCases.map((item) => ({
    caseId: item.caseId,
    caseRevision: item.caseRevision,
    caseFingerprint: item.caseFingerprint,
  })));
}

export async function fingerprintOperationalProfile(
  document: Omit<OperationalProfileVersion, 'documentFingerprint'> | OperationalProfileVersion,
): Promise<string> {
  const withoutFingerprint = structuredClone(document) as Partial<OperationalProfileVersion>;
  Reflect.deleteProperty(withoutFingerprint, 'documentFingerprint');
  return sha256(withoutFingerprint);
}
