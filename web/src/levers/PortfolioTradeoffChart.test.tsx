// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PortfolioMetrics } from './portfolioAnalysis';

const chart = vi.hoisted(() => ({
  use: vi.fn(), init: vi.fn(), setOption: vi.fn(), on: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
}));
chart.init.mockReturnValue({ setOption: chart.setOption, on: chart.on, resize: chart.resize, dispose: chart.dispose });
vi.mock('echarts/core', () => ({ use: chart.use, init: chart.init }));
vi.mock('echarts/charts', () => ({ ScatterChart: 'ScatterChart' }));
vi.mock('echarts/components', () => ({ AriaComponent: 'AriaComponent', GridComponent: 'GridComponent', TooltipComponent: 'TooltipComponent' }));
vi.mock('echarts/renderers', () => ({ SVGRenderer: 'SVGRenderer' }));

import { PortfolioTradeoffChart } from './PortfolioTradeoffChart';

let resizeCallback: ResizeObserverCallback | null = null;
const disconnect = vi.fn();
class ResizeObserverDouble {
  constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
  observe = vi.fn();
  disconnect = disconnect;
}

function point(scenarioId: string, name: string, weightedWait: string, savings: string, volume = '1'): PortfolioMetrics {
  return {
    scenarioId, name, companyIds: [scenarioId], companyNames: [name], savings, volume,
    baseline: '100', netted: '0', weightedWait, waitP95Days: 1,
    matchedVolume: '0', netability: '0',
    costDelta: { iof: '0', carry: '0', spread: '0', espera: '0', fixo: '0' },
  };
}

const candidates = [
  point('A', 'Primeira', '2', '100', '2'),
  point('B', 'Segunda', '1', '50'),
  point('C', '<img src=x onerror=alert(1)>', '1', '50'),
];

beforeEach(() => {
  for (const method of [chart.init, chart.setOption, chart.on, chart.resize, chart.dispose, disconnect]) method.mockClear();
  vi.stubGlobal('ResizeObserver', ResizeObserverDouble);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  resizeCallback = null;
});

describe('PortfolioTradeoffChart', () => {
  it('keeps overlapping portfolios separately selectable by keyboard in the accessible table', async () => {
    const onSelect = vi.fn();
    render(<PortfolioTradeoffChart candidates={candidates} frontierIds={new Set(['A', 'B', 'C'])}
      selectedScenarioId="B" winnerScenarioId="A" onSelect={onSelect} />);
    expect(screen.getByRole('table', { name: /dados do gráfico/i })).toBeVisible();
    const buttons = screen.getAllByRole('button', { name: /selecionar/i });
    expect(buttons).toHaveLength(3);
    const user = userEvent.setup();
    buttons[2]!.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('C');
    expect(screen.getByRole('row', { name: /Segunda/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('row', { name: /Primeira/ })).toHaveTextContent('Recomendada');
    expect(screen.getByRole('row', { name: /Segunda/ })).toHaveTextContent('Selecionada');
    expect(screen.getAllByRole('row').slice(1).every(row => row.textContent?.includes('Fronteira'))).toBe(true);
    expect(screen.queryByRole('img', { name: /onerror/ })).not.toBeInTheDocument();
  });

  it('uses SVG scatter, finite Number coordinates, bounded areas and a non-HTML tooltip', () => {
    render(<PortfolioTradeoffChart candidates={candidates} frontierIds={new Set(['A'])}
      selectedScenarioId="B" winnerScenarioId="A" onSelect={vi.fn()} />);
    expect(chart.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), undefined, { renderer: 'svg' });
    const option = chart.setOption.mock.calls[0]![0];
    expect(option.animation).toBe(false);
    expect(option.tooltip.renderMode).toBe('richText');
    expect(option.series[0].type).toBe('scatter');
    expect(option.series[0].data).toHaveLength(3);
    expect(option.series[0].data[0].value).toEqual([1, 100, 2]);
    expect(option.series[0].data.every((item: { value: number[] }) => item.value.every(Number.isFinite))).toBe(true);
    expect(option.series[0].data.every((item: { symbolSize: number }) => item.symbolSize >= 10 && item.symbolSize <= 36)).toBe(true);
    expect(option.series[0].data[0].symbol).not.toBe(option.series[0].data[1].symbol);
    const tooltip = option.tooltip.formatter({ dataIndex: 2 });
    expect(tooltip).toContain('<img src=x onerror=alert(1)>');
    expect(screen.queryByRole('img')).toBeTruthy();
  });

  it('handles scatter selection and disconnects resize observation on unmount', () => {
    const onSelect = vi.fn();
    const { unmount } = render(<PortfolioTradeoffChart candidates={candidates} frontierIds={new Set()}
      selectedScenarioId={null} winnerScenarioId={null} onSelect={onSelect} />);
    expect(chart.on).toHaveBeenCalledWith('click', expect.any(Function));
    chart.on.mock.calls[0]![1]({ componentType: 'series', dataIndex: 2 });
    expect(onSelect).toHaveBeenCalledWith('C');
    resizeCallback?.([], {} as ResizeObserver);
    expect(chart.resize).toHaveBeenCalledOnce();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(chart.dispose).toHaveBeenCalledOnce();
  });

  it('keeps one chart instance while selection and candidates change, with current click targets', () => {
    const firstSelect = vi.fn();
    const nextSelect = vi.fn();
    const { rerender, unmount } = render(<PortfolioTradeoffChart candidates={candidates} frontierIds={new Set(['A'])}
      selectedScenarioId="A" winnerScenarioId="B" onSelect={firstSelect} />);
    const firstData = chart.setOption.mock.calls[0]![0].series[0].data;
    rerender(<PortfolioTradeoffChart candidates={[candidates[2]!, candidates[0]!]} frontierIds={new Set(['C'])}
      selectedScenarioId="C" winnerScenarioId="A" onSelect={nextSelect} />);

    expect(chart.init).toHaveBeenCalledOnce();
    expect(chart.on).toHaveBeenCalledOnce();
    expect(chart.dispose).not.toHaveBeenCalled();
    expect(chart.setOption).toHaveBeenCalledTimes(2);
    const nextData = chart.setOption.mock.calls[1]![0].series[0].data;
    expect(nextData).toHaveLength(2);
    expect(nextData[0].symbol).toBe('diamond');
    expect(nextData[0].symbol).not.toBe(firstData[2].symbol);
    chart.on.mock.calls[0]![1]({ componentType: 'series', dataIndex: 0 });
    expect(nextSelect).toHaveBeenCalledWith('C');
    expect(firstSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('row', { name: /onerror/ })).toHaveAttribute('aria-selected', 'true');
    unmount();
    expect(chart.dispose).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
