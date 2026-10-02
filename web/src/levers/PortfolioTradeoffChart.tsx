import Decimal from 'decimal.js';
import { useEffect, useRef } from 'react';
import { ScatterChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

import type { PortfolioMetrics } from './portfolioAnalysis';

echarts.use([ScatterChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer]);

type Props = Readonly<{
  candidates: readonly PortfolioMetrics[];
  frontierIds: ReadonlySet<string>;
  selectedScenarioId: string | null;
  winnerScenarioId: string | null;
  onSelect: (scenarioId: string) => void;
}>;

function finiteNumber(value: Decimal): number {
  const projected = value.toNumber();
  if (Number.isFinite(projected)) return projected;
  return value.isNegative() ? -Number.MAX_VALUE : Number.MAX_VALUE;
}

function visualWait(row: PortfolioMetrics): number {
  const Exact = Decimal.clone({ precision: row.weightedWait.length + row.volume.length + 20 });
  return finiteNumber(new Exact(row.weightedWait).div(row.volume));
}

function visualVolumeSize(volume: string, largest: Decimal): number {
  const Ratio = Decimal.clone({ precision: volume.length + largest.toFixed().length + 20 });
  const relative = new Ratio(volume).div(largest).toNumber();
  return Math.max(10, Math.min(36, Math.sqrt(relative) * 36));
}

function statuses(row: PortfolioMetrics, frontierIds: ReadonlySet<string>, selectedId: string | null, winnerId: string | null): string[] {
  const labels: string[] = [];
  if (row.scenarioId === selectedId) labels.push('Selecionada');
  if (row.scenarioId === winnerId) labels.push('Recomendada');
  if (frontierIds.has(row.scenarioId)) labels.push('Fronteira');
  return labels;
}

function chartSymbol(row: PortfolioMetrics, selectedId: string | null, winnerId: string | null, frontierIds: ReadonlySet<string>) {
  if (row.scenarioId === selectedId) return 'diamond';
  if (row.scenarioId === winnerId) return 'triangle';
  return frontierIds.has(row.scenarioId) ? 'circle' : 'rect';
}

/** Rich-text tooltips never create HTML nodes; braces cannot become ECharts rich-text directives. */
function plainRichText(value: string): string {
  return value.replace(/[{}|]/g, character => ({ '{': '｛', '}': '｝', '|': '｜' })[character]!);
}

export function PortfolioTradeoffChart({ candidates, frontierIds, selectedScenarioId, winnerScenarioId, onSelect }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const interactionRef = useRef({ candidates, onSelect });
  useEffect(() => {
    interactionRef.current = { candidates, onSelect };
  }, [candidates, onSelect]);
  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return undefined;
    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    chart.on('click', params => {
      const { candidates: currentCandidates, onSelect: currentOnSelect } = interactionRef.current;
      const row = currentCandidates[params.dataIndex];
      if (params.componentType === 'series' && row !== undefined) currentOnSelect(row.scenarioId);
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => chart.resize());
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      chartRef.current = null;
      chart.dispose();
    };
  }, []);
  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const largest = candidates.reduce((maximum, row) => Decimal.max(maximum, row.volume), new Decimal(0));
    const data = candidates.map(row => ({
      value: [visualWait(row), finiteNumber(new Decimal(row.savings)), finiteNumber(new Decimal(row.volume))],
      symbolSize: largest.isZero() ? 10 : visualVolumeSize(row.volume, largest),
      symbol: chartSymbol(row, selectedScenarioId, winnerScenarioId, frontierIds),
      itemStyle: {
        color: frontierIds.has(row.scenarioId) ? '#207969' : '#7a8b9a',
        borderColor: row.scenarioId === selectedScenarioId ? '#162938' : '#ffffff',
        borderWidth: row.scenarioId === selectedScenarioId ? 3 : 1,
      },
    }));
    chart.setOption({
      animation: !reducedMotion,
      aria: { enabled: true, description: 'Espera média em dias no eixo horizontal e economia total em reais no eixo vertical. A tabela seguinte contém todos os pontos e permite seleção por teclado.' },
      grid: { left: 64, right: 24, top: 24, bottom: 52, containLabel: true },
      xAxis: { type: 'value', name: 'Espera média (dias)', min: 0 },
      yAxis: { type: 'value', name: 'Economia (R$)' },
      tooltip: {
        trigger: 'item', renderMode: 'richText', confine: true,
        formatter: (params: { dataIndex?: number }) => {
          const row = candidates[params.dataIndex ?? -1];
          if (row === undefined) return '';
          return `${plainRichText(row.name)}\nEspera exata: ${row.weightedWait} ÷ ${row.volume} dias\nEconomia: R$ ${row.savings}\nVolume: R$ ${row.volume}`;
        },
      },
      series: [{ type: 'scatter', data }],
    });
  }, [candidates, frontierIds, selectedScenarioId, winnerScenarioId]);

  return <section aria-label="Relação entre espera e economia">
    <p>Área dos pontos proporcional ao volume; diâmetro limitado entre 10 e 36 px. Losango: selecionada; triângulo: recomendada; círculo: fronteira; quadrado: demais.</p>
    <div ref={elementRef} role="img" aria-label="Gráfico de espera média e economia; todos os pontos estão na tabela seguinte." style={{ width: '100%', height: 320 }} />
    <div className="table-scroll" role="region" tabIndex={0} aria-label="Dados do gráfico e seleção de carteiras">
      <table className="company-table">
        <caption>Dados do gráfico: carteiras elegíveis ({candidates.length})</caption>
        <thead><tr><th scope="col">Composição</th><th scope="col">Espera média exata (dias)</th><th scope="col">Economia exata (R$)</th><th scope="col">Volume (R$)</th><th scope="col">Destaques</th><th scope="col">Análise</th></tr></thead>
        <tbody>{candidates.map(row => <tr key={row.scenarioId} aria-selected={selectedScenarioId === row.scenarioId}>
          <th scope="row">{row.name} ({row.scenarioId})</th>
          <td>{row.weightedWait} ÷ {row.volume}</td><td>{row.savings}</td><td>{row.volume}</td>
          <td>{statuses(row, frontierIds, selectedScenarioId, winnerScenarioId).join(', ') || 'Demais'}</td>
          <td><button type="button" onClick={() => onSelect(row.scenarioId)}>Selecionar {row.name}</button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
