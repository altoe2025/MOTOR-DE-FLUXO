import type { ScenarioDocument } from '../../study/model';
import { Button } from '../../ui/Button';

const ARCHETYPE_LABELS: Record<string, string> = {
  tesouraria_corporativa: 'Tesouraria corporativa',
  exportador: 'Exportador',
  remessa_outbound_massiva: 'Remessa outbound massiva',
  psp_inbound: 'PSP inbound',
  cripto_native_sem_fiat: 'Cripto sem fiat',
  payroll_fornecedor: 'Payroll fornecedor',
};

export function PortfolioCompositionSummary({ scenario, onEdit }: Readonly<{
  scenario: ScenarioDocument;
  onEdit(): void;
}>) {
  const input = scenario.sourceSnapshot.generationInputSnapshot;
  return <div className="portfolio-composition-summary">
    <h3>Composição de {scenario.name}</h3>
    {input === undefined ? <p>Esta origem não possui participantes geráveis registrados.</p> : <>
      <p>{input.participants.length} {input.participants.length === 1 ? 'participante' : 'participantes'} nesta carteira.</p>
      <ul>{input.participants.map((participant) => {
        const source = input.sources[`/participants/${participant.id}/profile`]?.source ?? '';
        const profileId = /^profile-mvp:(.+)@[0-9a-f]{64}:/.exec(source)?.[1];
        return <li key={participant.id}>
          <strong>{ARCHETYPE_LABELS[participant.profile] ?? participant.profile}</strong>
          <span>Participante {participant.id} · {profileId === undefined ? 'Perfil não vinculado' : `Perfil ${profileId}`}</span>
        </li>;
      })}</ul>
    </>}
    <Button variant="secondary" onClick={onEdit}>
      {input === undefined ? 'Criar hipótese' : 'Criar hipótese / alterar carteira'}
    </Button>
  </div>;
}
