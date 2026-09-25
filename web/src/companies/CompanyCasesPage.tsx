import Decimal from 'decimal.js';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type { ObservedCase } from '../cases/domain';
import { formatMoney } from '../presentation/format';
import { caseHasNotCollected } from './companyOverview';
import {
  filterObservedCases,
  parseCaseFilters,
  serializeCaseFilters,
  type CaseFilterState,
} from './caseFilters';
import { CompanyPageFrame, CompanyRouteState } from './components/CompanyPageFrame';
import { findCaseStudyLinks } from './studyLinks';
import { useCompanyResources } from './useCompanyResources';

function directionVolume(caseRecord: ObservedCase, direction: 'OUT' | 'IN'): string {
  const orders = caseRecord.orders.filter((order) => order.direction === direction);
  if (orders.length === 0) return 'não coletado';
  return formatMoney(orders.reduce((total, order) => total.plus(order.valueBrl), new Decimal(0)).toString());
}

function qualityLabel(caseRecord: ObservedCase): string {
  const labels = [];
  if (caseRecord.quality.blockers.length > 0) labels.push(`${caseRecord.quality.blockers.length} bloqueio(s)`);
  if (caseRecord.quality.warnings.length > 0) labels.push(`${caseRecord.quality.warnings.length} aviso(s)`);
  if (caseHasNotCollected(caseRecord)) labels.push('não coletado');
  return labels.length === 0 ? 'sem apontamentos' : labels.join(' · ');
}

export function CompanyCasesPage() {
  const { companyId } = useParams();
  const resources = useCompanyResources(companyId);
  const [search, setSearch] = useSearchParams();
  if (resources.loading || resources.company === null) return <CompanyRouteState loading={resources.loading} error={resources.error} />;
  const filters = parseCaseFilters(search.toString());
  const update = (change: Partial<CaseFilterState>) => setSearch(serializeCaseFilters({ ...filters, ...change }), { replace: true });
  const cases = filterObservedCases(resources.cases, filters);
  const sourceKinds = [...new Set(resources.cases.map((item) => item.sourceManifest.sourceKind))].sort();
  return (
    <CompanyPageFrame company={resources.company} title={`Casos de ${resources.company.displayName}`} introduction="Histórico observado com período, qualidade e vínculos preservados.">
      <p><Link to={`/empresas/${resources.company.id}#comparacao-temporal`}>Comparar observações no tempo</Link></p>
      <form className="case-filters" aria-label="Filtros dos casos" onSubmit={(event) => event.preventDefault()}>
        <label>Início<input type="date" value={filters.periodStart} onChange={(event) => update({ periodStart: event.currentTarget.value })} /></label>
        <label>Fim<input type="date" value={filters.periodEnd} onChange={(event) => update({ periodEnd: event.currentTarget.value })} /></label>
        <label>Tipo de fonte<select value={filters.sourceKind} onChange={(event) => update({ sourceKind: event.currentTarget.value })}><option value="">Todos</option>{sourceKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label>Qualidade<select value={filters.quality} onChange={(event) => update({ quality: event.currentTarget.value as CaseFilterState['quality'] })}><option value="">Todas</option><option value="WARNING">Com avisos</option><option value="BLOCKER">Com bloqueios</option><option value="NOT_COLLECTED">Não coletado</option></select></label>
      </form>
      {cases.length === 0 ? <p className="empty-copy">Nenhum caso encontrado.</p> : (
        <div className="table-scroll" tabIndex={0} aria-label="Tabela rolável de casos">
          <table className="company-table">
            <caption>Histórico de casos</caption>
            <thead><tr><th scope="col">Janela</th><th scope="col">Fechamento</th><th scope="col">Origem</th><th scope="col">Qualidade</th><th scope="col">OUT</th><th scope="col">IN</th><th scope="col">Revisão</th><th scope="col">Estudos</th></tr></thead>
            <tbody>{cases.map((caseRecord) => {
              const links = findCaseStudyLinks(resources.company!.ownerSub, caseRecord.id, resources.studies);
              return <tr key={caseRecord.id} id={`caso-${caseRecord.id}`}>
                <td>{caseRecord.window.startDate} a {caseRecord.window.endDate}</td>
                <td>{caseRecord.window.closingDate}</td>
                <td>{caseRecord.sourceManifest.sourceKind}</td>
                <td>{qualityLabel(caseRecord)}</td>
                <td>{directionVolume(caseRecord, 'OUT')}</td>
                <td>{directionVolume(caseRecord, 'IN')}</td>
                <td>{caseRecord.revision}</td>
                <td>{links.length === 0 ? 'nenhum estudo' : links.map((link) => <Link key={link.studyId} to={`/estudos/${link.studyId}`}>{link.studyName} — revisão {link.revisions.join(', ')}</Link>)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </CompanyPageFrame>
  );
}
