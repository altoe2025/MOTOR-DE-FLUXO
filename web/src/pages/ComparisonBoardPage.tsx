import Decimal from 'decimal.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useStudyController } from '../app/providers';
import { Button } from '../ui/Button';
import { companyResolver } from '../levers/companies';
import { breakdownByCompany, type Breakdown } from './comparisonBoardBreakdown';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { formatFraction, formatMoney } from '../presentation/format';
import type { ExecutionRecordV3, PreviewEnvelope, ScenarioDocument, StudyDocument } from '../study/model';

type BoardRow = Readonly<{
  key: string;
  studyId: string;
  scenarioId: string;
  studyName: string;
  scenarioName: string;
  origin: string;
  windowDays: number;
  orderCount: number;
  inBrl: string;
  outBrl: string;
  netability: string;
  baselineTotal: string;
  nettedTotal: string;
  savings: string;
  diagnosticExecutionId: string | null;
  finishedAt: string;
  breakdown: Breakdown | null;
}>;

type SortKey = 'savings' | 'netability' | 'name';

function envelopeOf(execution: ExecutionRecordV3): PreviewEnvelope | null {
  if (execution.status !== 'SUCCEEDED' || execution.envelope === null) return null;
  return execution.kind === 'DIAGNOSTIC'
    ? execution.envelope.selected_execution as PreviewEnvelope
    : execution.envelope as PreviewEnvelope;
}

function latestExecution(study: StudyDocument, scenario: ScenarioDocument) {
  const succeeded = study.executions
    .filter((execution) => execution.scenarioId === scenario.id && envelopeOf(execution) !== null
      && execution.scenarioRevision === scenario.revision && execution.inputFingerprint === scenario.inputFingerprint)
    .sort((left, right) => (right.finishedAt ?? '').localeCompare(left.finishedAt ?? ''));
  return succeeded[0];
}

function originLabel(scenario: ScenarioDocument, cases: readonly ObservedCase[], companies: readonly CompanyRecord[]): string {
  const source = scenario.sourceSnapshot.source;
  if (source.kind === 'OBSERVED_CASE') {
    const observed = cases.find((item) => item.id === source.caseId);
    const company = companies.find((item) => item.id === observed?.companyId);
    return `Caso observado · ${company?.displayName ?? source.caseId}`;
  }
  if (source.kind === 'AUTHORED') return 'Autoria manual';
  return 'Sintético';
}

export function buildRows(
  studies: readonly StudyDocument[],
  cases: readonly ObservedCase[],
  companies: readonly CompanyRecord[],
): BoardRow[] {
  return studies.flatMap((study) => study.scenarios.flatMap((scenario) => {
    const execution = latestExecution(study, scenario);
    const envelope = execution === undefined ? null : envelopeOf(execution);
    if (execution === undefined || envelope === null) return [];
    const orders = envelope.input_snapshot.cenario.ordens;
    const sum = (direction: 'IN' | 'OUT') => orders
      .filter((order) => order.direcao === direction)
      .reduce((total, order) => total.plus(order.valor_brl), new Decimal(0))
      .toFixed();
    const aggregate = envelope.result.agregado;
    return [{
      key: `${study.id}:${scenario.id}`,
      studyId: study.id,
      scenarioId: scenario.id,
      studyName: study.name,
      scenarioName: scenario.name,
      origin: originLabel(scenario, cases, companies),
      windowDays: envelope.input_snapshot.cenario.janela_dias,
      orderCount: orders.length,
      inBrl: sum('IN'),
      outBrl: sum('OUT'),
      netability: aggregate.taxa_netabilidade_periodo,
      baselineTotal: aggregate.baseline_periodo.total,
      nettedTotal: aggregate.netado_periodo.total,
      savings: aggregate.economia_periodo_brl,
      diagnosticExecutionId: execution.kind === 'DIAGNOSTIC' ? execution.id : null,
      finishedAt: execution.finishedAt ?? '',
      breakdown: safeBreakdown(envelope, companyResolver(execution.sourceSnapshot?.source ?? scenario.sourceSnapshot.source)),
    }];
  }));
}

function safeBreakdown(...args: Parameters<typeof breakdownByCompany>): Breakdown | null {
  try {
    return breakdownByCompany(...args);
  } catch {
    return null;
  }
}

