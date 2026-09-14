import { resolveInput } from './domain';
import type { AuthoredInput, EffectiveInput, Source } from './model';

type Fingerprints = { semantic: string; numeric: string; evidence: string; generation: string };

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortEffective(input: EffectiveInput): EffectiveInput {
  return {
    ...structuredClone(input),
    participants: [...input.participants].sort((a, b) => ordinal(a.id, b.id)),
    costs: {
      ...structuredClone(input.costs),
      iof_por_finalidade: [...input.costs.iof_por_finalidade].sort((a, b) =>
        ordinal(`${a.finalidade}\0${a.direcao}`, `${b.finalidade}\0${b.direcao}`)),
    },
    sources: Object.fromEntries(Object.entries(input.sources).sort(([a], [b]) => ordinal(a, b))),
  };
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => ordinal(a, b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function invalidNumericValue(input: AuthoredInput): AuthoredInput {
  const stripped = structuredClone(input);
  for (const group of stripped.groups) group.name = '';
  for (const participant of stripped.participants) participant.name = '';
  const withoutOrigin = (field: AuthoredInput['warmup_days']): void => { field.origin = null; };
  for (const group of stripped.groups) {
    for (const field of Object.values(group.fields)) withoutOrigin(field);
  }
  for (const participant of stripped.participants) {
    for (const slot of Object.values(participant.fields)) {
      if (slot.mode === 'own') withoutOrigin(slot.field);
    }
  }
  for (const field of Object.values(stripped.costs)) withoutOrigin(field);
  for (const rule of stripped.iof_rules) {
    rule.id = '';
    withoutOrigin(rule.purpose);
    withoutOrigin(rule.direction);
    withoutOrigin(rule.rate);
  }
  withoutOrigin(stripped.warmup_days);
  withoutOrigin(stripped.measurement_days);
  withoutOrigin(stripped.window_days);
  stripped.groups.sort((a, b) => ordinal(a.id, b.id));
  stripped.participants.sort((a, b) => ordinal(a.id, b.id));
  stripped.iof_rules.sort((a, b) => ordinal(
    `${a.purpose.raw}\0${a.direction.raw}`, `${b.purpose.raw}\0${b.direction.raw}`,
  ));
  return stripped;
}

function evidenceOnly(sources: Record<string, Source>): unknown {
  return Object.fromEntries(Object.entries(sources).sort(([a], [b]) => ordinal(a, b)));
}

function iofEvidence(input: AuthoredInput): unknown {
  return [...input.iof_rules]
    .sort((a, b) => ordinal(
      `${a.purpose.raw}\0${a.direction.raw}`, `${b.purpose.raw}\0${b.direction.raw}`,
    ))
    .map((rule) => ({
      purpose: rule.purpose.raw,
      direction: rule.direction.raw,
      origins: {
        purpose: rule.purpose.origin,
        direction: rule.direction.origin,
        rate: rule.rate.origin,
      },
    }));
}

function invalidEvidenceValue(input: AuthoredInput): unknown {
  const origins: Record<string, unknown> = {};
  for (const group of input.groups) {
    for (const [key, field] of Object.entries(group.fields)) {
      origins[`/groups/${group.id}/${key}`] = field.origin;
    }
  }
  for (const participant of input.participants) {
    for (const [key, slot] of Object.entries(participant.fields)) {
      if (slot.mode === 'own') origins[`/participants/${participant.id}/${key}`] = slot.field.origin;
    }
  }
  for (const [key, field] of Object.entries(input.costs)) origins[`/costs/${key}`] = field.origin;
  origins['/warmup_days'] = input.warmup_days.origin;
  origins['/measurement_days'] = input.measurement_days.origin;
  origins['/window_days'] = input.window_days.origin;
  return { origins: evidenceOnly(origins as Record<string, Source>), iof_rules: iofEvidence(input) };
}

export async function fingerprintInput(input: AuthoredInput): Promise<Fingerprints> {
  input = structuredClone(input);
  for (const group of input.groups) group.name = 'nome';
  for (const participant of input.participants) participant.name = 'nome';
  const resolved = resolveInput(input);
  if (!resolved.ok) {
    const numericValue = invalidNumericValue(input);
    const evidenceValue = invalidEvidenceValue(input);
    const generationValue = {
      groups: numericValue.groups, participants: numericValue.participants,
      warmup_days: numericValue.warmup_days, measurement_days: numericValue.measurement_days,
      repetition: numericValue.repetition,
    };
    return {
      semantic: await sha256({ numeric: numericValue, evidence: evidenceValue }),
      numeric: await sha256(numericValue),
      evidence: await sha256(evidenceValue),
      generation: await sha256(generationValue),
    };
  }
  const effective = sortEffective(resolved.value);
  const numericValue = { ...effective, sources: undefined, repetition: input.repetition };
  const evidenceValue = { sources: evidenceOnly(effective.sources), iof_rules: iofEvidence(input) };
  const generationValue = {
    participants: effective.participants,
    warmup_days: effective.warmup_days,
    measurement_days: effective.measurement_days,
    repetition: input.repetition,
  };
  return {
    numeric: await sha256(numericValue),
    evidence: await sha256(evidenceValue),
    semantic: await sha256({ numeric: numericValue, evidence: evidenceValue }),
    generation: await sha256(generationValue),
  };
}
