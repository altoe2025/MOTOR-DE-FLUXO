/** Compact, measured portfolio shape consumed by pure selection. */
export type SelectablePortfolio = Readonly<{
  scenarioId: string;
  name: string;
  companyIds: readonly string[];
  companyNames: readonly string[];
  savings: string;
  volume: string;
  baseline: string;
  netted: string;
  weightedWait: string;
  netability: string;
}>;

export type PortfolioObjective = 'savings' | 'efficiency' | 'costReduction' | 'wait' | 'companyCount' | 'netability';

export type PortfolioFilters = Readonly<{
  maxWaitDays: string | null;
  minVolume: string | null;
  minSavings: string | null;
  maxCompanies: number | null;
  requiredCompanyIds: readonly string[];
  retainBestPercent: string | null;
}>;

export type PortfolioSelection = Readonly<{
  ranked: readonly SelectablePortfolio[];
  winner: SelectablePortfolio | null;
  ineligible: readonly Readonly<{ candidate: SelectablePortfolio; reasons: readonly string[] }>[];
  relativeReference: string | null;
  relativeReferenceUniverseCount: number;
  relativeUnavailableReason: string | null;
  highlights: Readonly<Record<PortfolioObjective, string | null>>;
  errors: Readonly<Partial<Record<keyof PortfolioFilters, string>>>;
}>;

export const emptyFilters: PortfolioFilters = {
  maxWaitDays: null,
  minVolume: null,
  minSavings: null,
  maxCompanies: null,
  requiredCompanyIds: [],
  retainBestPercent: null,
};

type Exact = Readonly<{ units: bigint; scale: number }>;
type ParsedPortfolio = Readonly<{
  candidate: SelectablePortfolio;
  savings: Exact;
  volume: Exact;
  baseline: Exact;
  weightedWait: Exact;
  netability: Exact;
  companyIds: readonly string[];
}>;

const ZERO: Exact = { units: 0n, scale: 0 };
const HUNDRED: Exact = { units: 100n, scale: 0 };
const OBJECTIVES: readonly PortfolioObjective[] = ['savings', 'efficiency', 'costReduction', 'wait', 'companyCount', 'netability'];

function exact(text: string): Exact {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (match === null) throw new Error(`Invalid projected decimal: ${text}`);
  const fraction = match[3] ?? '';
  const units = BigInt(`${match[2]}${fraction}`);
  return { units: match[1] === '-' ? -units : units, scale: fraction.length };
}

function compare(left: Exact, right: Exact): number {
  const scale = Math.max(left.scale, right.scale);
  const l = left.units * 10n ** BigInt(scale - left.scale);
  const r = right.units * 10n ** BigInt(scale - right.scale);
  return l < r ? -1 : l > r ? 1 : 0;
}

function multiply(left: Exact, right: Exact): Exact {
  return { units: left.units * right.units, scale: left.scale + right.scale };
}

/** Cross-products stay exact even when both decimal operands have 80 digits. */
function compareRatios(
  leftNumerator: Exact, leftDenominator: Exact,
  rightNumerator: Exact, rightDenominator: Exact,
): number {
  return compare(multiply(leftNumerator, rightDenominator), multiply(rightNumerator, leftDenominator));
}

function plain(value: Exact): string {
  const negative = value.units < 0n;
  const digits = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, '0');
  const integer = value.scale === 0 ? digits : digits.slice(0, -value.scale);
  const fraction = value.scale === 0 ? '' : digits.slice(-value.scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function parseLimit(raw: string | null, key: keyof PortfolioFilters, errors: Partial<Record<keyof PortfolioFilters, string>>, maximum?: Exact): Exact | null {
  if (raw === null || raw.trim() === '') return null;
  const text = raw.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) {
    errors[key] = 'Informe um número não negativo válido.';
    return null;
  }
  const value = exact(text.replace(',', '.'));
  if (maximum !== undefined && compare(value, maximum) > 0) {
    errors[key] = 'O percentual deve estar entre 0 e 100.';
    return null;
  }
  return value;
}

function parseFilters(filters: PortfolioFilters): Readonly<{
  maxWaitDays: Exact | null;
  minVolume: Exact | null;
  minSavings: Exact | null;
  retainBestPercent: Exact | null;
  errors: Partial<Record<keyof PortfolioFilters, string>>;
}> {
  const errors: Partial<Record<keyof PortfolioFilters, string>> = {};
  const maxWaitDays = parseLimit(filters.maxWaitDays, 'maxWaitDays', errors);
  const minVolume = parseLimit(filters.minVolume, 'minVolume', errors);
  const minSavings = parseLimit(filters.minSavings, 'minSavings', errors);
  const retainBestPercent = parseLimit(filters.retainBestPercent, 'retainBestPercent', errors, HUNDRED);
  if (filters.maxCompanies !== null && (!Number.isSafeInteger(filters.maxCompanies) || filters.maxCompanies <= 0)) {
    errors.maxCompanies = 'Informe uma quantidade inteira positiva.';
  }
  if (!Array.isArray(filters.requiredCompanyIds)
    || filters.requiredCompanyIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    errors.requiredCompanyIds = 'Selecione empresas com identificadores válidos.';
  }
  return { maxWaitDays, minVolume, minSavings, retainBestPercent, errors };
}

function stringCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIds(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const result = stringCompare(left[index]!, right[index]!);
    if (result !== 0) return result;
  }
  return left.length - right.length;
}

function parsePortfolio(candidate: SelectablePortfolio): ParsedPortfolio {
  return {
    candidate,
    savings: exact(candidate.savings),
    volume: exact(candidate.volume),
    baseline: exact(candidate.baseline),
    weightedWait: exact(candidate.weightedWait),
    netability: exact(candidate.netability),
    companyIds: [...new Set(candidate.companyIds)].sort(stringCompare),
  };
}

