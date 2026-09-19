import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { usePreview } from '../preview/PreviewProvider';
import { getBrowserDraftRecovery } from '../study/draftRecovery';
import { Button } from '../ui/Button';
import { InlineNotice } from '../ui/InlineNotice';
import { TextField } from '../ui/TextField';
import { useImportFlow } from '../importer/components/ImportFlowContext';
import type { ImportStudyHeader } from '../importer/repository';

export function PortfolioPage() {
  const { userId } = useAuth();
  const preview = usePreview();
  const imports = useImportFlow();
  const recovery = getBrowserDraftRecovery();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [studies, setStudies] = useState<ImportStudyHeader[]>([]);
  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => { void imports.repository.listStudies().then(setStudies).catch(() => setStudies([])); }, [imports.repository]);
  useEffect(() => {
    if (userId === null) return;
    const loaded = recovery.load(userId);
    setName(loaded.draft?.name ?? '');
    if (loaded.status === 'corrupt') setWarning('O rascunho salvo está corrompido e foi preservado para recuperação manual.');
    else if (loaded.status === 'unavailable') setWarning('O armazenamento local não está disponível; alterações não sobreviverão à recarga.');
    else if (loaded.status === 'memory') setWarning('O rascunho está somente em memória e não sobreviverá à recarga.');
    else setWarning(null);
  }, [recovery, userId]);

  const changeName = (next: string) => {
    setName(next);
    if (userId === null) return;
    const saved = recovery.save(userId, { studyId: 'stage-1-draft', name: next });
    setWarning(saved.persistence === 'memory' ? 'Não foi possível gravar no navegador. O rascunho está somente em memória e não sobreviverá à recarga.' : null);
  };

  return (
    <article className="destination-page">
      <p className="eyebrow">Estudo atual</p>
      <h1 ref={headingRef} tabIndex={-1}>Carteira</h1>
      <p className="page-introduction">Descreva uma carteira para organizar uma prévia reproduzível.</p>
      <section className="draft-card" aria-labelledby="imports-heading"><h2 id="imports-heading">Importações XLSX</h2>
        <Link className="button link-button" to="/carteira/importar">Criar importação</Link>
        {studies.length === 0 ? <p>Nenhuma importação local.</p> : <ul className="study-list">{studies.map((study) => <li key={study.id}><Link to={`/carteira/${study.id}/importar`}>{study.name}</Link><span> revisão {study.revision}</span><Button variant="secondary" onClick={() => { if (confirm(`Excluir ${study.name}?`)) void imports.repository.deleteStudy(study.id).then(() => setStudies((all) => all.filter((item) => item.id !== study.id))); }}>Excluir</Button></li>)}</ul>}
        <details><summary>Configurações locais</summary><label>Digite APAGAR para remover todas as importações<input aria-label="Confirmação para apagar dados" id="delete-confirmation" /></label><Button variant="secondary" onClick={() => { const field = document.querySelector<HTMLInputElement>('#delete-confirmation'); if (field?.value === 'APAGAR') void imports.repository.deleteAllLocalData().then(() => setStudies([])); }}>Apagar todos os dados locais</Button></details>
      </section>
      <section className="draft-card" aria-labelledby="draft-heading">
        <h2 id="draft-heading">Rascunho local</h2>
        <TextField id="study-name" label="Nome do estudo" maxLength={120} value={name} onChange={(event) => changeName(event.currentTarget.value)} hint="Este nome fica somente neste navegador e nesta conta." />
        {warning === null ? <p className="save-status" role="status">Alterações salvas neste navegador.</p> : <InlineNotice tone="error">{warning}</InlineNotice>}
      </section>
      <section className="draft-card" aria-labelledby="reference-heading">
        <p className="eyebrow">Exemplo sintético de validação</p>
        <h2 id="reference-heading">Percurso de referência</h2>
        <p>Executa uma prévia real pela API e pelo motor. Os fluxos e custos do exemplo não estão calibrados.</p>
        <Button disabled={preview.status === 'running'} aria-busy={preview.status === 'running' || undefined} onClick={() => void preview.executeReference()}>
          {preview.status === 'running' ? 'Executando exemplo…' : 'Executar exemplo de referência'}
        </Button>
        {preview.error === null ? null : (
          <InlineNotice tone="error">
            {preview.error.message}{preview.envelope === null ? '' : ' O resultado anterior continua disponível em Diagnóstico.'}
          </InlineNotice>
        )}
      </section>
    </article>
  );
}
