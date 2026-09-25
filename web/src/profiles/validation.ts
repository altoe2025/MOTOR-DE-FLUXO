import type { ErrorObject } from 'ajv';
import { validateSchema } from '../generated/validators/profiles.js';

import type { ProfileValidation, ProfileValidationIssue } from './domain';
import { fingerprintOperationalProfile, fingerprintProfileSelection } from './fingerprints';

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