function objectiveComparison(left: ParsedPortfolio, right: ParsedPortfolio, objective: PortfolioObjective): number {
  switch (objective) {
    case 'savings': return compare(right.savings, left.savings);
    case 'efficiency': return compareRatios(right.savings, right.volume, left.savings, left.volume);
    case 'costReduction': return compareRatios(right.savings, right.baseline, left.savings, left.baseline);
    case 'wait': return compareRatios(left.weightedWait, left.volume, right.weightedWait, right.volume);
    case 'companyCount': return left.companyIds.length - right.companyIds.length;
    case 'netability': return compare(right.netability, left.netability);
  }
}

function rankComparison(left: ParsedPortfolio, right: ParsedPortfolio, objective: PortfolioObjective): number {
  const primary = objectiveComparison(left, right, objective);
  if (primary !== 0) return primary;
  if (objective !== 'savings') {
    const savings = compare(right.savings, left.savings);
    if (savings !== 0) return savings;
  }
  if (objective !== 'wait') {
    const wait = compareRatios(left.weightedWait, left.volume, right.weightedWait, right.volume);
    if (wait !== 0) return wait;
  }
  if (objective !== 'companyCount') {
    const companies = left.companyIds.length - right.companyIds.length;
    if (companies !== 0) return companies;
  }
  return compareIds(left.companyIds, right.companyIds) || stringCompare(left.candidate.scenarioId, right.candidate.scenarioId);
}

function noHighlights(): Record<PortfolioObjective, string | null> {
  return { savings: null, efficiency: null, costReduction: null, wait: null, companyCount: null, netability: null };
}

/** Select among already measured, comparable portfolios without mutating candidates. */
export function selectPortfolios(
  candidates: readonly SelectablePortfolio[], objective: PortfolioObjective, filters: PortfolioFilters,
): PortfolioSelection {
  const parsed = parseFilters(filters);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      ranked: [], winner: null, ineligible: [], relativeReference: null,
      relativeReferenceUniverseCount: 0, relativeUnavailableReason: null,
      highlights: noHighlights(), errors: parsed.errors,
    };
  }

  const requiredIds = new Set(filters.requiredCompanyIds);
  const absolute: ParsedPortfolio[] = [];
  const reasonsByCandidate = new Map<SelectablePortfolio, string[]>();
  for (const candidate of candidates) {
    const row = parsePortfolio(candidate);
    const reasons: string[] = [];
    if (compare(row.volume, ZERO) <= 0) reasons.push('volume');
    if (parsed.maxWaitDays !== null && compare(row.volume, ZERO) > 0
      && compareRatios(row.weightedWait, row.volume, parsed.maxWaitDays, { units: 1n, scale: 0 }) > 0) reasons.push('maxWaitDays');
    if (parsed.minVolume !== null && compare(row.volume, parsed.minVolume) < 0) reasons.push('minVolume');
    if (parsed.minSavings !== null && compare(row.savings, parsed.minSavings) < 0) reasons.push('minSavings');
    if (filters.maxCompanies !== null && row.companyIds.length > filters.maxCompanies) reasons.push('maxCompanies');
    if ([...requiredIds].some((id) => !row.companyIds.includes(id))) reasons.push('requiredCompanyIds');
    if (reasons.length > 0) reasonsByCandidate.set(candidate, reasons);
    else absolute.push(row);
  }

  const best = absolute.reduce<Exact | null>((current, row) => current === null || compare(row.savings, current) > 0 ? row.savings : current, null);
  const relativeReference = best !== null && compare(best, ZERO) > 0 ? plain(best) : null;
  const relativeUnavailableReason = parsed.retainBestPercent !== null && relativeReference === null
    ? 'Nenhuma carteira após as restrições absolutas tem economia positiva; a meta relativa está indisponível.'
    : null;

  const relativeEligible: ParsedPortfolio[] = [];
  const eligible: ParsedPortfolio[] = [];
  for (const row of absolute) {
    const reasons: string[] = [];
    if (parsed.retainBestPercent !== null && best !== null && relativeReference !== null
      && compare(multiply(row.savings, HUNDRED), multiply(best, parsed.retainBestPercent)) < 0) reasons.push('retainBestPercent');
    if (reasons.length > 0) {
      reasonsByCandidate.set(row.candidate, reasons);
      continue;
    }
    relativeEligible.push(row);
    if (objective === 'costReduction' && compare(row.baseline, ZERO) <= 0) reasons.push('baseline');
    if (reasons.length > 0) reasonsByCandidate.set(row.candidate, reasons);
    else eligible.push(row);
  }

  eligible.sort((left, right) => rankComparison(left, right, objective));
  const highlights = noHighlights();
  for (const criterion of OBJECTIVES) {
    const available = criterion === 'costReduction'
      ? relativeEligible.filter((row) => compare(row.baseline, ZERO) > 0) : relativeEligible;
    if (available.length > 0) highlights[criterion] = [...available].sort((left, right) => rankComparison(left, right, criterion))[0]!.candidate.scenarioId;
  }
  return {
    ranked: eligible.map((row) => row.candidate),
    winner: eligible[0]?.candidate ?? null,
    ineligible: candidates.flatMap((candidate) => {
      const reasons = reasonsByCandidate.get(candidate);
      return reasons === undefined ? [] : [{ candidate, reasons }];
    }),
    relativeReference,
    relativeReferenceUniverseCount: absolute.length,
    relativeUnavailableReason,
    highlights,
    errors: {},
  };
}
