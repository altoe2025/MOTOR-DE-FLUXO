import type { ScenarioDocument } from '../../study/model';
import { Button } from '../../ui/Button';
import { isProfileMvpScenario } from '../hypothesis';
import { AskAboutThis } from '../../help/AskAboutThis';
import { HELP_IDS } from '../../help/helpIds';

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
  const canEditComposition = input !== undefined && isProfileMvpScenario(scenario);
  return <div className="portfolio-composition-summary">
    <h3>Composição de {scenario.name}</h3>
    <AskAboutThis helpId={HELP_IDS.COMPOSITION} />
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
      {canEditComposition ? 'Criar hipótese / alterar carteira' : 'Criar hipótese'}
    </Button>
  </div>;
}
