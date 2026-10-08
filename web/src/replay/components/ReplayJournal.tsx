import { formatMoney } from '../../presentation/format';
import type { ReplayDocument } from '../domain';
import { presentReplayDay, presentReplayHistory } from '../presentation';

export function ReplayJournal({ document, day }: Readonly<{ document: ReplayDocument; day: number }>) {
  const view = presentReplayDay(document, day);
  const history = presentReplayHistory(document, day);
  return <section className="replay-journal" aria-labelledby="replay-journal-heading">
    <div className="replay-journal__heading">
      <div><p className="eyebrow">Registro factual acumulado</p><h2 id="replay-journal-heading">Diário do Replay</h2></div>
      <span>D0–D{day}</span>
    </div>
    <dl className="replay-day-values">
      <div><dt>Casado no dia</dt><dd>{formatMoney(view.matchedContributionBrl)}</dd></div>
      <div><dt>Remetido OUT</dt><dd>{formatMoney(view.remittedOutBrl)}</dd></div>
      <div><dt>Remetido IN</dt><dd>{formatMoney(view.remittedInBrl)}</dd></div>
      <div><dt>Ainda aberto</dt><dd>{formatMoney(view.openBrl)}</dd></div>
    </dl>
    <p className="replay-journal__definition">{view.explanation} Posição de tesouraria no dia: {formatMoney(view.matchedPositionBrl)}.</p>
    <div className="replay-journal__history">
      {history.map((group) => <section key={group.day} className="replay-journal__day" aria-labelledby={`replay-journal-day-${group.day}`}>
        <h3 id={`replay-journal-day-${group.day}`}>Dia {group.day}</h3>
        <ol>{group.entries.map((entry, index) => <li key={`${group.day}-${index}`}>{entry}</li>)}</ol>
      </section>)}
    </div>
  </section>;
}
