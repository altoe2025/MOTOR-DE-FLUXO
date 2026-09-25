import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ReplayDocument } from './domain';
import { nextClosingDay } from './state';

export type ReplaySpeed = 1 | 2 | 4;
export type ReplayPrimaryAction = 'PLAY' | 'PAUSE' | 'RESTART';

export type ReplayPlayback = Readonly<{
  day: number;
  playing: boolean;
  speed: ReplaySpeed;
  replayRevision: number;
  transitionMode: 'ANIMATE' | 'INSTANT';
  transitionKey: number;
  primaryAction: ReplayPrimaryAction;
  togglePlaying(): void;
  setSpeed(speed: ReplaySpeed): void;
  previous(): void;
  next(): void;
  selectDay(day: number): void;
  nextClosing(): void;
  repeat(): void;
  restart(): void;
}>;

export function useReplayPlayback(
  document: ReplayDocument,
  { intervalMs = 4_000, initialDay = 0 }: Readonly<{ intervalMs?: number; initialDay?: number }> = {},
): ReplayPlayback {
  const lastDay = document.period.settlement_end_day;
  const routeDay = Number.isSafeInteger(initialDay) && initialDay >= 0 && initialDay <= lastDay ? initialDay : 0;
  const identity = `${document.diagnostic_execution_id}:${document.result_fingerprint}`;
  const [day, setDay] = useState(routeDay);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);
  const [replayRevision, setReplayRevision] = useState(0);
  const [transitionMode, setTransitionMode] = useState<'ANIMATE' | 'INSTANT'>('INSTANT');
  const [transitionKey, setTransitionKey] = useState(0);

  useEffect(() => {
    setDay(routeDay);
    setPlaying(false);
    setReplayRevision(0);
    setTransitionMode('INSTANT');
    setTransitionKey(0);
  }, [identity, routeDay]);

  useEffect(() => {
    if (!playing) return undefined;
    if (day >= lastDay) {
      setPlaying(false);
      return undefined;
    }
    const timeout = globalThis.setTimeout(() => {
      setTransitionMode('ANIMATE');
      setTransitionKey((current) => current + 1);
      setDay((current) => {
        const nextDay = Math.min(lastDay, current + 1);
        if (nextDay === lastDay) setPlaying(false);
        return nextDay;
      });
    }, intervalMs / speed);
    return () => globalThis.clearTimeout(timeout);
  }, [day, intervalMs, lastDay, playing, speed]);

  const pauseAndMove = useCallback((target: number, mode: 'ANIMATE' | 'INSTANT' = 'INSTANT') => {
    setPlaying(false);
    setTransitionMode(mode);
    setTransitionKey((current) => current + 1);
    setDay(Math.max(0, Math.min(lastDay, Math.trunc(target))));
  }, [lastDay]);

  const restart = useCallback(() => pauseAndMove(0), [pauseAndMove]);
  const togglePlaying = useCallback(() => {
    if (day >= lastDay) {
      restart();
      return;
    }
    setPlaying((current) => !current);
  }, [day, lastDay, restart]);
  const setSpeed = useCallback((nextSpeed: ReplaySpeed) => setSpeedState(nextSpeed), []);
  const previous = useCallback(() => pauseAndMove(day - 1), [day, pauseAndMove]);
  const next = useCallback(() => pauseAndMove(day + 1, 'ANIMATE'), [day, pauseAndMove]);
  const selectDay = useCallback((selectedDay: number) => pauseAndMove(selectedDay), [pauseAndMove]);
  const nextClosing = useCallback(() => {
    const target = nextClosingDay(document, day);
    if (target !== null) pauseAndMove(target);
    else setPlaying(false);
  }, [day, document, pauseAndMove]);
  const repeat = useCallback(() => {
    setPlaying(false);
    setTransitionMode('ANIMATE');
    setTransitionKey((current) => current + 1);
    setReplayRevision((current) => current + 1);
  }, []);

  return useMemo(() => ({
    day,
    playing,
    speed,
    replayRevision,
    transitionMode,
    transitionKey,
    primaryAction: day >= lastDay ? 'RESTART' : playing ? 'PAUSE' : 'PLAY',
    togglePlaying,
    setSpeed,
    previous,
    next,
    selectDay,
    nextClosing,
    repeat,
    restart,
  }), [day, lastDay, next, nextClosing, playing, previous, replayRevision, repeat, restart, selectDay, setSpeed, speed, togglePlaying, transitionKey, transitionMode]);
}
