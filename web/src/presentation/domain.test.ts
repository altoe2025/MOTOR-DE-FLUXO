import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommunicationMetric } from '../communication/domain';
import { formatCommunicationMetric } from './domain';

function metric(unit: CommunicationMetric['unit'], value: string | null): CommunicationMetric {
  return { code: 'TEST', label: 'Teste', availability: value === null ? 'UNAVAILABLE' : 'AVAILABLE',
    value, unit, meaning: 'Teste', evidenceRefs: ['DIAGNOSTIC:/test'] };
}

describe('contrato de apresentação', () => {
  it.each([
    ['BRL', '-12345678901234567890.125', 'R$ -12.345.678.901.234.567.890,13'],
    ['FRACTION', '0.5822', '58,22%'],
    ['BPS', '25.125', '25,13 bps'],
    ['DAYS', '1', '1 dia'],
    ['DAYS', '1.5', '1,5 dias'],
    ['COUNT', '30', '30'],
    ['TEXT', '1.234', '1.234'],
    ['BRL', null, 'Não disponível'],
  ] as const)('apresenta %s sem converter o decimal publicado em Number', (unit, value, expected) => {
    expect(formatCommunicationMetric(metric(unit, value))).toBe(expected);
  });

  it('mantém os componentes sem conversão, agregação ou aritmética financeira', () => {
    const files = ['DocumentItems', 'PresentationHeader', 'ExecutiveSummary', 'CompositionSection',
      'ComparisonSection', 'ReplayHighlightsSection', 'AssumptionsSection', 'LimitationsSection'];
    for (const file of files) {
      const source = readFileSync(new URL(`./components/${file}.tsx`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/\bNumber\s*\(|\bparseFloat\s*\(|\.reduce\s*\(|\.plus\s*\(|\.minus\s*\(|\.times\s*\(|\.div\s*\(/);
    }
  });
});
