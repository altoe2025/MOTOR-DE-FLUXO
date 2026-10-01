// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import Decimal from 'decimal.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatMoney } from '../presentation/format';
import { ReplayStage, REPLAY_TIMING } from './components/ReplayStage';
import type { ReplayDocument } from './domain';
import fixture from './fixtures/replay-motor-fidelity.v1.json';
import { presentReplayDay } from './presentation';
import { replayStateAt } from './state';

/**
 * Documentos gerados pelo motor real (tests/web_api/fixture_replay_fidelidade.py).
 * Aqui a cena é conferida contra saldos recalculados do zero a partir dos eventos,
 * sem usar o código de estado do próprio Replay.
 */
const documents = (fixture as unknown as { seed: number; document: ReplayDocument }[]);
const playback = { primaryAction: 'PLAY', playing: false, togglePlaying: () => undefined } as const;

type DayTruth = Readonly<{
  opening: ReadonlyMap<string, Decimal>;
  closing: ReadonlyMap<string, Decimal>;
  flows: readonly string[];
}>;

function truthByDay(document: ReplayDocument): readonly DayTruth[] {
  const balance = new Map<string, Decimal>();
  const value = new Map(document.orders.map((order) => [order.id, new Decimal(order.value_brl)]));
  return document.days.map((day) => {
    for (const event of day.events) if (event.kind === 'ORDER_ARRIVED') balance.set(event.order_id, value.get(event.order_id)!);
    const opening = new Map([...balance].filter(([, amount]) => amount.gt(0)));
    const flows: string[] = [];
    for (const event of day.events) {
      if (event.kind !== 'ALLOCATION') continue;
      balance.set(event.order_id, balance.get(event.order_id)!.minus(event.value_brl));
      if (event.allocation_type === 'REMETIDO') flows.push(`${event.order_id}>GATEWAY:${formatMoney(event.value_brl)}`);
    }
    for (const segment of day.closing?.flow_segments ?? []) {
      flows.push(`${segment.out_order_id}>${segment.in_order_id}:${formatMoney(segment.value_brl)}`);
    }
    const closing = new Map([...opening.keys()].map((id) => [id, balance.get(id)!]));
    return { opening, closing, flows: flows.sort() };
  });
}

function scene(container: HTMLElement) {
  const cards = new Map([...container.querySelectorAll<HTMLElement>('[data-order-id]')].map((card) => [
    card.dataset.orderId!, card.querySelector('.replay-order__value')!.textContent!,
  ]));
  const flows = [...container.querySelectorAll<SVGGElement>('.replay-flow')].map((flow) => {
    const label = [...container.querySelectorAll('.replay-connection-label')]
      .find((item) => item.getAttribute('data-flow') === flow.getAttribute('data-flow'));
    return `${flow.dataset.from}>${flow.dataset.to}:${label?.textContent ?? '?'}`;
  }).sort();
  const open = container.querySelector('.replay-frontier__open strong')!.textContent!;
  return { cards, flows, open };
}

/** Avança em passos curtos, como o navegador: cada etapa renderiza antes da seguinte começar. */
function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 200) act(() => vi.advanceTimersByTime(Math.min(200, ms - elapsed)));
}

const openText = (document: ReplayDocument, day: number) => formatMoney(
  new Decimal(document.days[day]!.end_state.open_out_brl).plus(document.days[day]!.end_state.open_in_brl).toFixed(),
);

describe('Fronteira Viva contra documentos gerados pelo motor', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('a fixture cobre autonetting, multilateral, remessas OUT e IN e vários cartões por dia', () => {
    const kinds = new Set<string>();
    for (const { document } of documents) for (const day of document.days) {
      for (const segment of day.closing?.flow_segments ?? []) kinds.add(segment.matching_origin);
      for (const event of day.events) if (event.kind === 'ALLOCATION' && event.allocation_type === 'REMETIDO') kinds.add(`REMETIDO_${event.direction}`);
      if ((day.closing?.flow_segments.length ?? 0) >= 3) kinds.add('3+');
    }
    expect([...kinds].sort()).toEqual(['3+', 'INTER_CLIENTE', 'INTRA_CLIENTE', 'REMETIDO_IN', 'REMETIDO_OUT']);
  });

  for (const { seed, document } of documents) {
    const truth = truthByDay(document);

    it(`semente ${seed}: parado em cada dia, cartões, saldos, liquidadas, setas e aberto batem com o motor`, () => {
      for (const [day, expected] of truth.entries()) {
        const hasEvent = presentReplayDay(document, day).hasOperationalEvent;
        const { container, unmount } = render(<ReplayStage document={document} state={replayStateAt(document, day)} sort="ARRIVAL"
          transitionMode="INSTANT" transitionKey={day} frozen playback={playback} />);
        const shown = scene(container);
        // Pausado num dia com evento, a cena mostra quem estava aberto no fechamento; sem evento, só quem segue aberto.
        const ids = [...expected.closing].filter(([, amount]) => hasEvent || amount.gt(0)).map(([id]) => id).sort();
        expect([...shown.cards.keys()].sort(), `cartões D${day}`).toEqual(ids);
        for (const id of ids) {
          const amount = expected.closing.get(id)!;
          expect(shown.cards.get(id), `${id} D${day}`).toBe(amount.isZero() ? '✓ Liquidada' : formatMoney(amount.toFixed()));
        }
        expect(shown.flows, `setas D${day}`).toEqual(hasEvent ? expected.flows : []);
        expect(shown.open, `aberto D${day}`).toBe(openText(document, day));
        unmount();
      }
    });

    it(`semente ${seed}: tocando, o dia abre com o saldo antes do fechamento e termina no saldo do motor`, () => {
      // O rAF do jsdom não segue o relógio falso; um quadro a cada 16 ms faz o saldo contar até o fim.
      vi.useFakeTimers();
      vi.stubGlobal('requestAnimationFrame', (step: FrameRequestCallback) => setTimeout(() => step(performance.now()), 16));
      vi.stubGlobal('cancelAnimationFrame', (frame: number) => clearTimeout(frame));
      for (const [day, expected] of truth.entries()) {
        if (!presentReplayDay(document, day).hasOperationalEvent) continue;
        const { container, unmount } = render(<ReplayStage document={document} state={replayStateAt(document, day)} sort="EDF"
          transitionMode="ANIMATE" transitionKey={day + 1} playback={playback} />);
        const before = scene(container);
        expect([...before.cards.keys()].sort(), `cartões ao abrir D${day}`).toEqual([...expected.opening.keys()].sort());
        for (const [id, amount] of expected.opening) expect(before.cards.get(id), `${id} ao abrir D${day}`).toBe(formatMoney(amount.toFixed()));
        expect(before.flows).toEqual([]);

        const settleAt = REPLAY_TIMING.flowAt + REPLAY_TIMING.draw + REPLAY_TIMING.stagger * Math.max(0, expected.flows.length - 1);
        advance(settleAt + 1_000);
        const after = scene(container);
        expect(after.flows, `setas D${day}`).toEqual(expected.flows);
        for (const [id, amount] of expected.closing) {
          expect(after.cards.get(id), `${id} depois de D${day}`).toBe(amount.isZero() ? '✓ Liquidada' : formatMoney(amount.toFixed()));
        }

        advance(REPLAY_TIMING.clearAt);
        const cleared = scene(container);
        expect([...cleared.cards.keys()].sort(), `liquidadas saem em D${day}`)
          .toEqual([...expected.closing].filter(([, amount]) => amount.gt(0)).map(([id]) => id).sort());
        unmount();
      }
    });
  }
});
