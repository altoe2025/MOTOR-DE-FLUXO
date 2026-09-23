import { Link } from 'react-router-dom';
import type { ObservedCase } from '../../cases/domain';

export function CaseConfirmation({ observedCase }: { observedCase: ObservedCase }) {
  const company = encodeURIComponent(observedCase.companyId);
  return <section aria-labelledby="import-confirmed-title">
    <h2 id="import-confirmed-title">Caso confirmado</h2>
    <p role="status">Caso {observedCase.id}, revisão {observedCase.revision}, publicado.</p>
    <nav aria-label="Continuar após importação"><ul>
      <li><Link to={`/empresas/${company}/casos#caso-${encodeURIComponent(observedCase.id)}`}>Abrir Caso</Link></li>
      <li><Link to={`/empresas/${company}/perfis?caseId=${encodeURIComponent(observedCase.id)}&caseRevision=${observedCase.revision}`}>Criar Perfil Operacional</Link></li>
      <li><Link to={`/empresas/${company}/estudos`}>Abrir Estudos</Link></li>
    </ul></nav>
    <p>O Perfil e o Estudo são criados em etapas manuais separadas.</p>
  </section>;
}
