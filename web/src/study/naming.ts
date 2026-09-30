import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { describeLevers, type Levers } from '../levers/applyLevers';

export const DEFAULT_STUDY_NAME = 'Novo estudo';
const MAX_NAME = 120;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function fit(name: string): string {
  const trimmed = name.trim();
  return trimmed.length <= MAX_NAME ? trimmed : `${trimmed.slice(0, MAX_NAME - 1).trimEnd()}…`;
}

function monthOf(date: string): Readonly<{ year: string; month: string }> {
  const [year = '', month = '01'] = date.split('-');
  return { year, month: MONTHS[Number(month) - 1] ?? month };
}

function midpoint(startDate: string, endDate: string): string | null {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end - start > 45 * 86_400_000) return null;
  return new Date((start + end) / 2).toISOString().slice(0, 10);
}

/**
 * "jan/2026", "jan–mar/2026" ou "dez/2025–jan/2026". Janela de até ~1,5 mês que só encosta no
 * mês vizinho (31/12 a 30/01) leva o nome do mês do meio.
 */
export function formatPeriod(startDate: string, endDate: string): string {
  const middle = midpoint(startDate, endDate);
  if (middle !== null && monthOf(startDate).month !== monthOf(endDate).month) {
    const { year, month } = monthOf(middle);
    const startDay = Number(startDate.slice(8, 10));
    const endDay = Number(endDate.slice(8, 10));
    if (startDay >= 25 || endDay <= 5) return `${month}/${year}`;
  }
  const start = monthOf(startDate);
  const end = monthOf(endDate);
  if (start.year === end.year) {
    return start.month === end.month ? `${start.month}/${start.year}` : `${start.month}–${end.month}/${end.year}`;
  }
  return `${start.month}/${start.year}–${end.month}/${end.year}`;
}

/** Nome sugerido a partir dos casos observados que formam a carteira: empresas + período. */
export function suggestStudyName(cases: readonly ObservedCase[], companies: readonly CompanyRecord[]): string | null {
  if (cases.length === 0) return null;
  const names = [...new Set(cases.map((item) =>
    companies.find((company) => company.id === item.companyId)?.displayName ?? item.companyId))]
    .sort((left, right) => left.localeCompare(right, 'pt-BR'));
  const start = cases.map((item) => item.window.startDate).sort()[0]!;
  const end = cases.map((item) => item.window.endDate).sort().at(-1)!;
  return fit(`${names.join(' + ')} · ${formatPeriod(start, end)}`);
}

/** Nome curto de uma combinação: "Só AstroPay + X". */
export function combinationName(subset: readonly string[]): string {
  return fit(`Só ${subset.join(' + ')}`);
}

/** Nome curto de uma variação por alavanca: "Y: OUT ×2, +3 d" ou "Sem X". */
export function variationName(levers: Levers, baseName: string, baseIsOriginal: boolean): string {
  const described = describeLevers(levers);
  const short = described.charAt(0).toUpperCase() + described.slice(1);
  return fit(baseIsOriginal ? short : `${baseName} → ${short}`);
}

/** Evita dois cenários com o mesmo nome no estudo: acrescenta " (2)", " (3)"… */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let index = 2; ; index += 1) {
    const suffix = ` (${index})`;
    const candidate = `${name.slice(0, MAX_NAME - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
