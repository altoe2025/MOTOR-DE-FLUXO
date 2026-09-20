import { Link, useParams } from 'react-router-dom';

import { deriveCompanyOverview } from './companyOverview';
import { CompanyPageFrame, CompanyRouteState } from './components/CompanyPageFrame';
import { useCompanyResources } from './useCompanyResources';

export function CompanyStudiesPage() {
  const { companyId } = useParams();
  const resources = useCompanyResources(companyId);
  if (resources.loading || resources.company === null) return <CompanyRouteState loading={resources.loading} error={resources.error} />;
  const overview = deriveCompanyOverview({ ...resources, company: resources.company });
  return (
    <CompanyPageFrame company={resources.company} title={`Estudos de ${resources.company.displayName}`} introduction="Estudos relacionados por snapshots históricos de casos e perfis.">
      {overview.relatedStudies.length === 0 ? <p className="empty-copy">Nenhum estudo relacionado.</p> : <ul className="company-list">{overview.relatedStudies.map((link) => {
        const study = resources.studies.find((item) => item.id === link.studyId);
        const profileVersions = study?.evidenceSnapshots
          .filter((snapshot) => snapshot.profile.companyId === resources.company!.id)
          .map((snapshot) => snapshot.profile.version) ?? [];
        return <li key={link.studyId}>
          <Link to={`/estudos/${link.studyId}`}>{link.studyName}</Link>
          <p>{profileVersions.length === 0 ? 'Sem Perfil Operacional anexado.' : `Perfis anexados: ${profileVersions.map((version) => `v${version}`).join(', ')}`}</p>
        </li>;
      })}</ul>}
    </CompanyPageFrame>
  );
}
