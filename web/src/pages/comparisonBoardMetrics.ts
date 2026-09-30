import Decimal from 'decimal.js';

/**
 * Economia em pontos-base sobre o volume que atravessaria a fronteira sem pool: a soma das
 * ordens medidas (`volume_bruto_periodo_brl`), porque sem pool cada ordem remete sozinha.
 * Deixa comparáveis carteiras de volumes diferentes. Duas casas bastam para decidir.
 */
export function savingsBps(savingsBrl: string, grossVolumeBrl: string): string | null {
  const volume = new Decimal(grossVolumeBrl);
  if (volume.isZero()) return null;
  return new Decimal(savingsBrl).div(volume).times(10_000).toDecimalPlaces(2).toFixed();
}

type HttpPeriod = Readonly<{ modo: 'NATURAL'; dias_aquecimento: number; periodo_medicao_dias: number } | { modo: 'LEGADO' }>;

export function measuredPeriodLabel(period: HttpPeriod, horizonDays?: number): string {
  if (period.modo === 'LEGADO') return `horizonte de ${horizonDays ?? '?'} dias`;
  const days = period.periodo_medicao_dias;
  const measured = `${days} ${days === 1 ? 'dia medido' : 'dias medidos'}`;
  return period.dias_aquecimento === 0 ? measured : `${measured} (+${period.dias_aquecimento} de aquecimento)`;
}

type ComparablePremises = Readonly<{ windowDays: number; costs: Readonly<Record<string, unknown>> }>;

const FIELDS: readonly (readonly [string, (premises: ComparablePremises) => unknown])[] = [
  ['janela', (premises) => premises.windowDays],
  ['IOF OUT', (premises) => premises.costs.iof_out],
  ['IOF IN', (premises) => premises.costs.iof_in],
  ['carry', (premises) => premises.costs.carry_cnr],
  ['spread', (premises) => premises.costs.spread_rail_bps],
  ['custo fixo', (premises) => premises.costs.custo_fixo_remessa],
  ['custo de oportunidade', (premises) => premises.costs.custo_oportunidade_aa],
  ['PTAX', (premises) => premises.costs.ptax],
  ['IOF por finalidade', (premises) => premises.costs.iof_por_finalidade],
];

function normalized(value: unknown): string {
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return new Decimal(value).toFixed();
  return JSON.stringify(value ?? null);
}

/**
 * Linhas cujas premissas diferem do grupo mais comum entre as selecionadas, e em quais campos.
 * Serve para avisar que a diferença de economia pode vir das premissas, não da carteira.
 */
export function premisesDivergence(rows: readonly Readonly<{ key: string; premises: ComparablePremises }>[]): Readonly<{
  differing: string[]; fields: string[];
}> {
  const signature = (premises: ComparablePremises) => FIELDS.map(([, read]) => normalized(read(premises))).join('|');
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(signature(row.premises), (counts.get(signature(row.premises)) ?? 0) + 1);
  const reference = rows.find((row) => counts.get(signature(row.premises)) === Math.max(...counts.values()));
  if (reference === undefined) return { differing: [], fields: [] };
  const referenceSignature = signature(reference.premises);
  const differing = rows.filter((row) => signature(row.premises) !== referenceSignature);
  const fields = FIELDS.filter(([, read]) => differing.some((row) =>
    normalized(read(row.premises)) !== normalized(read(reference.premises)))).map(([label]) => label);
  return { differing: differing.map((row) => row.key), fields };
}
