import type { PortfolioMetrics } from './portfolioAnalysis';

type DecimalParts = Readonly<{ units: bigint; scale: number }>;

function decimal(value: string): DecimalParts {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (match === null) throw new Error(`Invalid portfolio decimal: ${value}`);
  const fraction = match[3] ?? '';
  const units = BigInt(`${match[2]}${fraction}`);
  return { units: match[1] === '-' ? -units : units, scale: fraction.length };
}

function multiply(left: DecimalParts, right: DecimalParts): DecimalParts {
  return { units: left.units * right.units, scale: left.scale + right.scale };
}

function compare(left: DecimalParts, right: DecimalParts): number {
  const scale = Math.max(left.scale, right.scale);
  const a = left.units * 10n ** BigInt(scale - left.scale);
  const b = right.units * 10n ** BigInt(scale - right.scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The caller supplies eligible portfolios; waiting is weightedWait / volume. */
export function paretoScenarioIds(candidates: readonly PortfolioMetrics[]): ReadonlySet<string> {
  const points = candidates.map(row => {
    const volume = decimal(row.volume);
    if (volume.units <= 0n) throw new Error('Portfolio volume must be positive.');
    return { scenarioId: row.scenarioId, savings: decimal(row.savings), wait: decimal(row.weightedWait), volume };
  });
  return new Set(points.filter(point => !points.some(other => {
    if (other === point) return false;
    const savings = compare(other.savings, point.savings);
    const wait = compare(multiply(other.wait, point.volume), multiply(point.wait, other.volume));
    return savings >= 0 && wait <= 0 && (savings > 0 || wait < 0);
  })).map(point => point.scenarioId));
}
