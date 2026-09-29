import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { groupOf } from '../pages/comparisonBoardBreakdown';
import { observedOrders, provenanceForObservedOrders } from '../preparation/resolvePortfolioSource';
import type {
  AuthoredPortfolioDefinition, CanonicalAuthoredOrder, OrderFieldProvenance, PortfolioSource,
} from '../study/model';

export type CompanyOf = (orderId: string) => string;
type ExplicitDefinition = Extract<AuthoredPortfolioDefinition, { kind: 'EXPLICIT_ORDERS' }>;

/** Empresa de cada ordem: a do cadastro quando a carteira junta casos; senão, o prefixo do ID. */
export function companyResolver(source: PortfolioSource | undefined): CompanyOf {
  const map = source?.kind === 'AUTHORED' && source.definition?.kind === 'EXPLICIT_ORDERS'
    ? source.definition.companyByOrder : undefined;
  return (orderId) => map?.[orderId]?.companyName ?? groupOf(orderId);
}

function dayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
}

export type CombinedCases = Readonly<{ definition: ExplicitDefinition; horizonDays: number; startDate: string }>;

/**
 * Junta casos observados de empresas diferentes numa carteira só, no mesmo calendário:
 * o dia 0 é a data inicial mais antiga entre os casos. IDs repetidos entre empresas
 * ganham o nome da empresa como sufixo.
 */
export function combineObservedCases(
  cases: readonly ObservedCase[],
  companies: readonly CompanyRecord[],
): CombinedCases {
  if (cases.length < 2) throw new Error('Escolha pelo menos dois casos.');
  const companyIds = cases.map((item) => item.companyId);
  if (new Set(companyIds).size !== companyIds.length) throw new Error('Escolha no máximo um caso por empresa.');
  const startDate = cases.map((item) => item.window.startDate).sort()[0]!;
  const start = dayOf(startDate);
  const taken = new Set<string>();
  const orders: CanonicalAuthoredOrder[] = [];
  const provenanceByOrder: Record<string, OrderFieldProvenance> = {};
  const companyByOrder: Record<string, { companyId: string; companyName: string }> = {};
  for (const caseRecord of cases) {
    const companyName = companies.find((item) => item.id === caseRecord.companyId)?.displayName ?? caseRecord.companyId;
    const offset = dayOf(caseRecord.window.startDate) - start;
    const provenance = provenanceForObservedOrders(caseRecord);
    for (const order of observedOrders(caseRecord)) {
      let id = order.id;
      if (taken.has(id)) id = `${order.id}@${companyName}`;
      for (let suffix = 2; taken.has(id); suffix += 1) id = `${order.id}@${companyName}~${suffix}`;
      taken.add(id);
      orders.push({ ...order, id, dia_conhecida: order.dia_conhecida + offset, dia_limite: order.dia_limite + offset } as CanonicalAuthoredOrder);
      provenanceByOrder[id] = structuredClone(provenance[order.id]!);
      companyByOrder[id] = { companyId: caseRecord.companyId, companyName };
    }
  }
  return {
    startDate,
    horizonDays: Math.max(...orders.map((order) => order.dia_limite)) + 1,
    definition: {
      kind: 'EXPLICIT_ORDERS',
      orders,
      provenanceByOrder,
      companyByOrder,
      sourceCases: cases.map((item) => ({ caseId: item.id, caseRevision: item.revision, companyId: item.companyId })),
    },
  };
}
