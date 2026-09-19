import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { usePreview } from '../preview/PreviewProvider';
import { ComparisonSummary } from '../ui/ComparisonSummary';
import { CostTable } from '../ui/CostTable';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { useImportFlow } from '../importer/components/ImportFlowContext';
import type { PreviewEnvelope } from '../api/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function PreviewPage() {
  const preview = usePreview();
  const { envelope } = preview;
  const { restoreEnvelope } = preview;
  const imports = useImportFlow();
  const [params] = useSearchParams();
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => {
    const study = params.get('study'); const execution = params.get('execution');
    if (study === null && execution === null) return;
    if (study === null || execution === null || !UUID.test(study) || !UUID.test(execution)) { setRestoreError('Identificador de execução inválido.'); return; }
    let active = true;
    void imports.repository.loadExecution(study, execution).then((record) => {
      if (!active) return;
      if (record === null) setRestoreError('Execução não encontrada nesta conta.');
      else restoreEnvelope(record.response as PreviewEnvelope);
    }).catch(() => active && setRestoreError('Execução não encontrada nesta conta.'));
    return () => { active = false; };
  }, [imports.repository, params, restoreEnvelope]);
  return (
    <article className="destination-page">
      <p className="eyebrow">Prévia — uma execução</p>
      <h1 ref={headingRef} tabIndex={-1}>Diagnóstico</h1>
      {restoreError === null ? null : <InlineNotice tone="error">{restoreError}</InlineNotice>}
      {envelope === null ? (
        <EmptyState title="Nenhuma prévia disponível">Execute o exemplo de referência em Carteira para ver o resultado canônico.</EmptyState>
      ) : (
        <>
          <p className="page-introduction">Exemplo sintético de validação</p>
          {envelope.result.manifesto.custo_calibrado ? null : (
            <InlineNotice>Valores não calibrados: os fluxos e custos deste exemplo são sintéticos.</InlineNotice>
          )}
          <ComparisonSummary envelope={envelope} />
          <CostTable envelope={envelope} />
          <section className="technical-identity" aria-labelledby="identity-heading">
            <h2 id="identity-heading">Identidade da execução</h2>
            <dl>
              <div><dt>Tipo</dt><dd>{envelope.kind}</dd></div>
              <div><dt>Fingerprint</dt><dd>{envelope.execution_fingerprint}</dd></div>
              <div><dt>Versão do motor</dt><dd>{envelope.result.manifesto.versao_motor}</dd></div>
            </dl>
          </section>
        </>
      )}
    </article>
  );
}
