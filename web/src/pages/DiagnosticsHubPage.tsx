import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useStudyController } from '../app/providers';
import { currentDiagnostic } from '../levers/VariationComparison';
import { formatFraction, formatMoney } from '../presentation/format';
import type { StudyDocument } from '../study/model';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';

function formatDate(iso: string | null): string {
  const match = iso === null ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match === null ? '—' : `${match[3]}/${match[2]}/${match[1]}`;
}

function StudyDiagnostics({ study }: Readonly<{ study: StudyDocument }>) {
  const [expanded, setExpanded] = useState(false);
  const base = `/estudos/${encodeURIComponent(study.id)}`;
  const regionId = `hub-scenarios-${study.id}`;
  const scenarioCount = `${study.scenarios.length} ${study.scenarios.length === 1 ? 'cenário' : 'cenários'}`;
  return <section className="diagnostics-hub__study" aria-labelledby={`hub-${study.id}`}>
    <div className="diagnostics-hub__study-header">
      <h2 id={`hub-${study.id}`}><button type="button" className="diagnostics-hub__toggle"
        aria-expanded={expanded} aria-controls={expanded ? regionId : undefined}
        aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} diagnósticos de ${study.name}`}
        onClick={() => setExpanded((current) => !current)}>
        <span>{study.name}</span>
        <small>{scenarioCount}</small>
        <span className="diagnostics-hub__toggle-icon" aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button></h2>
      <Link className="diagnostics-hub__study-link" to={`/carteira/${encodeURIComponent(study.id)}`}>Abrir estudo</Link>
    </div>
    {expanded ? <div id={regionId} className="table-scroll" role="region" tabIndex={0} aria-label={`Cenários de ${study.name}`}>
      <table className="company-table">
        <thead><tr>
          <th scope="col">Cenário</th><th scope="col" title="Parte do volume que não cruzou a fronteira">Netabilidade</th><th scope="col">Economia</th>
          <th scope="col">Diagnóstico</th><th scope="col"><span className="visually-hidden">Ações</span></th>
        </tr></thead>
        <tbody>{study.scenarios.map((scenario) => {
          const execution = currentDiagnostic(study, scenario);
          const aggregate = execution?.envelope?.selected_execution.result.agregado;
          const scenarioQuery = `scenarioId=${encodeURIComponent(scenario.id)}`;
          return <tr key={scenario.id}>
            <th scope="row">{scenario.name}<small>{scenario.id === study.baseScenarioId ? 'original' : 'variação'}</small></th>
            <td>{aggregate === undefined ? '—' : formatFraction(aggregate.taxa_netabilidade_periodo)}</td>
            <td>{aggregate === undefined ? '—' : formatMoney(aggregate.economia_periodo_brl)}</td>
            <td>{execution === null ? 'Sem diagnóstico atual' : formatDate(execution.finishedAt)}</td>
            <td className="diagnostics-hub__actions">{execution === null
              ? <Link to={`${base}/diagnostico?${scenarioQuery}`}>Executar diagnóstico</Link>
              : <>
                <Link to={`${base}/diagnostico?${scenarioQuery}&executionId=${encodeURIComponent(execution.id)}`}>Abrir</Link>
                <Link to={`${base}/apresentacao?cenario=${encodeURIComponent(scenario.id)}&execucao=${encodeURIComponent(execution.id)}`}>Apresentar</Link>
              </>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : null}
  </section>;
}

export function DiagnosticsHubPage() {
  const controller = useStudyController();
  const heading = useRef<HTMLHeadingElement>(null);
  const [studies, setStudies] = useState<StudyDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    let active = true;
    controller.listStudies().then((items) => { if (active) setStudies(items); })
      .catch(() => { if (active) setError('Não foi possível carregar os estudos.'); });
    return () => { active = false; };
  }, [controller]);
  return <article className="destination-page diagnostics-hub">
    <h1 ref={heading} tabIndex={-1}>Diagnóstico</h1>
    <p className="page-introduction">Abra um estudo para ver seus cenários e o diagnóstico mais recente de cada um. Netabilidade é a parte do volume que não cruzou a fronteira.</p>
    {error === null ? null : <InlineNotice tone="error">{error}</InlineNotice>}
    {studies === null && error === null ? <p role="status">Carregando estudos…</p> : null}
    {studies !== null && studies.length === 0
      ? <EmptyState title="Nenhum estudo ainda">Crie um estudo em Estudos para executar o primeiro diagnóstico.</EmptyState> : null}
    {studies?.map((study) => <StudyDiagnostics key={study.id} study={study} />)}
  </article>;
}
