import { describe, expect, it } from 'vitest';

import type { CompanyRecord } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type { EffectiveInput } from '../study/model';
import { participantNames } from './participantNames';

const UUID_A = '26befa2e-d776-4477-b142-f9224abc5844';

function input(): EffectiveInput {
  const participant = (id: string, profile: string) => ({ id, profile, seed: '1', monthly_volume_brl: '1',
    ticket_median_brl: '1', out_fraction: '0.5', deadline: { mode: 'PROFILE' }, eh_efx: false,
    purpose_out: 'X', purpose_in: 'Y' });
  return {
    participants: [participant('p1', 'exportador'), participant('p2', 'exportador'), participant('p3', 'psp_inbound')],
    warmup_days: 0, measurement_days: 30, window_days: 7, costs: {},
    sources: { '/participants/p3/profile': {
      kind: 'ESTIMATIVA_USUARIO', source: `profile-mvp:profile-3@${'a'.repeat(64)}:derived`, recorded_at: '2026-09-26T00:00:00Z',
    } },
  } as unknown as EffectiveInput;
}

describe('participantNames', () => {
  it('usa o nome da empresa quando o Perfil é conhecido e numera arquétipos repetidos', () => {
    const profiles = [{ id: 'profile-3', companyId: UUID_A }] as unknown as OperationalProfileVersion[];
    const companies = [{ id: UUID_A, displayName: 'AstroPay' }] as unknown as CompanyRecord[];
    const names = participantNames(input(), profiles, companies);
    expect(names.get('p1')?.name).toBe('Exportador 1');
    expect(names.get('p2')?.name).toBe('Exportador 2');
    expect(names.get('p3')).toEqual({ name: 'AstroPay', archetype: 'PSP inbound', profileId: 'profile-3' });
  });

  it('nunca usa um UUID como rótulo quando a empresa não está carregada', () => {
    const profiles = [{ id: 'profile-3', companyId: UUID_A }] as unknown as OperationalProfileVersion[];
    expect(participantNames(input(), profiles, []).get('p3')?.name).toBe('PSP inbound');
  });
});
