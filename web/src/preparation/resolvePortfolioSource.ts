import type { PreparationRequest, PreparationResponse } from '../api/client';
import { validatePreparationRequest, validatePreparationResponse } from '../api/validators';
import type { FieldProvenance, ObservedCase } from '../cases/domain';
import { validateObservedCase } from '../cases/validation';
import { canonical, fingerprintPortfolioSource } from '../study/fingerprints';
import type {
  CanonicalAuthoredOrder,
  PortfolioSourceSnapshot,
  SyntheticRecipe,
} from '../study/model';

export type PortfolioSourceResolverDependencies = Readonly<{
  getObservedCase(caseId: string): Promise<ObservedCase | null>;
  preparePortfolio(input: PreparationRequest): Promise<PreparationResponse>;
  now(): string;
}>;

export type ResolvablePortfolioSource =
  | Readonly<{ kind: 'OBSERVED_CASE'; caseId: string; caseRevision: number }>
  | Readonly<{
      kind: 'AUTHORED';
      authoredPortfolioId: string;
      preparation: PreparationResponse;
    }>
  | Readonly<{
      kind: 'SYNTHETIC';
      exampleId: string;
      preparation: PreparationRequest;
    }>;

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneAndOrderOrders(orders: readonly CanonicalAuthoredOrder[]): CanonicalAuthoredOrder[] {
  return orders.map((order) => structuredClone(order))
    .sort((left, right) => ordinal(left.id, right.id));
}

function orderProvenance(provenance: readonly FieldProvenance[]): FieldProvenance[] {
  return provenance.map((item) => structuredClone(item))
    .sort((left, right) => ordinal(canonical(left), canonical(right)));
}

function dayFromWindowStart(date: string, startDate: string): number {
  const atMidnight = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data observada inválida.');
    const [year, month, day] = value.split('-').map(Number);
    const timestamp = Date.UTC(year!, month! - 1, day!);
    if (Number.isNaN(timestamp)) throw new Error('Data observada inválida.');
    return timestamp;
  };
  return Math.round((atMidnight(date) - atMidnight(startDate)) / 86_400_000);
}

function observedOrders(caseRecord: ObservedCase): CanonicalAuthoredOrder[] {
  return caseRecord.orders.map((order) => {
    if (order.purposeCode === null) {
      throw new Error('Caso observado contém finalidade necessária não coletada.');
    }
    return {
      id: order.id,
      cliente_id: order.clientId,
      direcao: order.direction,
      dia_conhecida: dayFromWindowStart(order.knownDate, caseRecord.window.startDate),
      dia_limite: dayFromWindowStart(order.deadlineDate, caseRecord.window.startDate),
      valor_brl: order.valueBrl,
      finalidade: order.purposeCode,
      eh_efx: order.efxStatus === 'YES',
    };
  }).sort((left, right) => ordinal(left.id, right.id));
}

function preparationProvenance(response: PreparationResponse): FieldProvenance[] {
  const provenance = Object.values(response.input_snapshot.sources).map((source) => (
    source.kind === 'PADRAO_SINTETICO'
      ? {
          kind: 'SYNTHETIC_DEFAULT' as const,
          source: source.source,
          version: response.preparation_version,
          recordedAt: source.recorded_at,
          rule: response.generator_version,
        }
      : {
          kind: 'USER_ESTIMATE' as const,
          source: source.source,
          version: response.preparation_version,
          recordedAt: source.recorded_at,
        }
  ));
  return orderProvenance(provenance);
}

function assertPreparationResponse(value: unknown): asserts value is PreparationResponse {
  if (!validatePreparationResponse(value)) {
    throw new Error('Preparação inválida para resolver a origem da carteira.');
  }
}

async function snapshot(
  input: Omit<PortfolioSourceSnapshot, 'sourceFingerprint'>,
): Promise<PortfolioSourceSnapshot> {
  return {
    ...input,
    sourceFingerprint: await fingerprintPortfolioSource(input),
  };
}

function recipe(exampleId: string, response: PreparationResponse): SyntheticRecipe {
  return {
    exampleId,
    seeds: response.input_snapshot.participants.map((participant) => participant.seed),
    composition: structuredClone(response.composition),
    preparationVersion: response.preparation_version,
    generatorVersion: response.generator_version,
    motorBuildSha: response.motor_build_sha,
    generationFingerprint: response.generation_fingerprint,
  };
}

export async function resolvePortfolioSource(
  source: ResolvablePortfolioSource,
  dependencies: PortfolioSourceResolverDependencies,
): Promise<PortfolioSourceSnapshot> {
  if (source.kind === 'OBSERVED_CASE') {
    const caseRecord = await dependencies.getObservedCase(source.caseId);
    if (caseRecord === null) throw new Error('Caso observado não encontrado.');
    if (caseRecord.status !== 'CONFIRMED') throw new Error('Caso observado precisa estar confirmado.');
    if (caseRecord.revision !== source.caseRevision) throw new Error('Revisão do caso observado não confere.');
    const validated = validateObservedCase(caseRecord);
    if (!validated.ok) throw new Error('Caso observado confirmado é inválido.');
    return snapshot({
      source: { kind: 'OBSERVED_CASE', caseId: caseRecord.id, caseRevision: caseRecord.revision },
      capturedAt: dependencies.now(),
      orders: observedOrders(caseRecord),
      provenance: orderProvenance(caseRecord.orders.flatMap((order) => order.provenance)),
      observedOutcome: structuredClone(caseRecord.observedOutcome),
    });
  }

  if (source.kind === 'AUTHORED') {
    assertPreparationResponse(source.preparation);
    return snapshot({
      source: { kind: 'AUTHORED', authoredPortfolioId: source.authoredPortfolioId },
      capturedAt: dependencies.now(),
      orders: cloneAndOrderOrders(source.preparation.orders),
      provenance: preparationProvenance(source.preparation),
      observedOutcome: null,
    });
  }

  if (!validatePreparationRequest(source.preparation)) {
    throw new Error('Preparação sintética inválida.');
  }
  const prepared = await dependencies.preparePortfolio(source.preparation);
  assertPreparationResponse(prepared);
  return snapshot({
    source: { kind: 'SYNTHETIC', recipe: recipe(source.exampleId, prepared) },
    capturedAt: dependencies.now(),
    orders: cloneAndOrderOrders(prepared.orders),
    provenance: preparationProvenance(prepared),
    observedOutcome: null,
  });
}
