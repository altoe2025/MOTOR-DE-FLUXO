import { useEffect, useRef } from 'react';

import { usePreview } from '../preview/PreviewProvider';
import { ComparisonSummary } from '../ui/ComparisonSummary';
import { CostTable } from '../ui/CostTable';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';

export function PreviewPage() {
  const { envelope } = usePreview();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <article className="destination-page">
      <p className="eyebrow">Prévia — uma execução</p>
      <h1 ref={headingRef} tabIndex={-1}>Diagnóstico</h1>
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
