import { useEffect, useMemo, useState } from 'react';

import type { CompanyRecord } from '../../cases/domain';
import type { OperationalProfileVersion } from '../../profiles/domain';
import type { ScenarioDocument } from '../../study/model';
import { Button } from '../../ui/Button';
import { InlineNotice } from '../../ui/InlineNotice';
import type { CompositionHypothesisDraft } from '../composition';
import type { MvpHypothesisDraft, MvpScalarCostDraft } from '../hypothesis';
import { isProfileMvpScenario } from '../hypothesis';
import { CompositionHypothesisBuilder } from './CompositionHypothesisBuilder';

type Props = Readonly<{
  baseScenario: ScenarioDocument;
  availableProfiles?: readonly OperationalProfileVersion[];
  companies?: readonly CompanyRecord[];
  onCreate(draft: MvpHypothesisDraft | CompositionHypothesisDraft): void | Promise<void>;
}>;

const COSTS: readonly Readonly<{ key: keyof MvpScalarCostDraft; label: string }>[] = [
  { key: 'iof_out', label: 'IOF OUT' }, { key: 'iof_in', label: 'IOF IN' },
  { key: 'carry_cnr', label: 'Carry CNR' }, { key: 'spread_rail_bps', label: 'Spread do rail em bps' },
  { key: 'custo_fixo_remessa', label: 'Custo fixo por remessa' },
  { key: 'custo_oportunidade_aa', label: 'Custo de oportunidade ao ano' },
  { key: 'ptax', label: 'PTAX' },
];

function scalarCosts(scenario: ScenarioDocument): MvpScalarCostDraft {
  const { iof_por_finalidade: _frozen, ...costs } = scenario.premises.costs;
  void _frozen;
  return costs;
}

export function HypothesisBuilder(props: Props) {
  if (isProfileMvpScenario(props.baseScenario) && props.availableProfiles !== undefined) {
    return <CompositionHypothesisBuilder baseScenario={props.baseScenario}
      availableProfiles={props.availableProfiles} companies={props.companies} onCreate={props.onCreate} />;
  }
  return <LegacyHypothesisBuilder {...props} />;
}

