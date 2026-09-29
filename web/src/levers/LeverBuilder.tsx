import { useMemo, useState } from 'react';

import { formatMoney } from '../presentation/format';
import type { ScenarioDocument } from '../study/model';
import { Button } from '../ui/Button';
import { describeLevers, isNeutralLevers, NEUTRAL_LEVERS, type Levers } from './applyLevers';
import { companyResolver } from './companies';
import { combinationPreset, companySubsets, leverBaseAvailable } from './leverScenario';

type DeadlineMode = Levers['deadline']['mode'];

/**
 * Sem `applyToBase`: cada alavanca vira uma variação nova do estudo, e a Composição gera
 * variações por grupo de empresas. Com `applyToBase` (combinação de carteiras): a alavanca
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
  const [manual, setManual] = useState<Set<string>>(new Set());

  if (!leverBaseAvailable(base) || groups.length === 0) {
    return <section className="lever-builder" aria-labelledby="lever-title">
      <h2 id="lever-title">Alavancas</h2>
      <p className="field-hint">{applyToBase
        ? 'Escolha as empresas no Passo 1 para liberar as alavancas.'
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
  const allSubsets = groups.length >= 2 && groups.length <= 8 ? companySubsets(groups) : [];
  const alone = combinationPreset('ALONE', groups);
  const leaveOneOut = combinationPreset('LEAVE_ONE_OUT', groups);
  const manualSubset = groups.filter((item) => manual.has(item));
  const createCombinations = async (subsets: readonly (readonly string[])[]) => {
    if (subsets.length === 0 || onCreateCombinations === undefined) return;
    setBusy(true); setError(null);
    try {
      await onCreateCombinations(subsets, groups);
      setManual(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar as combinações.');
    } finally {
      setBusy(false);
    }
  };
  const createAll = () => {
    if (!window.confirm(`Criar ${allSubsets.length} variações, uma para cada combinação de ${groups.join(', ')}?`)) return;
    void createCombinations(allSubsets);
  };
  const toggleManual = (company: string) => setManual((current) => {
    const next = new Set(current);
    if (!next.delete(company)) next.add(company);
    return next;
  });
  const toggleOrder = (id: string) => setRemoved((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return <section className="lever-builder" aria-labelledby="lever-title">
    <h2 id="lever-title">Alavancas</h2>
    <p className="field-hint">{applyToBase
      ? 'Altera a carteira acima (volume, datas, prazo ou ordens de uma empresa). Todas as combinações usam a carteira alterada. Para desfazer, aplique de novo as empresas no Passo 1.'
      : `Cria uma variação de “${base.name}” como cenário novo deste estudo. O original não muda. Rode o diagnóstico para comparar.`}</p>
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
    {applyToBase || groups.length < 2 ? null : <div className="lever-combinations">
      <h3>Composição</h3>
      <p className="field-hint">
        Cada variação usa as mesmas ordens, valores, datas, período e premissas de “{base.name}”, só sem as empresas de fora.
        Depois, no diagnóstico, “Rodar todas” e compare. “Cada empresa sozinha” alimenta a origem da economia de cada empresa.
      </p>
      <div className="source-actions">
        <Button variant="secondary" disabled={busy} onClick={() => void createCombinations(alone)}>Cada empresa sozinha ({alone.length})</Button>
        {leaveOneOut.length === 0 ? null
          : <Button variant="secondary" disabled={busy} onClick={() => void createCombinations(leaveOneOut)}>Retirar uma por vez ({leaveOneOut.length})</Button>}
      </div>
      <fieldset className="lever-manual">
        <legend>Escolher as empresas de uma variação</legend>
        {groups.map((item) => <label key={item} className="checkbox-field">
          <input type="checkbox" aria-label={`Incluir ${item}`} checked={manual.has(item)} onChange={() => toggleManual(item)} /> {item}
        </label>)}
        <Button variant="secondary" disabled={busy || manualSubset.length === 0 || manualSubset.length === groups.length}
          onClick={() => void createCombinations([manualSubset])}>Criar com as marcadas</Button>
      </fieldset>
      <details className="lever-advanced">
        <summary>{allSubsets.length === 0
          ? `Avançado: todas as combinações (indisponível com ${groups.length} empresas; máximo 8)`
          : `Avançado: todas as combinações (${allSubsets.length} variações)`}</summary>
        {allSubsets.length === 0 ? null : <>
          <p className="field-hint">Cria uma variação para cada grupo possível de empresas. Com muitas empresas, a lista e o tempo de “Rodar todas” crescem rápido.</p>
          <Button variant="secondary" disabled={busy} onClick={createAll}>Criar as {allSubsets.length} variações</Button>
        </>}
      </details>
      {progress ? <p role="status">{progress}</p> : null}
    </div>}
    {error === null ? null : <p role="alert" className="field-error">{error}</p>}
    <div className="source-actions">
      <span className="field-hint">{applyToBase ? 'Alteração' : 'Variação'}: {describeLevers(levers)}</span>
      <Button data-chat-help-id="control.alavancas.criar" disabled={busy || (applyToBase && neutral)} onClick={() => void create()}>{busy ? (applyToBase ? 'Aplicando…' : 'Criando…') : applyToBase ? 'Aplicar à carteira' : 'Criar variação'}</Button>
    </div>
  </section>;
}
