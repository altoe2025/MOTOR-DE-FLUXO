import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { CompanyRecord, ObservedCase } from '../../cases/domain';
import { Button } from '../../ui/Button';
import { formatPeriod } from '../naming';

type Origin = 'IMPORTED' | 'COMPANIES' | 'SYNTHETIC';

export type NewStudyChooserProps = Readonly<{
  cases: readonly ObservedCase[];
  companies: readonly CompanyRecord[];
  busy: boolean;
  onCreateFromCases(caseIds: readonly string[]): void;
  onCreateSynthetic(): void;
  onCancel(): void;
}>;

export function caseLabel(item: ObservedCase, companies: readonly CompanyRecord[]): string {
  const company = companies.find((entry) => entry.id === item.companyId)?.displayName ?? item.companyId;
  return `${company} · ${formatPeriod(item.window.startDate, item.window.endDate)} · ${item.orders.length} ${item.orders.length === 1 ? 'ordem' : 'ordens'}`;
}

/** Escolha da origem antes de criar o rascunho: só a carteira gerada depende do servidor. */
export function NewStudyChooser({ cases, companies, busy, onCreateFromCases, onCreateSynthetic, onCancel }: NewStudyChooserProps) {
  const confirmed = cases.filter((item) => item.status === 'CONFIRMED')
    .sort((left, right) => caseLabel(left, companies).localeCompare(caseLabel(right, companies), 'pt-BR'));
  const [origin, setOrigin] = useState<Origin>(confirmed.length > 0 ? 'IMPORTED' : 'SYNTHETIC');
  const [caseId, setCaseId] = useState(confirmed[0]?.id ?? '');
  const [picked, setPicked] = useState<readonly string[]>([]);
  const pickedCompanies = picked.map((id) => confirmed.find((item) => item.id === id)?.companyId);
  const combineError = picked.length < 2 ? 'Marque casos de pelo menos duas empresas.'
    : new Set(pickedCompanies).size !== picked.length ? 'Marque no máximo um caso por empresa.' : null;
  const noCases = <p className="field-hint">Nenhum caso importado ainda. <Link to="/importar">Importar planilha</Link></p>;
  return <section className="source-panel new-study-chooser" aria-labelledby="new-study-title">
    <h2 id="new-study-title">Novo estudo: de onde vêm os dados?</h2>
    <div className="source-selector__choices" role="radiogroup" aria-label="Origem do novo estudo">
      <label><input type="radio" name="new-study-origin" checked={origin === 'IMPORTED'} onChange={() => setOrigin('IMPORTED')} /> Dados importados de uma empresa</label>
      <label><input type="radio" name="new-study-origin" checked={origin === 'COMPANIES'} onChange={() => setOrigin('COMPANIES')} /> Carteira de várias empresas</label>
      <label><input type="radio" name="new-study-origin" checked={origin === 'SYNTHETIC'} onChange={() => setOrigin('SYNTHETIC')} /> Carteira gerada (exemplo)</label>
    </div>
    {origin === 'IMPORTED' ? (confirmed.length === 0 ? noCases : <>
      <label htmlFor="new-study-case">Caso importado</label>
      <select id="new-study-case" value={caseId} onChange={(event) => setCaseId(event.currentTarget.value)}>
        {confirmed.map((item) => <option key={item.id} value={item.id}>{caseLabel(item, companies)}</option>)}
      </select>
      <div className="source-actions"><Button disabled={busy || caseId === ''} onClick={() => onCreateFromCases([caseId])}>Criar estudo</Button><Button variant="secondary" onClick={onCancel}>Cancelar</Button></div>
    </>) : null}
    {origin === 'COMPANIES' ? (confirmed.length === 0 ? noCases : <>
      <fieldset className="new-study-cases"><legend>Casos que entram na carteira</legend>
        {confirmed.map((item) => <label key={item.id}><input type="checkbox" checked={picked.includes(item.id)}
          onChange={(event) => { const checked = event.currentTarget.checked; setPicked((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id)); }} /> {caseLabel(item, companies)}</label>)}
      </fieldset>
      {combineError === null ? null : <p className="field-hint">{combineError}</p>}
      <div className="source-actions"><Button disabled={busy || combineError !== null} onClick={() => onCreateFromCases(picked)}>Criar carteira</Button><Button variant="secondary" onClick={onCancel}>Cancelar</Button></div>
    </>) : null}
    {origin === 'SYNTHETIC' ? <>
      <p className="field-hint">Gera no servidor uma carteira de exemplo equilibrada. Dá para trocar a origem depois, na página do estudo.</p>
      <div className="source-actions"><Button disabled={busy} onClick={onCreateSynthetic}>Criar com carteira gerada</Button><Button variant="secondary" onClick={onCancel}>Cancelar</Button></div>
    </> : null}
  </section>;
}
