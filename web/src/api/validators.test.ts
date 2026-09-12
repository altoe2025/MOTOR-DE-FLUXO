import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { validatePreviaRequest } from './validators';

const fixturePath = fileURLToPath(
  new URL('../../../contracts/fixtures/reference-request.json', import.meta.url),
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
});
