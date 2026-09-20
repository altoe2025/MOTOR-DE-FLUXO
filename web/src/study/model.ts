import type { components } from '../api/generated';
import type { FieldProvenance, ObservedOutcome } from '../cases/domain';
import type { ObservedComparison } from '../cases/observedComparison';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

export type CanonicalAuthoredOrder = DeepReadonly<components['schemas']['OrdemEntrada']>;
export type CostPremises = DeepReadonly<components['schemas']['CustoEntrada']>;
export type HttpPeriod = DeepReadonly<
  components['schemas']['PeriodoLegado'] | components['schemas']['PeriodoNatural']
>;
export type PeriodDocument =
  | Readonly<{
      httpPeriod: DeepReadonly<components['schemas']['PeriodoLegado']>;
      executableHorizonDays: number;
    }>
  | Readonly<{ httpPeriod: DeepReadonly<components['schemas']['PeriodoNatural']> }>;
export type PreviaRequest = DeepReadonly<components['schemas']['PreviaRequest']>;
export type PreviewEnvelope = DeepReadonly<components['schemas']['PreviewEnvelope']>;
export type PreparationResponse = DeepReadonly<components['schemas']['PreparationResponse']>;
export type SeedText = components['schemas']['EffectiveParticipant']['seed'];

export type OrderFieldProvenance = Readonly<{
  id?: FieldProvenance;
  cliente_id?: FieldProvenance;
  direcao?: FieldProvenance;
  dia_conhecida: FieldProvenance;
  dia_limite: FieldProvenance;
  eh_efx: FieldProvenance;
  finalidade: FieldProvenance;
  valor_brl: FieldProvenance;
}>;

export type AuthoredParameters = Readonly<{
  frequency: string;
  ticket: string;
  direction: 'OUT' | 'IN' | 'MIXED';
  deadline: string;
  purpose: string;
  profile: components['schemas']['EffectiveParticipant']['profile'];
}>;

export type AuthoredParticipant = Readonly<{
  id: string;
  name: string;
  override: boolean;
  parameters: AuthoredParameters;
}>;

export type AuthoredGroup = Readonly<{
  id: string;
  name: string;
  parameters: AuthoredParameters;
  participants: readonly AuthoredParticipant[];
}>;

export type AuthoredPortfolioDefinition =
  | Readonly<{ kind: 'PARAMETRIC'; groups: readonly AuthoredGroup[] }>
  | Readonly<{
      kind: 'EXPLICIT_ORDERS';
      derivedFromObservedCase?: Readonly<{ caseId: string; caseRevision: number }>;
      orders: readonly CanonicalAuthoredOrder[];
      provenanceByOrder: Readonly<Record<string, OrderFieldProvenance>>;
    }>;

export type SyntheticRecipe = Readonly<{
  exampleId: string;
  seeds: readonly SeedText[];
  composition: PreparationResponse['composition'];
  preparationVersion: string;
  generatorVersion: string;
  motorBuildSha: string;
  generationFingerprint: string;
}>;

export type PortfolioSource =
  | Readonly<{ kind: 'OBSERVED_CASE'; caseId: string; caseRevision: number }>
  | Readonly<{
      kind: 'AUTHORED';
      authoredPortfolioId: string;
      definition?: AuthoredPortfolioDefinition;
    }>
  | Readonly<{ kind: 'SYNTHETIC'; recipe: SyntheticRecipe }>;

export type PortfolioSourceSnapshot = Readonly<{
  source: PortfolioSource;
  capturedAt: string;
  orders: readonly CanonicalAuthoredOrder[];
  provenance: readonly FieldProvenance[];
  provenanceByOrder?: Readonly<Record<string, OrderFieldProvenance>>;
  observedOutcome: ObservedOutcome | null;
  sourceFingerprint: string;
}>;

export type PremisesDocument = Readonly<{
  costs: CostPremises;
  windowDays: number;
}>;

export type ScenarioInputProvenance = Readonly<{
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

export type ScenarioDocument = Readonly<{
  id: string;
  revision: number;
  name: string;
  sourceSnapshot: PortfolioSourceSnapshot;
  premises: PremisesDocument;
  period: PeriodDocument;
  inputProvenance?: ScenarioInputProvenance;
  inputFingerprint: string;
}>;

export type ScenarioDraft = Omit<ScenarioDocument, 'inputFingerprint'> &
  Readonly<{ inputFingerprint?: string }>;

export type ExecutionStatus = 'PREPARING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED';
export type ExecutionRecord = Readonly<{
  id: string;
  attemptId?: string;
  scenarioId: string;
  scenarioRevision: number;
  inputFingerprint: string;
  requestSnapshot: PreviaRequest;
  sourceSnapshot?: PortfolioSourceSnapshot;
  premisesSnapshot?: PremisesDocument;
  periodSnapshot?: PeriodDocument;
  engineVersion: string;
  contractVersion: string;
  status: ExecutionStatus;
  envelope: PreviewEnvelope | null;
  observedComparison: ObservedComparison | null;
  createdAt: string;
  finishedAt: string | null;
}>;

export type StudyDocument = Readonly<{
  schemaVersion: '2.0.0';
  id: string;
  ownerSub: string;
  name: string;
  revision: number;
  baseScenarioId: string;
  scenarios: readonly ScenarioDocument[];
  executions: readonly ExecutionRecord[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export type StudyValidationIssue = Readonly<{
  path: string;
  code:
    | 'INVALID_STRUCTURE'
    | 'OWNER_MISMATCH'
    | 'BASE_SCENARIO_MISSING'
    | 'DUPLICATE_ID'
    | 'MISSING_SCENARIO_REVISION'
    | 'INCOMPATIBLE_ENVELOPE'
    | 'INCOMPATIBLE_EXECUTION_SNAPSHOT'
    | 'SOURCE_FINGERPRINT_MISMATCH'
    | 'INPUT_FINGERPRINT_MISMATCH';
  message: string;
}>;

export type StudyValidation<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly StudyValidationIssue[] }>;

export type IdFactory = () => string;

export type CreateStudyInput = Readonly<{
  id: string;
  ownerSub: string;
  name: string;
  baseScenario: ScenarioDraft;
  now: string;
}>;

export type ScenarioUpdate = Readonly<{
  name?: string;
  sourceSnapshot?: PortfolioSourceSnapshot;
  premises?: PremisesDocument;
  period?: PeriodDocument;
  inputProvenance?: ScenarioInputProvenance;
}>;

export type ResultState =
  | Readonly<{ kind: 'ABSENT' }>
  | Readonly<{ kind: 'CURRENT'; executionId: string; status: ExecutionStatus }>
  | Readonly<{
      kind: 'STALE';
      executionId: string;
      reasons: readonly ('INPUT_CHANGED' | 'SCENARIO_REVISION_CHANGED')[];
    }>;
