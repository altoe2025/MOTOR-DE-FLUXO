import { useMemo, useState } from 'react';

import { formatMoney } from '../presentation/format';
import type { ScenarioDocument } from '../study/model';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { HelpTip } from '../ui/HelpTip';
import { describeLevers, isNeutralLevers, NEUTRAL_LEVERS, type Levers } from './applyLevers';
import { companyResolver } from './companies';
import { compositionSubsets, leverBaseAvailable } from './leverScenario';

const MAX_COMPOSITION_COMPANIES = 8;

type DeadlineMode = Levers['deadline']['mode'];

/**
 * Sem `applyToBase`: cada alavanca vira uma variação nova do estudo, e a Composição gera
 * todas as combinações das empresas que ficaram na composição. Com `applyToBase` (combinação de carteiras): a alavanca
 * altera a própria carteira, e as combinações são geradas depois, no diagnóstico.
 */
export function LeverBuilder({ base, progress, applyToBase = false, onCreate, onCreateCombinations }: Readonly<{
  base: ScenarioDocument;
  progress?: string | null;
  applyToBase?: boolean;
  onCreate(levers: Levers): Promise<void>;
  onCreateCombinations?(subsets: readonly (readonly string[])[], companies: readonly string[]): Promise<void>;
}>) {
  const orders = base.sourceSnapshot.orders;
  const companyOf = useMemo(() => companyResolver(base.sourceSnapshot.source), [base.sourceSnapshot.source]);
  const groups = useMemo(() => [...new Set(orders.map((order) => companyOf(order.id)))].sort(), [orders, companyOf]);
  const [chosenGroup, setGroup] = useState(groups[0] ?? '');
  const group = groups.includes(chosenGroup) ? chosenGroup : groups[0] ?? '';
  const [removeCompany, setRemoveCompany] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [volumeIn, setVolumeIn] = useState('1');
  const [volumeOut, setVolumeOut] = useState('1');
  const [spacing, setSpacing] = useState('1');
  const [shift, setShift] = useState('0');
  const [deadlineMode, setDeadlineMode] = useState<DeadlineMode>('KEEP');
  const [deadlineDays, setDeadlineDays] = useState('0');
  const [showOrders, setShowOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set());

  if (!leverBaseAvailable(base) || groups.length === 0) {
    return <section className="lever-builder" aria-label="Alavancas">
      <p className="field-hint">{applyToBase
        ? 'Escolha as empresas acima para liberar as alavancas.'
        : `Alavancas funcionam sobre cenários com ordens explícitas (caso importado ou variação). “${base.name}” é sintético.`}</p>
    </section>;
  }

  const groupOrders = orders.filter((order) => companyOf(order.id) === group)
    .sort((left, right) => left.dia_limite - right.dia_limite || left.id.localeCompare(right.id));
  const levers: Levers = {
    ...NEUTRAL_LEVERS, group, removeCompany, removedOrderIds: [...removed].filter((id) => groupOrders.some((order) => order.id === id)),
    volumeIn: volumeIn.trim(), volumeOut: volumeOut.trim(), spacingFactor: spacing.trim(),
    shiftDays: Number(shift),
    deadline: deadlineMode === 'KEEP' ? { mode: 'KEEP' } : { mode: deadlineMode, days: Number(deadlineDays) },
  };
  const neutral = isNeutralLevers(levers);
  const reset = () => {
    setRemoveCompany(false); setRemoved(new Set()); setVolumeIn('1'); setVolumeOut('1'); setSpacing('1');
    setShift('0'); setDeadlineMode('KEEP'); setDeadlineDays('0');
  };
  const create = async () => {
    if (applyToBase && neutral) return;
    setBusy(true); setError(null);
    try {
      await onCreate(levers);
      reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a variação.');
    } finally {
      setBusy(false);
    }
  };
  const included = groups.filter((item) => !leftOut.has(item));
  const tooMany = included.length > MAX_COMPOSITION_COMPANIES;
  const composition = tooMany ? [] : compositionSubsets(included, groups);
  const compose = async () => {
    if (composition.length === 0 || onCreateCombinations === undefined) return;
    setBusy(true); setError(null);
    try {
      await onCreateCombinations(composition, groups);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar as combinações.');
    } finally {
      setBusy(false);
    }
  };
  const toggleLeftOut = (company: string) => setLeftOut((current) => {
    const next = new Set(current);
    if (!next.delete(company)) next.add(company);
    return next;
  });
  const toggleOrder = (id: string) => setRemoved((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const composable = !applyToBase && groups.length >= 2;
  const adjustPanel = <Disclosure id="lever-adjust" label="Ajustar uma empresa" defaultOpen={!applyToBase && !composable}
    hint={applyToBase ? 'vale para todas as combinações' : 'volume, datas, prazo ou ordens'}>
    <p className="field-hint">{applyToBase
      ? 'Altera a carteira acima. Todas as combinações usam a carteira alterada. Para desfazer, aplique as empresas de novo.'
      : `Cria uma variação de “${base.name}” como cenário novo. O original não muda.`}</p>
    <div className="lever-grid">
      <label>Empresa<select value={group} onChange={(event) => { setGroup(event.target.value); setRemoved(new Set()); }}>
        {groups.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      {applyToBase ? null : <label className="checkbox-field"><input type="checkbox" checked={removeCompany} onChange={(event) => setRemoveCompany(event.target.checked)} /> Tirar a empresa inteira</label>}
    </div>
    {removeCompany ? null : <>
      <div className="lever-grid">
        <label>Volume IN ×<input inputMode="decimal" value={volumeIn} onChange={(event) => setVolumeIn(event.target.value)} /></label>
        <label>Volume OUT ×<input inputMode="decimal" value={volumeOut} onChange={(event) => setVolumeOut(event.target.value)} /></label>
        <label>Deslocar datas (dias, ±)<input inputMode="numeric" value={shift} onChange={(event) => setShift(event.target.value)} /></label>
        <label>Espaçamento ×<input inputMode="decimal" value={spacing} onChange={(event) => setSpacing(event.target.value)} /></label>
        <label>Prazo<select value={deadlineMode} onChange={(event) => setDeadlineMode(event.target.value as DeadlineMode)}>
          <option value="KEEP">Manter</option>
          <option value="FIXED">Fixar em N dias</option>
          <option value="DELTA">Somar ± N dias</option>
        </select></label>
        {deadlineMode === 'KEEP' ? null : <label>{deadlineMode === 'FIXED' ? 'Prazo (dias)' : 'Somar ao prazo (dias, ±)'}<input inputMode="numeric" value={deadlineDays} onChange={(event) => setDeadlineDays(event.target.value)} /></label>}
      </div>
      <p className="field-hint">Espaçamento: ×0,5 junta os fechamentos no começo do período, ×2 espalha. Use ponto como separador decimal.</p>
      <Button variant="secondary" onClick={() => setShowOrders((value) => !value)} aria-expanded={showOrders}>
        {showOrders ? 'Esconder ordens' : `Escolher ordens para tirar (${groupOrders.length} de ${group})`}
      </Button>
      {showOrders ? <div className="table-scroll">
        <table className="company-table">
          <caption>{removed.size === 0 ? 'Marque as ordens que saem da variação' : `${levers.removedOrderIds.length} de ${groupOrders.length} ordens saem`}</caption>
          <thead><tr><th scope="col">Tirar</th><th scope="col">Operação</th><th scope="col">Direção</th><th scope="col">Dia conhecida</th><th scope="col">Dia limite</th><th scope="col">Valor</th></tr></thead>
          <tbody>{groupOrders.map((order) => <tr key={order.id}>
            <td><input type="checkbox" aria-label={`Tirar ${order.id}`} checked={removed.has(order.id)} onChange={() => toggleOrder(order.id)} /></td>
            <td>{order.id}</td><td>{order.direcao}</td><td>D{order.dia_conhecida}</td><td>D{order.dia_limite}</td><td>{formatMoney(order.valor_brl)}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
    </>}
    <div className="source-actions">
      <span className="field-hint">{applyToBase ? 'Alteração' : 'Variação'}: {describeLevers(levers)}</span>
      <Button data-chat-help-id={applyToBase ? 'control.alavancas.aplicar-carteira' : 'control.alavancas.criar'} disabled={busy || (applyToBase && neutral)} onClick={() => void create()}>{busy ? (applyToBase ? 'Aplicando…' : 'Criando…') : applyToBase ? 'Aplicar à carteira' : 'Criar variação'}</Button>
    </div>
  </Disclosure>;

  return <section className="lever-builder" aria-label="Alavancas">
    {composable ? <div className="lever-combinations">
      <div className="lever-combinations__head">
        <h2>Composição</h2><HelpTip label="Composição">Cria um cenário para cada combinação das empresas marcadas, com as mesmas ordens, valores, datas, período e premissas de “{base.name}”. Depois, no diagnóstico, rode todos e compare.</HelpTip>
        <span className="status-badge">{included.length} de {groups.length} empresas</span>
      </div>
      <div className="composition-companies" role="group" aria-label="Empresas da composição">
        {groups.map((item) => <button key={item} type="button" className="composition-company" aria-pressed={!leftOut.has(item)}
          title={leftOut.has(item) ? `Devolver ${item} à composição` : `Tirar ${item} da composição`} onClick={() => toggleLeftOut(item)}>{item}</button>)}
      </div>
      {tooMany ? <p className="field-hint">A composição aceita no máximo {MAX_COMPOSITION_COMPANIES} empresas; tire {included.length - MAX_COMPOSITION_COMPANIES} para continuar.</p> : null}
      <div className="source-actions">
        <Button data-chat-help-id="control.alavancas.combinacoes" disabled={busy || composition.length === 0} onClick={() => void compose()}>
          Fazer composição ({composition.length} {composition.length === 1 ? 'combinação' : 'combinações'})
        </Button>
        <span className="field-hint">Clique numa empresa para tirá-la.</span>
      </div>
      {progress ? <p role="status">{progress}</p> : null}
    </div> : null}
    {error === null ? null : <p role="alert" className="field-error">{error}</p>}
    {adjustPanel}
  </section>;
}
