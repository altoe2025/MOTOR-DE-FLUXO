import { describe, expect, it } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type { StudyDocument } from '../study/model';
import { makeObservedCase } from '../study/fixtures';
import { deriveCompanyOverview } from './companyOverview';

const company: CompanyRecord = {
  id: 'company-1', ownerSub: 'owner-1', displayName: 'Empresa Um', aliases: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
};

function observedCase(id: string, startDate: string, endDate: string, orders: ObservedCase['orders']): ObservedCase {
  return {
    ...makeObservedCase(), id, ownerSub: company.ownerSub, companyId: company.id,
    window: { startDate, endDate, closingDate: endDate }, orders,
  };
}

function order(id: string, direction: 'OUT' | 'IN', valueBrl: string): ObservedCase['orders'][number] {
  return { ...makeObservedCase().orders[0]!, id, direction, valueBrl };
}

function profile(id: string, version: number, createdAt: string): OperationalProfileVersion {
  return { id, version, createdAt, ownerSub: company.ownerSub, companyId: company.id } as OperationalProfileVersion;
}

function study(overrides: Partial<StudyDocument>): StudyDocument {
  return {
    schemaVersion: '3.0.0', id: 'study-1', ownerSub: company.ownerSub, name: 'Estudo histórico',
    revision: 1, baseScenarioId: 'scenario-current', scenarios: [], executions: [], evidenceSnapshots: [],
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', deletedAt: null, ...overrides,
  } as StudyDocument;
}

describe('deriveCompanyOverview', () => {
  it('une janelas inclusivas e informa a lacuna exata entre casos', () => {
    const cases = [
      observedCase('case-1', '2026-01-01', '2026-01-03', [order('out-1', 'OUT', '100')]),
      observedCase('case-2', '2026-01-03', '2026-01-05', [order('in-1', 'IN', '40')]),
      observedCase('case-3', '2026-01-08', '2026-01-09', [order('out-2', 'OUT', '25')]),
    ];
    const overview = deriveCompanyOverview({ company, cases, profiles: [], studies: [] });
    expect(overview.coverage).toEqual({ coveredDays: 7, firstDate: '2026-01-01', lastDate: '2026-01-09', gapDays: 2 });
    expect(overview.volume).toEqual({ outBrl: '125', inBrl: '40' });
  });

  it('não transforma ausência de casos em zero e escolhe o perfil mais recente', () => {
    const overview = deriveCompanyOverview({
      company, cases: [],
      profiles: [profile('profile-1', 1, '2026-01-10T00:00:00Z'), profile('profile-2', 2, '2026-02-10T00:00:00Z')],
      studies: [],
    });
    expect(overview.coverage).toBeNull();
    expect(overview.volume).toEqual({ outBrl: null, inBrl: null });
    expect(overview.latestProfile?.id).toBe('profile-2');
  });

  it('não transforma direção ausente em volume zero', () => {
    const overview = deriveCompanyOverview({
      company,
      cases: [observedCase('out-only', '2026-01-01', '2026-01-02', [order('out', 'OUT', '50')])],
      profiles: [], studies: [],
    });
    expect(overview.volume).toEqual({ outBrl: '50', inBrl: null });
  });

  it('ignora dados de outra empresa ou conta', () => {
    const foreign = { ...observedCase('foreign', '2026-01-01', '2026-01-31', [order('foreign-order', 'OUT', '999')]), ownerSub: 'owner-2' };
    const overview = deriveCompanyOverview({ company, cases: [foreign], profiles: [], studies: [] });
    expect(overview.caseCount).toBe(0);
    expect(overview.volume.outBrl).toBeNull();
  });

  it('relaciona estudo pela execução histórica e não pelo cenário mutável atual', () => {
    const historicalCase = observedCase('case-old', '2026-01-01', '2026-01-02', [order('o', 'OUT', '10')]);
    const currentOnly = study({
      id: 'current-only',
      scenarios: [{ id: 'scenario-current', sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: historicalCase.id, caseRevision: 9 } } }] as unknown as StudyDocument['scenarios'],
    });
    const historical = study({
      id: 'historical',
      executions: [{ kind: 'PREVIEW', sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: historicalCase.id, caseRevision: 2 } } }] as unknown as StudyDocument['executions'],
    });
    const overview = deriveCompanyOverview({ company, cases: [historicalCase], profiles: [], studies: [currentOnly, historical] });
    expect(overview.relatedStudies.map((link) => link.studyId)).toEqual(['historical']);
  });
});
