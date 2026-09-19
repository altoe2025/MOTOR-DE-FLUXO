import type { PreviaRequest } from '../api/client';
import { validatePreviaRequest } from '../api/validators';
import type { FieldProvenance } from '../cases/domain';
import { canonical } from '../study/fingerprints';
import type {
  CanonicalAuthoredOrder,
  PeriodDocument,
  PortfolioSourceSnapshot,
  PremisesDocument,
} from '../study/model';

export const MAX_PREVIEW_REQUEST_BYTES = 1_000_000;

export class PreviewRequestTooLargeError extends Error {
  constructor(readonly bytes: number, readonly maxBytes: number) {
    super('A prévia excede o limite local de tamanho.');
    this.name = 'PreviewRequestTooLargeError';
  }
}

export type PreviewRequestIdentity = Readonly<{
  requestId: string;
  studyId: string;
  scenarioId: string;
  scenarioRevision: number;
}>;

type OrderProvenance = Readonly<{
  dia_conhecida: FieldProvenance;
  dia_limite: FieldProvenance;
  eh_efx: FieldProvenance;
  finalidade: FieldProvenance;
  valor_brl: FieldProvenance;
}>;

export type PreviewRequestProvenance = Readonly<{
  orders?: Readonly<Record<string, OrderProvenance>>;
  premises: Readonly<{
    windowDays: FieldProvenance;
    costs: Readonly<{
      iof_out: FieldProvenance;
      iof_in: FieldProvenance;
      carry_cnr: FieldProvenance;
      custo_fixo_remessa: FieldProvenance;
      custo_oportunidade_aa: FieldProvenance;
      spread_rail_bps: FieldProvenance;
      ptax: FieldProvenance;
    }>;
  }>;
  period: Readonly<{ horizonDays: FieldProvenance }>;
}>;

export type BuildPreviewRequestOptions = Readonly<{ maxBytes?: number }>;

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedOrders(orders: readonly CanonicalAuthoredOrder[]): CanonicalAuthoredOrder[] {
  return orders.map((order) => structuredClone(order))
    .sort((left, right) => ordinal(left.id, right.id));
}

function projectProvenance(item: FieldProvenance): PreviaRequest['proveniencia'][string] {
  const tipo = item.kind === 'OBSERVED'
    ? 'DADO_OBSERVADO'
    : item.kind === 'NOT_COLLECTED'
      ? 'NAO_COLETADO'
      : item.kind === 'USER_ESTIMATE' || item.kind === 'USER_CORRECTED'
        ? 'ESTIMATIVA_USUARIO'
        : 'PADRAO_SINTETICO';
  return { tipo, fonte: item.source, registrado_em_utc: item.recordedAt };
}

function uniformSnapshotProvenance(snapshot: PortfolioSourceSnapshot): PreviaRequest['proveniencia'][string] {
  if (snapshot.provenance.length === 0) throw new Error('Snapshot sem proveniência.');
  const values = snapshot.provenance.map(projectProvenance);
  if (new Set(values.map(canonical)).size !== 1) {
    throw new Error('Proveniência agregada ambígua para as ordens do snapshot.');
  }
  return values[0]!;
}

function requestProvenance(
  snapshot: PortfolioSourceSnapshot,
  orders: readonly CanonicalAuthoredOrder[],
  context: PreviewRequestProvenance,
): PreviaRequest['proveniencia'] {
  const provenance: PreviaRequest['proveniencia'] = {
    '/horizonte_dias': projectProvenance(context.period.horizonDays),
    '/janela_dias': projectProvenance(context.premises.windowDays),
    '/custo/iof_out': projectProvenance(context.premises.costs.iof_out),
    '/custo/iof_in': projectProvenance(context.premises.costs.iof_in),
    '/custo/carry_cnr': projectProvenance(context.premises.costs.carry_cnr),
    '/custo/custo_fixo_remessa': projectProvenance(context.premises.costs.custo_fixo_remessa),
    '/custo/custo_oportunidade_aa': projectProvenance(context.premises.costs.custo_oportunidade_aa),
    '/custo/spread_rail_bps': projectProvenance(context.premises.costs.spread_rail_bps),
    '/custo/ptax': projectProvenance(context.premises.costs.ptax),
  };
  const fallback = context.orders === undefined ? uniformSnapshotProvenance(snapshot) : null;
  for (const [index, order] of orders.entries()) {
    const fields = context.orders?.[order.id];
    if (fields === undefined && fallback === null) {
      throw new Error(`Proveniência ausente para a ordem ${order.id}.`);
    }
    const value = (field: keyof OrderProvenance) => fields === undefined
      ? fallback!
      : projectProvenance(fields[field]);
    Object.assign(provenance, {
      [`/ordens/${index}/dia_conhecida`]: value('dia_conhecida'),
      [`/ordens/${index}/dia_limite`]: value('dia_limite'),
      [`/ordens/${index}/eh_efx`]: value('eh_efx'),
      [`/ordens/${index}/finalidade`]: value('finalidade'),
      [`/ordens/${index}/valor_brl`]: value('valor_brl'),
    });
  }
  return provenance;
}

function horizon(period: PeriodDocument): number {
  return 'executableHorizonDays' in period
    ? period.executableHorizonDays
    : period.httpPeriod.dias_aquecimento + period.httpPeriod.periodo_medicao_dias;
}

export function buildPreviewRequest(
  snapshot: PortfolioSourceSnapshot,
  premises: PremisesDocument,
  period: PeriodDocument,
  identity: PreviewRequestIdentity,
  provenance: PreviewRequestProvenance,
  options: BuildPreviewRequestOptions = {},
): PreviaRequest {
  const orders = orderedOrders(snapshot.orders);
  const request: PreviaRequest = {
    api_version: '1.0.0',
    request_id: identity.requestId,
    study_id: identity.studyId,
    scenario_id: identity.scenarioId,
    scenario_revision: identity.scenarioRevision,
    cenario: {
      ordens: orders,
      custo: structuredClone(premises.costs) as PreviaRequest['cenario']['custo'],
      janela_dias: premises.windowDays,
      horizonte_dias: horizon(period),
    },
    periodo: structuredClone(period.httpPeriod),
    proveniencia: requestProvenance(snapshot, orders, provenance),
  };
  if (!validatePreviaRequest(request)) {
    throw new Error('Request de prévia inválido.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  const maxBytes = options.maxBytes ?? MAX_PREVIEW_REQUEST_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Limite de tamanho inválido.');
  if (bytes > maxBytes) throw new PreviewRequestTooLargeError(bytes, maxBytes);
  return request;
}
