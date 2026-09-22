import type { ReplayDocument, ReplaySort } from '../domain';
import type { ReplayPlayback } from '../useReplayPlayback';

export function ReplayControls({ document, playback, sort, onSort }: Readonly<{
  document: ReplayDocument;
  playback: ReplayPlayback;
  sort: ReplaySort;
  onSort(sort: ReplaySort): void;
}>) {
  const lastDay = document.period.settlement_end_day;
  const hasNextClosing = document.days.some((day) => day.day > playback.day && day.closing !== null);
  return <section className="replay-control-panel" aria-label="Controles do Replay">
    <div className="replay-transport">
      <button className="replay-play" type="button" onClick={playback.togglePlaying} aria-pressed={playback.playing}>
        {playback.primaryAction === 'RESTART' ? '↺ Recomeçar' : playback.playing ? 'Ⅱ Pausar' : '▶ Tocar'}
      </button>
      <div className="replay-speed" aria-label="Velocidade">
        {([1, 2, 4] as const).map((speed) => <button type="button" key={speed} aria-pressed={playback.speed === speed} onClick={() => playback.setSpeed(speed)}>{speed}×</button>)}
      </div>
      <button type="button" onClick={playback.previous} disabled={playback.day === 0}>← Anterior</button>
      <button type="button" onClick={playback.next} disabled={playback.day === lastDay}>Seguinte →</button>
      <button type="button" onClick={playback.nextClosing} disabled={!hasNextClosing}>Próximo fechamento</button>
      <button type="button" onClick={playback.repeat}>Repetir evento</button>
    </div>
    <div className="replay-timeline">
      <div><span>D0</span><strong>Dia {playback.day} de {lastDay}</strong><span>D{lastDay}</span></div>
      <label className="visually-hidden" htmlFor="replay-day-range">Selecionar dia</label>
      <input id="replay-day-range" aria-label="Selecionar dia" type="range" min={0} max={lastDay} value={playback.day} onChange={(event) => playback.selectDay(Number(event.currentTarget.value))} />
      <div className="replay-closing-marks" aria-hidden="true">{document.days.filter((day) => day.closing !== null).map((day) => <i key={day.day} style={{ left: `${lastDay === 0 ? 0 : (day.day / lastDay) * 100}%` }} />)}</div>
    </div>
    <div className="replay-sort" role="group" aria-label="Ordenar cartões abertos">
      <span>Ordenar</span>
      <button type="button" aria-pressed={sort === 'ARRIVAL'} onClick={() => onSort('ARRIVAL')}>Chegada</button>
      <button type="button" aria-pressed={sort === 'EDF'} onClick={() => onSort('EDF')}>EDF</button>
    </div>
  </section>;
}
