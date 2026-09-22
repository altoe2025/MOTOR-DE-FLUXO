import Decimal from 'decimal.js';

import type { FieldProvenance } from '../cases/domain';
import type {
  CostPremises,
  EffectiveInput,
  PortfolioSourceSnapshot,
  ScenarioDocument,
  ScenarioDraft,
  ScenarioInputProvenance,
} from '../study/model';
import { PROFILE_MVP_EXAMPLE_ID } from '../study/domain';
import { assertExactEffectiveSources } from './profileMvp';

export { PROFILE_MVP_EXAMPLE_ID };

export type MvpScalarCostDraft = Readonly<Pick<CostPremises,
  | 'iof_out'
  | 'iof_in'
  | 'carry_cnr'
  | 'spread_rail_bps'
  | 'custo_fixo_remessa'
  | 'custo_oportunidade_aa'
  | 'ptax'
>>;

export type ObservedHypothesisDraft = Readonly<{
  kind: 'OBSERVED';
  name: string;
  windowDays: number;
  costs: MvpScalarCostDraft;
}>;

export type ProfileHypothesisDraft = Readonly<{
  kind: 'PROFILE_SIMULATION';
  name: string;
  volumeMultiplier: string;
  ticketMultiplier: string;
  outFractionDelta: string;
  deadline: Readonly<{ mode: 'KEEP' }> | EffectiveInput['participants'][number]['deadline'];
  windowDays: number;
  costs: MvpScalarCostDraft;
}>;

export type MvpHypothesisDraft = ObservedHypothesisDraft | ProfileHypothesisDraft;

export type BuildHypothesisScenarioDraftInput = Readonly<{
  base: ScenarioDocument;
  draft: MvpHypothesisDraft;
  sourceSnapshot: PortfolioSourceSnapshot;
  id: string;
  recordedAt: string;
}>;

const DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const SIGNED_DECIMAL = /^-?(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function checkedDecimal(
  value: string,
  label: string,
  options: Readonly<{ min: string; max: string; maxPlaces: number; positive?: boolean }>,
): Decimal {
  const match = DECIMAL.exec(value);
  if (match === null || (match[2]?.length ?? 0) > options.maxPlaces) {
    throw new Error(`${label} possui formato ou precisão inválida.`);
  }
  const parsed = new Decimal(value);
  if (!parsed.isFinite()
      || parsed.lessThan(options.min)
      || parsed.greaterThan(options.max)
      || (options.positive === true && parsed.lessThanOrEqualTo(0))) {
    throw new Error(`${label} fora do intervalo permitido.`);
  }
  return parsed;
}

function checkedSignedDecimal(value: string, label: string, maxPlaces = 12): Decimal {
  const match = SIGNED_DECIMAL.exec(value);
  if (match === null || (match[2]?.length ?? 0) > maxPlaces) {
    throw new Error(`${label} possui formato ou precisão inválida.`);
  }
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) throw new Error(`${label} inválido.`);
  return parsed;
}

function canonicalMoney(value: Decimal): string {
  const rounded = value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  if (rounded.lessThan('0.000001') || rounded.greaterThan('1e12')) {
    throw new Error('Valor monetário fora do intervalo permitido.');
  }
  return rounded.toString();
}

function canonicalFraction(value: Decimal): string {
  const rounded = value.toDecimalPlaces(12, Decimal.ROUND_HALF_UP);
  if (rounded.isNegative() || rounded.greaterThan(1)) {
    throw new Error('Fração OUT fora do intervalo permitido.');
  }
  return rounded.toString();
}

