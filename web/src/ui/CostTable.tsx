import type { PreviewEnvelope } from '../study/model';
import { formatMoney } from '../presentation/format';

const rows = [
  ['IOF', 'iof'],
  ['Spread', 'spread'],
  ['Tarifa fixa', 'fixo'],
  ['Carregamento', 'carry'],
  ['Espera', 'espera'],
] as const;

export function CostTable({ envelope }: { envelope: PreviewEnvelope }) {
  const aggregate = envelope.result.agregado;
  return (
    <section className="cost-table-section" aria-labelledby="cost-table-title">
      <h2 id="cost-table-title">Decomposição de custos</h2>
      <table>
        <caption>Custos informados pela prévia canônica.</caption>
        <thead><tr><th scope="col">Componente</th><th scope="col">Sem agrupamento</th><th scope="col">Com agrupamento</th></tr></thead>
        <tbody>
          <tr><th scope="row">Total</th><td>{formatMoney(aggregate.baseline_periodo.total)}</td><td>{formatMoney(aggregate.netado_periodo.total)}</td></tr>
          {rows.map(([label, key]) => <tr key={key}><th scope="row">{label}</th><td>{formatMoney(aggregate.baseline_periodo[key])}</td><td>{formatMoney(aggregate.netado_periodo[key])}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}
