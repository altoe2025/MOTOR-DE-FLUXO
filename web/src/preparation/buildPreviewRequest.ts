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

function representativeProvenance(snapshot: PortfolioSourceSnapshot): PreviaRequest['proveniencia'][string] {
  if (snapshot.provenance.length === 0) throw new Error('Snapshot sem proveniência.');
  const ordered = snapshot.provenance.map((item) => structuredClone(item))
    .sort((left, right) => ordinal(canonical(left), canonical(right)));
  return projectProvenance(ordered[0]!);
}

function requestProvenance(snapshot: PortfolioSourceSnapshot, orderCount: number): PreviaRequest['proveniencia'] {
  const value = representativeProvenance(snapshot);
  const paths = [
    '/horizonte_dias',
    '/janela_dias',
    '/custo/iof_out',
    '/custo/iof_in',
    '/custo/carry_cnr',
    '/custo/custo_fixo_remessa',
    '/custo/custo_oportunidade_aa',
    '/custo/spread_rail_bps',
    '/custo/ptax',
  ];
  for (let index = 0; index < orderCount; index += 1) {
    paths.push(
      `/ordens/${index}/dia_conhecida`,
      `/ordens/${index}/dia_limite`,
      `/ordens/${index}/eh_efx`,
      `/ordens/${index}/finalidade`,
      `/ordens/${index}/valor_brl`,
    );
  }
  return Object.fromEntries(paths.map((path) => [path, structuredClone(value)]));
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
    proveniencia: requestProvenance(snapshot, orders.length),
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
