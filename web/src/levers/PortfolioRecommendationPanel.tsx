import Decimal from 'decimal.js';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatBps, formatDecimal, formatMoney } from '../presentation/format';
import type { StudyDocument } from '../study/model';
import { recommendPortfolios } from './portfolioRecommendation';

export function PortfolioRecommendation({ study }: Readonly<{ study: StudyDocument }>) {
  const [waitLimit, setWaitLimit] = useState('');
  const fieldId = useId();
  const normalized = waitLimit.trim().replace(',', '.');
  const maxWaitDays = normalized === '' ? null : Number(normalized);
  const valid = normalized === '' || (/^\d+(?:\.\d+)?$/.test(normalized)
    && maxWaitDays !== null && Number.isFinite(maxWaitDays) && maxWaitDays >= 0);
  const recommendation = recommendPortfolios(study, valid ? maxWaitDays : null);
  const winner = valid ? recommendation.winner : null;
  const combinationStudy = study.studyType === 'PORTFOLIO_COMBINATIONS';
  const visibleExcluded = combinationStudy ? recommendation.excluded.slice(0, 5) : recommendation.excluded;
  const alternatives = recommendation.candidates.filter((candidate) => candidate.scenarioId !== winner?.scenarioId);
  const runnerUp = alternatives.find((candidate) => candidate.eligible);
  const waitDifference = winner && runnerUp ? winner.waitDays - runnerUp.waitDays : null;
  const link = (scenarioId: string) => `/estudos/${encodeURIComponent(study.id)}/diagnostico?scenarioId=${encodeURIComponent(scenarioId)}`;
  const wait = (days: number) => `${formatDecimal(String(days), 2)} dias`;

  return <section className="savings-origin" aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`}>Qual carteira atende melhor?</h2>
    <p><strong>Objetivo: Maior economia</strong></p>
    <label htmlFor={fieldId}>Limite de espera média (dias, opcional)</label>
    <input id={fieldId} type="text" inputMode="decimal" value={waitLimit}
      placeholder="Sem limite" aria-invalid={!valid} aria-describedby={`${fieldId}-hint`}
      onChange={(event) => setWaitLimit(event.target.value)} />
    <p id={`${fieldId}-hint`} className="field-hint">Deixe vazio para não limitar. A espera é a média ponderada pelo volume, não o prazo máximo de cada operação.</p>
    {!valid ? <p role="alert">Informe um número de dias igual ou maior que zero, como 2,5.</p> : <div aria-live="polite">
      {winner === null ? <p>{recommendation.candidates.length === 0
        ? 'Ainda não há carteiras comparáveis com diagnóstico atual. Rode os cenários para avaliar as composições.'
        : 'Nenhuma carteira avaliada atende ao limite de espera média. Aumente ou remova o limite para ver uma recomendação.'}</p> : <>
        <h3>Composição recomendada: {winner.name}</h3>
        {new Decimal(winner.savings).lte(0) ? <p role="note">Mesmo a melhor composição avaliada não reduz o custo em relação à execução sem pool.</p> : null}
        <p><strong>Empresas:</strong> {winner.companies.join(', ')}</p>
        <dl>
          <dt>Economia</dt><dd>{formatMoney(winner.savings)}</dd>
          <dt>Economia sobre o volume</dt><dd>{new Decimal(winner.volume).isZero() ? '—' : formatBps(new Decimal(winner.savings).div(winner.volume).times(10000).toFixed())}</dd>
          <dt>Volume da carteira</dt><dd>{formatMoney(winner.volume)}</dd>
          <dt>Espera média ponderada</dt><dd>{wait(winner.waitDays)}</dd>
        </dl>
        {runnerUp === undefined ? null : <p className="field-hint">Em relação à próxima alternativa que atende, {runnerUp.name}: {formatMoney(new Decimal(winner.savings).minus(runnerUp.savings).toFixed())} a mais de economia; diferença de espera média de {waitDifference !== null && waitDifference > 0 ? '+' : ''}{formatDecimal(String(waitDifference), 2)} dias.</p>}
        <Link to={link(winner.scenarioId)}>Abrir composição</Link>
      </>}
    </div>}
    <p className="field-hint">A recomendação escolhe a maior economia entre as composições avaliadas e comparáveis deste estudo. Não garante a melhor combinação possível. Os custos das empresas que ficam fora da carteira não entram nesta comparação.</p>
    {!valid || alternatives.length === 0 ? null : <div className="table-scroll" role="region" tabIndex={0} aria-label="Outras composições avaliadas">
      <table className="company-table">
        <caption>Outras composições avaliadas, por economia</caption>
        <thead><tr><th scope="col">Composição</th><th scope="col">Economia</th><th scope="col">Volume</th><th scope="col">Espera média</th><th scope="col">Critério</th></tr></thead>
        <tbody>{alternatives.slice(0, 5).map((candidate) => <tr key={candidate.scenarioId}>
          <th scope="row"><Link to={link(candidate.scenarioId)}>{candidate.name}</Link><small>{candidate.companies.join(', ')}</small></th>
          <td>{formatMoney(candidate.savings)}</td><td>{formatMoney(candidate.volume)}</td>
          <td>{wait(candidate.waitDays)}</td><td>{candidate.eligible ? 'Atende' : 'Acima do limite de espera'}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {valid && alternatives.length > 5 ? <p className="field-hint">Mostrando as 5 alternativas com maior economia entre {alternatives.length} avaliadas.{combinationStudy ? null : ' A comparação abaixo traz todos os cenários.'}</p> : null}
    {recommendation.excluded.length === 0 ? null : <details>
      <summary>Cenários fora da recomendação ({recommendation.excluded.length})</summary>
      <ul>{visibleExcluded.map((scenario) => <li key={scenario.scenarioId}>
        <strong>{scenario.name}:</strong> {scenario.reason}
      </li>)}</ul>
      {visibleExcluded.length < recommendation.excluded.length ? <p className="field-hint">Mostrando os motivos de 5 composições. As demais seguem os mesmos critérios de comparação.</p> : null}
    </details>}
  </section>;
}
