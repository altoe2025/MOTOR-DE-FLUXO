import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useStudyController } from '../app/providers';
import { useAuth } from '../auth/AuthProvider';
import type { CompanyRecord } from '../cases/domain';

export function CompaniesPage() {
  const controller = useStudyController();
  const { userId } = useAuth();
  const heading = useRef<HTMLHeadingElement>(null);
  const [companies, setCompanies] = useState<CompanyRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    heading.current?.focus();
    void controller.listCompanies()
      .then((records) => { setCompanies(records.filter((item) => item.ownerSub === userId)); setError(null); })
      .catch((reason: unknown) => { setCompanies([]); setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as empresas.'); });
  }, [controller, userId]);
  return (
    <article className="destination-page company-page">
      <p className="eyebrow">Catálogo</p>
      <h1 ref={heading} tabIndex={-1}>Empresas</h1>
      <p className="page-introduction">Consulte casos observados, perfis versionados e estudos relacionados por empresa.</p>
      {error === null ? null : <p role="alert" className="inline-notice inline-notice--error">{error}</p>}
      {companies === null ? <p role="status">Carregando empresas…</p> : companies.length === 0 ? <p className="empty-copy">Nenhuma empresa disponível.</p> : (
        <ul className="company-list">
          {companies.map((company) => <li key={company.id}><Link to={`/empresas/${company.id}`}>{company.displayName}</Link></li>)}
        </ul>
      )}
    </article>
  );
}
