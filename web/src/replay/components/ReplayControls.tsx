import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { formatMoney } from '../../presentation/format';
import type { ReplayDocument, ReplaySort } from '../domain';
import { timelineDayX, timelineLabels, TIMELINE_FALLBACK_WIDTH_PX } from '../timeline';
import type { ReplayPlayback, ReplaySpeed } from '../useReplayPlayback';

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

type TimelineDay = Readonly<{ day: number; arrivals: number; closing: boolean; remitted: boolean }>;

function daySummary(day: TimelineDay): string {
  const parts: string[] = [];
  if (day.arrivals > 0) parts.push(`${day.arrivals} chegada${day.arrivals === 1 ? '' : 's'}`);
  if (day.remitted) parts.push('fechamento com remessa');
  else if (day.closing) parts.push('fechamento');
  return parts.join(' · ');
}

/**
 * Régua de dias: chegadas em barras, fechamento e remessa em losangos, rótulos espaçados pela
 * largura disponível e o dia atual numa etiqueta. O deslizante invisível continua sendo o controle.
 */
function ReplayTimeline({ document, day, dateOf, onSelect }: Readonly<{
  document: ReplayDocument;
  day: number;
  dateOf: ((day: number) => string) | null;
  onSelect(day: number): void;
}>) {
  const ruler = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const count = document.days.length;
  const lastDay = document.period.settlement_end_day;

  useLayoutEffect(() => {
    const element = ruler.current;
    if (element === null) return undefined;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    // ResizeObserver cobre mudanças de layout; o resize da janela é a rede de segurança.
    globalThis.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => { globalThis.removeEventListener('resize', measure); observer?.disconnect(); };
  }, []);

  const days = useMemo<readonly TimelineDay[]>(() => document.days.map((item) => ({
    day: item.day,
    arrivals: item.events.filter((event) => event.kind === 'ORDER_ARRIVED').length,
    closing: item.closing !== null,
    remitted: item.events.some((event) => event.kind === 'ALLOCATION' && event.allocation_type === 'REMETIDO'),
  })), [document]);

  const effective = width > 0 ? width : TIMELINE_FALLBACK_WIDTH_PX;
  const dayWidth = effective / Math.max(1, count);
  const most = Math.max(1, ...days.map((item) => item.arrivals));
  const barWidth = Math.max(2, Math.min(8, dayWidth - 3));
  const percent = (value: number) => `${(timelineDayX(value, count, 1) * 100).toFixed(4)}%`;
  const labels = timelineLabels({
    dayCount: count, current: day, widthPx: width,
    nowText: `D${day}${dateOf === null ? '' : ` · ${dateOf(day).slice(0, 5)}`}`,
  });
  const summary = days[day] === undefined ? '' : daySummary(days[day]);

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const span = box.width > 0 ? box.width : TIMELINE_FALLBACK_WIDTH_PX;
    setHovered(Math.max(0, Math.min(count - 1, Math.floor(((event.clientX - box.left) / span) * count))));
  };
  const hoveredDay = hovered === null ? null : days[hovered] ?? null;

  return <div ref={ruler} className="replay-timeline" style={{ ['--replay-days' as string]: count } as CSSProperties}
    onMouseMove={onMove} onMouseLeave={() => setHovered(null)}>
    <div className="replay-timeline__bars" aria-hidden="true">
      {days.filter((item) => item.arrivals > 0).map((item) => <i key={item.day} data-day={item.day}
        className={`replay-timeline__bar${item.day <= day ? ' is-past' : ''}`}
        style={{ left: percent(item.day), width: `${barWidth}px`, height: `${4 + Math.round((14 * item.arrivals) / most)}px` }} />)}
    </div>
    <div className="replay-timeline__marks" aria-hidden="true">
      {days.map((item) => item.remitted
        ? <i key={item.day} data-day={item.day} className="replay-mark replay-mark--remit" style={{ left: percent(item.day) }} />
        : item.closing && dayWidth >= 6
          ? <i key={item.day} data-day={item.day} className="replay-mark replay-mark--closing" style={{ left: percent(item.day) }} />
          : null)}
    </div>
    <div className="replay-timeline__rail" aria-hidden="true"><i style={{ width: percent(day) }} /></div>
    <span className="replay-timeline__knob" aria-hidden="true" style={{ left: percent(day) }} />
    <div className="replay-timeline__labels" aria-hidden="true">
      {labels.days.map((item) => <span key={item} className="replay-timeline__label" style={{ left: percent(item) }}>D{item}</span>)}
      <span className="replay-timeline__now" style={{ left: width > 0 ? `${labels.now.leftPx}px` : `${(labels.now.leftPx / effective) * 100}%` }}>{labels.now.text}</span>
    </div>
    <div className={`replay-timeline__tip${hoveredDay === null ? '' : ' is-visible'}`} aria-hidden="true"
      style={hoveredDay === null ? undefined : { left: percent(hoveredDay.day) }}>
      {hoveredDay === null ? null : <>D{hoveredDay.day}{dateOf === null ? '' : ` · ${dateOf(hoveredDay.day)}`}
        <small>{daySummary(hoveredDay) || 'sem evento'}</small></>}
    </div>
    <label className="visually-hidden" htmlFor="replay-day-range">Selecionar dia</label>
    <input id="replay-day-range" className="replay-scrub" aria-label="Selecionar dia" type="range" min={0} max={lastDay} value={day}
      aria-valuetext={`Dia ${day} de ${lastDay}${dateOf === null ? '' : `, ${dateOf(day)}`}${summary === '' ? '' : ` · ${summary}`}`}
      onChange={(event) => onSelect(Number(event.currentTarget.value))} />
  </div>;
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

      <ReplayTimeline document={document} day={playback.day} dateOf={dateOf} onSelect={playback.selectDay} />

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
