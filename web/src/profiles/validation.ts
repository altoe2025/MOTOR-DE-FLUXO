import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import observedCaseSchema from '../cases/observedCase.schema.json';
import type { OperationalProfileVersion, ProfileValidation, ProfileValidationIssue } from './domain';
import { fingerprintOperationalProfile, fingerprintProfileSelection } from './fingerprints';
import operationalProfileSchema from './operationalProfile.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(observedCaseSchema);
const validateSchema: ValidateFunction<OperationalProfileVersion> = ajv.compile(operationalProfileSchema);

function schemaIssue(error: ErrorObject): ProfileValidationIssue {
  return {
    path: error.instancePath === '' ? '/' : error.instancePath,
    code: 'INVALID_STRUCTURE',
    message: 'Perfil Operacional inválido.',
  };
}

export async function validateOperationalProfile(value: unknown): Promise<ProfileValidation> {
  if (!validateSchema(value)) {
    return { ok: false, issues: (validateSchema.errors ?? []).map(schemaIssue) };
  }
  const expectedSelectionFingerprint = await fingerprintProfileSelection(value.selectedCases);
  if (value.selectionFingerprint !== expectedSelectionFingerprint) {
    return {
      ok: false,
      issues: [{
        path: '/selectionFingerprint',
        code: 'SELECTION_FINGERPRINT_MISMATCH',
        message: 'Fingerprint da seleção não corresponde aos casos preservados.',
      }],
    };
  }
  const expectedDocumentFingerprint = await fingerprintOperationalProfile(value);
  if (value.documentFingerprint !== expectedDocumentFingerprint) {
    return {
      ok: false,
      issues: [{
        path: '/documentFingerprint',
        code: 'DOCUMENT_FINGERPRINT_MISMATCH',
        message: 'Fingerprint do documento não corresponde ao conteúdo preservado.',
      }],
    };
  }
  return { ok: true, value };
}
