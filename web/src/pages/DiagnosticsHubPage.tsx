import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useStudyController } from '../app/providers';
import { currentDiagnostic } from '../levers/savingsOrigin';
import { formatFraction, formatMoney } from '../presentation/format';
import type { StudySummary } from '../storage/applicationRepository';
import type { StudyDocument } from '../study/model';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';

function formatDate(iso: string | null): string {
  const match = iso === null ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match === null ? '—' : `${match[3]}/${match[2]}/${match[1]}`;
}

function PortfolioCombinationDiagnostics({ summary }: Readonly<{ summary: StudySummary }>) {
  const scenarioCount = `${summary.scenarioCount} ${summary.scenarioCount === 1 ? 'cenário' : 'cenários'}`;
  return <section className="diagnostics-hub__study" aria-labelledby={`hub-${summary.id}`}>
    <div className="diagnostics-hub__study-header">
      <h2 id={`hub-${summary.id}`}><span>{summary.name}</span> <small>{scenarioCount}</small></h2>
      <Link className="diagnostics-hub__study-link"
        to={`/estudos/${encodeURIComponent(summary.id)}/diagnostico`}>Abrir recomendação</Link>
    </div>
  </section>;
}

function StudyDiagnostics({ summary, readStudy }: Readonly<{ summary: StudySummary; readStudy(id: string): Promise<StudyDocument | null> }>) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<'collapsed' | 'loading' | 'loaded' | 'error'>('collapsed');
  const [study, setStudy] = useState<StudyDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlight = useRef<Promise<StudyDocument | null> | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const toggle = () => {
    if (expanded && state !== 'error') { setExpanded(false); return; }
    setExpanded(true);
    if (study !== null || inFlight.current !== null) return;
    setState('loading'); setLoadError(null);
    const reading = readStudy(summary.id);
    inFlight.current = reading;
    void reading.then((loaded) => {
      if (!active.current) return;
      if (loaded === null) throw new Error('Estudo não encontrado.');
      setStudy(loaded); setState('loaded');
    }).catch((reason: unknown) => {
      if (!active.current) return;
      setLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar os cenários.');
      setState('error');
    }).finally(() => { if (inFlight.current === reading) inFlight.current = null; });
  };
  const base = `/estudos/${encodeURIComponent(summary.id)}`;
  const regionId = `hub-scenarios-${summary.id}`;
  const scenarioCount = `${summary.scenarioCount} ${summary.scenarioCount === 1 ? 'cenário' : 'cenários'}`;
  return <section className="diagnostics-hub__study" aria-labelledby={`hub-${summary.id}`}>
    <div className="diagnostics-hub__study-header">
      <h2 id={`hub-${summary.id}`}><button type="button" className="diagnostics-hub__toggle"
        aria-expanded={expanded} aria-controls={expanded ? regionId : undefined}
        aria-label={`${state === 'error' && expanded ? 'Tentar novamente os' : expanded ? 'Ocultar' : 'Mostrar'} diagnósticos de ${summary.name}`}
        onClick={toggle}>
        <span>{summary.name}</span>
        <small>{scenarioCount}</small>
        <span className="diagnostics-hub__toggle-icon" aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button></h2>
      <Link className="diagnostics-hub__study-link" to={`/carteira/${encodeURIComponent(summary.id)}`}>Abrir estudo</Link>
    </div>
    {expanded && state === 'loading' ? <p id={regionId} role="status">Carregando cenários de {summary.name}…</p> : null}
    {expanded && state === 'error' ? <p id={regionId} role="alert">{loadError}</p> : null}
    {expanded && state === 'loaded' && study !== null ? <div id={regionId} className="table-scroll" role="region" tabIndex={0} aria-label={`Cenários de ${summary.name}`}>
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
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    let active = true;
    controller.listStudySummaries().then((items) => { if (active) setStudies(items); })
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
    {studies?.map((study) => study.studyType === 'PORTFOLIO_COMBINATIONS'
      ? <PortfolioCombinationDiagnostics key={study.id} summary={study} />
      : <StudyDiagnostics key={study.id} summary={study} readStudy={(id) => controller.readStudy(id)} />)}
  </article>;
}
