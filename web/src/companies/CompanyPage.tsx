import { useParams } from 'react-router-dom';

import { formatMoney } from '../presentation/format';
import { deriveCompanyOverview } from './companyOverview';
import { CompanyPageFrame, CompanyRouteState } from './components/CompanyPageFrame';
import { useCompanyResources } from './useCompanyResources';

function valueOrNotCollected(value: string | null): string {
  return value === null ? 'não coletado' : formatMoney(value);
}

export function CompanyPage() {
  const { companyId } = useParams();
  const resources = useCompanyResources(companyId);
  if (resources.loading || resources.company === null) return <CompanyRouteState loading={resources.loading} error={resources.error} />;
  const overview = deriveCompanyOverview({ ...resources, company: resources.company });
  return (
    <CompanyPageFrame company={resources.company} title={resources.company.displayName} introduction="Visão consolidada das evidências preservadas para esta empresa.">
      <dl className="company-summary">
        <div><dt>Casos</dt><dd>{overview.caseCount === 0 ? 'nenhum caso' : overview.caseCount}</dd></div>
        <div><dt>Dias cobertos</dt><dd>{overview.coverage?.coveredDays ?? 'não coletado'}</dd></div>
        <div><dt>Primeira data</dt><dd>{overview.coverage?.firstDate ?? 'não coletado'}</dd></div>
        <div><dt>Última data</dt><dd>{overview.coverage?.lastDate ?? 'não coletado'}</dd></div>
        <div><dt>Lacunas</dt><dd>{overview.coverage === null ? 'não coletado' : `${overview.coverage.gapDays} dias`}</dd></div>
        <div><dt>Volume OUT</dt><dd>{valueOrNotCollected(overview.volume.outBrl)}</dd></div>
        <div><dt>Volume IN</dt><dd>{valueOrNotCollected(overview.volume.inBrl)}</dd></div>
        <div><dt>Qualidade</dt><dd>{overview.quality.blockerCount} bloqueios · {overview.quality.warningCount} avisos · {overview.quality.notCollectedCount} não coletados</dd></div>
        <div><dt>Perfil mais recente</dt><dd>{overview.latestProfile === null ? 'não coletado' : `versão ${overview.latestProfile.version}`}</dd></div>
        <div><dt>Estudos relacionados</dt><dd>{overview.relatedStudies.length === 0 ? 'nenhum estudo' : overview.relatedStudies.length}</dd></div>
      </dl>
    </CompanyPageFrame>
  );
}
