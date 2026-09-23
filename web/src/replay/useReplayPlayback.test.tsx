// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { replayDocumentFixture } from './testFixtures';
import { useReplayPlayback } from './useReplayPlayback';

describe('useReplayPlayback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mantém o dia por 3,2 segundos na velocidade padrão', () => {
    const { result } = renderHook(() => useReplayPlayback(replayDocumentFixture()));

    act(() => result.current.togglePlaying());
    act(() => vi.advanceTimersByTime(3_199));
    expect(result.current.day).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.day).toBe(1);
  });

  it('toca, pausa e respeita velocidades 1×/2×/4×', () => {
    const replay = replayDocumentFixture();
    const { result } = renderHook(() => useReplayPlayback(replay, { intervalMs: 1_000 }));

    act(() => result.current.togglePlaying());
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.day).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.day).toBe(1);
    expect(result.current.transitionMode).toBe('ANIMATE');

    act(() => result.current.setSpeed(2));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.day).toBe(2);
    expect(result.current.playing).toBe(false);

    act(() => result.current.restart());
    act(() => result.current.setSpeed(4));
    act(() => result.current.togglePlaying());
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.day).toBe(1);
  });

  it('navega por dia, fechamento e limites sempre pausando', () => {
    const { result } = renderHook(() => useReplayPlayback(replayDocumentFixture()));

    act(() => result.current.next());
    expect(result.current.day).toBe(1);
    act(() => result.current.nextClosing());
    expect(result.current.day).toBe(2);
    act(() => result.current.previous());
    expect(result.current.day).toBe(1);
    act(() => result.current.selectDay(0));
    expect(result.current.day).toBe(0);
    expect(result.current.playing).toBe(false);
    expect(result.current.transitionMode).toBe('INSTANT');
  });

  it('repete o evento sem mudar o estado e recomeça ao fim', () => {
    const { result } = renderHook(() => useReplayPlayback(replayDocumentFixture()));

    act(() => result.current.repeat());
    expect(result.current.replayRevision).toBe(1);
    expect(result.current.day).toBe(0);
    expect(result.current.transitionMode).toBe('ANIMATE');
    act(() => result.current.selectDay(2));
    expect(result.current.primaryAction).toBe('RESTART');
    act(() => result.current.togglePlaying());
    expect(result.current.day).toBe(0);
    expect(result.current.playing).toBe(false);
  });

  it('limpa o timeout ao desmontar e reinicia quando muda a identidade do documento', () => {
    const replay = replayDocumentFixture();
    const { result, rerender, unmount } = renderHook(
      ({ document }) => useReplayPlayback(document, { intervalMs: 1_000 }),
      { initialProps: { document: replay } },
    );
    act(() => { result.current.selectDay(1); result.current.togglePlaying(); });

    const nextDocument = { ...replay, result_fingerprint: 'd'.repeat(64) };
    rerender({ document: nextDocument });
    expect(result.current.day).toBe(0);
    expect(result.current.playing).toBe(false);
    unmount();
    act(() => vi.runOnlyPendingTimers());
  });
});
