import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { TextField } from '../ui/TextField';
import { getBrowserDraftRecovery } from './draftRecovery';

export function DraftPortfolio() {
  const { userId } = useAuth();
  const recovery = getBrowserDraftRecovery();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => headingRef.current?.focus(), []);
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
      <p className="eyebrow">Estudo atual</p><h1 ref={headingRef} tabIndex={-1}>Carteira</h1><p className="page-introduction">Descreva uma carteira para organizar uma prévia reproduzível.</p>
      <section className="draft-card" aria-labelledby="draft-heading">
        <h2 id="draft-heading">Rascunho local</h2>
        <TextField id="study-name" label="Nome do estudo" maxLength={120} value={name} onChange={(event) => changeName(event.currentTarget.value)} hint="Este nome fica somente neste navegador e nesta conta." />
        {warning === null ? <p className="save-status" role="status">Alterações salvas neste navegador.</p> : <InlineNotice tone="error">{warning}</InlineNotice>}
      </section>
      <EmptyState title="Ainda não há uma carteira para analisar">Os dados informados aparecerão aqui antes de qualquer execução.</EmptyState>
    </article>
  );
}
