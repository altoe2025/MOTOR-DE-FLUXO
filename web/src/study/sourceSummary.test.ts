import { describe, expect, it } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeAuthoredSnapshot, makeObservedCase, makeSyntheticSnapshot } from './fixtures';
import type { ScenarioDocument } from './model';
import { studyFromObservedCases } from './newStudy';
import { describeSource, SOURCE_LABELS } from './sourceSummary';

const companies = [{ id: 'company-1', displayName: 'AstroPay' }, { id: 'company-y', displayName: 'Empresa Y' }] as CompanyRecord[];
const astro = makeObservedCase();
const empresaY: ObservedCase = { ...makeObservedCase(), id: 'case-y', companyId: 'company-y' };
let counter = 0;
const context = { ownerSub: FIXTURE_OWNER, now: FIXTURE_NOW, ids: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, companies };
const base = async (cases: ObservedCase[]) => {
  const study = await studyFromObservedCases(cases, context);
  return study.scenarios[0]!;
};

describe('resumo da origem da carteira', () => {
  it('um caso importado mostra empresa, período, ordens e total', async () => {
    expect(describeSource(await base([astro]), [astro], companies)).toEqual({
      kind: 'IMPORTED', label: SOURCE_LABELS.IMPORTED, detail: 'AstroPay · set/2026 · 1 ordem · R$\u00a0100,00',
    });
  });

  it('carteira de várias empresas lista as empresas', async () => {
    expect(describeSource(await base([astro, empresaY]), [astro, empresaY], companies)).toMatchObject({
      kind: 'COMPANIES', label: SOURCE_LABELS.COMPANIES, detail: 'AstroPay + Empresa Y · 2 ordens · R$\u00a0200,00',
    });
  });

  it('usa o nome guardado na carteira quando o caso não está mais no navegador', async () => {
    const scenario = await base([astro, empresaY]);
    expect(describeSource(scenario, [], []).detail).toBe('AstroPay + Empresa Y · 2 ordens · R$\u00a0200,00');
  });

  it('caso que sumiu do navegador ainda mostra ordens e total', async () => {
    expect(describeSource(await base([astro]), [], []).detail).toBe('1 ordem · R$\u00a0100,00');
  });

  it('carteira gerada e carteira montada à mão mostram só ordens e total', () => {
    const scenario = (sourceSnapshot: unknown) => ({ sourceSnapshot }) as ScenarioDocument;
    expect(describeSource(scenario(makeSyntheticSnapshot()), [], [])).toEqual({ kind: 'SYNTHETIC', label: SOURCE_LABELS.SYNTHETIC, detail: '2 ordens · R$\u00a0170,00' });
    expect(describeSource(scenario(makeAuthoredSnapshot()), [], [])).toEqual({ kind: 'MANUAL', label: SOURCE_LABELS.MANUAL, detail: '2 ordens · R$\u00a0170,00' });
  });
});
