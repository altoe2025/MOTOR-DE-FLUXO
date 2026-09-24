import { AXIS_TITLES, type MvpComparison } from '../comparison';
import { AskAboutThis } from '../../help/AskAboutThis';
import { HELP_IDS } from '../../help/helpIds';

const LIMITATION_LABELS: Readonly<Record<string, string>> = {
  COMPOSITION_CHANGED: 'A composição mudou; os resultados representam diagnósticos agregados de carteiras diferentes.',
  UNPAIRED_DIAGNOSTICS: 'As execuções são diagnósticos independentes e não formam uma amostra pareada.',
};

function display(value: string | null, unit: string): string {
  if (value === null) return 'Indisponível';
  return `${value} ${unit}`;
}

export function ScenarioComparison({ comparison }: Readonly<{ comparison: MvpComparison }>) {
  return <div className="scenario-comparison">
    <section className="comparison-limitations" aria-labelledby="comparison-limitations-title">
      <h2 id="comparison-limitations-title">Limitações da comparação</h2>
      <AskAboutThis helpId={HELP_IDS.COMPARISON_PAGE} contextKind="LIMITATIONS" />
      <ul>{comparison.limitations.map((item) => <li key={item}>{LIMITATION_LABELS[item] ?? item}</li>)}</ul>
    </section>
    <section className="comparison-inputs" aria-labelledby="comparison-composition-title">
      <h2 id="comparison-composition-title">Mudanças na composição</h2>
      <div className="table-scroll" role="region" tabIndex={0} aria-label="Tabela rolável — mudanças na composição">
        <table className="diagnostic-table"><caption>Participantes mantidos, adicionados, removidos e alterados</caption>
          <thead><tr><th>Participante</th><th>Classificação</th><th>Detalhes</th></tr></thead>
          <tbody>
            {comparison.compatibility.added.map((item) => <tr key={`added-${item.participantId}`}><th scope="row">{item.participantId}</th><td>Adicionado</td><td>{item.profileId ?? 'Perfil indisponível'}</td></tr>)}
            {comparison.compatibility.removed.map((item) => <tr key={`removed-${item.participantId}`}><th scope="row">{item.participantId}</th><td>Removido</td><td>{item.profileId ?? 'Perfil indisponível'}</td></tr>)}
            {comparison.compatibility.modified.map((item) => <tr key={`modified-${item.participantId}`}><th scope="row">{item.participantId}</th><td>Alterado</td><td>{item.fields.join(', ')}</td></tr>)}
            {comparison.compatibility.added.length + comparison.compatibility.removed.length + comparison.compatibility.modified.length === 0
              ? <tr><td colSpan={3}>Mesma composição de participantes.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
    <section className="comparison-inputs" aria-labelledby="comparison-inputs-title">
      <h2 id="comparison-inputs-title">Entradas alteradas</h2>
      {comparison.inputChanges.length === 0 ? <p>Nenhuma entrada autorizada divergiu.</p> : <ul>{comparison.inputChanges.map((item) => <li key={item.code}><strong>{item.label}</strong>: {item.before} → {item.after}</li>)}</ul>}
    </section>
    {Object.entries(AXIS_TITLES).map(([axis, title]) => {
      const metrics = comparison.axes.filter((item) => item.axis === axis);
      return <section key={axis} className="comparison-axis" aria-labelledby={`comparison-${axis}`}>
        <h2 id={`comparison-${axis}`}>{title}</h2>
        <div className="table-scroll" role="region" tabIndex={0} aria-label={`Tabela rolável — ${title}`}><table className="diagnostic-table">
          <caption>{title}: base, hipótese e diferença</caption>
          <thead><tr><th>Métrica</th><th>Base</th><th>Hipótese</th><th>Diferença</th></tr></thead>
          <tbody>{metrics.map((item) => <tr key={item.metric}><th scope="row">{item.label}</th><td>{display(item.base, item.unit)}</td><td>{display(item.hypothesis, item.unit)}</td><td>{item.state === 'AVAILABLE' ? display(item.delta, item.unit) : `Indisponível: ${item.reason ?? 'sem evidência'}`}</td></tr>)}</tbody>
        </table></div>
      </section>;
    })}
  </div>;
}
