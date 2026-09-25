// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { replayStateAt } from '../state';
import { replayDocumentFixture, replayDocumentWithBothRemittancesFixture } from '../testFixtures';
import { ReplayJournal } from './ReplayJournal';
import { ReplayStage } from './ReplayStage';

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
    expect(screen.getByRole('article', { name: /OUT out-1/i })).toHaveTextContent('cliente-a');
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
});
