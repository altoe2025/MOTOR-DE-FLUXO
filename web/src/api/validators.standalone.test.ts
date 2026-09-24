import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { expect, it } from 'vitest';
import schemas from './schemas.json';
import * as validators from '../generated/validators/api.js';

it('preserves the previous API schema validation errors, including schema paths', () => {
  const ajv = new Ajv2020({ coerceTypes: false, removeAdditional: false, useDefaults: false });
  addFormats(ajv);
  ajv.addSchema(schemas);
  const names = {
    validatePreviaRequest: 'PreviaRequest', validatePreviewEnvelope: 'PreviewEnvelope',
    validateReferenceExample: 'ReferenceExample', validatePreparationRequest: 'PreparationRequest',
    validatePreparationResponse: 'PreparationResponse', validateDiagnosticRequestShape: 'DiagnosticRequest',
    validateJobSnapshot: 'JobSnapshot', validateDiagnosticEnvelope: 'DiagnosticEnvelope',
    validateReplayRequest: 'ReplayRequestV1', validateReplayDocument: 'ReplayDocumentV1',
    validateCatalogoImportacao: 'CatalogoImportacao', validateProductHelpCatalogV1: 'ProductHelpCatalogV1',
    validateChatRequestV1: 'ChatRequestV1', validateChatResponseV1: 'ChatResponseV1',
  } as const;
  for (const [name, definition] of Object.entries(names)) {
    const previous = ajv.compile({ $ref: `${schemas.$id}#/$defs/${definition}` });
    const standalone = validators[name as keyof typeof names];
    for (const value of [{}, null, { api_version: 'wrong' }]) {
      expect(standalone(value)).toBe(previous(value));
      expect(standalone.errors).toEqual(previous.errors);
    }
  }
});

it('preserves nested API error paths when documents share generated definitions', () => {
  const ajv = new Ajv2020({ coerceTypes: false, removeAdditional: false, useDefaults: false });
  addFormats(ajv);
  ajv.addSchema(schemas);
  const previous = ajv.compile({ $ref: `${schemas.$id}#/$defs/PreviaRequest` });
  const reference = JSON.parse(readFileSync(
    new URL('../../../contracts/fixtures/reference-request.json', import.meta.url), 'utf8',
  ));
  const variants = [
    reference,
    { ...reference, cenario: { ...reference.cenario, ordens: [{ ...reference.cenario.ordens[0], valor_brl: 17 }] } },
    { ...reference, cenario: { ...reference.cenario, ordens: [{ ...reference.cenario.ordens[0], direcao: 'invalid' }] } },
    { ...reference, periodo: { modo: 'invalid' } },
    { ...reference, proveniencia: { '/custo/ptax': { ...reference.proveniencia['/custo/ptax'], registrado_em_utc: 'invalid' } } },
  ];
  for (const value of variants) {
    expect(validators.validatePreviaRequest(value)).toBe(previous(value));
    expect(validators.validatePreviaRequest.errors).toEqual(previous.errors);
  }
});
