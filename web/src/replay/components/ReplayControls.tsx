import { useEffect, type CSSProperties } from 'react';

import { formatMoney } from '../../presentation/format';
import type { ReplayDocument, ReplaySort } from '../domain';
import type { ReplayPlayback, ReplaySpeed } from '../useReplayPlayback';

/** Acima disso a régua vira contínua: só remessas marcadas e rótulos espaçados. */
const DETAILED_DAYS = 45;
const SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 2, 4];

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.closest('input, textarea, select, button, a, [role="slider"]') !== null);
}

function TransportIcon({ kind }: Readonly<{ kind: 'first' | 'previous' | 'play' | 'pause' | 'restart' | 'next' }>) {
  const paths = {
    first: 'M3 2h2v12H3zM14 2v12L6 8z',
    previous: 'M12 2v12L4 8z',
    play: 'M4 2v12l10-6z',
    pause: 'M3 2h4v12H3zM9 2h4v12H9z',
    restart: 'M8 3a5 5 0 1 1-4.6 3H1.2A7 7 0 1 0 8 1V0L4.5 2.5 8 5z',
    next: 'M4 2v12l8-6z',
  } as const;
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d={paths[kind]} /></svg>;
}

export function ReplayControls({ document, playback, sort, onSort, residue = null, dateOf = null, companies = [], company = null, onCompany }: Readonly<{
  document: ReplayDocument;
  playback: ReplayPlayback;
  sort: ReplaySort;
  onSort(sort: ReplaySort): void;
  residue?: Readonly<{ day: number; valueBrl: string }> | null;
  dateOf?: ((day: number) => string) | null;
  companies?: readonly string[];
  company?: string | null;
  onCompany?(company: string | null): void;
}>) {
  const lastDay = document.period.settlement_end_day;
  const hasNextClosing = document.days.some((day) => day.day > playback.day && day.closing !== null);
  const detailed = document.days.length <= DETAILED_DAYS;
  const labelEvery = detailed ? 1 : Math.ceil(document.days.length / 12);
  const { togglePlaying, previous, next } = playback;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      if (event.key === ' ') togglePlaying();
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') previous();
      else return;
      event.preventDefault();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [next, previous, togglePlaying]);

  const playLabel = playback.primaryAction === 'RESTART' ? 'Recomeçar do início' : playback.playing ? 'Pausar reprodução' : 'Reproduzir';
  const playIcon = playback.primaryAction === 'RESTART' ? 'restart' : playback.playing ? 'pause' : 'play';

  return <section className="replay-control-panel" aria-label="Controles do Replay">
    <div className="replay-deck">
      <div className="replay-transport" role="group" aria-label="Reprodução">
        <button type="button" onClick={playback.restart} disabled={playback.day === 0} aria-label="Primeiro dia" title="Primeiro dia"><TransportIcon kind="first" /></button>
        <button type="button" onClick={playback.previous} disabled={playback.day === 0} aria-label="Anterior" title="Dia anterior (←)"><TransportIcon kind="previous" /></button>
        <button className="replay-play" type="button" onClick={playback.togglePlaying} aria-pressed={playback.playing} aria-label={playLabel} title={`${playLabel} (espaço)`}>
          <TransportIcon kind={playIcon} />
        </button>
        <button type="button" onClick={playback.next} disabled={playback.day === lastDay} aria-label="Seguinte" title="Dia seguinte (→)"><TransportIcon kind="next" /></button>
      </div>

      <div className={`replay-timeline${detailed ? '' : ' replay-timeline--dense'}`} style={{ ['--replay-days' as string]: document.days.length } as CSSProperties}>
        <div className="replay-ticks" aria-hidden="true">
          {document.days.map((day) => {
            const arrivals = day.events.filter((event) => event.kind === 'ORDER_ARRIVED').length;
            const remitted = day.events.some((event) => event.kind === 'ALLOCATION' && event.allocation_type === 'REMETIDO');
            const state = day.day < playback.day ? ' is-past' : day.day === playback.day ? ' is-now' : '';
            return <span key={day.day} className={`replay-tick${state}`}>
              <span className="replay-tick__marks">
                {detailed ? Array.from({ length: Math.min(arrivals, 4) }, (_, index) => <i key={index} className="replay-mark replay-mark--arrival" />) : null}
                {remitted ? <i className="replay-mark replay-mark--remit" /> : detailed && day.closing !== null ? <i className="replay-mark replay-mark--closing" /> : null}
              </span>
              <span className="replay-tick__rail"><i /></span>
              {day.day % labelEvery === 0 || day.day === lastDay || day.day === playback.day
                ? <span className="replay-tick__label">D{day.day}</span> : null}
            </span>;
          })}
        </div>
        <label className="visually-hidden" htmlFor="replay-day-range">Selecionar dia</label>
        <input id="replay-day-range" className="replay-scrub" aria-label="Selecionar dia" type="range" min={0} max={lastDay} value={playback.day}
          aria-valuetext={`Dia ${playback.day} de ${lastDay}${dateOf === null ? '' : `, ${dateOf(playback.day)}`}`}
          onChange={(event) => playback.selectDay(Number(event.currentTarget.value))} />
      </div>

      <div className="replay-speed" role="group" aria-label="Velocidade">
        {SPEEDS.map((speed) => <button type="button" key={speed} aria-pressed={playback.speed === speed} onClick={() => playback.setSpeed(speed)}>
          {String(speed).replace('.', ',')}×
        </button>)}
      </div>
      <span className="replay-keys" aria-hidden="true"><kbd>espaço</kbd><kbd>←</kbd><kbd>→</kbd></span>
    </div>

    <div className="replay-toolbar">
      <span className="replay-toolbar__range">D0{dateOf === null ? '' : ` · ${dateOf(0)}`} — D{lastDay}{dateOf === null ? '' : ` · ${dateOf(lastDay)}`}</span>
      <button type="button" onClick={playback.nextClosing} disabled={!hasNextClosing}>Próximo fechamento</button>
      <button type="button" onClick={playback.repeat}>Repetir evento</button>
      {residue === null ? null : <button type="button" onClick={() => playback.selectDay(residue.day)} disabled={playback.day === residue.day}
        title={`Dia com mais volume remetido: ${formatMoney(residue.valueBrl)}`}>Ir ao maior resíduo (D{residue.day})</button>}
      <div className="replay-sort" role="group" aria-label="Ordenar cartões abertos">
        <span>Ordenar</span>
        <button type="button" aria-pressed={sort === 'ARRIVAL'} onClick={() => onSort('ARRIVAL')}>Chegada</button>
        <button type="button" aria-pressed={sort === 'EDF'} onClick={() => onSort('EDF')}>EDF</button>
      </div>
      {companies.length < 2 || onCompany === undefined ? null : <label className="replay-company-filter">Empresa
        <select value={company ?? ''} onChange={(event) => onCompany(event.currentTarget.value === '' ? null : event.currentTarget.value)}>
          <option value="">Todas</option>
          {companies.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>}
    </div>
  </section>;
}
