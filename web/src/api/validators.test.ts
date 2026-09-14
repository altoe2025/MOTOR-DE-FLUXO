import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  validateEffectiveInput,
  validatePreparationRequest,
  validatePreviaRequest,
} from './validators';

const fixturePath = fileURLToPath(
  new URL('../../../contracts/fixtures/reference-request.json', import.meta.url),
);
const authoredFixturePath = fileURLToPath(
  new URL('../../../contracts/fixtures/authored-input.json', import.meta.url),
);

describe('generated runtime validation', () => {
  it('accepts the versioned reference request', () => {
    const payload: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(validatePreviaRequest(payload)).toBe(true);
  });

  it('rejects a JSON number where decimal text is required', () => {
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8'));
    payload.cenario.ordens[0].valor_brl = 10800000;
    expect(validatePreviaRequest(payload)).toBe(false);
  });

  it('validates authored preparation shape without coercing money or seed', () => {
    const payload = JSON.parse(readFileSync(authoredFixturePath, 'utf8'));
    expect(validatePreparationRequest(payload)).toBe(true);
    expect(validateEffectiveInput(payload.input)).toBe(true);

    payload.input.participants[0].monthly_volume_brl = 10000;
    payload.input.participants[0].seed = 1;
    expect(validatePreparationRequest(payload)).toBe(false);
  });
});
