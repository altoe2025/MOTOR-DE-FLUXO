import { describe, expect, it } from 'vitest';

import {
  chartPresentation,
  evidencePresentation,
  type ChartSeries,
} from './presentation';

describe('apresentação do diagnóstico', () => {
  it('usa uma única série como fonte do gráfico e da tabela', () => {
    const series: ChartSeries = {
      name: 'Economia por repetição',
      unit: 'BRL',
      points: [
        { label: 'R-01', value: '100.25' },
        { label: 'R-02', value: '80.75' },
      ],
    };

    const result = chartPresentation(series);

    expect(result.option.xAxis).toMatchObject({ data: ['R-01', 'R-02'] });
    expect(result.option.series).toEqual([
      expect.objectContaining({ data: ['100.25', '80.75'], name: 'Economia por repetição' }),
    ]);
    expect(result.rows).toEqual([
      { label: 'R-01', value: '100.25' },
      { label: 'R-02', value: '80.75' },
    ]);
  });

  it('preserva decimal canônico além da precisão segura no gráfico e na tabela', () => {
    const canonical = '9007199254740993.01';
    const result = chartPresentation({
      name: 'Economia por repetição',
      unit: 'BRL',
      points: [{ label: 'R-01', value: canonical }],
    });

    expect(result.option.series[0]?.data).toEqual([canonical]);
    expect(result.rows).toEqual([{ label: 'R-01', value: canonical }]);
  });

  it('não fabrica zero nem série para evidência indisponível', () => {
    expect(evidencePresentation({
      state: 'INSUFFICIENT_COVERAGE',
      reason: 'FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION',
      evidence: [],
    }, 'BRL')).toEqual({
      state: 'UNAVAILABLE',
      label: 'Cobertura insuficiente',
      reason: 'FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION',
      evidence: [],
    });
  });

  it('formata somente o valor existente e preserva a evidência canônica', () => {
    const result = evidencePresentation({
      state: 'AVAILABLE', value: '0.5882', evidence: ['axes/policy_capture/captured_fraction'],
    }, 'FRACTION');

    expect(result).toEqual({
      state: 'AVAILABLE',
      raw: '0.5882',
      formatted: '58,82%',
      evidence: ['axes/policy_capture/captured_fraction'],
    });
  });
});
