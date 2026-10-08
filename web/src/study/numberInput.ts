import Decimal from 'decimal.js';

/**
 * Conversão entre o que a pessoa digita (3,5 % · R$ 40,00) e o que o estudo guarda
 * (fração decimal em texto, "0.035"; reais em texto com ponto, "40.00"). O armazenamento não muda:
 * estudos já salvos continuam em fração. Toda conta é em Decimal, sem float.
 */
export type ParsedInput = Readonly<{ ok: true; value: string } | { ok: false; error: string }>;

const PLAIN = /^\d+(?:[.,]\d+)?$/;
const THOUSANDS_WITH_COMMA = /^\d{1,3}(?:\.\d{3})+,\d+$/;
const THOUSANDS_ONLY = /^\d{1,3}(?:\.\d{3})+$/;

function normalizeDecimal(text: string): string | null {
  const trimmed = text.trim();
  if (THOUSANDS_WITH_COMMA.test(trimmed)) return trimmed.replaceAll('.', '').replace(',', '.');
  if (PLAIN.test(trimmed)) return trimmed.replace(',', '.');
  return null;
}

export function parseDecimalInput(text: string, example = '5,40'): ParsedInput {
  const normalized = normalizeDecimal(text);
  if (normalized === null) return { ok: false, error: `Use um número não negativo, com vírgula ou ponto. Ex.: ${example}.` };
  return { ok: true, value: normalized };
}

export function parsePercentInput(text: string): ParsedInput {
  const normalized = normalizeDecimal(text.trim().replace(/\s*%$/, ''));
  if (normalized === null) return { ok: false, error: 'Use um percentual não negativo, com vírgula ou ponto. Ex.: 3,5 para 3,5%.' };
  return { ok: true, value: new Decimal(normalized).div(100).toFixed() };
}

export function parseBrlInput(text: string): ParsedInput {
  const trimmed = text.trim().replace(/^R\$\s*/i, '');
  const normalized = THOUSANDS_ONLY.test(trimmed) ? trimmed.replaceAll('.', '') : normalizeDecimal(trimmed);
  if (normalized === null) return { ok: false, error: 'Use um valor em reais não negativo. Ex.: 40,00 ou 1.234,56.' };
  return { ok: true, value: normalized };
}

/** Texto em notação brasileira para um decimal salvo ("5.4" → "5,4"). */
export function plainToBrText(stored: string): string {
  return /^-?\d+(?:\.\d+)?$/.test(stored) ? stored.replace('.', ',') : stored;
}

/** Fração salva ("0.035") em percentual para edição ("3,5"). */
export function fractionToPercentText(stored: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(stored)) return stored;
  return plainToBrText(new Decimal(stored).times(100).toFixed());
}