export function validateMvpScalarCosts(costs: MvpScalarCostDraft): void {
  checkedDecimal(costs.iof_out, 'IOF OUT', { min: '0', max: '1', maxPlaces: 12 });
  checkedDecimal(costs.iof_in, 'IOF IN', { min: '0', max: '1', maxPlaces: 12 });
  checkedDecimal(costs.carry_cnr, 'Carry CNR', { min: '0', max: '1', maxPlaces: 12 });
  checkedDecimal(costs.custo_oportunidade_aa, 'Custo de oportunidade', {
    min: '0', max: '1', maxPlaces: 12,
  });
  checkedDecimal(costs.spread_rail_bps, 'Spread do rail', {
    min: '0', max: '10000', maxPlaces: 12,
  });
  checkedDecimal(costs.custo_fixo_remessa, 'Custo fixo', {
    min: '0', max: '1000000000000', maxPlaces: 6,
  });
  checkedDecimal(costs.ptax, 'PTAX', {
    min: '0', max: '1000000', maxPlaces: 12, positive: true,
  });
}

export function isProfileMvpScenario(scenario: ScenarioDocument): boolean {
  return scenario.sourceSnapshot.source.kind === 'SYNTHETIC'
    && scenario.sourceSnapshot.source.recipe.exampleId === PROFILE_MVP_EXAMPLE_ID;
}

function hypothesisSource(original: EffectiveInput['sources'][string], recordedAt: string) {
  const source = original.source.startsWith('profile-mvp:')
    ? original.source.replace(/:(?:derived|hypothesis)$/, ':hypothesis')
    : 'profile-mvp:hypothesis';
  return { kind: 'ESTIMATIVA_USUARIO' as const, source, recorded_at: recordedAt };
}

export function applyProfileHypothesis(
  base: EffectiveInput,
  changes: Pick<ProfileHypothesisDraft,
    'volumeMultiplier' | 'ticketMultiplier' | 'outFractionDelta' | 'deadline'>,
  recordedAt: string,
): EffectiveInput {
  const volumeMultiplier = checkedDecimal(changes.volumeMultiplier, 'Multiplicador de volume', {
    min: '0.000000000001', max: '1000000000000', maxPlaces: 12, positive: true,
  });
  const ticketMultiplier = checkedDecimal(changes.ticketMultiplier, 'Multiplicador de ticket', {
    min: '0.000000000001', max: '1000000000000', maxPlaces: 12, positive: true,
  });
  const outFractionDelta = checkedSignedDecimal(changes.outFractionDelta, 'Deslocamento da fração OUT');
  if (changes.deadline.mode === 'FIXED'
      && (!Number.isInteger(changes.deadline.days)
        || changes.deadline.days < 0
        || changes.deadline.days > 1095)) {
    throw new Error('Prazo fixo fora do intervalo permitido.');
  }

  const next = structuredClone(base) as EffectiveInput;
  const sources = structuredClone(base.sources) as Record<string, EffectiveInput['sources'][string]>;
  const participants = base.participants.map((participant) => {
    const prefix = `/participants/${participant.id}`;
    const monthly = canonicalMoney(new Decimal(participant.monthly_volume_brl).times(volumeMultiplier));
    const ticket = canonicalMoney(new Decimal(participant.ticket_median_brl).times(ticketMultiplier));
    const fraction = canonicalFraction(new Decimal(participant.out_fraction).plus(outFractionDelta));
    if (monthly !== participant.monthly_volume_brl) {
      sources[`${prefix}/monthly_volume_brl`] = hypothesisSource(
        base.sources[`${prefix}/monthly_volume_brl`]!, recordedAt,
      );
    }
    if (ticket !== participant.ticket_median_brl) {
      sources[`${prefix}/ticket_median_brl`] = hypothesisSource(
        base.sources[`${prefix}/ticket_median_brl`]!, recordedAt,
      );
    }
    if (fraction !== participant.out_fraction) {
      sources[`${prefix}/out_fraction`] = hypothesisSource(
        base.sources[`${prefix}/out_fraction`]!, recordedAt,
      );
    }
    const deadline = changes.deadline.mode === 'KEEP'
      ? structuredClone(participant.deadline)
      : structuredClone(changes.deadline);
    if (changes.deadline.mode !== 'KEEP') {
      sources[`${prefix}/deadline/mode`] = hypothesisSource(
        base.sources[`${prefix}/deadline/mode`]!, recordedAt,
      );
      if (deadline.mode === 'FIXED') {
        sources[`${prefix}/deadline/days`] = hypothesisSource(
          base.sources[`${prefix}/deadline/days`] ?? base.sources[`${prefix}/deadline/mode`]!,
          recordedAt,
        );
      } else {
        delete sources[`${prefix}/deadline/days`];
      }
    }
    return {
      ...structuredClone(participant),
      monthly_volume_brl: monthly,
      ticket_median_brl: ticket,
      out_fraction: fraction,
      deadline,
    };
  });
  const result: EffectiveInput = { ...next, participants, sources };
  assertExactEffectiveSources(result);
  return result;
}

