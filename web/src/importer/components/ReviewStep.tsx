import { useState, type FormEvent } from 'react';

import type { EditableImportField, ImportPortfolio } from '../domain';
import type { ImportCommand, ImportReview } from '../eligibility';
import { projectPortfolio } from '../portfolio';
import { normalizeDirection, normalizePurposeCode } from '../normalization';
import { parseCivilDate } from '../dates';
import { parseBrlDecimal } from '../decimals';

const editable: readonly { value: EditableImportField; label: string }[] = [
  { value: 'direction', label: 'Direção' }, { value: 'knownDate', label: 'Data conhecida' },
  { value: 'deadlineDate', label: 'Data limite' }, { value: 'valueBrl', label: 'Valor BRL' },
  { value: 'purposeCode', label: 'Finalidade' },
];

function canonicalCorrectionValue(path: string, value: string | null): string {
  if (value === null) return 'não coletado';
  try {
    switch (path.split('/').at(-1)) {
      case 'direction': return normalizeDirection(value);
      case 'knownDate': case 'deadlineDate': return parseCivilDate(value);
      case 'valueBrl': return parseBrlDecimal(value);
      case 'purposeCode': return normalizePurposeCode(value) ?? 'não coletado';
      default: return 'não validado';
    }
  } catch { return 'não validado'; }
}

