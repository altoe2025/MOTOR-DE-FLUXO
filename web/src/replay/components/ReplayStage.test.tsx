// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { replayStateAt } from '../state';
import { replayDocumentFixture, replayDocumentWithBothRemittancesFixture } from '../testFixtures';
import { ReplayJournal } from './ReplayJournal';
import { ReplayStage } from './ReplayStage';
import { ReplayControls } from './ReplayControls';
import type { ReplayPlayback } from '../useReplayPlayback';

describe('cena Fronteira Viva', () => {
  afterEach(() => vi.useRealTimers());
  it('posiciona direções, fronteira e cartão parcial com dados completos', () => {
    const document = replayDocumentWithBothRemittancesFixture();
    render(<ReplayStage
      document={document}
      state={replayStateAt(document, 0)}
      sort="ARRIVAL"
      transitionMode="INSTANT"
      transitionKey={0}
    />);

    expect(screen.getByRole('region', { name: 'Cena Fronteira Viva' })).toBeInTheDocument();
    expect(screen.getByText('Brasil')).toBeInTheDocument();
    expect(screen.getByText('CNR')).toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /OUT out-1/i })).not.toHaveTextContent('cliente-a');
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('R$ 60,00');
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('Prazo D2');
    expect(screen.queryByRole('article', { name: /IN in-1/i })).not.toBeInTheDocument();
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

  it('mantém cartões liquidados e conexões visíveis por 2,6 segundos', () => {
    vi.useFakeTimers();
    const document = replayDocumentWithBothRemittancesFixture();
    const { container } = render(<ReplayStage
      document={document}
      state={replayStateAt(document, 2)}
      sort="ARRIVAL"
      transitionMode="ANIMATE"
      transitionKey={1}
    />);

    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('Liquidada');
    expect(screen.getByRole('article', { name: /IN in-2/i })).toHaveTextContent('Liquidada');
    expect(container.querySelector('.replay-connections')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_900));
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toBeInTheDocument();
    expect(container.querySelector('.replay-connections')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_900));
    expect(screen.queryByRole('article', { name: /OUT out-1/i })).not.toBeInTheDocument();
    expect(container.querySelector('.replay-connections')).not.toBeInTheDocument();
  });

  it('congela cartões liquidados e setas enquanto pausado', () => {
    vi.useFakeTimers();
    const document = replayDocumentWithBothRemittancesFixture();
    const props = { document, state: replayStateAt(document, 2), sort: 'ARRIVAL' as const, transitionKey: 1 };
    const { container, rerender } = render(<ReplayStage {...props} transitionMode="ANIMATE" frozen={false} />);

    act(() => vi.advanceTimersByTime(3_800));
    expect(screen.queryByRole('article', { name: /OUT out-1/i })).not.toBeInTheDocument();

    rerender(<ReplayStage {...props} transitionMode="ANIMATE" frozen />);
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('Liquidada');
    expect(container.querySelector('.replay-connections')).toBeInTheDocument();
    expect(container.querySelector('.replay-stage--frozen')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toBeInTheDocument();
    expect(container.querySelector('.replay-connections')).toBeInTheDocument();
  });

  it('rotula cada seta casada como autonetting ou netting multilateral', () => {
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
    />);

    const labels = [...container.querySelectorAll('.replay-connection-label')].map((item) => item.textContent);
    expect(labels).toEqual(['Autonetting intracliente', 'Netting multilateral']);
    expect(container.querySelector('.replay-connection--intra-client')).toBeInTheDocument();
    expect(container.querySelector('.replay-connection--inter-client')).toBeInTheDocument();
  });

  it('filtra os cartões pela empresa e mostra a data real do prazo', () => {
    const document = replayDocumentFixture();
    const companyOf = (id: string) => (id === 'out-1' ? 'AstroPay' : 'Empresa Y');
    render(<ReplayStage document={document} state={replayStateAt(document, 0)} sort="ARRIVAL" transitionMode="INSTANT" transitionKey={0}
      companyOf={companyOf} company="Empresa Y" dateOf={(day) => `0${day + 1}/09/2026`} />);
    expect(screen.queryByRole('article', { name: /OUT out-1/i })).not.toBeInTheDocument();
    expect(screen.getByText('Sem OUT aberto de Empresa Y')).toBeInTheDocument();
    expect(screen.getByText('01/09/2026')).toBeInTheDocument();
  });

  it('“Ir ao maior resíduo” salta para o dia com mais volume remetido', () => {
    const selectDay = vi.fn();
    const playback = { day: 0, playing: false, speed: 1, primaryAction: 'PLAY', selectDay, togglePlaying: vi.fn(), setSpeed: vi.fn(), previous: vi.fn(), next: vi.fn(), nextClosing: vi.fn(), repeat: vi.fn() } as unknown as ReplayPlayback;
    const onCompany = vi.fn();
    render(<ReplayControls document={replayDocumentFixture()} playback={playback} sort="ARRIVAL" onSort={vi.fn()}
      residue={{ day: 2, valueBrl: '60' }} companies={['AstroPay', 'Empresa Y']} company={null} onCompany={onCompany} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir ao maior resíduo (D2)' }));
    expect(selectDay).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Empresa' }), { target: { value: 'Empresa Y' } });
    expect(onCompany).toHaveBeenCalledWith('Empresa Y');
  });
});