function sortRows(rows: readonly BoardRow[], key: SortKey): BoardRow[] {
  return [...rows].sort((left, right) => {
    if (key === 'name') return `${left.studyName} ${left.scenarioName}`.localeCompare(`${right.studyName} ${right.scenarioName}`);
    const field = key === 'savings' ? 'savings' : 'netability';
    return new Decimal(right[field]).comparedTo(left[field]);
  });
}

const SELECTION_KEY = 'motor-de-fluxo:quadro-comparativo:selecionados';
const NAMES_KEY = 'motor-de-fluxo:quadro-comparativo:nomes-empresas';

function readNames(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '{}') as unknown;
    return stored !== null && typeof stored === 'object' ? stored as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeNames(names: Record<string, string>) {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    // Sem armazenamento local os nomes valem só nesta visita.
  }
}

function readSelection(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSelection(selection: ReadonlySet<string>) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify([...selection]));
  } catch {
    // Sem armazenamento local a escolha vale só nesta visita.
  }
}

export function ComparisonBoardPage() {
  const controller = useStudyController();
  const heading = useRef<HTMLHeadingElement>(null);
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('savings');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(readSelection);
  const [names, setNames] = useState<Record<string, string>>(readNames);
  const rename = (group: string, name: string) => setNames((current) => {
    const next = { ...current, [group]: name };
    writeNames(next);
    return next;
  });
  const label = (group: string) => names[group]?.trim() || group;

  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    let active = true;
    void Promise.all([controller.listStudies(), controller.listObservedCases(), controller.listCompanies()])
      .then(([studies, cases, companies]) => {
        if (active) setRows(buildRows(studies.filter((study) => study.deletedAt === null), cases, companies));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os estudos.');
      });
    return () => { active = false; };
  }, [controller]);

  const updateSelection = (change: (current: Set<string>) => void) => setSelected((current) => {
    const next = new Set(current);
    change(next);
    writeSelection(next);
    return next;
  });
  const toggle = (key: string) => updateSelection((next) => { if (!next.delete(key)) next.add(key); });

  const candidates = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return sortRows((rows ?? []).filter((row) => term === ''
      || `${row.studyName} ${row.scenarioName} ${row.origin}`.toLowerCase().includes(term)), 'name');
  }, [rows, filter]);
  const board = useMemo(
    () => sortRows((rows ?? []).filter((row) => selected.has(row.key)), sortKey),
    [rows, selected, sortKey],
  );
  const groups = useMemo(() => [...new Set(board.flatMap((row) =>
    row.breakdown?.companies.map((item) => item.group) ?? []))].sort(), [board]);

  return <article className="destination-page">
    <p className="eyebrow">Estudos</p>
    <h1 ref={heading} tabIndex={-1}>Quadro comparativo</h1>
    <p className="page-introduction">
      Escolha os estudos que entram no quadro. Vale a última execução concluída da revisão atual de cada cenário; com diagnóstico de várias repetições, os números são da repetição representativa.
    </p>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    {rows === null && error === null ? <p role="status">Carregando estudos…</p> : null}
    {rows !== null && rows.length === 0 ? <p>Nenhum cenário com execução concluída. Rode o diagnóstico de um estudo para ele aparecer aqui.</p> : null}

    {rows !== null && rows.length > 0 ? <fieldset className="source-selector">
      <legend>Escolher estudos</legend>
      <div className="source-actions">
        <label>Filtrar<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="nome do estudo, cenário ou empresa" /></label>
        <Button variant="secondary" onClick={() => updateSelection((next) => candidates.forEach((row) => next.add(row.key)))}>Marcar {filter.trim() === '' ? 'todos' : 'filtrados'}</Button>
        <Button variant="secondary" onClick={() => updateSelection((next) => next.clear())}>Limpar quadro</Button>
      </div>
      <ul className="board-candidates">{candidates.map((row) => <li key={row.key}>
        <label className="checkbox-field">
          <input type="checkbox" checked={selected.has(row.key)} onChange={() => toggle(row.key)} />
          {' '}{row.studyName} · {row.scenarioName} — {row.origin}
        </label>
      </li>)}</ul>
    </fieldset> : null}

    {rows !== null && rows.length > 0 && board.length === 0 ? <p>Nenhum estudo no quadro. Marque acima os que quer comparar.</p> : null}
    {board.length > 0 ? <>
      <div className="source-actions">
        <label>Ordenar por<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
          <option value="savings">Maior economia</option>
          <option value="netability">Maior netabilidade</option>
          <option value="name">Nome</option>
        </select></label>
      </div>
      <div className="table-scroll">
        <table className="company-table">
          <caption>{board.length} {board.length === 1 ? 'cenário' : 'cenários'} no quadro</caption>
          <thead><tr>
            <th scope="col">Estudo · cenário</th>
            <th scope="col">Origem</th>
            <th scope="col">Janela</th>
            <th scope="col">Ordens</th>
            <th scope="col">IN</th>
            <th scope="col">OUT</th>
            <th scope="col">Netabilidade</th>
            <th scope="col">Custo sem pool</th>
            <th scope="col">Custo com pool</th>
            <th scope="col">Economia</th>
            <th scope="col"><span className="visually-hidden">Ações</span></th>
          </tr></thead>
          <tbody>{board.map((row) => <tr key={row.key}>
            <th scope="row">
              <Link to={row.diagnosticExecutionId === null
                ? `/carteira/${encodeURIComponent(row.studyId)}`
                : `/estudos/${encodeURIComponent(row.studyId)}/diagnostico?scenarioId=${encodeURIComponent(row.scenarioId)}&executionId=${encodeURIComponent(row.diagnosticExecutionId)}`}>{row.studyName}</Link>
              <small>{row.scenarioName}</small>
            </th>
            <td>{row.origin}</td>
            <td>{row.windowDays} d</td>
            <td>{row.orderCount}</td>
            <td>{formatMoney(row.inBrl)}</td>
            <td>{formatMoney(row.outBrl)}</td>
            <td>{formatFraction(row.netability)}</td>
            <td>{formatMoney(row.baselineTotal)}</td>
            <td>{formatMoney(row.nettedTotal)}</td>
            <td>{formatMoney(row.savings)}</td>
            <td><Button variant="secondary" onClick={() => toggle(row.key)} aria-label={`Remover ${row.studyName} · ${row.scenarioName} do quadro`}>Remover</Button></td>
          </tr>)}</tbody>
        </table>
      </div>

      <section className="board-breakdown" aria-labelledby="board-breakdown-title">
        <h2 id="board-breakdown-title">Economia por empresa</h2>
        <p className="field-hint">
          A empresa de cada ordem é a do cadastro quando o estudo junta casos de empresas; num caso único, é o prefixo do ID da operação antes do primeiro hífen (AP-…, X-…, Y-…). IOF, carry e espera são exatos por ordem; spread e custo fixo das remessas agregadas são repartidos pelo volume que cada empresa remeteu. Abaixo da economia: quanto do volume da empresa não cruzou a fronteira (casando com ela mesma + com as outras).
        </p>
        <div className="source-actions">
          {groups.map((group) => <label key={group}>Nome de {group}<input value={names[group] ?? ''} placeholder={group} onChange={(event) => rename(group, event.target.value)} /></label>)}
        </div>
        <div className="table-scroll">
          <table className="company-table">
            <caption>Economia de cada empresa em cada cenário</caption>
            <thead><tr>
              <th scope="col">Estudo · cenário</th>
              {groups.map((group) => <th scope="col" key={group}>{label(group)}</th>)}
              <th scope="col">Total</th>
            </tr></thead>
            <tbody>{board.map((row) => <tr key={row.key}>
              <th scope="row">{row.studyName}<small>{row.origin}</small></th>
              {groups.map((group) => {
                const item = row.breakdown?.companies.find((company) => company.group === group);
                if (item === undefined) return <td key={group}>—</td>;
                const matched = new Decimal(item.matchedOwn).plus(item.matchedOthers);
                const share = new Decimal(item.volume).isZero() ? '0' : matched.div(item.volume).toFixed();
                return <td key={group}>
                  {formatMoney(item.savings)}
                  <small>{formatFraction(share)} não cruzou ({formatFraction(new Decimal(item.volume).isZero() ? '0' : new Decimal(item.matchedOwn).div(item.volume).toFixed())} consigo mesma)</small>
                </td>;
              })}
              <td>
                {formatMoney(row.savings)}
                {row.breakdown === null ? <small>sem detalhe por ordem</small>
                  : row.breakdown.reconciled ? null : <small role="note">conferência com o total não bateu</small>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </> : null}
  </article>;
}
