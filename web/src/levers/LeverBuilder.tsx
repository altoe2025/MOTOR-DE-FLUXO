import { useMemo, useState } from 'react';

import { formatMoney } from '../presentation/format';
import type { ScenarioDocument } from '../study/model';
import { Button } from '../ui/Button';
import { describeLevers, NEUTRAL_LEVERS, type Levers } from './applyLevers';
import { companyResolver } from './companies';
import { companySubsets, leverBaseAvailable } from './leverScenario';

type DeadlineMode = Levers['deadline']['mode'];

export function LeverBuilder({ base, onCreate, onCreateCombinations }: Readonly<{
  base: ScenarioDocument;
  onCreate(levers: Levers): Promise<void>;
  onCreateCombinations(subsets: readonly (readonly string[])[], companies: readonly string[]): Promise<void>;
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

  if (!leverBaseAvailable(base) || groups.length === 0) {
    return <section className="lever-builder" aria-labelledby="lever-title">
      <h2 id="lever-title">Alavancas</h2>
      <p className="field-hint">Alavancas funcionam sobre cenários com ordens explícitas (caso importado ou variação). “{base.name}” é sintético.</p>
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
  const reset = () => {
    setRemoveCompany(false); setRemoved(new Set()); setVolumeIn('1'); setVolumeOut('1'); setSpacing('1');
    setShift('0'); setDeadlineMode('KEEP'); setDeadlineDays('0');
  };
  const create = async () => {
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
  const subsets = groups.length >= 2 && groups.length <= 8 ? companySubsets(groups) : [];
  const createCombinations = async () => {
    if (!window.confirm(`Criar ${subsets.length} variações, uma para cada combinação de ${groups.join(', ')}?`)) return;
    setBusy(true); setError(null);
    try {
      await onCreateCombinations(subsets, groups);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar as combinações.');
    } finally {
      setBusy(false);
    }
  };
  const toggleOrder = (id: string) => setRemoved((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return <section className="lever-builder" aria-labelledby="lever-title">
    <h2 id="lever-title">Alavancas</h2>
    <p className="field-hint">Cria uma variação de “{base.name}” como cenário novo deste estudo. O original não muda. Rode o diagnóstico para comparar.</p>
    <div className="lever-grid">
      <label>Empresa<select value={group} onChange={(event) => { setGroup(event.target.value); setRemoved(new Set()); }}>
        {groups.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <label className="checkbox-field"><input type="checkbox" checked={removeCompany} onChange={(event) => setRemoveCompany(event.target.checked)} /> Tirar a empresa inteira</label>
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
    {groups.length < 2 ? null : <div className="lever-combinations">
      <h3>Composição</h3>
      <p className="field-hint">
        {subsets.length === 0
          ? `São ${groups.length} empresas: combinações demais para gerar de uma vez (máximo 8).`
          : `Cria ${subsets.length} variações: cada empresa sozinha e cada grupo de empresas. Depois, no diagnóstico, “Rodar todas” e compare pela economia.`}
      </p>
      <Button variant="secondary" disabled={busy || subsets.length === 0} onClick={() => void createCombinations()}>Gerar todas as combinações</Button>
    </div>}
    {error === null ? null : <p role="alert" className="field-error">{error}</p>}
    <div className="source-actions">
      <span className="field-hint">Variação: {describeLevers(levers)}</span>
      <Button disabled={busy} onClick={() => void create()}>{busy ? 'Criando…' : 'Criar variação'}</Button>
    </div>
  </section>;
}
