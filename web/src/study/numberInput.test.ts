import { describe, expect, it } from 'vitest';

import { fractionToPercentText, parseBrlInput, parseDecimalInput, parsePercentInput, plainToBrText } from './numberInput';

describe('parsePercentInput', () => {
  it('converte percentual com vírgula brasileira em fração', () => {
    expect(parsePercentInput('3,5')).toEqual({ ok: true, value: '0.035' });
    expect(parsePercentInput('0,04')).toEqual({ ok: true, value: '0.0004' });
    expect(parsePercentInput('0,38')).toEqual({ ok: true, value: '0.0038' });
  });

  it('aceita ponto, sinal de % e espaços externos', () => {
    expect(parsePercentInput('3.5')).toEqual({ ok: true, value: '0.035' });
    expect(parsePercentInput(' 3,5 % ')).toEqual({ ok: true, value: '0.035' });
  });

  it('não sofre erro de ponto flutuante', () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004; em fração 0,3% é 0.003 exato.
    expect(parsePercentInput('0,3')).toEqual({ ok: true, value: '0.003' });
    expect(parsePercentInput('1,1')).toEqual({ ok: true, value: '0.011' });
    expect(parsePercentInput('0,07')).toEqual({ ok: true, value: '0.0007' });
  });

  it('aceita zero e rejeita negativo, vazio, milhar ambíguo e texto', () => {
    expect(parsePercentInput('0')).toEqual({ ok: true, value: '0' });
    for (const text of ['-1', '', 'abc', '1,2,3', '3,5,', '1e3']) {
      expect(parsePercentInput(text).ok).toBe(false);
    }
  });

  it('explica como corrigir', () => {
    const result = parsePercentInput('3;5');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/3,5/);
  });

  it('faz ida e volta com a fração armazenada', () => {
    for (const stored of ['0.035', '0.0038', '0.0004', '0', '0.1']) {
      const parsed = parsePercentInput(fractionToPercentText(stored));
      expect(parsed).toEqual({ ok: true, value: stored });
    }
  });
});

describe('fractionToPercentText', () => {
  it('mostra frações salvas como percentual brasileiro', () => {
    expect(fractionToPercentText('0.035')).toBe('3,5');
    expect(fractionToPercentText('0.0004')).toBe('0,04');
    expect(fractionToPercentText('0')).toBe('0');
  });

  it('devolve o texto original quando não é número (rascunho inválido antigo)', () => {
    expect(fractionToPercentText('abc')).toBe('abc');
  });
});

describe('parseBrlInput', () => {
  it('preserva os dígitos digitados, trocando só a notação', () => {
    expect(parseBrlInput('1500.50')).toEqual({ ok: true, value: '1500.50' });
  });

  it('aceita reais com vírgula, R$ e separador de milhar', () => {
    expect(parseBrlInput('40,00')).toEqual({ ok: true, value: '40.00' });
    expect(parseBrlInput('R$ 1.234,56')).toEqual({ ok: true, value: '1234.56' });
    expect(parseBrlInput('100000')).toEqual({ ok: true, value: '100000' });
    expect(parseBrlInput('100.000')).toEqual({ ok: true, value: '100000' });
    expect(parseBrlInput('12.5')).toEqual({ ok: true, value: '12.5' });
  });

  it('rejeita negativo e texto', () => {
    expect(parseBrlInput('-3').ok).toBe(false);
    expect(parseBrlInput('quarenta').ok).toBe(false);
  });
});

describe('parseDecimalInput', () => {
  it('aceita vírgula ou ponto como decimal', () => {
    expect(parseDecimalInput('5,40')).toEqual({ ok: true, value: '5.40' });
    expect(parseDecimalInput('5.4000')).toEqual({ ok: true, value: '5.4000' });
    expect(parseDecimalInput('25')).toEqual({ ok: true, value: '25' });
    expect(parseDecimalInput('x').ok).toBe(false);
  });
});

describe('plainToBrText', () => {
  it('mostra decimal armazenado com vírgula', () => {
    expect(plainToBrText('5.4')).toBe('5,4');
    expect(plainToBrText('40')).toBe('40');
  });
});
