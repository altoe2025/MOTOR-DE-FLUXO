import Decimal from 'decimal.js';

import type { ObservedCase } from '../cases/domain';
import type { PortfolioSourceSnapshot } from '../study/model';
import type { ReplayDocument } from './domain';

/** Dia com o maior volume remetido (OUT + IN) num fechamento — o que atravessou a fronteira. */
export function largestResidueDay(document: ReplayDocument): Readonly<{ day: number; valueBrl: string }> | null {
  let best: { day: number; value: Decimal } | null = null;
  for (const day of document.days) {
    if (day.closing === null) continue;
    const value = new Decimal(day.closing.remitted_out_brl).plus(day.closing.remitted_in_brl);
    if (value.isZero()) continue;
    if (best === null || value.gt(best.value)) best = { day: day.day, value };
  }
  return best === null ? null : { day: best.day, valueBrl: best.value.toFixed() };
}

export function replayCompanies(document: ReplayDocument, companyOf: (orderId: string) => string): string[] {
  return [...new Set(document.orders.map((order) => companyOf(order.id)))].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function startDateOf(source: PortfolioSourceSnapshot['source'], cases: readonly ObservedCase[]): string | null {
  const startOf = (caseId: string) => cases.find((item) => item.id === caseId)?.window.startDate ?? null;
  if (source.kind === 'OBSERVED_CASE') return startOf(source.caseId);
  if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') return null;
  // Carteira de empresas: o dia 0 é a data inicial mais antiga entre os casos (combineObservedCases).
  if (source.definition.sourceCases !== undefined) {
    const starts = source.definition.sourceCases.map((item) => startOf(item.caseId));
    return starts.some((item) => item === null) ? null : (starts as string[]).sort()[0] ?? null;
  }
  return source.definition.derivedFromObservedCase === undefined ? null : startOf(source.definition.derivedFromObservedCase.caseId);
}

/**
 * Converte D+n do Replay em data real quando a origem vem de casos observados ainda neste
 * navegador. O deslocamento entre o dia do motor e o dia da origem sai de uma ordem comum.
 */
export function calendarForReplay(
  document: ReplayDocument,
  snapshot: PortfolioSourceSnapshot | undefined,
  cases: readonly ObservedCase[],
): ((day: number) => string) | null {
  if (snapshot === undefined) return null;
  const start = startDateOf(snapshot.source, cases);
  if (start === null || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const byId = new Map(snapshot.orders.map((order) => [order.id, order.dia_conhecida]));
  const common = document.orders.find((order) => byId.has(order.id));
  const offset = common === undefined ? 0 : common.known_day - byId.get(common.id)!;
  const [year, month, day] = start.split('-').map(Number);
  const origin = Date.UTC(year!, month! - 1, day!);
  return (replayDay) => new Date(origin + (replayDay - offset) * 86_400_000).toISOString().slice(0, 10).split('-').reverse().join('/');
}
