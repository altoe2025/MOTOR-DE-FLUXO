import { useMemo, useState } from 'react';
import type { ImportStudy, PortfolioProjection } from '../domain';
import type { StudyMutation as RepositoryMutation } from '../repository';
import { Button } from '../../ui/Button';

type Filter = 'all' | 'valid' | 'invalid' | 'excluded' | 'conflicts';

export function ReviewStep({ study, projection, onMutate }: {
  study: ImportStudy; projection: PortfolioProjection;
  onMutate(mutation: RepositoryMutation): Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [page, setPage] = useState(0);
  const conflictIds = useMemo(() => new Set(projection.conflicts.map((item) => item.operationId)), [projection]);
  const rows = projection.operations.filter((row) => filter === 'all'
    || (filter === 'valid' && row.executable && !row.excluded)
    || (filter === 'invalid' && row.issues.length > 0)
    || (filter === 'excluded' && row.excluded)
    || (filter === 'conflicts' && conflictIds.has(row.operationId)));
  const pageSize = 25;
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const invalidRows = study.batches.flatMap((batch) => batch.rows).filter((row) => row.normalized === null);
  return <section className="import-card" aria-labelledby="review-title"><h2 id="review-title">Revisar operações</h2>
    <div className="filter-row" role="group" aria-label="Filtrar operações">{(['all','valid','invalid','excluded','conflicts'] as const).map((item) => <button key={item} aria-pressed={filter === item} onClick={() => { setFilter(item); setPage(0); }}>{({all:'Todas',valid:'Válidas',invalid:'Inválidas',excluded:'Excluídas',conflicts:'Conflitos'} as const)[item]}</button>)}</div>
    {projection.conflicts.map((conflict) => <div className="inline-notice inline-notice--error" key={conflict.operationId} role="alert">Conflito em {conflict.operationId}. Escolha uma versão. {conflict.versionIds.map((versionId) => <Button key={versionId} variant="secondary" onClick={() => { if (confirm(`Usar esta versão de ${conflict.operationId}?`)) void onMutate({ kind:'RESOLVE_VERSION_CONFLICT', resolution:{ operationId: conflict.operationId, selectedVersionId: versionId } }); }}>Usar versão {versionId.slice(0, 8)}</Button>)}</div>)}
    <div className="table-scroll"><table><caption>{rows.length} operações exibidas</caption><thead><tr><th>ID</th><th>Cliente</th><th>Direção</th><th>Valor</th><th>Finalidade</th><th>Ações</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.operationId}><th scope="row">{row.operationId}</th><td>{row.operation.clientName}</td><td>{row.operation.direction}</td><td>{row.operation.valueBrl}</td><td>{editing === row.operationId ? <input aria-label={`Finalidade de ${row.operationId}`} value={value} onChange={(e) => setValue(e.currentTarget.value)} /> : (row.operation.purposeCode ?? 'Não informada')}</td><td>
      {editing === row.operationId ? <><Button onClick={() => { void onMutate({kind:'EDIT_OPERATION', operationId:row.operationId, field:'purposeCode', rawValue:value, eventId:crypto.randomUUID(), at:new Date().toISOString()}); setEditing(null); }}>Salvar</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button></> : <Button variant="secondary" onClick={() => { setEditing(row.operationId); setValue(row.operation.purposeCode ?? ''); }}>Editar</Button>}
      <Button variant="secondary" onClick={() => { if (confirm(`${row.excluded ? 'Restaurar' : 'Excluir'} ${row.operationId}?`)) void onMutate({ kind: row.excluded ? 'RESTORE_OPERATION' : 'EXCLUDE_OPERATION', operationId: row.operationId, eventId: crypto.randomUUID(), at: new Date().toISOString() }); }}>{row.excluded ? 'Restaurar' : 'Excluir'}</Button></td></tr>)}
      {rows.flatMap((row) => row.issues.map((issue) => <tr className="issue-row" key={`${row.operationId}:${issue.code}:${issue.field}`}><td colSpan={6}>Linha {row.rowNumber}: {issue.field ?? 'operação'} — {issue.message}</td></tr>))}</tbody></table></div>
    {rows.length > pageSize ? <nav className="pagination" aria-label="Paginação das operações"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Anterior</Button><span>Página {page + 1} de {Math.ceil(rows.length / pageSize)}</span><Button variant="secondary" disabled={(page + 1) * pageSize >= rows.length} onClick={() => setPage((current) => current + 1)}>Próxima</Button></nav> : null}
    {(filter === 'all' || filter === 'invalid') && invalidRows.length > 0 ? <div className="table-scroll"><table><caption>{invalidRows.length} linhas inválidas preservadas</caption><thead><tr><th>Linha</th><th>ID informado</th><th colSpan={4}>Erros</th></tr></thead><tbody>{invalidRows.map((row) => <tr key={`${row.rowNumber}:${row.raw.operacao_id}`}><th scope="row">{row.rowNumber}</th><td>{row.raw.operacao_id ?? 'Não informado'}</td><td colSpan={4}>{row.errors.map((issue) => `${issue.field ?? 'linha'} — ${issue.message}`).join('; ')}</td></tr>)}</tbody></table></div> : null}
    {study.batches.length === 0 ? <p>Nenhum lote importado.</p> : <Button variant="secondary" onClick={() => { const batch = study.batches.at(-1); if (batch && confirm('Desfazer o último lote importado?')) void onMutate({kind:'REVERT_BATCH', batchId:batch.id}); }}>Desfazer último lote</Button>}
  </section>;
}
