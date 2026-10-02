import { describe, expect, it } from 'vitest';

import { collectPortfolioMetrics } from '../levers/portfolioAnalysis';
import { emptyFilters, selectPortfolios } from '../levers/portfolioSelection';
import { canonical } from '../study/fingerprints';
import { validateStudyDocument } from '../study/validation';
import { makePortfolioStudy } from './portfolioPerformanceFixtures';

describe('portfolio performance fixtures', () => {
  const sizes: readonly { companyCount: 6 | 8; resultCount: 0 | 63 | 255; preparedCount: 63 | 255 }[] = [
    { companyCount: 8, resultCount: 0, preparedCount: 255 },
    { companyCount: 6, resultCount: 63, preparedCount: 63 },
  ];
  it.each(sizes)('materializes $resultCount current diagnostics for $companyCount companies', async ({
    companyCount, resultCount, preparedCount,
  }) => {
    const study = await makePortfolioStudy(companyCount, { currentResultCount: resultCount });
    const projection = collectPortfolioMetrics(study);
    const currentExecutions = study.executions.filter((item) => item.status === 'SUCCEEDED');

    expect(study.scenarios).toHaveLength(preparedCount);
    expect(currentExecutions).toHaveLength(resultCount);
    expect(new Set(currentExecutions.map((item) => item.inputFingerprint)).size).toBe(resultCount);
    expect(projection.preparedCount).toBe(preparedCount);
    expect(projection.candidates).toHaveLength(resultCount);
    expect(projection.complete).toBe(resultCount === preparedCount);
  });

  it('satisfies study persistence validation with paired diagnostic attempts', async () => {
    const study = await makePortfolioStudy(6, { currentResultCount: 63 });

    const validation = await validateStudyDocument(study);

    expect(validation).toMatchObject({ ok: true });
  });

  it('preserves unique compositions and deterministic projection and savings ranking', async () => {
    const study = await makePortfolioStudy(8, { currentResultCount: 255 });
    const projected = collectPortfolioMetrics(study);
    const compositionKey = (candidate: (typeof projected.candidates)[number]) => candidate.companyIds.join(',');
    const ranking = selectPortfolios(projected.candidates, 'savings', emptyFilters);
    const currentExecutions = study.executions.filter((item) => item.status === 'SUCCEEDED');

    expect(study.scenarios).toHaveLength(255);
    expect(currentExecutions).toHaveLength(255);
    expect(new Set(currentExecutions.map((item) => item.inputFingerprint)).size).toBe(255);
    expect(new Set(projected.candidates.map(compositionKey)).size).toBe(255);
    expect(projected.candidates).toHaveLength(255);
    expect(projected.excluded).toEqual([]);
    expect(projected.complete).toBe(true);
    expect(ranking.ranked).toHaveLength(255);
    expect(ranking.winner?.scenarioId).toBe(study.baseScenarioId);
    expect(ranking.winner?.savings).toBe('255');
    // Canonical golden for the full 8-company metrics projection and its savings ranking.
    expect(await digest(canonical(projected))).toBe('7acc086f3178f552b0e4626f3a10e514a6d1cd0cf71d828faec81b1313a401fe');
    expect(await digest(canonical(ranking))).toBe('20de6857a16c9b322264737248d84ea88d89c874562831cfa00720c792adace4');
  });
});

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
