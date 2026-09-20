import { useEffect, useRef, type ReactNode } from 'react';

import type { CompanyRecord } from '../../cases/domain';
import { CompanyNavigation } from './CompanyNavigation';

export function CompanyPageFrame({
  company,
  title,
  introduction,
  children,
}: {
  company: CompanyRecord;
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [title]);
  return (
    <article className="destination-page company-page">
      <p className="eyebrow">Empresa</p>
      <h1 ref={heading} tabIndex={-1}>{title}</h1>
      <p className="page-introduction">{introduction}</p>
      <CompanyNavigation companyId={company.id} />
      {children}
    </article>
  );
}

export function CompanyRouteState({ loading, error }: { loading: boolean; error: string | null }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (!loading) heading.current?.focus(); }, [loading]);
  if (loading) return <p role="status">Carregando empresa…</p>;
  return (
    <article className="destination-page">
      <h1 ref={heading} tabIndex={-1}>Empresa não encontrada</h1>
      <p>{error ?? 'A empresa não existe ou pertence a outra conta.'}</p>
    </article>
  );
}
