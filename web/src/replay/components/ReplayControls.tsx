import { formatMoney } from '../../presentation/format';
import type { ReplayDocument, ReplaySort } from '../domain';
import type { ReplayPlayback } from '../useReplayPlayback';

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
      {residue === null ? null : <button type="button" onClick={() => playback.selectDay(residue.day)} disabled={playback.day === residue.day}
        title={`Dia com mais volume remetido: ${formatMoney(residue.valueBrl)}`}>Ir ao maior resíduo (D{residue.day})</button>}
    </div>
    <div className="replay-timeline">
      <div><span>D0{dateOf === null ? '' : ` · ${dateOf(0)}`}</span><span className="replay-timeline__current"><strong>D{playback.day}</strong><button
        className="replay-timeline__toggle" type="button" onClick={playback.togglePlaying} aria-pressed={playback.playing}
        aria-label={playback.primaryAction === 'RESTART' ? 'Recomeçar' : playback.playing ? 'Pausar' : 'Tocar'}>
        {playback.primaryAction === 'RESTART' ? '↺' : playback.playing ? 'Ⅱ' : '▶'}
      </button></span><span>D{lastDay}{dateOf === null ? '' : ` · ${dateOf(lastDay)}`}</span></div>
      <label className="visually-hidden" htmlFor="replay-day-range">Selecionar dia</label>
      <input id="replay-day-range" aria-label="Selecionar dia" type="range" min={0} max={lastDay} value={playback.day} onChange={(event) => playback.selectDay(Number(event.currentTarget.value))} />
      <div className="replay-closing-marks" aria-hidden="true">{document.days.filter((day) => day.closing !== null).map((day) => <i key={day.day} style={{ left: `${lastDay === 0 ? 0 : (day.day / lastDay) * 100}%` }} />)}</div>
    </div>
    <div className="replay-sort" role="group" aria-label="Ordenar cartões abertos">
      <span>Ordenar</span>
      <button type="button" aria-pressed={sort === 'ARRIVAL'} onClick={() => onSort('ARRIVAL')}>Chegada</button>
      <button type="button" aria-pressed={sort === 'EDF'} onClick={() => onSort('EDF')}>EDF</button>
      {companies.length < 2 || onCompany === undefined ? null : <label className="replay-company-filter">Empresa
        <select value={company ?? ''} onChange={(event) => onCompany(event.currentTarget.value === '' ? null : event.currentTarget.value)}>
          <option value="">Todas</option>
          {companies.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>}
    </div>
  </section>;
}
