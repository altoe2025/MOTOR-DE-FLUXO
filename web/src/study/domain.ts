import type {
  AuthoredInput, CostKey, DraftField, EffectiveInput, FieldIssue, FieldKey,
  IdFactory, ProfileId, Source, StudyDocument, UTC, Validation,
} from './model';
import { validateAuthoredInput, validateStudyDocument } from './validation';

const PROFILE_IDS = new Set<ProfileId>([
  'remessa_outbound_massiva', 'psp_inbound', 'cripto_native_sem_fiat',
  'payroll_fornecedor', 'exportador', 'tesouraria_corporativa',
]);
const FIELD_KEYS: FieldKey[] = [
  'profile', 'monthly_volume_brl', 'ticket_median_brl', 'out_fraction',
  'deadline_mode', 'deadline_days', 'eh_efx', 'purpose_out', 'purpose_in',
];
const COST_KEYS: CostKey[] = [
  'iof_out', 'iof_in', 'carry_cnr', 'spread_rail_bps', 'custo_fixo_remessa',
  'custo_oportunidade_aa', 'ptax',
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(,[0-9]+)?$/;

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type DecimalParts = { integer: bigint; scale: number };

function addIssue(issues: FieldIssue[], path: string, code: FieldIssue['code'], message: string): void {
  issues.push({ path, code, message });
}

function decimalParts(value: string): DecimalParts {
  const [whole = '0', fraction = ''] = value.split('.');
  return { integer: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function compareDecimal(left: DecimalParts, right: DecimalParts): number {
  const scale = Math.max(left.scale, right.scale);
  const a = left.integer * (10n ** BigInt(scale - left.scale));
  const b = right.integer * (10n ** BigInt(scale - right.scale));
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseDecimal(
  field: DraftField,
  path: string,
  issues: FieldIssue[],
  limits: { minimum: string; maximum: string; decimals: number; exclusiveMinimum?: boolean },
): string | null {
  if (field.raw === '') {
    addIssue(issues, path, 'OBRIGATORIO', 'Informe um valor.');
    return null;
  }
  if (!DECIMAL_PATTERN.test(field.raw)) {
    addIssue(issues, path, 'DECIMAL_INVALIDO', 'Use dígitos e vírgula decimal, sem expoente ou milhar.');
    return null;
  }
  const [whole = '0', fraction = ''] = field.raw.split(',');
  if (fraction.length > limits.decimals) {
    addIssue(issues, path, 'DECIMAL_INVALIDO', 'Valor possui casas decimais demais.');
    return null;
  }
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  const normalizedFraction = fraction.replace(/0+$/, '');
  const canonical = normalizedFraction === '' ? normalizedWhole : `${normalizedWhole}.${normalizedFraction}`;
  const value = decimalParts(canonical);
  const minimum = decimalParts(limits.minimum);
  const maximum = decimalParts(limits.maximum);
  if (compareDecimal(value, minimum) < 0
    || (limits.exclusiveMinimum === true && compareDecimal(value, minimum) === 0)
    || compareDecimal(value, maximum) > 0) {
    addIssue(issues, path, 'FORA_DO_LIMITE', 'Valor fora do intervalo permitido.');
    return null;
  }
  return canonical;
}

function parseInteger(
  field: DraftField,
  path: string,
  issues: FieldIssue[],
  minimum: number,
  maximum: number,
): number | null {
  if (field.raw === '') {
    addIssue(issues, path, 'OBRIGATORIO', 'Informe um valor.');
    return null;
  }
  if (!INTEGER_PATTERN.test(field.raw)) {
    addIssue(issues, path, 'INTEIRO_INVALIDO', 'Use um número inteiro não negativo.');
    return null;
  }
  const value = Number(field.raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    addIssue(issues, path, 'FORA_DO_LIMITE', 'Valor fora do intervalo permitido.');
    return null;
  }
  return value;
}

function validateOrigin(field: DraftField, path: string, issues: FieldIssue[]): Source | null {
  if (field.origin === null) {
    addIssue(issues, path, 'ORIGEM_AUSENTE', 'Informe a origem do valor.');
    return null;
  }
  const { source, recorded_at: recordedAt } = field.origin;
  if (source.length < 1 || source.length > 200 || source.trim() !== source) {
    addIssue(issues, path, 'ORIGEM_INVALIDA', 'Fonte da origem inválida.');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(recordedAt)
    || Number.isNaN(Date.parse(recordedAt))
    || new Date(recordedAt).toISOString().slice(0, 19) !== recordedAt.slice(0, 19)) {
    addIssue(issues, path, 'ORIGEM_INVALIDA', 'Instante da origem deve estar em UTC.');
  }
  return structuredClone(field.origin);
}

function escaped(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function participantPath(id: string, key: FieldKey): string {
  if (key === 'deadline_mode') return `/participants/${id}/deadline/mode`;
  if (key === 'deadline_days') return `/participants/${id}/deadline/days`;
  return `/participants/${id}/${key}`;
}

export function resolveInput(input: AuthoredInput): Validation<EffectiveInput> {
  const structure = validateAuthoredInput(input);
  if (!structure.ok) return structure;
  const issues: FieldIssue[] = [];
  if (!UUID_PATTERN.test(input.portfolio_id)) {
    addIssue(issues, '/portfolio_id', 'REFERENCIA_INVALIDA', 'Identificador inválido.');
  }
  if (input.groups.length > 20) addIssue(issues, '/groups', 'FORA_DO_LIMITE', 'Máximo de 20 grupos.');
  if (input.participants.length > 100) {
    addIssue(issues, '/participants', 'FORA_DO_LIMITE', 'Máximo de 100 participantes.');
  }
  const allIds = [...input.groups.map(({ id }) => id), ...input.participants.map(({ id }) => id),
    ...input.iof_rules.map(({ id }) => id)];
  const seen = new Set<string>();
  for (const id of allIds) {
    if (!UUID_PATTERN.test(id)) addIssue(issues, `/entities/${id}`, 'REFERENCIA_INVALIDA', 'Identificador inválido.');
    if (seen.has(id)) addIssue(issues, `/entities/${id}`, 'DUPLICADO', 'Identificador repetido.');
    seen.add(id);
  }
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  for (const group of input.groups) {
    if (group.name.length < 1 || group.name.length > 120) {
      addIssue(issues, `/groups/${group.id}/name`, group.name === '' ? 'OBRIGATORIO' : 'FORA_DO_LIMITE', 'Informe um nome de grupo válido.');
    }
  }
  if (input.iof_rules.length > 100) addIssue(issues, '/iof_rules', 'FORA_DO_LIMITE', 'Máximo de 100 regras IOF.');
  const sources: EffectiveInput['sources'] = {};
  const participants: EffectiveInput['participants'] = [];

  for (const participant of [...input.participants].sort((a, b) => ordinal(a.id, b.id))) {
    const group = participant.group_id === null ? undefined : groupById.get(participant.group_id);
    if (participant.name.length < 1 || participant.name.length > 120) {
      addIssue(issues, `/participants/${participant.id}/name`, participant.name === '' ? 'OBRIGATORIO' : 'FORA_DO_LIMITE', 'Informe um nome de participante válido.');
    }
    if (participant.group_id !== null && group === undefined) {
      addIssue(issues, `/participants/${participant.id}/group_id`, 'REFERENCIA_INVALIDA', 'Grupo indisponível.');
    }
    if (!INTEGER_PATTERN.test(participant.seed)) {
      addIssue(issues, `/participants/${participant.id}/seed`, 'INTEIRO_INVALIDO', 'Seed deve ser inteiro não negativo.');
    } else if (BigInt(participant.seed) > 9223372036854775807n) {
      addIssue(issues, `/participants/${participant.id}/seed`, 'FORA_DO_LIMITE', 'Seed fora do intervalo permitido.');
    }
    const effective = {} as Record<FieldKey, DraftField | undefined>;
    for (const key of FIELD_KEYS) {
      const slot = participant.fields[key];
      const selected = slot.mode === 'own' ? slot.field : group?.fields[key];
      if (selected === undefined) {
        addIssue(issues, participantPath(participant.id, key), 'REFERENCIA_INVALIDA', 'Grupo indisponível.');
      }
      effective[key] = selected;
    }
    if (FIELD_KEYS.some((key) => effective[key] === undefined)) continue;
    const sourceFor = (key: FieldKey): Source | null => {
      const path = participantPath(participant.id, key);
      const origin = validateOrigin(effective[key]!, path, issues);
      if (origin !== null) sources[path] = origin;
      return origin;
    };
    const profileRaw = effective.profile!.raw;
    sourceFor('profile');
    if (!PROFILE_IDS.has(profileRaw as ProfileId)) {
      addIssue(issues, `/participants/${participant.id}/profile`, 'REFERENCIA_INVALIDA', 'Perfil não reconhecido.');
    }
    const monthly = parseDecimal(effective.monthly_volume_brl!, participantPath(participant.id, 'monthly_volume_brl'), issues,
      { minimum: '0', maximum: '1000000000000', decimals: 6, exclusiveMinimum: true });
    sourceFor('monthly_volume_brl');
    const ticket = parseDecimal(effective.ticket_median_brl!, participantPath(participant.id, 'ticket_median_brl'), issues,
      { minimum: '0.01', maximum: '1000000000000', decimals: 6 });
    sourceFor('ticket_median_brl');
    const fraction = parseDecimal(effective.out_fraction!, participantPath(participant.id, 'out_fraction'), issues,
      { minimum: '0', maximum: '1', decimals: 12 });
    sourceFor('out_fraction');
    const deadlineMode = effective.deadline_mode!.raw;
    sourceFor('deadline_mode');
    if (deadlineMode !== 'PROFILE' && deadlineMode !== 'FIXED') {
      addIssue(issues, participantPath(participant.id, 'deadline_mode'), 'REFERENCIA_INVALIDA', 'Modo de prazo inválido.');
    }
    let deadline: EffectiveInput['participants'][number]['deadline'] = { mode: 'PROFILE' };
    if (deadlineMode === 'FIXED') {
      const days = parseInteger(effective.deadline_days!, participantPath(participant.id, 'deadline_days'), issues, 0, 365);
      sourceFor('deadline_days');
      if (days !== null) deadline = { mode: 'FIXED', days };
    }
    const efxRaw = effective.eh_efx!.raw;
    sourceFor('eh_efx');
    if (efxRaw !== 'true' && efxRaw !== 'false') {
      addIssue(issues, participantPath(participant.id, 'eh_efx'), 'REFERENCIA_INVALIDA', 'Use true ou false.');
    }
    const purposeOut = effective.purpose_out!.raw;
    const purposeIn = effective.purpose_in!.raw;
    sourceFor('purpose_out');
    sourceFor('purpose_in');
    for (const [key, value] of [['purpose_out', purposeOut], ['purpose_in', purposeIn]] as const) {
      if (value.length < 1 || value.length > 128 || value.trim() !== value) {
        addIssue(issues, `/participants/${participant.id}/${key}`, value === '' ? 'OBRIGATORIO' : 'REFERENCIA_INVALIDA', 'Finalidade inválida.');
      }
    }
    if (monthly !== null && ticket !== null && fraction !== null && PROFILE_IDS.has(profileRaw as ProfileId)
      && (deadlineMode === 'PROFILE' || (deadlineMode === 'FIXED' && deadline.mode === 'FIXED'))
      && (efxRaw === 'true' || efxRaw === 'false') && purposeOut.trim() === purposeOut
      && purposeOut !== '' && purposeIn.trim() === purposeIn && purposeIn !== '') {
      participants.push({
        id: participant.id,
        profile: profileRaw as ProfileId,
        seed: participant.seed,
        monthly_volume_brl: monthly,
        ticket_median_brl: ticket,
        out_fraction: fraction,
        deadline,
        eh_efx: efxRaw === 'true',
        purpose_out: purposeOut,
        purpose_in: purposeIn,
      });
    }
  }

  const costs = {} as Record<CostKey, string>;
  const costLimits: Record<CostKey, { minimum: string; maximum: string; decimals: number; exclusiveMinimum?: boolean }> = {
    iof_out: { minimum: '0', maximum: '1', decimals: 12 },
    iof_in: { minimum: '0', maximum: '1', decimals: 12 },
    carry_cnr: { minimum: '0', maximum: '1', decimals: 12 },
    spread_rail_bps: { minimum: '0', maximum: '10000', decimals: 12 },
    custo_fixo_remessa: { minimum: '0', maximum: '1000000000000', decimals: 6 },
    custo_oportunidade_aa: { minimum: '0', maximum: '1', decimals: 12 },
    ptax: { minimum: '0', maximum: '1000000', decimals: 12, exclusiveMinimum: true },
  };
  for (const key of COST_KEYS) {
    const path = `/costs/${key}`;
    const value = parseDecimal(input.costs[key], path, issues, costLimits[key]);
    const origin = validateOrigin(input.costs[key], path, issues);
    if (value !== null) costs[key] = value;
    if (origin !== null) sources[path] = origin;
  }
  const rules: EffectiveInput['costs']['iof_por_finalidade'] = [];
  const ruleKeys = new Set<string>();
  for (const rule of [...input.iof_rules].sort((a, b) => ordinal(
    `${a.purpose.raw}\0${a.direction.raw}`, `${b.purpose.raw}\0${b.direction.raw}`,
  ))) {
    const purpose = rule.purpose.raw;
    const direction = rule.direction.raw;
    const path = `/costs/iof_por_finalidade/${escaped(purpose)}/${direction}`;
    const rate = parseDecimal(rule.rate, path, issues, { minimum: '0', maximum: '1', decimals: 12 });
    const origin = validateOrigin(rule.rate, path, issues);
    validateOrigin(rule.purpose, `/iof_rules/${rule.id}/purpose`, issues);
    validateOrigin(rule.direction, `/iof_rules/${rule.id}/direction`, issues);
    if (purpose.length < 1 || purpose.length > 128 || purpose.trim() !== purpose) {
      addIssue(issues, `/iof_rules/${rule.id}/purpose`, purpose === '' ? 'OBRIGATORIO' : 'REFERENCIA_INVALIDA', 'Finalidade inválida.');
    }
    if (direction !== 'OUT' && direction !== 'IN') {
      addIssue(issues, `/iof_rules/${rule.id}/direction`, 'REFERENCIA_INVALIDA', 'Direção inválida.');
    }
    const key = `${purpose}\0${direction}`;
    if (ruleKeys.has(key)) addIssue(issues, `/iof_rules/${rule.id}`, 'DUPLICADO', 'Regra IOF repetida.');
    ruleKeys.add(key);
    if (rate !== null && origin !== null && (direction === 'OUT' || direction === 'IN')) {
      rules.push({ finalidade: purpose, direcao: direction, aliquota: rate });
      sources[path] = origin;
    }
  }
  const warmup = parseInteger(input.warmup_days, '/warmup_days', issues, 0, 365);
  const measurement = parseInteger(input.measurement_days, '/measurement_days', issues, 1, 365);
  const window = parseInteger(input.window_days, '/window_days', issues, 1, 730);
  for (const [path, value] of [
    ['/warmup_days', input.warmup_days], ['/measurement_days', input.measurement_days],
    ['/window_days', input.window_days],
  ] as const) {
    const origin = validateOrigin(value, path, issues);
    if (origin !== null) sources[path] = origin;
  }
  if (warmup !== null && measurement !== null && warmup + measurement > 730) {
    addIssue(issues, '/measurement_days', 'FORA_DO_LIMITE', 'Período total excede 730 dias.');
  }
  if (!Number.isSafeInteger(input.repetition)) {
    addIssue(issues, '/repetition', 'INTEIRO_INVALIDO', 'Repetição inválida.');
  } else if (input.repetition < 1) {
    addIssue(issues, '/repetition', 'FORA_DO_LIMITE', 'Repetição inválida.');
  }
  if (issues.length > 0 || warmup === null || measurement === null || window === null
    || COST_KEYS.some((key) => costs[key] === undefined)) return { ok: false, issues };
  return {
    ok: true,
    value: {
      participants,
      costs: { ...costs, iof_por_finalidade: rules },
      warmup_days: warmup,
      measurement_days: measurement,
      window_days: window,
      sources,
    },
  };
}

export function duplicateStudy(
  study: StudyDocument,
  now: UTC,
  ids: IdFactory,
): StudyDocument {
  if (!validateStudyDocument(study).ok) throw new Error('Documento inválido para duplicação.');
  const duplicate = structuredClone(study);
  duplicate.id = ids();
  duplicate.scenario_id = ids();
  duplicate.created_at = now;
  duplicate.updated_at = now;
  duplicate.created_by = study.scope.owner_sub;
  duplicate.updated_by = study.scope.owner_sub;
  duplicate.revision = 1;
  duplicate.scenario_revision = 1;
  duplicate.semantic_key = '';
  duplicate.deleted_at = null;
  duplicate.current_preparation_id = null;
  duplicate.execution_ids = [];
  duplicate.attempt = null;
  duplicate.last_failure = null;
  if (duplicate.content.kind === 'AUTHORED') {
    duplicate.content.input.portfolio_id = ids();
    const groupIds = new Map<string, string>();
    for (const group of duplicate.content.input.groups) {
      const next = ids();
      groupIds.set(group.id, next);
      group.id = next;
    }
    for (const participant of duplicate.content.input.participants) {
      participant.id = ids();
      if (participant.group_id !== null) {
        participant.group_id = groupIds.get(participant.group_id) ?? null;
      }
    }
    for (const rule of duplicate.content.input.iof_rules) rule.id = ids();
  }
  duplicate.last_operation_id = ids();
  if (!validateStudyDocument(duplicate).ok) throw new Error('IDs ou instante inválidos para duplicação.');
  return duplicate;
}