function fallbackProvenance(): ScenarioInputProvenance {
  const value: FieldProvenance = {
    kind: 'SYNTHETIC_DEFAULT',
    source: 'cenário-base',
    version: '1.0.0',
    recordedAt: '1970-01-01T00:00:00Z',
    rule: 'legacy-scenario-provenance',
  };
  return {
    premises: {
      windowDays: value,
      costs: {
        iof_out: value, iof_in: value, carry_cnr: value,
        spread_rail_bps: value, custo_fixo_remessa: value,
        custo_oportunidade_aa: value, ptax: value,
      },
    },
    period: { horizonDays: value },
  };
}

export function mergeScenarioInputProvenance(
  base: ScenarioDocument,
  next: Readonly<{ windowDays: number; costs: CostPremises }>,
  recordedAt: string,
): ScenarioInputProvenance {
  const previous = structuredClone(base.inputProvenance ?? fallbackProvenance());
  const changed = (): FieldProvenance => ({
    kind: 'USER_ESTIMATE',
    source: 'hipótese MVP',
    version: '1.0.0',
    recordedAt,
  });
  const costKeys: readonly (keyof MvpScalarCostDraft)[] = [
    'iof_out', 'iof_in', 'carry_cnr', 'spread_rail_bps',
    'custo_fixo_remessa', 'custo_oportunidade_aa', 'ptax',
  ];
  return {
    premises: {
      windowDays: next.windowDays === base.premises.windowDays
        ? previous.premises.windowDays
        : changed(),
      costs: Object.fromEntries(costKeys.map((key) => [
        key,
        next.costs[key] === base.premises.costs[key]
          ? previous.premises.costs[key]
          : changed(),
      ])) as ScenarioInputProvenance['premises']['costs'],
    },
    period: structuredClone(previous.period),
  };
}

export function buildHypothesisScenarioDraft(
  input: BuildHypothesisScenarioDraftInput,
): ScenarioDraft {
  validateMvpScalarCosts(input.draft.costs);
  if (!Number.isInteger(input.draft.windowDays)
      || input.draft.windowDays < 1
      || input.draft.windowDays > 730) {
    throw new Error('Janela fora do intervalo permitido.');
  }
  const observed = input.base.sourceSnapshot.source.kind === 'OBSERVED_CASE';
  const simulated = isProfileMvpScenario(input.base);
  if (observed !== (input.draft.kind === 'OBSERVED')
      || simulated !== (input.draft.kind === 'PROFILE_SIMULATION')) {
    throw new Error(observed
      ? 'Carteira observada permite alterar somente janela e custos.'
      : 'A hipótese não corresponde à origem do cenário-base.');
  }
  const nextCosts: CostPremises = {
    ...structuredClone(input.draft.costs),
    iof_por_finalidade: structuredClone(input.base.premises.costs.iof_por_finalidade),
  };
  return {
    id: input.id,
    revision: 1,
    name: input.draft.name,
    sourceSnapshot: structuredClone(input.sourceSnapshot),
    premises: { windowDays: input.draft.windowDays, costs: nextCosts },
    period: structuredClone(input.base.period),
    inputProvenance: mergeScenarioInputProvenance(
      input.base,
      { windowDays: input.draft.windowDays, costs: nextCosts },
      input.recordedAt,
    ),
  };
}
