import Decimal from 'decimal.js';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { formatMoney } from '../presentation/format';
import type { ScenarioDocument } from './model';
import { formatPeriod } from './naming';

export type SourceKindLabel = 'IMPORTED' | 'COMPANIES' | 'SYNTHETIC' | 'MANUAL';

/** Os mesmos nomes no "Novo estudo", no resumo do Passo 1, no seletor e na lista de estudos. */
export const SOURCE_LABELS: Readonly<Record<SourceKindLabel, string>> = {
  IMPORTED: 'Dados importados de uma empresa',
  COMPANIES: 'Carteira de várias empresas',
  SYNTHETIC: 'Carteira gerada (exemplo)',
  MANUAL: 'Montada à mão',
};

export type SourceDescription = Readonly<{ kind: SourceKindLabel; label: string; detail: string }>;

/** Uma linha que diz de onde veio a carteira do cenário: tipo, empresas, período, ordens e total. */
export function describeSource(
  scenario: ScenarioDocument,
  cases: readonly ObservedCase[],
  companies: readonly CompanyRecord[],
): SourceDescription {
  const { source, orders } = scenario.sourceSnapshot;
  const total = orders.reduce((sum, order) => sum.plus(order.valor_brl), new Decimal(0));
  const volume = `${orders.length} ${orders.length === 1 ? 'ordem' : 'ordens'} · ${formatMoney(total.toFixed())}`;
  const describe = (kind: SourceKindLabel, parts: readonly string[]) => ({ kind, label: SOURCE_LABELS[kind], detail: [...parts, volume].join(' · ') });
  if (source.kind === 'OBSERVED_CASE') {
    const found = cases.find((item) => item.id === source.caseId);
    if (found === undefined) return describe('IMPORTED', []);
    const company = companies.find((item) => item.id === found.companyId)?.displayName ?? found.companyId;
    return describe('IMPORTED', [company, formatPeriod(found.window.startDate, found.window.endDate)]);
  }
  if (source.kind === 'SYNTHETIC') return describe('SYNTHETIC', []);
  const definition = source.definition;
  if (definition?.kind === 'EXPLICIT_ORDERS' && definition.sourceCases !== undefined) {
    const names = definition.sourceCases.map((item) =>
      companies.find((company) => company.id === item.companyId)?.displayName
      ?? Object.values(definition.companyByOrder ?? {}).find((entry) => entry.companyId === item.companyId)?.companyName
      ?? item.companyId);
    return describe('COMPANIES', [names.join(' + ')]);
  }
  return describe('MANUAL', []);
}
