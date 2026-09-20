import { Link, useParams } from 'react-router-dom';

import { CompanyPageFrame, CompanyRouteState } from './components/CompanyPageFrame';
import { findProfileStudyLinks } from './studyLinks';
import { useCompanyResources } from './useCompanyResources';

export function CompanyProfilesPage() {
  const { companyId } = useParams();
  const resources = useCompanyResources(companyId);
  if (resources.loading || resources.company === null) return <CompanyRouteState loading={resources.loading} error={resources.error} />;
  const profiles = [...resources.profiles].sort((left, right) => right.version - left.version);
  return (
    <CompanyPageFrame company={resources.company} title={`Perfis de ${resources.company.displayName}`} introduction="Versões imutáveis do Perfil Operacional e estudos que preservaram cada evidência.">
      {profiles.length === 0 ? <p className="empty-copy">Perfil operacional não coletado.</p> : (
        <div className="table-scroll" tabIndex={0} aria-label="Tabela rolável de perfis"><table className="company-table"><caption>Versões do perfil operacional</caption><thead><tr><th scope="col">Versão</th><th scope="col">Criado em</th><th scope="col">Cobertura</th><th scope="col">Qualidade</th><th scope="col">Estudos</th></tr></thead><tbody>
          {profiles.map((profile) => {
            const links = findProfileStudyLinks(profile, resources.studies);
            return <tr key={profile.id}><td>{profile.version}</td><td>{profile.createdAt}</td><td>{profile.coverage.coveredDays} dias</td><td>{profile.compatibility.blockers.length} bloqueios · {profile.compatibility.warnings.length} avisos</td><td>{links.length === 0 ? 'nenhum estudo' : links.map((link) => <Link key={link.studyId} to={`/estudos/${link.studyId}`}>{link.studyName}</Link>)}</td></tr>;
          })}
        </tbody></table></div>
      )}
    </CompanyPageFrame>
  );
}
