// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { replayStateAt } from '../state';
import { replayDocumentFixture, replayDocumentWithBothRemittancesFixture } from '../testFixtures';
import { ReplayJournal } from './ReplayJournal';
import { ReplayStage } from './ReplayStage';
import { ReplayControls } from './ReplayControls';
import type { ReplayPlayback } from '../useReplayPlayback';

const stagePlayback = {
  primaryAction: 'PLAY', playing: false, togglePlaying: vi.fn(),
} as Pick<ReplayPlayback, 'primaryAction' | 'playing' | 'togglePlaying'>;

describe('cena Fronteira Viva', () => {
  afterEach(() => vi.useRealTimers());
  it('posiciona direções, fronteira e cartão parcial com dados completos', () => {
    const document = replayDocumentWithBothRemittancesFixture();
    const togglePlaying = vi.fn();
    const { container } = render(<ReplayStage
      document={document}
      state={replayStateAt(document, 0)}
      sort="ARRIVAL"
      transitionMode="INSTANT"
      transitionKey={0}
      dateOf={(day) => `0${day + 1}/09/2026`}
      playback={{ primaryAction: 'PAUSE', playing: true, togglePlaying }}
    />);

    const stage = screen.getByRole('region', { name: 'Cena Fronteira Viva' });
    expect(stage).toBeInTheDocument();
    expect(screen.getByText('Brasil')).toBeInTheDocument();
    expect(screen.getByText('CNR')).toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /OUT out-1/i })).not.toHaveTextContent('cliente-a');
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('R$ 60,00');
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('Prazo D2 · 03/09/2026');
    expect(screen.queryByRole('article', { name: /IN in-1/i })).not.toBeInTheDocument();
    expect(container.querySelector('.replay-frontier__day')).toHaveTextContent(/^D0$/);
    fireEvent.click(within(stage).getByRole('button', { name: 'Pausar' }));
    expect(togglePlaying).toHaveBeenCalledOnce();
  });

  it('mantém diário cumulativo por dia sem registrar dias futuros ou vazios', () => {
    const document = replayDocumentWithBothRemittancesFixture();
    render(<ReplayJournal document={document} day={2} />);

    expect(screen.getByRole('heading', { name: 'Diário do Replay' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dia 0' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dia 2' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dia 1' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ordem out-1 chegou/i)).toBeInTheDocument();
    expect(screen.getByText(/ordem in-2.*remetida IN/i)).toBeInTheDocument();
  });

  it('anima o dia em etapas: cartões andam, setas entram, saldos baixam e liquidadas saem', () => {
    vi.useFakeTimers();
    const document = replayDocumentWithBothRemittancesFixture();
    const { container } = render(<ReplayStage
      document={document}
      state={replayStateAt(document, 2)}
      sort="ARRIVAL"
      transitionMode="ANIMATE"
      transitionKey={1}
      playback={stagePlayback}
    />);

    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('R$ 60,00');
    expect(screen.getByRole('article', { name: /IN in-2/i })).toHaveTextContent('R$ 20,00');
    expect(container.querySelector('.replay-connections')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_000));
    expect(container.querySelectorAll('.replay-connection')).toHaveLength(2);
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('R$ 60,00');

    act(() => vi.advanceTimersByTime(1_700));
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('Liquidada');
    expect(screen.getByRole('article', { name: /IN in-2/i })).toHaveTextContent('Liquidada');
    expect(container.querySelector('.replay-gateway--live')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4_300));
    expect(screen.queryByRole('article', { name: /OUT out-1/i })).not.toBeInTheDocument();
    expect(container.querySelector('.replay-connections')).not.toBeInTheDocument();
  });

  it('acelera as etapas junto com a velocidade escolhida', () => {
    vi.useFakeTimers();
    const document = replayDocumentWithBothRemittancesFixture();
    const { container } = render(<ReplayStage document={document} state={replayStateAt(document, 2)} sort="ARRIVAL"
      transitionMode="ANIMATE" transitionKey={1} playback={{ ...stagePlayback, speed: 2 }} />);

    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('.replay-connections')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByRole('article', { name: /OUT out-1/i })).not.toBeInTheDocument();
  });

  it('isola o caminho de uma ordem ao passar o mouse sobre ela', () => {
    const document = replayDocumentWithBothRemittancesFixture();
    const { container } = render(<ReplayStage document={document} state={replayStateAt(document, 2)} sort="ARRIVAL"
      transitionMode="ANIMATE" transitionKey={1} frozen playback={stagePlayback} />);

    fireEvent.mouseOver(screen.getByRole('article', { name: /IN in-2/i }));
    expect(container.querySelector('.replay-stage--focus')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /IN in-2/i })).toHaveClass('replay-order--focus');
    expect(screen.getByRole('article', { name: /OUT out-1/i })).not.toHaveClass('replay-order--focus');
    expect(container.querySelectorAll('.replay-connection.is-focus')).toHaveLength(1);

    fireEvent.mouseOut(screen.getByRole('article', { name: /IN in-2/i }));
    expect(container.querySelector('.replay-stage--focus')).not.toBeInTheDocument();
  });

  it('congela cartões liquidados e setas enquanto pausado', () => {
    vi.useFakeTimers();
    const document = replayDocumentWithBothRemittancesFixture();
    const props = { document, state: replayStateAt(document, 2), sort: 'ARRIVAL' as const, transitionKey: 1 };
    const { container, rerender } = render(<ReplayStage {...props} transitionMode="ANIMATE" frozen={false} playback={stagePlayback} />);

    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.queryByRole('article', { name: /OUT out-1/i })).not.toBeInTheDocument();

    rerender(<ReplayStage {...props} transitionMode="ANIMATE" frozen playback={stagePlayback} />);
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('Liquidada');
    expect(container.querySelector('.replay-connections')).toBeInTheDocument();
    expect(container.querySelector('.replay-stage--frozen')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toBeInTheDocument();
    expect(container.querySelector('.replay-connections')).toBeInTheDocument();
  });

  it('rotula cada seta com o valor do fluxo e pinta pela origem do casamento', () => {
    const document = replayDocumentFixture();
    document.days[0]!.closing!.flow_segments = [
      {
        ...document.days[0]!.closing!.flow_segments[0]!,
        value_brl: '10', matching_origin: 'INTRA_CLIENTE',
      },
      document.days[0]!.closing!.flow_segments[0]!,
    ];
    const { container } = render(<ReplayStage
      document={document}
      state={replayStateAt(document, 0)}
      sort="ARRIVAL"
      transitionMode="ANIMATE"
      transitionKey={1}
      frozen
      playback={stagePlayback}
    />);

    const labels = [...container.querySelectorAll('.replay-connection-label')].map((item) => item.textContent);
    expect(labels).toEqual(['R$ 10,00', 'R$ 40,00']);
    expect(container.querySelector('.replay-connection-label--intra')?.textContent).toBe('R$ 10,00');
    expect(container.querySelector('.replay-connection--intra-client')).toBeInTheDocument();
    expect(container.querySelector('.replay-connection--inter-client')).toBeInTheDocument();
  });

  it('filtra os cartões pela empresa sem recolocar a data no indicador do dia', () => {
    const document = replayDocumentFixture();
    const companyOf = (id: string) => (id === 'out-1' ? 'AstroPay' : 'Empresa Y');
    const { container } = render(<ReplayStage document={document} state={replayStateAt(document, 0)} sort="ARRIVAL" transitionMode="INSTANT" transitionKey={0}
      companyOf={companyOf} company="Empresa Y" dateOf={(day) => `0${day + 1}/09/2026`} playback={stagePlayback} />);
    expect(screen.queryByRole('article', { name: /OUT out-1/i })).not.toBeInTheDocument();
    expect(screen.getByText('Sem OUT aberto de Empresa Y')).toBeInTheDocument();
    expect(container.querySelector('.replay-frontier__day')).toHaveTextContent(/^D0$/);
  });

  it('“Ir ao maior resíduo” salta para o dia com mais volume remetido', () => {
    const selectDay = vi.fn();
    const playback = { day: 0, playing: false, speed: 1, primaryAction: 'PLAY', selectDay, togglePlaying: vi.fn(), setSpeed: vi.fn(), previous: vi.fn(), next: vi.fn(), nextClosing: vi.fn(), repeat: vi.fn() } as unknown as ReplayPlayback;
    const onCompany = vi.fn();
    const { container } = render(<ReplayControls document={replayDocumentFixture()} playback={playback} sort="ARRIVAL" onSort={vi.fn()}
      residue={{ day: 2, valueBrl: '60' }} companies={['AstroPay', 'Empresa Y']} company={null} onCompany={onCompany} />);
    expect(within(container.querySelector('.replay-timeline')!).queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ir ao maior resíduo (D2)' }));
    expect(selectDay).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Empresa' }), { target: { value: 'Empresa Y' } });
    expect(onCompany).toHaveBeenCalledWith('Empresa Y');
  });
});