export function ReviewStep({ review, onCommand }: { review: ImportReview; onCommand(command: ImportCommand): void }) {
  const [filter, setFilter] = useState<'ALL' | 'INVALID' | 'CONFLICT'>('ALL');
  const [versionId, setVersionId] = useState('');
  const [field, setField] = useState<EditableImportField>('direction');
  const [value, setValue] = useState('');
  const [alias, setAlias] = useState('');
  const [clientId, setClientId] = useState('');
  const projection = projectPortfolio({ revision: review.semanticRevision, batches: review.batches, events: review.events } as ImportPortfolio);
  const conflicts = new Set(projection.conflicts.map((item) => item.operationId));
  const excluded = new Set<string>();
  for (const event of [...review.events].sort((a, b) => a.eventSequence - b.eventSequence)) {
    if (event.kind === 'OPERATION_EXCLUDED') excluded.add(event.operationId);
    if (event.kind === 'OPERATION_RESTORED') excluded.delete(event.operationId);
  }
  const visible = projection.rows.filter((row) => filter === 'ALL' || (filter === 'INVALID' ? row.errors.some((error) => error.code !== 'PURPOSE_MISSING') : conflicts.has(row.raw.operacao_id ?? '')));
  const action = () => ({ eventId: crypto.randomUUID(), at: new Date().toISOString() });
  const correct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const row = projection.rows.find((item) => item.versionId === versionId);
    if (row?.raw.operacao_id === null || row === undefined) return;
    onCommand({ kind: 'CORRECT_FIELD', versionId, operationId: row.raw.operacao_id, field, rawValue: value, actionId: crypto.randomUUID(), at: new Date().toISOString() });
    setValue('');
  };
  const associate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (alias === '' || clientId === '') return;
    onCommand({ kind: 'ASSOCIATE_ALIAS', alias, canonicalClientId: clientId, ...action() });
    setAlias('');
  };
  return <section aria-labelledby="import-review-title">
    <h2 id="import-review-title">Revisar operações</h2>
    <dl className="company-summary">
      <div><dt>Empresa</dt><dd>{review.company?.displayName ?? 'não selecionada'}</dd></div>
      <div><dt>Janela</dt><dd>{review.draft.window.startDate} a {review.draft.window.endDate}</dd></div>
      <div><dt>Fechamento</dt><dd>{review.draft.window.closingDate}</dd></div>
      <div><dt>Fonte</dt><dd>{review.draft.sourceManifest.adapterId} v{review.draft.sourceManifest.adapterVersion}</dd></div>
      <div><dt>Ordens</dt><dd>{review.draft.orders.length}</dd></div>
      <div><dt>Totais</dt><dd>{review.draft.controlTotals.map((item) => `${item.code}: ${item.valueBrl}`).join(' · ')}</dd></div>
    </dl>
    <p>SHA-256 da fonte: {review.context.parsed.sha256}</p>
    <p>Revisão semântica: {review.semanticRevision} · correções: {review.draft.corrections.length}</p>
    {review.blockers.length === 0 ? <p role="status">Sem bloqueios para confirmar o Caso.</p> : <div role="alert"><strong>{review.blockers.length} bloqueio(s)</strong><ul>{review.blockers.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul></div>}
    {review.warnings.length === 0 ? null : <section aria-label="Avisos da importação"><h3>Avisos</h3><ul>{review.warnings.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul></section>}
    <label htmlFor="import-filter">Filtrar revisão</label>
    <select id="import-filter" value={filter} onChange={(event) => setFilter(event.currentTarget.value as typeof filter)}>
      <option value="ALL">Todas as linhas</option><option value="INVALID">Com erro</option><option value="CONFLICT">Em conflito</option>
    </select>
    <div className="table-scroll" tabIndex={0} aria-label="Tabela rolável de revisão">
      <table className="company-table"><caption>Linhas importadas</caption><thead><tr>
        <th scope="col">Linha</th><th scope="col">Operação</th><th scope="col">Cliente na fonte</th><th scope="col">Cliente canônico</th><th scope="col">Direção</th><th scope="col">Valor BRL</th><th scope="col">Situação</th><th scope="col">Ação</th>
      </tr></thead><tbody>{visible.map((row) => {
        const operationId = row.raw.operacao_id;
        const isExcluded = operationId !== null && excluded.has(operationId);
        const order = review.draft.orders.find((item) => item.id === operationId);
        const canonical = review.clientIdentity.clients.find((item) => item.id === order?.clientId)?.displayName ?? '—';
        return <tr key={row.versionId}><td>{row.rowNumber}</td><td>{operationId ?? '—'}</td><td>{row.raw.cliente_nome ?? '—'}</td><td>{canonical}</td><td>{row.normalized?.direction ?? row.raw.direcao ?? '—'}</td><td>{row.normalized?.valueBrl ?? row.raw.valor_brl ?? '—'}</td><td>{conflicts.has(operationId ?? '') ? 'Conflito' : row.errors.length === 0 ? 'Válida' : row.errors.map((error) => error.code).join(', ')}</td><td><button type="button" onClick={() => setVersionId(row.versionId)}>Corrigir</button>{operationId === null ? null : <button type="button" onClick={() => onCommand({ kind: isExcluded ? 'RESTORE_OPERATION' : 'EXCLUDE_OPERATION', operationId, ...action() })}>{isExcluded ? 'Restaurar' : 'Excluir'}</button>}</td></tr>;
      })}</tbody></table>
    </div>
    {versionId === '' ? null : <form aria-label="Corrigir campo" onSubmit={correct}>
      <h3>Corrigir linha selecionada</h3><label htmlFor="import-correction-field">Campo</label><select id="import-correction-field" value={field} onChange={(event) => setField(event.currentTarget.value as EditableImportField)}>{editable.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <label htmlFor="import-correction-value">Valor corrigido</label><input id="import-correction-value" value={value} onChange={(event) => setValue(event.currentTarget.value)} required />
      <button className="button" type="submit">Aplicar correção</button>
    </form>}
    {projection.conflicts.length === 0 ? null : <section aria-label="Conflitos de versão"><h3>Conflitos</h3>{projection.conflicts.map((conflict) => <div key={conflict.operationId}>
      <h4>Operação {conflict.operationId}</h4>
      <ul className="import-conflict-versions">{conflict.versionIds.map((id) => {
        const version = projection.versions.find((item) => item.versionId === id);
        const batch = review.batches.find((item) => item.id === version?.batchId);
        if (version === undefined || batch === undefined) return null;
        const operation = version.operation;
        return <li key={id}>
          <strong>Versão {id}</strong>
          <p>Origem: Lote {batch.batchSequence} · ID {batch.id} · Linha {version.rowNumber}</p>
          <dl>
            <div><dt>Cliente canônico (ID)</dt><dd>{version.canonicalClientId}</dd></div>
            <div><dt>Direção</dt><dd>{operation.direction}</dd></div>
            <div><dt>Data conhecida</dt><dd>{operation.knownDate}</dd></div>
            <div><dt>Data limite</dt><dd>{operation.deadlineDate}</dd></div>
            <div><dt>Valor BRL</dt><dd>{operation.valueBrl}</dd></div>
            <div><dt>Finalidade</dt><dd>{operation.purposeCode ?? 'não coletado'}</dd></div>
          </dl>
        </li>;
      })}</ul>
      <label>Versão a manter<select defaultValue="" onChange={(event) => { if (event.currentTarget.value !== '') onCommand({ kind: 'RESOLVE_CONFLICT', operationId: conflict.operationId, selectedVersionId: event.currentTarget.value, ...action() }); }}><option value="">Selecione</option>{conflict.versionIds.map((id) => {
        const version = projection.versions.find((item) => item.versionId === id);
        const batch = review.batches.find((item) => item.id === version?.batchId);
        return <option key={id} value={id}>{id} · Lote {batch?.batchSequence ?? '?'} · Linha {version?.rowNumber ?? '?'}</option>;
      })}</select></label>
    </div>)}</section>}
    {review.draft.corrections.length === 0 ? null : <section aria-label="Histórico de correções"><h3>Histórico de correções</h3><ol>{review.draft.corrections.map((correction) => <li key={correction.id}>
      {correction.fieldPath} · {canonicalCorrectionValue(correction.fieldPath, correction.previousValue)} → {canonicalCorrectionValue(correction.fieldPath, correction.nextValue)} · {correction.actionAt}
    </li>)}</ol></section>}
    <form aria-label="Associar alias" onSubmit={associate}><h3>Associar nome de cliente</h3>
      <label htmlFor="import-alias">Nome na fonte</label><input id="import-alias" value={alias} onChange={(event) => setAlias(event.currentTarget.value)} required />
      <label htmlFor="import-client">Cliente canônico</label><select id="import-client" value={clientId} onChange={(event) => setClientId(event.currentTarget.value)} required><option value="">Selecione</option>{review.clientIdentity.clients.map((client) => <option key={client.id} value={client.id}>{client.displayName}</option>)}</select>
      <button className="button" type="submit">Associar alias</button>
    </form>
  </section>;
}
