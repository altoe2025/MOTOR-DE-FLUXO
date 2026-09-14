import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import httpSchemas from '../api/schemas.json';
import type { AuthoredInput, ExecutionRecord, PreparationRecord, FieldIssue, StudyDocument, Validation } from './model';
import studySchema from './study.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(httpSchemas);
const validateSchema: ValidateFunction<StudyDocument> = ajv.compile(studySchema);
const validateInputSchema: ValidateFunction<AuthoredInput> = ajv.compile({
  $ref: `${studySchema.$id}#/$defs/AuthoredInput`,
});

export function validateAuthoredInput(value: unknown): Validation<AuthoredInput> {
  if (!validateInputSchema(value)) {
    return { ok: false, issues: (validateInputSchema.errors ?? []).map(schemaIssue) };
  }
  return { ok: true, value };
}
export const validatePreparationRecord: ValidateFunction<PreparationRecord> = ajv.compile({
  $ref: `${studySchema.$id}#/$defs/PreparationRecord`,
});
export const validateExecutionRecord: ValidateFunction<ExecutionRecord> = ajv.compile({
  $ref: `${studySchema.$id}#/$defs/ExecutionRecord`,
});

function schemaIssue(error: ErrorObject): FieldIssue {
  return {
    path: error.instancePath === '' ? '/' : error.instancePath,
    code: error.instancePath.includes('/origin') ? 'ORIGEM_INVALIDA'
      : error.keyword === 'required' ? 'OBRIGATORIO'
        : error.keyword === 'maxItems' || error.keyword === 'maxLength' ? 'FORA_DO_LIMITE'
          : 'REFERENCIA_INVALIDA',
    message: 'Documento de estudo inválido.',
  };
}

export function validateStudyDocument(value: unknown): Validation<StudyDocument> {
  if (!validateSchema(value)) {
    return { ok: false, issues: (validateSchema.errors ?? []).map(schemaIssue) };
  }
  const issues: FieldIssue[] = [];
  if (value.scope.project_ref.trim() !== value.scope.project_ref
    || value.created_by !== value.scope.owner_sub || value.updated_by !== value.scope.owner_sub) {
    issues.push({ path: '/scope', code: 'REFERENCIA_INVALIDA', message: 'Escopo do documento inválido.' });
  }
  if (value.content.kind === 'AUTHORED') {
    const input = value.content.input;
    const ids = [...input.groups.map(({ id }) => id), ...input.participants.map(({ id }) => id),
      ...input.iof_rules.map(({ id }) => id)];
    if (new Set(ids).size !== ids.length) {
      issues.push({ path: '/content/input', code: 'DUPLICADO', message: 'Identificador repetido.' });
    }
    const groupIds = new Set(input.groups.map(({ id }) => id));
    for (const participant of input.participants) {
      if (participant.group_id !== null && !groupIds.has(participant.group_id)) {
        issues.push({ path: `/content/input/participants/${participant.id}/group_id`,
          code: 'REFERENCIA_INVALIDA', message: 'Grupo indisponível.' });
      }
      if (participant.group_id === null
        && Object.values(participant.fields).some((slot) => slot.mode === 'inherit')) {
        issues.push({ path: `/content/input/participants/${participant.id}/fields`,
          code: 'REFERENCIA_INVALIDA', message: 'Participante sem grupo não pode herdar.' });
      }
    }
  }
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}
