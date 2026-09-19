import type {
  DeepMutable,
  DeepReadonly,
  PortfolioSourceSnapshot,
  ScenarioDraft,
  ScenarioDocument,
} from './model';

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => ordinal(left, right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Valor não serializável para fingerprint.');
  return encoded;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeDecimal(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) return value;
  const [whole, fraction = ''] = value.split('.');
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction === '' ? whole! : `${whole}.${normalizedFraction}`;
}

function normalizeSnapshot(
  snapshot: DeepReadonly<Omit<PortfolioSourceSnapshot, 'sourceFingerprint'>>,
): Record<string, unknown> {
  const source = structuredClone(snapshot.source) as DeepMutable<typeof snapshot.source>;
  if (source.kind === 'SYNTHETIC') {
    source.recipe.seeds = [...source.recipe.seeds].sort((left, right) =>
      left.length - right.length || ordinal(left, right));
    source.recipe.composition = [...source.recipe.composition]
      .map((item) => ({
        ...item,
        total_brl: normalizeDecimal(item.total_brl),
        out_brl: normalizeDecimal(item.out_brl),
        in_brl: normalizeDecimal(item.in_brl),
        out_fraction: item.out_fraction === null ? null : normalizeDecimal(item.out_fraction),
      }))
      .sort((left, right) => ordinal(left.participant_id ?? '', right.participant_id ?? ''));
  }
  const orders = snapshot.orders.map((order) => ({
    ...structuredClone(order),
    valor_brl: normalizeDecimal(order.valor_brl),
  })).sort((left, right) => ordinal(left.id, right.id));
  const provenance = snapshot.provenance.map((item) => structuredClone(item))
    .sort((left, right) => ordinal(canonical(left), canonical(right)));
  return {
    source,
    orders,
    provenance,
  };
}

function normalizePremises(input: ScenarioDraft | ScenarioDocument): unknown {
  const costs = structuredClone(input.premises.costs) as DeepMutable<typeof input.premises.costs>;
  costs.iof_out = normalizeDecimal(costs.iof_out);
  costs.iof_in = normalizeDecimal(costs.iof_in);
  costs.carry_cnr = normalizeDecimal(costs.carry_cnr);
  costs.custo_fixo_remessa = normalizeDecimal(costs.custo_fixo_remessa);
  costs.custo_oportunidade_aa = normalizeDecimal(costs.custo_oportunidade_aa);
  costs.spread_rail_bps = normalizeDecimal(costs.spread_rail_bps);
  costs.ptax = normalizeDecimal(costs.ptax);
  costs.iof_por_finalidade = [...costs.iof_por_finalidade]
    .map((rule) => ({ ...rule, aliquota: normalizeDecimal(rule.aliquota) }))
    .sort((left, right) => ordinal(
      `${left.finalidade}\0${left.direcao}\0${left.aliquota}`,
      `${right.finalidade}\0${right.direcao}\0${right.aliquota}`,
    ));
  return { costs, windowDays: input.premises.windowDays };
}

export async function fingerprintPortfolioSource(
  snapshot: DeepReadonly<Omit<PortfolioSourceSnapshot, 'sourceFingerprint'>> | PortfolioSourceSnapshot,
): Promise<string> {
  return sha256(normalizeSnapshot(snapshot));
}

export async function fingerprintScenarioInput(
  input: ScenarioDraft | ScenarioDocument,
): Promise<string> {
  return sha256({
    portfolio: {
      ...normalizeSnapshot(input.sourceSnapshot),
      sourceFingerprint: input.sourceSnapshot.sourceFingerprint,
    },
    premises: normalizePremises(input),
    period: structuredClone(input.period),
  });
}
