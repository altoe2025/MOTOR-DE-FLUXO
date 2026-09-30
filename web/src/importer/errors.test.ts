import { describe, expect, it } from 'vitest';

import { humanMessage } from './errors';

describe('humanMessage', () => {
  it('tira o código técnico do começo da mensagem', () => {
    expect(humanMessage('DIRECTION_INVALID: Use OUT ou IN.')).toBe('Use OUT ou IN.');
    expect(humanMessage('Sem código.')).toBe('Sem código.');
  });
});
