import type { components } from '../api/generated';

export type CenarioEntrada = components['schemas']['CenarioEntrada'];
export type PeriodoEntrada = components['schemas']['PeriodoLegado'] | components['schemas']['PeriodoNatural'];
export type PreviewEnvelope = components['schemas']['PreviewEnvelope'];
export type PreviaRequest = components['schemas']['PreviaRequest'];
export type ProvenienciaEntrada = PreviaRequest['proveniencia'];
export type EffectiveInput = components['schemas']['EffectiveInput'];
export type PreparationRequest = components['schemas']['PreparationRequest'];
export type PreparationResponse = components['schemas']['PreparationResponse'];
export type CatalogResponse = components['schemas']['CatalogResponse'];
export type Capabilities = components['schemas']['Capabilities'];

export type UUID = string;
export type UTC = string;
export type DecimalText = string;
export type SeedText = string;
export type Scope = Readonly<{ project_ref: string; owner_sub: UUID }>;
export type ProfileId = 'remessa_outbound_massiva' | 'psp_inbound' |
  'cripto_native_sem_fiat' | 'payroll_fornecedor' | 'exportador' | 'tesouraria_corporativa';
export type Source = {
  kind: 'PADRAO_SINTETICO' | 'ESTIMATIVA_USUARIO';
  source: string;
  recorded_at: UTC;
};
export type DraftField = { raw: string; origin: Source | null };
export type Slot = { mode: 'inherit' } | { mode: 'own'; field: DraftField };
export type FieldKey = 'profile' | 'monthly_volume_brl' | 'ticket_median_brl' |
  'out_fraction' | 'deadline_mode' | 'deadline_days' | 'eh_efx' |
  'purpose_out' | 'purpose_in';
export type Group = { id: UUID; name: string; fields: Record<FieldKey, DraftField> };
export type Participant = {
  id: UUID;
  name: string;
  group_id: UUID | null;
  seed: SeedText;
  fields: Record<FieldKey, Slot>;
};
export type CostKey = 'iof_out' | 'iof_in' | 'carry_cnr' | 'spread_rail_bps' |
  'custo_fixo_remessa' | 'custo_oportunidade_aa' | 'ptax';
export type IofDraft = { id: UUID; purpose: DraftField; direction: DraftField; rate: DraftField };
export type ExampleId = 'equilibrado' | 'retail_pesado' | 'corporativo_pesado' |
  'psp_dominante' | 'outbound_extremo';
export type AuthoredInput = {
  portfolio_id: UUID;
  groups: Group[];
  participants: Participant[];
  costs: Record<CostKey, DraftField>;
  iof_rules: IofDraft[];
  warmup_days: DraftField;
  measurement_days: DraftField;
  window_days: DraftField;
  repetition: number;
  template: { id: ExampleId; catalog_version: string } | null;
};
export type FieldIssue = { path: string; code: 'OBRIGATORIO' | 'DECIMAL_INVALIDO' |
  'FORA_DO_LIMITE' | 'INTEIRO_INVALIDO' | 'REFERENCIA_INVALIDA' | 'DUPLICADO' |
  'ORIGEM_AUSENTE' | 'ORIGEM_INVALIDA'; message: string };
export type Attempt = {
  id: UUID;
  request_id: UUID;
  tab_id: UUID;
  session_epoch: number;
  scenario_revision: number;
  started_at: UTC;
  phase: 'PREPARANDO' | 'EXECUTANDO';
};
export type PublicFailure = { code: string; message: string; fields: FieldIssue[]; request_id: UUID | null };
export type StudyDocument = {
  study_schema_version: '2.0.0';
  id: UUID;
  scope: Scope;
  name: string;
  created_at: UTC;
  updated_at: UTC;
  created_by: UUID;
  updated_by: UUID;
  revision: number;
  scenario_id: UUID;
  scenario_revision: number;
  semantic_key: string;
  deleted_at: UTC | null;
  content: { kind: 'AUTHORED'; input: AuthoredInput } | {
    kind: 'LEGACY_EXPLICIT';
    input: CenarioEntrada;
    period: PeriodoEntrada;
    provenance: ProvenienciaEntrada;
  };
  current_preparation_id: UUID | null;
  execution_ids: UUID[];
  attempt: Attempt | null;
  last_failure: PublicFailure | null;
  last_operation_id: UUID;
};
export type PreparationRecord = {
  record_version: '1.0.0'; id: UUID; study_id: UUID; scope: Scope;
  received_at: UTC; envelope: PreparationResponse;
};
export type ExecutionRecord = {
  record_version: '1.0.0'; id: UUID; study_id: UUID; scope: Scope;
  received_at: UTC; preparation_id: UUID | null;
  authored_snapshot: AuthoredInput | null;
  preparation_snapshot: PreparationResponse | null;
  request_snapshot: PreviaRequest;
  numeric_key: string; evidence_key: string;
  envelope: PreviewEnvelope;
};
export type StoredRecord<T> = { bytes: number; digest: string; value: T };
export type OriginalRecord = {
  id: string; study_id: UUID; source_version: string;
  captured_at: UTC; original_json: string;
};
export type MigrationMarker = {
  source_key: string; source_digest: string; study_id: UUID;
  state: 'IMPORTED' | 'DELETED'; migrated_at: UTC;
};
export type OwnerMeta = { key: 'quota'; logical_bytes: number; study_count: number };
export type ResultState = { kind: 'AUSENTE' } |
  { kind: 'ATUAL'; execution_id: UUID; server_version: 'VERIFICADA' | 'NAO_VERIFICADA' } |
  { kind: 'DESATUALIZADO'; execution_id: UUID; reasons: Array<
    'ENTRADAS_ALTERADAS' | 'PROVENIENCIA_ALTERADA' | 'ENTRADA_INCOMPLETA' | 'VERSAO_ALTERADA'> };
export type PersistState = 'SALVO' | 'PENDENTE' | 'SALVANDO' | 'CONFLITO' | 'FALHA';
export type Validation<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };
export type Clock = () => UTC;
export type IdFactory = () => UUID;
export interface DomainServices {
  resolve(input: AuthoredInput): Validation<EffectiveInput>;
  fingerprint(input: AuthoredInput): Promise<{
    semantic: string; numeric: string; evidence: string; generation: string;
  }>;
  duplicate(study: StudyDocument, now: UTC, ids: IdFactory): StudyDocument;
  resultState(study: StudyDocument, execution: ExecutionRecord | null,
    keys: { numeric: string; evidence: string } | null, build: string | null): ResultState;
}
