import type { CompanyRecord } from '../../cases/domain';
import type { OperationalProfileVersion } from '../../profiles/domain';
import type { ScenarioDocument } from '../../study/model';
import { Button } from '../../ui/Button';
import { isProfileMvpScenario } from '../hypothesis';
import { participantNames } from '../participantNames';

export function PortfolioCompositionSummary({ scenario, profiles = [], companies = [], onEdit }: Readonly<{
  scenario: ScenarioDocument;
  profiles?: readonly OperationalProfileVersion[];
  companies?: readonly CompanyRecord[] | undefined;
  onEdit(): void;
}>) {
  const input = scenario.sourceSnapshot.generationInputSnapshot;
  const canEditComposition = input !== undefined && isProfileMvpScenario(scenario);
  const names = input === undefined ? null : participantNames(input, profiles, companies);
  return <div className="portfolio-composition-summary">
    <h3>Composição de {scenario.name}</h3>
    {input === undefined || names === null ? <p>Esta origem não possui participantes geráveis registrados.</p> : <>
      <p>{input.participants.length} {input.participants.length === 1 ? 'participante' : 'participantes'} nesta carteira.</p>
      <ul className="composition-roster">{input.participants.map((participant) => {
        const label = names.get(participant.id)!;
        return <li key={participant.id}>
          <strong>{label.name}</strong>
          <span>{label.name.startsWith(label.archetype) ? '' : label.archetype}</span>
        </li>;
      })}</ul>
      <details className="technical-ids">
        <summary>Ver identificadores técnicos</summary>
        <ul>{input.participants.map((participant) => {
          const label = names.get(participant.id)!;
          return <li key={participant.id}>
            <strong>{label.name}</strong>
            <span>Participante {participant.id} · {label.profileId === null ? 'Perfil não vinculado' : `Perfil ${label.profileId}`}</span>
          </li>;
        })}</ul>
      </details>
    </>}
    <Button variant="secondary" onClick={onEdit}>
      {canEditComposition ? 'Criar hipótese / alterar carteira' : 'Criar hipótese'}
    </Button>
  </div>;
}
