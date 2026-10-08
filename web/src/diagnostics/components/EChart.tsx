import { useEffect, useRef } from 'react';
import { BarChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

import { chartPresentation, type ChartSeries } from '../presentation';

echarts.use([BarChart, LineChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer]);

/** Cores do gráfico tiradas dos tokens do tema, para que ele acompanhe o escuro/claro do app. */
function themeColors(element: HTMLElement) {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const ink = token('--ink', '#252a28');
  const muted = token('--muted', '#56615a');
  const line = token('--border', '#d8e0e7');
  const surface = token('--surface', '#ffffff');
  return {
    color: [token('--accent', '#295e58'), token('--inter', '#4855c4'), token('--warn', '#9a6200'), token('--flow-in', '#2470b3')],
    textStyle: { color: muted, fontFamily: token('--font-mono', 'monospace') },
    xAxis: { axisLine: { lineStyle: { color: line } }, axisTick: { lineStyle: { color: line } }, axisLabel: { color: muted } },
    yAxis: { splitLine: { lineStyle: { color: line, type: 'dashed' as const } }, axisLabel: { color: muted } },
    tooltip: { backgroundColor: surface, borderColor: line, textStyle: { color: ink } },
  };
}

export function EChart({ series, description }: Readonly<{ series: ChartSeries; description: string }>) {
  const elementRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    const { option } = chartPresentation(series, !reducedMotion);
    const themed = () => {
      const colors = themeColors(element);
      return {
        ...option,
        color: colors.color,
        textStyle: colors.textStyle,
        xAxis: { ...option.xAxis, ...colors.xAxis },
        yAxis: { ...option.yAxis, ...colors.yAxis },
        tooltip: { ...option.tooltip, ...colors.tooltip },
        aria: { ...option.aria, description },
      };
    };
    chart.setOption(themed());
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => chart.resize());
    observer?.observe(element);
    const themeObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => chart.setOption(themed()));
    themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      observer?.disconnect();
      themeObserver?.disconnect();
      chart.dispose();
    };
  }, [description, series]);
  return <div className="diagnostic-chart" ref={elementRef} role="img" aria-label={description} />;
}

export function ChartWithTable({ series, description }: Readonly<{ series: ChartSeries; description: string }>) {
  const { rows } = chartPresentation(series);
  return <div className="chart-with-table">
    <EChart series={series} description={description} />
    <div className="table-scroll" role="region" tabIndex={0} aria-label={`Tabela rolável — ${series.name} — dados do gráfico`}>
      <table className="diagnostic-table">
        <caption>{series.name} — dados do gráfico</caption>
        <thead><tr><th scope="col">Categoria</th><th scope="col">Valor</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
