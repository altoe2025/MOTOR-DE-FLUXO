import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

import type { CommunicationDocumentV1 } from '../../communication/domain';
import type { ProductHelpCatalogV1 } from '../../help/catalog';
import type { ChatCitation as Citation } from '../domain';
import type { RouteChatContext } from '../routeContext';
import { selectionId } from '../routeContext';
import { selectChatContext, type ChatIntent } from '../contextFragment';
import type { BoardChatDocument, ChatContext } from '../chatContext';

async function matchingDocument(citation: Citation, fingerprint: string | null,
  document: CommunicationDocumentV1 | null): Promise<CommunicationDocumentV1 | null> {
  if (document === null || fingerprint === null || citation.kind === 'HELP') return null;
  if (document.contextFingerprint === fingerprint) return document;
  const candidates: ChatIntent[] = [];
  if (citation.kind === 'METRIC') candidates.push({ kind: 'METRIC', id: citation.id });
  if (citation.kind === 'EVIDENCE') {
    const sections = [document.composition, document.mechanism, document.economics, document.robustness,
      document.comparison, document.replaySnapshot];
    const codes = [...document.executiveMetrics, ...sections.filter((item): item is NonNullable<typeof item> => item !== null)
      .flatMap((item) => item.metrics)].filter((metric) => metric.evidenceRefs.includes(citation.id)).map((metric) => metric.code);
    candidates.push(...[...new Set(codes)].map((id) => ({ kind: 'METRIC' as const, id })));
  }
  if (document.comparison !== null) candidates.push({ kind: 'COMPARISON' });
  if (document.replaySnapshot !== null) candidates.push({ kind: 'REPLAY' });
  if (citation.kind === 'LIMITATION' || citation.kind === 'EVIDENCE') candidates.push({ kind: 'LIMITATIONS' });
  if (citation.kind === 'EVIDENCE') candidates.push({ kind: 'REPETITION' });
  for (const intent of candidates) {
    try {
      const fragment = await selectChatContext(document, intent);
      if (fragment?.contextFingerprint === fingerprint) return fragment;
    } catch { /* A candidate citation does not identify this fragment. */ }
  }
  return null;
}

function implementedPath(path: string): boolean {
  return /^\/(?:importar|diagnostico|comparar|replay|premissas|estudos|carteira|quadro)$/.test(path)
    || /^\/empresas(?:\/[^/]+(?:\/(?:casos|perfis|estudos|importar))?)?$/.test(path)
    || /^\/carteira\/[^/]+$/.test(path)
    || /^\/estudos\/[^/]+\/(?:diagnostico|replay|apresentacao)$/.test(path);
}

const BOARD_FIELD_LABEL: Readonly<Record<string, string>> = {
  studyId: 'Estudo', scenarioId: 'Cenário', executionId: 'Execução', studyName: 'Nome do estudo',
  scenarioName: 'Nome do cenário', sourceLabel: 'Origem', windowDays: 'Janela', orderCount: 'Ordens',
  inBrl: 'IN', outBrl: 'OUT', netability: 'Netabilidade', baselineTotalBrl: 'Custo sem pool',
  nettedTotalBrl: 'Custo com pool', savingsBrl: 'Economia',
};

export function boardCitationDestination(citation: Citation, fingerprint: string | null,
  document: BoardChatDocument | null): { label: string; href: string | null } {
  if (citation.kind !== 'EVIDENCE' || document === null || fingerprint !== document.contextFingerprint) {
    return { label: citation.id, href: null };
  }
  const evidence = document.evidenceIndex[citation.id];
  if (evidence === undefined) return { label: citation.id, href: null };
  const row = document.rows.find((item) => item.rowKey === evidence.rowKey);
  return { label: row === undefined ? citation.id
    : `${row.studyName} · ${row.scenarioName} — ${BOARD_FIELD_LABEL[evidence.field] ?? evidence.field}`,
    href: row === undefined ? null : '/quadro' };
}

function safePath(pattern: string, route: RouteChatContext, currentPath: string): string | null {
  if (!pattern.startsWith('/') || pattern.startsWith('//')) return null;
  if (!currentPath.startsWith('/') || currentPath.startsWith('//') || /[\\\u0000-\u0020]/.test(currentPath)) return null;
  const current = new URL(currentPath, 'https://local.invalid');
  if (current.origin !== 'https://local.invalid') return null;
  let path = pattern === '/:route' ? current.pathname : pattern;
  const replacements = { studyId: route.studyId, id: route.studyId,
    companyId: /^\/empresas\/([^/]+)/.exec(current.pathname)?.[1] ?? null };
  for (const [name, value] of Object.entries(replacements)) {
    if (path.includes(`:${name}`)) {
      if (value === null) return null;
      path = path.replace(`:${name}`, encodeURIComponent(value));
    }
  }
  if (path.includes(':') || !/^\/[a-z0-9/_%.-]+$/i.test(path) || !implementedPath(path)) return null;
  if (/^\/estudos\/[^/]+\/apresentacao$/.test(path)) {
    const samePresentation = current.pathname === path;
    const keys = ['cenario', 'execucao', 'comparacao', 'dia'];
    if (samePresentation && keys.some((key) => current.searchParams.getAll(key).length > 1)) return null;
    const scenario = selectionId(samePresentation ? current.searchParams.get('cenario') : route.scenarioId);
    const execution = selectionId(samePresentation ? current.searchParams.get('execucao') : route.diagnosticExecutionId);
    const comparisonText = samePresentation ? current.searchParams.get('comparacao') : route.comparisonExecutionId ?? null;
    const comparison = selectionId(comparisonText);
    const dayText = samePresentation ? current.searchParams.get('dia')
      : route.replayDay === null ? null : String(route.replayDay);
    const day = dayText !== null && /^(0|[1-9]\d*)$/.test(dayText) ? Number(dayText) : null;
    if (scenario === null || execution === null || (comparisonText !== null && comparison === null)
      || (dayText !== null && (day === null || !Number.isSafeInteger(day)))) return null;
    const search = new URLSearchParams({ cenario: scenario, execucao: execution });
    if (comparison !== null) search.set('comparacao', comparison);
    if (day !== null) search.set('dia', String(day));
    return `${path}?${search}`;
  }
  if (path.includes('/replay') && route.diagnosticExecutionId !== null) {
    path += `?executionId=${encodeURIComponent(route.diagnosticExecutionId)}`;
  } else if (path === '/comparar' && route.studyId !== null) path += `?studyId=${encodeURIComponent(route.studyId)}`;
  return path;
}

