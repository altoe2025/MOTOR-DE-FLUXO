import Decimal from 'decimal.js';
import { useId } from 'react';

import { formatMoney, formatSignedMoney } from '../presentation/format';
import type { PortfolioMetrics } from './portfolioAnalysis';

const components = [
  ['iof', 'IOF'], ['carry', 'Carry'], ['spread', 'Spread'], ['espera', 'Espera'], ['fixo', 'Fixo'],
] as const;

export function PortfolioSelectionDetails({ selected }: Readonly<{ selected: PortfolioMetrics }>) {
  const titleId = useId();
  const values = [selected.savings, ...Object.values(selected.costDelta)];
  const Exact = Decimal.clone({ precision: values.reduce((total, value) => total + value.length, 20) });
  const total = components.reduce((sum, [key]) => sum.plus(selected.costDelta[key]), new Exact(0));
  const residual = new Exact(selected.savings).minus(total);
  return <section className="portfolio-selection-details" aria-labelledby={titleId}>
    <span className="eyebrow">04 / Entenda o resultado</span>
    <h3 id={titleId}>Detalhes da composição: {selected.name}</h3>
    <dl className="portfolio-selection-metrics">
      <div><dt>Custo sem pool</dt><dd>{formatMoney(selected.baseline)}</dd></div>
      <div><dt>Custo com pool</dt><dd>{formatMoney(selected.netted)}</dd></div>
      <div><dt>Economia total</dt><dd>{formatSignedMoney(selected.savings)}</dd></div>
      <div><dt>Espera P95 por volume</dt><dd>{selected.waitP95Days} dias</dd></div>
    </dl>
    <p className="field-hint">O P95 indica em quantos dias 95% do volume foi resolvido; não é o prazo máximo de cada operação.</p>
    <p>Diferenças de custo no período: custo sem pool menos custo com pool. Valores negativos representam aumento de custo.</p>
    {!residual.isZero() ? <p role="note">Arredondamentos independentes podem gerar resíduos de precisão.
      {' '}Diferença de reconciliação (economia publicada menos soma dos componentes): {residual.toFixed()} BRL.
      {' '}Os totais e a economia publicados permanecem a referência; todos os componentes estão preservados abaixo.</p> : null}
    <div className="table-scroll portfolio-cost-breakdown" role="region" tabIndex={0} aria-label="Diferenças dos componentes de custo">
      <table className="company-table">
        <caption>Decomposição da economia no período</caption>
        <thead><tr><th scope="col">Componente</th><th scope="col">Diferença (R$)</th></tr></thead>
        <tbody>{components.map(([key, label]) => <tr key={key}>
          <th scope="row">{label}</th><td>{formatSignedMoney(selected.costDelta[key])}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Soma dos componentes</th><td>{formatSignedMoney(total.toFixed())}</td></tr></tfoot>
      </table>
    </div>
  </section>;
}
