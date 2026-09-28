import type { CommunicationDocumentV1, CommunicationMetric } from '../../communication/domain';
import { difference } from '../derived';
import { formatMoney, formatSignedMoney } from '../format';
import type { PresentationStory } from '../story';
import { evidenceAttributes, metricText } from './DocumentItems';

type VariationRow = Readonly<{
  position: string; name: string; scenarioId: string;
  savings: CommunicationMetric | undefined; netability: CommunicationMetric | undefined;
  baseline: CommunicationMetric | undefined; netted: CommunicationMetric | undefined;
}>;

export function variationRows(document: CommunicationDocumentV1): VariationRow[] {
  const facts = document.economics.facts;
  return facts.filter((fact) => /^variation\.\d+\.name$/.test(fact.code)).map((nameFact) => {
    const position = nameFact.code.split('.')[1]!;
    const find = (name: string) => document.economics.metrics.find((metric) => metric.code === `variation.${position}.${name}`);
    return {
      position, name: nameFact.value,
      scenarioId: facts.find((fact) => fact.code === `variation.${position}.scenario`)?.value ?? '',
      savings: find('savings'), netability: find('netability'), baseline: find('baseline'), netted: find('netted'),
    };
  });
}

export function VariationsSection({ document, story }: Readonly<{
  document: CommunicationDocumentV1;
  story: PresentationStory | null;
}>) {
  const rows = variationRows(document);
  if (rows.length < 2) return null;
  const baseId = document.economics.facts.find((fact) => fact.code === 'VARIATION_BASE')?.value;
  const base = rows.find((row) => row.scenarioId === baseId);
  const origin = story?.origin ?? [];
  const hasSolo = origin.some((entry) => entry.solo !== undefined);
  const cell = (metric: CommunicationMetric | undefined) => metric === undefined ? '—' : metricText(document, metric);
  return <section id="variacoes" aria-labelledby="variacoes-title" data-route-id="presentation">
    <h2 id="variacoes-title">Original × variações</h2>
    <p className="presentation-lead">Cada cenário do estudo com diagnóstico atual. Netabilidade é a parte do volume que não cruzou a fronteira.</p>
    <div className="table-scroll"><table className="presentation-table">
      <caption className="visually-hidden">Comparação entre o original e as variações</caption>
      <thead><tr><th scope="col">Cenário</th><th scope="col">Netabilidade</th><th scope="col">Custo sem pool</th>
        <th scope="col">Custo com pool</th><th scope="col">Economia</th><th scope="col">Δ economia</th></tr></thead>
      <tbody>{rows.map((row) => {
        const isBase = row === base;
        const delta = isBase ? null : difference(row.savings?.value, base?.savings?.value);
        return <tr key={row.position} aria-current={row.scenarioId === document.selection.scenarioId ? 'true' : undefined}
          {...(row.savings === undefined ? {} : evidenceAttributes(document, row.savings.evidenceRefs))}>
          <th scope="row">{row.name}{isBase ? <small> (original)</small> : null}</th>
          <td>{cell(row.netability)}</td><td>{cell(row.baseline)}</td><td>{cell(row.netted)}</td><td>{cell(row.savings)}</td>
          <td>{delta === null ? '—' : formatSignedMoney(delta)}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {origin.length < 2 ? null : <>
      <h3>De onde vem a economia de cada empresa</h3>
      {!hasSolo ? <p className="presentation-lead">Para separar o que cada empresa faria sozinha do que a carteira acrescenta, gere as combinações no estudo e rode o diagnóstico de todas.</p> : <>
        <p className="presentation-lead">“Sozinha” é a mesma empresa rodada sem as outras. O que ela casa sozinha se divide em mesma linha (o mesmo cliente com IN e OUT) e entre linhas da própria empresa. O ganho da carteira é o que só existe porque as outras empresas estão junto. Repartição calculada a partir das ordens de cada cenário, contra “{story!.baseName}”.</p>
        <div className="table-scroll"><table className="presentation-table">
          <caption className="visually-hidden">Origem da economia por empresa</caption>
          <thead><tr><th scope="col">Empresa</th><th scope="col">Sozinha · mesma linha</th><th scope="col">Sozinha · entre linhas</th>
            <th scope="col">Economia sozinha</th><th scope="col">Economia na carteira</th><th scope="col">Ganho da carteira</th></tr></thead>
          <tbody>{origin.map(({ item, solo }) => <tr key={item.group}>
            <th scope="row">{item.group}</th>
            <td>{solo === undefined ? '—' : formatMoney(solo.matchedOwn)}</td>
            <td>{solo === undefined ? '—' : formatMoney(solo.matchedOthers)}</td>
            <td>{solo === undefined ? '—' : formatMoney(solo.savings)}</td>
            <td>{formatMoney(item.savings)}</td>
            <td>{solo === undefined ? '—' : formatSignedMoney(difference(item.savings, solo.savings))}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </>}
  </section>;
}
