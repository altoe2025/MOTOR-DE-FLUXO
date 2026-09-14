import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import httpSchemas from '../api/schemas.json';
import studySchema from './study.schema.json';

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
ajv.addSchema(httpSchemas);
ajv.addSchema(studySchema);

describe('study.schema.json', () => {
  it.each(['PreparationRecord', 'ExecutionRecord', 'OriginalRecord', 'MigrationMarker', 'OwnerMeta', 'StoredRecord'])(
    'expõe o contrato fechado %s', (name) => {
      const validate = ajv.getSchema(`${studySchema.$id}#/$defs/${name}`);
      expect(validate, `schema ${name}`).toBeTypeOf('function');
    },
  );

  it('mantém original_json como texto opaco e fecha o registro', () => {
    const validate = ajv.getSchema(`${studySchema.$id}#/$defs/OriginalRecord`)!;
    const record = {
      id: 'legacy:key', study_id: '00000000-0000-4000-8000-000000000020',
      source_version: '1.0.0', captured_at: '2026-09-13T00:00:00Z',
      original_json: '{"__proto__":{"polluted":true}}',
    };
    expect(validate(record)).toBe(true);
    expect(validate({ ...record, parsed: {} })).toBe(false);
  });
});
