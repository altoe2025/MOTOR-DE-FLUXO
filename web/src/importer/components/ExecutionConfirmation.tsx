import type { ExecutionAssessment } from '../domain';
import { Button } from '../../ui/Button';

export function ExecutionConfirmation({ assessment, blockedReason, busy, error, onExecute, onRetrySave }: {
  assessment: ExecutionAssessment; blockedReason: string | null; busy: boolean; error: string | null;
  onExecute(): void; onRetrySave?(): void;
}) {
  const omitted = assessment.omitted.invalid + assessment.omitted.excluded + assessment.omitted.outsideRecut + assessment.omitted.superseded;
  const total = assessment.selected.length + omitted;
  return <section className="import-card" aria-labelledby="confirm-title"><h2 id="confirm-title">Confirmar execução</h2>
    <dl className="confirmation-counts"><div><dt>Total</dt><dd>{total}</dd></div><div><dt>Executáveis</dt><dd>{assessment.selected.length}</dd></div><div><dt>Inválidas</dt><dd>{assessment.omitted.invalid}</dd></div><div><dt>Excluídas</dt><dd>{assessment.omitted.excluded}</dd></div><div><dt>Fora do recorte</dt><dd>{assessment.omitted.outsideRecut}</dd></div><div><dt>Substituídas</dt><dd>{assessment.omitted.superseded}</dd></div><div><dt>Conflitos</dt><dd>{assessment.blockers.filter((item) => item.code === 'UNRESOLVED_CONFLICT').length}</dd></div><div><dt>Período</dt><dd>{assessment.periodDays} dias</dd></div></dl>
    {blockedReason === null ? null : <p role="alert" className="field-error">{blockedReason}</p>}
    {assessment.blockers.map((blocker) => <p role="alert" className="field-error" key={blocker.code}>{blocker.message}</p>)}
    {error === null ? null : <p role="alert" className="field-error">{error}</p>}
    <Button disabled={busy || blockedReason !== null || assessment.blockers.length > 0} aria-busy={busy || undefined} onClick={onExecute}>{busy ? 'Executando…' : omitted > 0 ? `Executar apenas ${assessment.selected.length} operações` : `Executar ${assessment.selected.length} operações`}</Button>
    {onRetrySave === undefined ? null : <Button variant="secondary" onClick={onRetrySave}>Tentar salvar novamente</Button>}
  </section>;
}
