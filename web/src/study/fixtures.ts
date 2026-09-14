import type {
  AuthoredInput, CostKey, DraftField, FieldKey, Group, Participant, Scope,
  Source, StudyDocument, UUID,
} from './model';

const RECORDED_AT = '2026-09-13T00:00:00Z';
const DEFAULT_SCOPE: Scope = {
  project_ref: 'projeto-sintetico',
  owner_sub: '00000000-0000-4000-8000-000000000001',
};

function source(label = 'Fixture sintética MOT-24'): Source {
  return { kind: 'PADRAO_SINTETICO', source: label, recorded_at: RECORDED_AT };
}

function field(raw: string, label?: string): DraftField {
  return { raw, origin: source(label) };
}

function fields(): Record<FieldKey, DraftField> {
  return {
    profile: field('remessa_outbound_massiva', 'Catálogo sintético 1.0.0'),
    monthly_volume_brl: field('10000000'),
    ticket_median_brl: field('1000'),
    out_fraction: field('0,5'),
    deadline_mode: field('FIXED'),
    deadline_days: field('7'),
    eh_efx: field('true'),
    purpose_out: field('ANEXO_V_REMESSA_TERCEIRO'),
    purpose_in: field('ANEXO_V_DISPONIBILIDADE'),
  };
}

export function makeGroup(id: UUID = '00000000-0000-4000-8000-000000000010'): Group {
  return { id, name: 'Grupo sintético', fields: fields() };
}

export function makeParticipant(
  id: UUID = '00000000-0000-4000-8000-000000000011',
  groupId: UUID | null = null,
): Participant {
  const ownFields = fields();
  const participantFields = Object.fromEntries(
    (Object.keys(ownFields) as FieldKey[]).map((key) => [
      key,
      groupId === null ? { mode: 'own', field: ownFields[key] } : { mode: 'inherit' },
    ]),
  ) as Participant['fields'];
  return { id, name: 'Participante sintético', group_id: groupId, seed: '1', fields: participantFields };
}

function authoredInput(): AuthoredInput {
  const group = makeGroup();
  const costValues: Record<CostKey, string> = {
    iof_out: '0,035', iof_in: '0,0038', carry_cnr: '0,0004', spread_rail_bps: '0',
    custo_fixo_remessa: '0', custo_oportunidade_aa: '0', ptax: '5,40',
  };
  const costs = Object.fromEntries(
    (Object.keys(costValues) as CostKey[]).map((key) => [
      key, field(costValues[key], 'motor/varredura.py:PARAMETROS_VARREDURA'),
    ]),
  ) as Record<CostKey, DraftField>;
  return {
    portfolio_id: '00000000-0000-4000-8000-000000000012',
    groups: [group],
    participants: [makeParticipant(undefined, group.id)],
    costs,
    iof_rules: [],
    warmup_days: field('0', 'Padrão temporal NATURAL'),
    measurement_days: field('30', 'Padrão temporal NATURAL'),
    window_days: field('7', 'Padrão temporal NATURAL'),
    repetition: 1,
    template: null,
  };
}

export function makeStudy(
  scope: Scope = DEFAULT_SCOPE,
  ids: Partial<{ study: UUID; scenario: UUID; operation: UUID }> = {},
): StudyDocument {
  return {
    study_schema_version: '2.0.0',
    id: ids.study ?? '00000000-0000-4000-8000-000000000020',
    scope: structuredClone(scope),
    name: 'Estudo sintético',
    created_at: RECORDED_AT,
    updated_at: RECORDED_AT,
    created_by: scope.owner_sub,
    updated_by: scope.owner_sub,
    revision: 1,
    scenario_id: ids.scenario ?? '00000000-0000-4000-8000-000000000021',
    scenario_revision: 1,
    semantic_key: '',
    deleted_at: null,
    content: { kind: 'AUTHORED', input: authoredInput() },
    current_preparation_id: null,
    execution_ids: [],
    attempt: null,
    last_failure: null,
    last_operation_id: ids.operation ?? '00000000-0000-4000-8000-000000000022',
  };
}
