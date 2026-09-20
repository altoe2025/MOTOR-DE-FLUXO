import { useEffect, useRef } from 'react';
import { BarChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

import { chartPresentation, type ChartSeries } from '../presentation';

echarts.use([BarChart, LineChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer]);

export function EChart({ series, description }: Readonly<{ series: ChartSeries; description: string }>) {
  const elementRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    const { option } = chartPresentation(series, !reducedMotion);
    chart.setOption({ ...option, aria: { ...option.aria, description } });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => chart.resize());
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      chart.dispose();
    };
  }, [description, series]);
  return <div className="diagnostic-chart" ref={elementRef} role="img" aria-label={description} />;
}

export function ChartWithTable({ series, description }: Readonly<{ series: ChartSeries; description: string }>) {
  const { rows } = chartPresentation(series);
  return <div className="chart-with-table">
    <EChart series={series} description={description} />
    <div className="table-scroll">
      <table className="diagnostic-table">
        <caption>{series.name} — dados do gráfico</caption>
        <thead><tr><th scope="col">Categoria</th><th scope="col">Valor</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
