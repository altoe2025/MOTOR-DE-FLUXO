import { formatFraction, formatMoney } from '../presentation/format';

export type MetricUnit = 'BRL' | 'FRACTION' | 'NUMBER' | 'DAYS' | 'MS';
export type EvidenceMetric = Readonly<{
  state: 'AVAILABLE';
  value: string;
  evidence: readonly string[];
}> | Readonly<{
  state: 'NOT_COLLECTED' | 'INSUFFICIENT_COVERAGE' | 'INCOMPATIBLE';
  reason: string;
  evidence: readonly string[];
}>;

export type EvidencePresentation = Readonly<{
  state: 'AVAILABLE'; raw: string; formatted: string; evidence: readonly string[];
}> | Readonly<{
  state: 'UNAVAILABLE'; label: string; reason: string; evidence: readonly string[];
}>;

export type ChartPoint = Readonly<{ label: string; value: string }>;
export type ChartSeries = Readonly<{
  name: string;
  unit: MetricUnit;
  kind?: 'bar' | 'line';
  points: readonly ChartPoint[];
}>;

export type ChartOption = Readonly<{
  animation: boolean;
  aria: Readonly<{ enabled: true; description: string }>;
  grid: Readonly<{ left: number; right: number; top: number; bottom: number }>;
  tooltip: Readonly<{ trigger: 'axis' }>;
  xAxis: Readonly<{ type: 'category'; data: readonly string[] }>;
  yAxis: Readonly<{ type: 'value' }>;
  series: readonly Readonly<{
    type: 'bar' | 'line';
    name: string;
    data: readonly string[];
    label: Readonly<{ show: true; position: 'top' }>;
  }>[];
}>;

const unavailableLabels: Record<Exclude<EvidenceMetric['state'], 'AVAILABLE'>, string> = {
  NOT_COLLECTED: 'Não coletado',
  INSUFFICIENT_COVERAGE: 'Cobertura insuficiente',
  INCOMPATIBLE: 'Incompatível',
};

export function formatMetric(value: string, unit: MetricUnit): string {
  if (unit === 'BRL') return formatMoney(value);
  if (unit === 'FRACTION') return formatFraction(value);
  if (unit === 'DAYS') return `${value.replace('.', ',')} dias`;
  if (unit === 'MS') return `${value.replace('.', ',')} ms`;
  return value.replace('.', ',');
}

export function evidencePresentation(metric: EvidenceMetric, unit: MetricUnit): EvidencePresentation {
  if (metric.state !== 'AVAILABLE') {
    return { state: 'UNAVAILABLE', label: unavailableLabels[metric.state], reason: metric.reason, evidence: metric.evidence };
  }
  return { state: 'AVAILABLE', raw: metric.value, formatted: formatMetric(metric.value, unit), evidence: metric.evidence };
}

export function chartPresentation(series: ChartSeries, animation = true): Readonly<{
  option: ChartOption;
  rows: readonly ChartPoint[];
}> {
  const labels = series.points.map((point) => point.label);
  const values = series.points.map((point) => point.value);
  return {
    option: {
      animation,
      aria: { enabled: true, description: `${series.name}. ${labels.length} pontos; tabela equivalente disponível após o gráfico.` },
      grid: { left: 48, right: 24, top: 32, bottom: 48 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value' },
      series: [{ type: series.kind ?? 'bar', name: series.name, data: values, label: { show: true, position: 'top' } }],
    },
    rows: series.points.map((point) => ({ ...point })),
  };
}
