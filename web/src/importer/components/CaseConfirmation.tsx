import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useStudyController } from '../../app/providers';
import { useAuth } from '../../auth/AuthProvider';
import type { CompanyRecord, ObservedCase } from '../../cases/domain';
import { addCaseToPortfolio, portfolioCandidates, studyFromObservedCases, type PortfolioCandidate } from '../../study/newStudy';
import { Button } from '../../ui/Button';

type AddState = Readonly<{ candidates: PortfolioCandidate[]; cases: ObservedCase[]; companies: CompanyRecord[] }>;

export function CaseConfirmation({ observedCase }: { observedCase: ObservedCase }) {
  const controller = useStudyController(); const { userId } = useAuth(); const navigate = useNavigate();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddState | null>(null); const [target, setTarget] = useState('');
  const company = encodeURIComponent(observedCase.companyId);
  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true); setError(null);
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : failure); } finally { setBusy(false); }
  };
  const analyze = () => run(async () => {
    if (userId === null) throw new Error('Sessão necessária.');
    const study = await studyFromObservedCases([observedCase], { ownerSub: userId, now: new Date().toISOString(), ids: () => crypto.randomUUID(), companies: await controller.listCompanies() });
    controller.startNewStudy(); controller.edit(study); await controller.flush();
    navigate(`/carteira/${study.id}`);
  }, 'Não foi possível criar o estudo.');
  const openAdd = () => run(async () => {
    const [studies, cases, companies] = await Promise.all([controller.listStudies(), controller.listObservedCases(), controller.listCompanies()]);
    const candidates = portfolioCandidates(studies, observedCase, companies, cases);
    setAdding({ candidates, cases, companies });
    setTarget(candidates.find((item) => item.blocked === null)?.study.id ?? '');
  }, 'Não foi possível listar os estudos.');
  const add = () => run(async () => {
    if (adding === null) return;
    const loaded = await controller.loadStudy(target);
    if (loaded === null) throw new Error('Estudo não encontrado.');
    controller.edit(await addCaseToPortfolio(loaded, observedCase, { cases: adding.cases, companies: adding.companies, now: new Date().toISOString() }));
    const saved = await controller.flush();
    if (saved === null) throw new Error('Não foi possível confirmar a gravação do estudo.');
    navigate(`/carteira/${saved.id}`);
  }, 'Não foi possível adicionar o caso à carteira.');
  return <section aria-labelledby="import-confirmed-title">
    <h2 id="import-confirmed-title">Caso confirmado</h2>
    <p role="status">Caso {observedCase.id}, revisão {observedCase.revision}, publicado.</p>
    {error === null ? null : <p role="alert" className="inline-notice inline-notice--error">{error}</p>}
    <div className="source-actions">
      <Button disabled={busy} onClick={() => void analyze()}>Analisar este caso</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void openAdd()}>Adicionar a uma carteira</Button>
    </div>
    {adding === null ? null : <div className="source-panel case-shortcuts">
      {adding.candidates.length === 0
        ? <p className="field-hint">Nenhum estudo com dados importados ainda. Use “Analisar este caso” ou crie uma carteira em <Link to="/estudos">Estudos</Link>.</p>
        : <>
          <label htmlFor="add-to-portfolio">Estudo que recebe o caso</label>
          <select id="add-to-portfolio" value={target} onChange={(event) => setTarget(event.currentTarget.value)}>
            <option value="" disabled>Selecione um estudo</option>
            {adding.candidates.map(({ study, caseCount, blocked }) => <option key={study.id} value={study.id} disabled={blocked !== null}>
              {study.name} · {caseCount === 1 ? '1 caso' : `${caseCount} empresas`}{blocked === null ? '' : ` — ${blocked}`}
            </option>)}
          </select>
          <p className="field-hint">O caso entra no cenário original do estudo. Variações já criadas ficam como estavam; rode o diagnóstico do original de novo.</p>
          <div className="source-actions"><Button disabled={busy || target === ''} onClick={() => void add()}>Adicionar e abrir o estudo</Button><Button variant="secondary" onClick={() => setAdding(null)}>Cancelar</Button></div>
        </>}
    </div>}
    <nav aria-label="Continuar após importação"><ul>
      <li><Link to={`/empresas/${company}/casos#caso-${encodeURIComponent(observedCase.id)}`}>Abrir Caso</Link></li>
      <li><Link to={`/empresas/${company}/perfis?caseId=${encodeURIComponent(observedCase.id)}&caseRevision=${observedCase.revision}`}>Criar Perfil Operacional</Link></li>
      <li><Link to={`/empresas/${company}/estudos`}>Abrir Estudos</Link></li>
    </ul></nav>
  </section>;
}
