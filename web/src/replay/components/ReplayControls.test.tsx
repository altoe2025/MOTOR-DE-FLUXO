// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { replayStateAt } from '../state';
import { replayDocumentFixture, replayDocumentWithBothRemittancesFixture } from '../testFixtures';
import type { ReplayDocument } from '../domain';
import type { ReplayPlayback } from '../useReplayPlayback';
import { ReplayControls } from './ReplayControls';
import { ReplayMetrics } from './ReplayMetrics';

/** Estende o fixture de 3 dias com dias vazios, como um Replay longo. */
function longDocument(dayCount: number): ReplayDocument {
  const document = replayDocumentWithBothRemittancesFixture();
  const last = document.days.at(-1)!;
  for (let day = document.days.length; day < dayCount; day++) document.days.push({ ...last, day, events: [], closing: null });
  document.period = { ...document.period, settlement_end_day: dayCount - 1 };
  return document;
}

function playback(overrides: Partial<ReplayPlayback> = {}): ReplayPlayback {
  return {
    day: 1, playing: false, paused: false, speed: 1, replayRevision: 0, transitionMode: 'INSTANT', transitionKey: 0, primaryAction: 'PLAY',
    togglePlaying: vi.fn(), setSpeed: vi.fn(), previous: vi.fn(), next: vi.fn(), selectDay: vi.fn(), nextClosing: vi.fn(), repeat: vi.fn(), restart: vi.fn(),
    ...overrides,
  };
}

