// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { replayStateAt } from '../state';
import { replayDocumentFixture, replayDocumentWithBothRemittancesFixture } from '../testFixtures';
import type { ReplayPlayback } from '../useReplayPlayback';
import { ReplayControls } from './ReplayControls';
import { ReplayMetrics } from './ReplayMetrics';

function playback(overrides: Partial<ReplayPlayback> = {}): ReplayPlayback {
  return {
    day: 1, playing: false, paused: false, speed: 1, replayRevision: 0, transitionMode: 'INSTANT', transitionKey: 0, primaryAction: 'PLAY',
    togglePlaying: vi.fn(), setSpeed: vi.fn(), previous: vi.fn(), next: vi.fn(), selectDay: vi.fn(), nextClosing: vi.fn(), repeat: vi.fn(), restart: vi.fn(),
    ...overrides,
  };
}

describe('controles do Replay', () => {
  it('mostra um segmento por dia com chegadas, fechamento e remessa, e marca o dia atual', () => {
    const { container } = render(<ReplayControls document={replayDocumentWithBothRemittancesFixture()} playback={playback()} sort="ARRIVAL" onSort={vi.fn()} />);
    const ticks = [...container.querySelectorAll('.replay-tick')];

    expect(ticks.map((tick) => tick.querySelector('.replay-tick__label')?.textContent)).toEqual(['D0', 'D1', 'D2']);
    expect(ticks[0]!.querySelectorAll('.replay-mark--arrival')).toHaveLength(2);
    expect(ticks[0]!.querySelector('.replay-mark--closing')).toBeInTheDocument();
    expect(ticks[1]!.querySelector('.replay-mark--closing, .replay-mark--remit')).not.toBeInTheDocument();
    expect(ticks[2]!.querySelector('.replay-mark--remit')).toBeInTheDocument();
    expect(ticks.map((tick) => tick.className.includes('is-now'))).toEqual([false, true, false]);
    expect(ticks[0]).toHaveClass('is-past');
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