export function citationDestination(citation: Citation, fingerprint: string | null,
  catalog: ProductHelpCatalogV1 | null, document: CommunicationDocumentV1 | null,
  route: RouteChatContext, currentPath: string): { label: string; href: string | null } {
  if (citation.kind === 'HELP') {
    const item = catalog?.items.find((candidate) => candidate.id === citation.id);
    return { label: item?.label ?? citation.id,
      href: item === undefined ? null : safePath(item.routePattern, route, currentPath) };
  }
  if (document === null || fingerprint !== document.contextFingerprint || route.studyId !== document.study.id) {
    return { label: citation.id, href: null };
  }
  const execution = document.selection.diagnosticExecutionId;
  const study = document.study.id;
  const diagnostic = `/estudos/${encodeURIComponent(study)}/diagnostico?scenarioId=${encodeURIComponent(document.selection.scenarioId)}`
    + `&executionId=${encodeURIComponent(execution)}`;
  const replay = `/estudos/${encodeURIComponent(study)}/replay?executionId=${encodeURIComponent(execution)}`
    + (document.selection.replayDay === null ? '' : `&day=${document.selection.replayDay}#replay-journal-day-${document.selection.replayDay}`);
  const comparison = document.selection.comparisonExecutionId === null ? null
    : `/comparar?studyId=${encodeURIComponent(study)}`
      + `&baseExecutionId=${encodeURIComponent(document.selection.comparisonExecutionId)}`
      + `&hypothesisExecutionId=${encodeURIComponent(execution)}`;
  if (citation.kind === 'EVIDENCE') {
    const evidence = Object.hasOwn(document.evidenceIndex, citation.id) ? document.evidenceIndex[citation.id] : undefined;
    return { label: citation.id, href: evidence === undefined ? null : evidence.source === 'REPLAY' ? replay
      : evidence.source === 'COMPARISON' ? comparison
        : evidence.source === 'DIAGNOSTIC' && evidence.diagnosticExecutionId !== execution ? null : diagnostic };
  }
  if (citation.kind === 'LIMITATION') {
    const item = document.limitations.find((candidate) => candidate.code === citation.id);
    const source = item?.evidenceRefs.map((ref) => document.evidenceIndex[ref]?.source);
    return { label: item?.statement ?? citation.id, href: item === undefined || source?.length === 0 ? null
      : source?.every((kind) => kind === 'COMPARISON') ? (comparison === null ? null : `${comparison}#comparison-limitations-title`)
        : source?.every((kind) => kind === 'DIAGNOSTIC') ? `${diagnostic}#all-limitations-heading` : null };
  }
  const sections = [document.composition, document.mechanism, document.economics, document.robustness];
  const metric = [...document.executiveMetrics, ...sections.flatMap((section) => section.metrics),
    ...(document.comparison?.metrics ?? []), ...(document.replaySnapshot?.metrics ?? [])]
    .find((candidate) => candidate.code === citation.id);
  const destination = document.replaySnapshot?.metrics.some((item) => item.code === citation.id) ? replay
    : document.comparison?.metrics.some((item) => item.code === citation.id) ? comparison
      : `${diagnostic}#selected-execution-heading`;
  return { label: metric?.label ?? citation.id, href: metric === undefined ? null : destination };
}

export function ChatCitation({ citation, fingerprint, catalog, context, route }: Readonly<{
  citation: Citation;
  fingerprint: string | null;
  catalog: ProductHelpCatalogV1 | null;
  context: ChatContext | null;
  route: RouteChatContext;
}>) {
  const location = useLocation();
  const document = context?.kind === 'STUDY' ? context.document : null;
  const board = context?.kind === 'BOARD' ? context.document : null;
  const [resolvedDocument, setResolvedDocument] = useState<CommunicationDocumentV1 | null>(
    document?.contextFingerprint === fingerprint ? document : null);
  useEffect(() => {
    let active = true;
    setResolvedDocument(document?.contextFingerprint === fingerprint ? document : null);
    void matchingDocument(citation, fingerprint, document).then((matching) => {
      if (active) setResolvedDocument(matching);
    });
    return () => { active = false; };
  }, [citation.kind, citation.id, fingerprint, document]);
  const destination = board !== null && citation.kind !== 'HELP'
    ? boardCitationDestination(citation, fingerprint, board)
    : citationDestination(citation, fingerprint, catalog, resolvedDocument, route, location.pathname + location.search);
  return destination.href === null ? <span>{destination.label} (referência indisponível neste contexto)</span>
    : <Link to={destination.href}>{destination.label}</Link>;
}
