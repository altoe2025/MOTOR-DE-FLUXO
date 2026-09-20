import { NavLink } from 'react-router-dom';

export function CompanyNavigation({ companyId }: { companyId: string }) {
  const base = `/empresas/${companyId}`;
  return (
    <nav className="company-navigation" aria-label="Áreas da empresa">
      <NavLink end to={base}>Visão geral</NavLink>
      <NavLink to={`${base}/casos`}>Casos</NavLink>
      <NavLink to={`${base}/perfis`}>Perfis</NavLink>
      <NavLink to={`${base}/estudos`}>Estudos</NavLink>
    </nav>
  );
}
