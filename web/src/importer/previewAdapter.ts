import type { PreviaRequest } from '../api/client';
import { validatePreviaRequest } from '../api/validators';
import { daysBetween } from './dates';
import type {
  EditableField,
  ExecutionAssessment,
  ImportCatalog,
  ImportStudy,
  ImportStudyParameters,
  ISODate,
  ParameterOrigin,
  ProjectedOperation,
} from './domain';

const MAX_REQUEST_BYTES = 1_048_576;

export class PreviewAdapterError extends Error {
  constructor(public readonly code: 'INVALID_ASSESSMENT' | 'INVALID_REQUEST' | 'REQUEST_TOO_LARGE', message: string) {
    super(`${code}: ${message}`);
    this.name = 'PreviewAdapterError';
  }
}

export type ImportedPreviewInput = {
  study: ImportStudy;
  assessment: ExecutionAssessment;
  catalog: ImportCatalog;
  parameters: ImportStudyParameters;
  recut: { start: ISODate; end: ISODate };
  requestId: string;
  scenarioId: string;
  nowUtc: string;
};

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function origin(tipo: ParameterOrigin['tipo'], fonte: string, at: string): ParameterOrigin {
  return { tipo, fonte, registrado_em_utc: at };
}

function editedFields(operation: ProjectedOperation): Set<EditableField> {
  return new Set(operation.audit.edits.map((edit) => edit.field));
}

function operationOrigins(
  target: Record<string, ParameterOrigin>,
  operation: ProjectedOperation,
  index: number,
  nowUtc: string,
): void {
  const edited = editedFields(operation);
  const fields: Array<[string, EditableField]> = [
    ['direcao', 'direction'],
    ['dia_conhecida', 'knownDate'],
    ['dia_limite', 'deadlineDate'],
    ['valor_brl', 'valueBrl'],
    ['finalidade', 'purposeCode'],
  ];
  for (const [output, field] of fields) {
    target[`/ordens/${index}/${output}`] = origin(
      edited.has(field) ? 'ESTIMATIVA_USUARIO' : 'DADO_OBSERVADO',
      edited.has(field) ? 'Valor editado pelo usuário' : 'Célula observada no XLSX importado',
      nowUtc,
    );
  }
  target[`/ordens/${index}/eh_efx`] = origin(
    'NAO_COLETADO',
    'eFX não coletado na importação XLSX',
    nowUtc,
  );
}

export function buildImportedPreviewRequest(input: ImportedPreviewInput): PreviaRequest {
  if (input.assessment.blockers.length > 0 || input.assessment.selected.length === 0) {
    throw new PreviewAdapterError('INVALID_ASSESSMENT', 'avaliação não está executável');
  }
  if (input.assessment.selected.length > 1000) {
    throw new PreviewAdapterError('INVALID_ASSESSMENT', 'limite de 1.000 operações excedido');
  }
  if (input.parameters.catalogVersion !== input.catalog.catalog_version) {
    throw new PreviewAdapterError('INVALID_ASSESSMENT', 'versão do catálogo divergiu');
  }
  const expectedPeriodDays = daysBetween(input.recut.start, input.recut.end) + 1;
  if (
    expectedPeriodDays < 1
    || expectedPeriodDays !== input.assessment.periodDays
  ) {
    throw new PreviewAdapterError(
      'INVALID_ASSESSMENT',
      'recorte diverge do período avaliado',
    );
  }

  const selected = [...input.assessment.selected].sort(
    (left, right) => ordinal(left.operationId, right.operationId),
  );
  const proveniencia: PreviaRequest['proveniencia'] = {};
  const ordens = selected.map((selectedOperation, index) => {
    const operation = selectedOperation.operation;
    operationOrigins(proveniencia, selectedOperation, index, input.nowUtc);
    return {
      id: operation.operationId,
      cliente_id: selectedOperation.canonicalClientId,
      direcao: operation.direction,
      valor_brl: operation.valueBrl,
      dia_conhecida: daysBetween(input.recut.start, operation.knownDate),
      dia_limite: daysBetween(input.recut.start, operation.deadlineDate),
      eh_efx: false,
      finalidade: operation.purposeCode ?? '',
    };
  });

  const usedPairs = new Map<string, { finalidade: string; direcao: 'OUT' | 'IN'; aliquota: string }>();
  for (const order of ordens) {
    const purpose = input.catalog.finalidades.find((item) => item.codigo === order.finalidade);
    const rate = purpose?.aliquotas.find((item) => item.direcao === order.direcao);
    if (rate === undefined) {
      throw new PreviewAdapterError('INVALID_ASSESSMENT', 'finalidade sem alíquota aplicável');
    }
    usedPairs.set(`${order.finalidade}\u0000${order.direcao}`, {
      finalidade: order.finalidade,
      direcao: order.direcao,
      aliquota: rate.aliquota,
    });
  }
  const iofRules = [...usedPairs.values()].sort((left, right) => (
    ordinal(left.finalidade, right.finalidade) || ordinal(left.direcao, right.direcao)
  ));

  for (const [field, fieldOrigin] of Object.entries(input.parameters.fieldOrigins)) {
    if (field !== 'windowDays' && field !== 'iof_por_finalidade') {
      proveniencia[`/custo/${field}`] = { ...fieldOrigin };
    }
  }
  proveniencia['/janela_dias'] = { ...input.parameters.fieldOrigins.windowDays };
  proveniencia['/horizonte_dias'] = origin(
    'DADO_OBSERVADO', 'Recorte confirmado para a execução', input.nowUtc,
  );
  for (const [index] of iofRules.entries()) {
    for (const field of ['finalidade', 'direcao', 'aliquota'] as const) {
      proveniencia[`/custo/iof_por_finalidade/${index}/${field}`] = origin(
        'DADO_OBSERVADO',
        'Regra publicada no catálogo de importação',
        input.catalog.publicado_em_utc,
      );
    }
  }

  const request: PreviaRequest = {
    api_version: '1.0.0',
    request_id: input.requestId,
    study_id: input.study.id,
    scenario_id: input.scenarioId,
    scenario_revision: input.study.revision,
    cenario: {
      ordens,
      janela_dias: input.parameters.windowDays,
      horizonte_dias: input.assessment.periodDays,
      custo: { ...structuredClone(input.parameters.costs), iof_por_finalidade: iofRules },
    },
    periodo: {
      modo: 'NATURAL', dias_aquecimento: 0,
      periodo_medicao_dias: input.assessment.periodDays,
    },
    proveniencia,
  };
  if (!validatePreviaRequest(request)) {
    throw new PreviewAdapterError('INVALID_REQUEST', 'request não passou pelo schema canônico');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  if (bytes > MAX_REQUEST_BYTES) {
    throw new PreviewAdapterError('REQUEST_TOO_LARGE', 'request excede 1 MiB');
  }
  return request;
}
