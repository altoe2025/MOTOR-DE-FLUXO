import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useStudyController } from '../app/providers';
import { useAuth } from '../auth/AuthProvider';
import type { CompanyRecord } from '../cases/domain';
import { Button } from '../ui/Button';

export function CompaniesPage() {
  const controller = useStudyController();
  const { userId } = useAuth();
  const heading = useRef<HTMLHeadingElement>(null);
  const [companies, setCompanies] = useState<CompanyRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const load = useCallback(() => controller.listCompanies()
    .then((records) => { setCompanies(records.filter((item) => item.ownerSub === userId)); setError(null); })
    .catch((reason: unknown) => { setCompanies([]); setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as empresas.'); }), [controller, userId]);
  useEffect(() => {
    heading.current?.focus();
    void load();
  }, [load]);
  const remove = async (company: CompanyRecord) => {
    const confirmed = window.confirm(`Excluir a empresa "${company.displayName}"?

Os casos importados e os perfis dela serão apagados. Estudos já criados continuam, com a cópia das ordens que já guardam. Não dá para desfazer.`);
    if (!confirmed) return;
    setDeleting(company.id);
    try {
      await controller.deleteCompany(company.id);
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a empresa.');
    } finally {
      setDeleting(null);
    }
  };
  return (
    <article className="destination-page company-page">
      <p className="eyebrow">Catálogo</p>
      <h1 ref={heading} tabIndex={-1}>Empresas</h1>
      <p className="page-introduction">Consulte casos observados, perfis versionados e estudos relacionados por empresa.</p>
      <p><Link to="/importar">Importar operações</Link></p>
      {error === null ? null : <p role="alert" className="inline-notice inline-notice--error">{error}</p>}
      {companies === null ? <p role="status">Carregando empresas…</p> : companies.length === 0 ? <p className="empty-copy">Nenhuma empresa disponível.</p> : (
        <ul className="company-list">
          {companies.map((company) => <li key={company.id} className="company-list__item">
            <Link to={`/empresas/${company.id}`}>{company.displayName}</Link>
            <Button variant="secondary" disabled={deleting !== null} onClick={() => void remove(company)} aria-label={`Excluir empresa ${company.displayName}`}>
              {deleting === company.id ? 'Excluindo…' : 'Excluir'}
            </Button>
          </li>)}
        </ul>
      )}
    </article>
  );
}
