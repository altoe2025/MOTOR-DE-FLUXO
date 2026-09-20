// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const echarts = vi.hoisted(() => ({
  use: vi.fn(), setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), init: vi.fn(),
}));
echarts.init.mockReturnValue({ setOption: echarts.setOption, resize: echarts.resize, dispose: echarts.dispose });

vi.mock('echarts/core', () => ({ use: echarts.use, init: echarts.init }));
vi.mock('echarts/charts', () => ({ BarChart: 'BarChart', LineChart: 'LineChart' }));
vi.mock('echarts/components', () => ({ AriaComponent: 'AriaComponent', GridComponent: 'GridComponent', TooltipComponent: 'TooltipComponent' }));
vi.mock('echarts/renderers', () => ({ SVGRenderer: 'SVGRenderer' }));

import { EChart } from './EChart';

let resizeCallback: ResizeObserverCallback | null = null;
const disconnect = vi.fn();

class ResizeObserverDouble {
  constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = disconnect;
}

describe('EChart acessível', () => {
  it('usa módulos explícitos, movimento reduzido, resize e descarte', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverDouble);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const { unmount } = render(<EChart
      series={{ name: 'Economia', unit: 'BRL', points: [{ label: 'R1', value: '20' }] }}
      description="Economia por repetição; valores na tabela seguinte."
    />);

    expect(echarts.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), undefined, { renderer: 'svg' });
    expect(echarts.setOption).toHaveBeenCalledWith(expect.objectContaining({ animation: false }));
    expect(screen.getByRole('img', { name: /Economia por repetição/ })).toBeVisible();
    resizeCallback?.([], {} as ResizeObserver);
    expect(echarts.resize).toHaveBeenCalledOnce();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(echarts.dispose).toHaveBeenCalledOnce();
  });
});
