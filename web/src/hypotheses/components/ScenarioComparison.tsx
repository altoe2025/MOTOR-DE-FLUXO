import { AXIS_TITLES, type MvpComparison } from '../comparison';

function display(value: string | null, unit: string): string {
  if (value === null) return 'Indisponível';
  return `${value} ${unit}`;
}

export function ScenarioComparison({ comparison }: Readonly<{ comparison: MvpComparison }>) {
  return <div className="scenario-comparison">
    <section className="comparison-limitations" aria-labelledby="comparison-limitations-title">
      <h2 id="comparison-limitations-title">Limitações da comparação</h2>
      <ul>{comparison.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
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
