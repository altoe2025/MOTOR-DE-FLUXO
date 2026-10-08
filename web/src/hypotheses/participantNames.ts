import type { CompanyRecord } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type { EffectiveInput } from '../study/model';

export const ARCHETYPE_LABELS: Readonly<Record<string, string>> = {
  tesouraria_corporativa: 'Tesouraria corporativa',
  exportador: 'Exportador',
  remessa_outbound_massiva: 'Remessa outbound massiva',
  psp_inbound: 'PSP inbound',
  cripto_native_sem_fiat: 'Cripto sem fiat',
  payroll_fornecedor: 'Payroll fornecedor',
};

export type ParticipantName = Readonly<{ name: string; archetype: string; profileId: string | null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function archetypeLabel(archetype: string): string {
  return ARCHETYPE_LABELS[archetype] ?? archetype;
}

export function lineageProfileId(input: EffectiveInput, participantId: string): string | null {
  const source = input.sources[`/participants/${participantId}/profile`]?.source;
  return source?.match(/^profile-mvp:(.+)@[0-9a-f]{64}:/)?.[1] ?? null;
}

export function companyLabel(companyId: string, companies: readonly CompanyRecord[]): string {
  return companies.find((company) => company.id === companyId)?.displayName ?? companyId;
}

/**
 * Nome legível de cada participante: nome da empresa quando conhecido; senão o
 * arquétipo base numerado ("Exportador 2"). IDs técnicos nunca viram rótulo.
 */
export function participantNames(
  input: EffectiveInput,
  profiles: readonly OperationalProfileVersion[] = [],
  companies: readonly CompanyRecord[] = [],
): Map<string, ParticipantName> {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const archetypeTotals = new Map<string, number>();
  for (const participant of input.participants) {
    archetypeTotals.set(participant.profile, (archetypeTotals.get(participant.profile) ?? 0) + 1);
  }
  const archetypeSeen = new Map<string, number>();
  const names = new Map<string, ParticipantName>();
  for (const participant of input.participants) {
    const archetype = archetypeLabel(participant.profile);
    const ordinal = (archetypeSeen.get(participant.profile) ?? 0) + 1;
    archetypeSeen.set(participant.profile, ordinal);
    const profileId = lineageProfileId(input, participant.id);
    const companyId = profileById.get(profileId ?? '')?.companyId;
    const company = companyId === undefined ? undefined : companyById.get(companyId);
    const fallback = (archetypeTotals.get(participant.profile) ?? 0) > 1 ? `${archetype} ${ordinal}` : archetype;
    const name = company?.displayName
      ?? (companyId !== undefined && !UUID.test(companyId) ? companyId : fallback);
    names.set(participant.id, { name, archetype, profileId });
  }
  return names;
}
