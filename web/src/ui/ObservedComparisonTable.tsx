import type { ObservedComparison, ObservedComparisonRow } from '../cases/observedComparison';
import { formatFraction, formatMoney, formatSignedMoney } from '../presentation/format';

const STATUS_LABEL: Record<ObservedComparisonRow['status'], string> = {
  MATCHED: 'Coincide',
  DIFFERENT: 'Diferente',
  NOT_OBSERVED: 'Não observado',
  INCOMPATIBLE: 'Incompatível',
};

export function ObservedComparisonTable({ comparison }: { comparison: ObservedComparison | null }) {
  return (
    <section className="cost-table-section" aria-labelledby="observed-comparison-title">
      <p className="eyebrow">Conciliação</p>
      <h2 id="observed-comparison-title">Observado × Motor</h2>
      {comparison === null ? <p>Resultado observado não informado.</p> : (
        <table>
          <caption>Diferença = Motor − Observado. O percentual usa o observado como base.</caption>
          <thead><tr><th scope="col">Métrica</th><th scope="col">Observado</th><th scope="col">Motor</th><th scope="col">Diferença</th><th scope="col">Percentual</th><th scope="col">Estado</th></tr></thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.code}>
                <th scope="row">{row.label}</th>
                <td>{row.observedValue === null ? 'não informado' : formatMoney(row.observedValue)}</td>
                <td>{formatMoney(row.motorValue)}</td>
                <td>{formatSignedMoney(row.difference)}</td>
                <td>{formatFraction(row.percentageDifference)}</td>
                <td>
                  <strong>{STATUS_LABEL[row.status]}</strong>
                  {row.status === 'INCOMPATIBLE' ? <small><br />{row.explanation}</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
