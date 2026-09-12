import { describe, expect, it } from 'vitest';

import { formatBps, formatDays, formatFraction, formatMoney } from './format';

describe('presentation formatting', () => {
  it('rounds decimal text with HALF_UP and explicit units', () => {
    expect(formatMoney('1234.565')).toBe('R$\u00a01.234,57');
    expect(formatFraction('0.5882352941176471')).toBe('58,82%');
    expect(formatBps('25')).toBe('25,00 bps');
    expect(formatDays(2)).toBe('2 dias');
    expect(formatDays(1)).toBe('1 dia');
  });

  it('does not expose negative zero or lose large integer precision', () => {
    expect(formatMoney('-0.004')).toBe('R$\u00a00,00');
    expect(formatMoney('12345678901234567890.125')).toBe(
      'R$\u00a012.345.678.901.234.567.890,13',
    );
  });

  it('renders absence explicitly', () => {
    expect(formatMoney(null)).toBe('Não disponível');
    expect(formatFraction(null)).toBe('Não disponível');
    expect(formatBps(null)).toBe('Não disponível');
  });
});