describe('controles do Replay', () => {
  it('mostra chegadas em barras, fechamento e remessa em losangos, e o dia atual numa etiqueta', () => {
    const { container } = render(<ReplayControls document={replayDocumentWithBothRemittancesFixture()} playback={playback()} sort="ARRIVAL" onSort={vi.fn()} />);
    const dayOf = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)].map((item) => item.dataset.day);

    // Sem largura medida (jsdom), a régua assume 640 px: com 3 dias cabem todos, menos o que a etiqueta cobre.
    expect([...container.querySelectorAll('.replay-timeline__label')].map((item) => item.textContent)).toEqual(['D0', 'D2']);
    expect(container.querySelector('.replay-timeline__now')).toHaveTextContent('D1');
    expect(dayOf('.replay-timeline__bar')).toEqual(['0', '2']);
    expect(container.querySelector<HTMLElement>('.replay-timeline__bar[data-day="0"]')!.style.height).toBe('18px');
    expect(dayOf('.replay-mark--closing')).toEqual(['0']);
    expect(dayOf('.replay-mark--remit')).toEqual(['2']);
    expect(container.querySelector('.replay-tick__label, .replay-ticks')).not.toBeInTheDocument();
  });

  it('em 36 dias rotula de 5 em 5 sem rótulos encostados, com data na etiqueta do dia atual', () => {
    const document = longDocument(36);
    const dateOf = (day: number) => new Date(Date.UTC(2025, 11, 26 + day)).toISOString().slice(0, 10).split('-').reverse().join('/');
    const { container } = render(<ReplayControls document={document} playback={playback({ day: 14 })} sort="ARRIVAL" onSort={vi.fn()} dateOf={dateOf} />);

    expect([...container.querySelectorAll('.replay-timeline__label')].map((item) => item.textContent)).toEqual(['D0', 'D5', 'D10', 'D20', 'D25', 'D30', 'D35']);
    expect(container.querySelector('.replay-timeline__now')).toHaveTextContent('D14 · 09/01');
    expect(screen.getByRole('slider', { name: 'Selecionar dia' })).toHaveAttribute('aria-valuetext', 'Dia 14 de 35, 09/01/2026');
  });

  it('recalcula os rótulos quando a janela muda de largura', () => {
    let width = 1_200;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 74, left: 0, top: 0, right: width, bottom: 74, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
    try {
      const { container } = render(<ReplayControls document={longDocument(36)} playback={playback({ day: 14 })} sort="ARRIVAL" onSort={vi.fn()} />);
      const labels = () => [...container.querySelectorAll('.replay-timeline__label')].map((item) => item.textContent);
      expect(labels()).toContain('D2');
      width = 300;
      act(() => { window.dispatchEvent(new Event('resize')); });
      expect(labels()).toEqual(['D0', 'D7', 'D21', 'D28', 'D35']);
    } finally {
      spy.mockRestore();
    }
  });

  it('resume o dia sob o mouse', () => {
    const { container } = render(<ReplayControls document={replayDocumentWithBothRemittancesFixture()} playback={playback()} sort="ARRIVAL" onSort={vi.fn()} />);
    const ruler = container.querySelector('.replay-timeline')!;

    fireEvent.mouseMove(ruler, { clientX: 100 });
    expect(container.querySelector('.replay-timeline__tip')).toHaveTextContent('D0');
    expect(container.querySelector('.replay-timeline__tip')).toHaveTextContent('2 chegadas · fechamento');
    fireEvent.mouseMove(ruler, { clientX: 600 });
    expect(container.querySelector('.replay-timeline__tip')).toHaveTextContent('1 chegada · fechamento com remessa');
    fireEvent.mouseLeave(ruler);
    expect(container.querySelector('.replay-timeline__tip')).not.toHaveClass('is-visible');
  });

  it('mantém o controle deslizante acessível sobre a linha do tempo', () => {
    const selectDay = vi.fn();
    render(<ReplayControls document={replayDocumentFixture()} playback={playback({ selectDay })} sort="ARRIVAL" onSort={vi.fn()} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Selecionar dia' }), { target: { value: '2' } });
    expect(selectDay).toHaveBeenCalledWith(2);
  });

  it('comanda o transporte pelos botões', () => {
    const controls = playback();
    render(<ReplayControls document={replayDocumentFixture()} playback={controls} sort="ARRIVAL" onSort={vi.fn()} />);
    const transport = screen.getByRole('group', { name: 'Reprodução' });
    fireEvent.click(within(transport).getByRole('button', { name: 'Primeiro dia' }));
    fireEvent.click(within(transport).getByRole('button', { name: 'Anterior' }));
    fireEvent.click(within(transport).getByRole('button', { name: 'Reproduzir' }));
    fireEvent.click(within(transport).getByRole('button', { name: 'Seguinte' }));
    expect(controls.restart).toHaveBeenCalledOnce();
    expect(controls.previous).toHaveBeenCalledOnce();
    expect(controls.togglePlaying).toHaveBeenCalledOnce();
    expect(controls.next).toHaveBeenCalledOnce();
  });

  it('oferece 0,5× a 4× de velocidade', () => {
    const controls = playback();
    render(<ReplayControls document={replayDocumentFixture()} playback={controls} sort="ARRIVAL" onSort={vi.fn()} />);
    const speed = screen.getByRole('group', { name: 'Velocidade' });
    expect(within(speed).getAllByRole('button').map((button) => button.textContent)).toEqual(['0,5×', '1×', '2×', '4×']);
    fireEvent.click(within(speed).getByRole('button', { name: '0,5×' }));
    expect(controls.setSpeed).toHaveBeenCalledWith(0.5);
  });

  it('atende espaço e setas, mas não rouba teclas de campos e botões', () => {
    const controls = playback();
    render(<ReplayControls document={replayDocumentFixture()} playback={controls} sort="ARRIVAL" onSort={vi.fn()}
      companies={['A', 'B']} company={null} onCompany={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(controls.togglePlaying).toHaveBeenCalledOnce();
    expect(controls.next).toHaveBeenCalledOnce();
    expect(controls.previous).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Empresa' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: '1×' }), { key: ' ' });
    expect(controls.next).toHaveBeenCalledOnce();
    expect(controls.togglePlaying).toHaveBeenCalledOnce();
  });
});

describe('acumulados do Replay', () => {
  it('mostra casado, remetido e netabilidade com medidor da fração', () => {
    const document = replayDocumentWithBothRemittancesFixture();
    const { container } = render(<ReplayMetrics document={document} state={replayStateAt(document, 2)} />);

    expect(screen.getByText('Casado acumulado').closest('.replay-metric')).toHaveTextContent('R$ 80,00');
    expect(screen.getByText('Remetido acumulado').closest('.replay-metric')).toHaveTextContent('OUT R$ 60,00 · IN R$ 20,00');
    expect(container.querySelector<HTMLElement>('.replay-metric__meter i')?.style.width).toBe('50%');
  });
});