function LegacyHypothesisBuilder({ baseScenario, onCreate }: Props) {
  const profile = isProfileMvpScenario(baseScenario);
  const [name, setName] = useState('Nova hipótese');
  const [windowDays, setWindowDays] = useState(String(baseScenario.premises.windowDays));
  const [costs, setCosts] = useState<MvpScalarCostDraft>(() => scalarCosts(baseScenario));
  const [volumeMultiplier, setVolumeMultiplier] = useState('1');
  const [ticketMultiplier, setTicketMultiplier] = useState('1');
  const [outFractionDelta, setOutFractionDelta] = useState('0');
  const [deadlineMode, setDeadlineMode] = useState<'KEEP' | 'PROFILE' | 'FIXED'>('KEEP');
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const actionId = `hypothesis-action-${baseScenario.id}`;
  useEffect(() => { if (error !== null) document.getElementById(actionId)?.focus(); }, [actionId, error]);
  const generationChanged = profile && (volumeMultiplier !== '1' || ticketMultiplier !== '1'
    || outFractionDelta !== '0' || deadlineMode !== 'KEEP');
  const changes = useMemo(() => {
    const rows: { code: string; label: string; before: string; after: string }[] = [];
    const add = (code: string, label: string, before: string, after: string) => {
      if (before !== after) rows.push({ code, label, before, after });
    };
    if (profile) {
      add('volume', 'Volume', '1', volumeMultiplier);
      add('ticket', 'Ticket', '1', ticketMultiplier);
      add('mix', 'Fração OUT', '0', outFractionDelta);
      add('deadline', 'Prazo', 'Manter', deadlineMode === 'KEEP' ? 'Manter' : deadlineMode === 'FIXED' ? `${deadlineDays} dias` : 'Derivado do Perfil');
    }
    add('window', 'Janela', String(baseScenario.premises.windowDays), windowDays);
    for (const item of COSTS) add(item.key, item.label, baseScenario.premises.costs[item.key], costs[item.key]);
    return rows;
  }, [baseScenario, costs, deadlineDays, deadlineMode, outFractionDelta, profile, ticketMultiplier, volumeMultiplier, windowDays]);

  const submit = async () => {
    const common = { name, windowDays: Number(windowDays), costs };
    const draft: MvpHypothesisDraft = profile ? {
      kind: 'PROFILE_SIMULATION', ...common, volumeMultiplier, ticketMultiplier, outFractionDelta,
      deadline: deadlineMode === 'KEEP' ? { mode: 'KEEP' }
        : deadlineMode === 'FIXED' ? { mode: 'FIXED', days: Number(deadlineDays) }
          : { mode: 'PROFILE' },
    } : { kind: 'OBSERVED', ...common };
    setSubmitting(true); setError(null);
    try { await onCreate(draft); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a hipótese.'); }
    finally { setSubmitting(false); }
  };
  const input = baseScenario.sourceSnapshot.generationInputSnapshot;
  const recipe = baseScenario.sourceSnapshot.source.kind === 'SYNTHETIC'
    ? baseScenario.sourceSnapshot.source.recipe : null;
  return (
    <section className="hypothesis-card" aria-labelledby="hypothesis-title">
      <h2 id="hypothesis-title">Criar hipótese</h2>
      <label>Nome da hipótese<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      {profile ? <div className="parameter-grid">
        <label>Multiplicador de volume<input type="number" step="any" value={volumeMultiplier} onChange={(event) => setVolumeMultiplier(event.target.value)} /></label>
        <label>Deslocamento da fração OUT<input type="number" step="any" value={outFractionDelta} onChange={(event) => setOutFractionDelta(event.target.value)} /></label>
        <label>Multiplicador de ticket<input type="number" step="any" value={ticketMultiplier} onChange={(event) => setTicketMultiplier(event.target.value)} /></label>
        <label>Prazo<select value={deadlineMode} onChange={(event) => setDeadlineMode(event.target.value as typeof deadlineMode)}><option value="KEEP">Manter</option><option value="PROFILE">Derivado do Perfil</option><option value="FIXED">Fixo</option></select></label>
        {deadlineMode === 'FIXED' ? <label>Dias de prazo<input type="number" value={deadlineDays} onChange={(event) => setDeadlineDays(event.target.value)} /></label> : null}
      </div> : null}
      <div className="parameter-grid">
        <label>Janela em dias<input type="number" min="1" value={windowDays} onChange={(event) => setWindowDays(event.target.value)} /></label>
        {COSTS.map((item) => <label key={item.key}>{item.label}<input type="number" step="any" value={costs[item.key]} onChange={(event) => setCosts((current) => ({ ...current, [item.key]: event.target.value }))} /></label>)}
      </div>
      {profile && input !== undefined && recipe !== null ? <div className="frozen-panel" aria-label="Valores congelados da simulação">
        {input.participants.map((participant) => {
          const source = input.sources[`/participants/${participant.id}/profile`]?.source ?? '';
          const match = /^profile-mvp:(.+)@([0-9a-f]{64}):/.exec(source);
          return <div key={participant.id} className="frozen-participant">
            <p>ID do Perfil: {match?.[1] ?? 'Indisponível'}</p><p>Fingerprint do Perfil: {match?.[2] ?? 'Indisponível'}</p>
            <p>Participante: {participant.id}</p><p>Perfil do gerador: {participant.profile}</p>
            <p>Seed: {participant.seed}</p><p>eFX: {participant.eh_efx ? 'Sim' : 'Não'}</p>
            <p>Finalidade OUT: {participant.purpose_out}</p><p>Finalidade IN: {participant.purpose_in}</p>
          </div>;
        })}
        <p>Horizonte: {input.measurement_days} dias</p><p>Versão da preparação: {recipe.preparationVersion}</p>
        <p>Versão do gerador: {recipe.generatorVersion}</p><p>Versão do motor: {recipe.motorBuildSha}</p>
      </div> : null}
      <InlineNotice>{generationChanged ? 'As ordens serão regeneradas' : 'As mesmas ordens serão reutilizadas'}</InlineNotice>
      <div className="table-scroll"><table className="hypothesis-changes"><caption>Alterações da hipótese</caption><thead><tr><th>Parâmetro</th><th>Base</th><th>Hipótese</th></tr></thead><tbody>{changes.length === 0 ? <tr><td colSpan={3}>Nenhuma alteração.</td></tr> : changes.map((change) => <tr key={change.code}><th scope="row">{change.label}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div>
      {error === null ? null : <InlineNotice tone="error">{error}</InlineNotice>}
      <Button id={actionId} disabled={submitting} onClick={() => void submit()}>{error === null ? (submitting ? 'Criando…' : 'Criar hipótese') : 'Tentar novamente'}</Button>
    </section>
  );
}
