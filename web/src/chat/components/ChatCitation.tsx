import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

import type { CommunicationDocumentV1 } from '../../communication/domain';
import type { ProductHelpCatalogV1 } from '../../help/catalog';
import type { ChatCitation as Citation } from '../domain';
import type { RouteChatContext } from '../routeContext';
import { selectChatContext, type ChatIntent } from '../contextFragment';

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
  return /^\/(?:importar|diagnostico|comparar|replay|premissas|estudos|carteira)$/.test(path)
    || /^\/empresas(?:\/[^/]+(?:\/(?:casos|perfis|estudos|importar))?)?$/.test(path)
    || /^\/carteira\/[^/]+$/.test(path)
    || /^\/estudos\/[^/]+\/(?:diagnostico|replay)$/.test(path);
}

function safePath(pattern: string, route: RouteChatContext, currentPath: string): string | null {
  if (!pattern.startsWith('/') || pattern.startsWith('//')) return null;
  if (pattern === '/:route') return implementedPath(currentPath) ? currentPath : null;
  let path = pattern;
  const replacements = { studyId: route.studyId, id: route.studyId,
    companyId: /^\/empresas\/([^/]+)/.exec(currentPath)?.[1] ?? null };
  for (const [name, value] of Object.entries(replacements)) {
    if (path.includes(`:${name}`)) {
      if (value === null) return null;
      path = path.replace(`:${name}`, encodeURIComponent(value));
    }
  }
  if (path.includes(':') || !/^\/[a-z0-9/_%.-]+$/i.test(path) || !implementedPath(path)) return null;
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

export function ChatCitation({ citation, fingerprint, catalog, document, route }: Readonly<{
  citation: Citation;
  fingerprint: string | null;
  catalog: ProductHelpCatalogV1 | null;
  document: CommunicationDocumentV1 | null;
  route: RouteChatContext;
}>) {
  const location = useLocation();
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
  const destination = citationDestination(citation, fingerprint, catalog, resolvedDocument, route, location.pathname);
  return destination.href === null ? <span>{destination.label} (referência indisponível neste contexto)</span>
    : <Link to={destination.href}>{destination.label}</Link>;
}
