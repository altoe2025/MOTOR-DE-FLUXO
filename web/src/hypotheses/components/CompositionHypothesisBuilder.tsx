import { useMemo, useState } from 'react';

import type { OperationalProfileVersion } from '../../profiles/domain';
import type { CostPremises, EffectiveInput, ScenarioDocument } from '../../study/model';
import { Button } from '../../ui/Button';
import { InlineNotice } from '../../ui/InlineNotice';
import type {
  CompositionHypothesisDraft, CompositionParticipantChange, CompositionParticipantPatch,
} from '../composition';

type Participant = EffectiveInput['participants'][number];
type AddedParticipant = Readonly<{
  profile: OperationalProfileVersion;
  participantId: string;
  seed: string;
}>;

type Props = Readonly<{
  baseScenario: ScenarioDocument;
  availableProfiles: readonly OperationalProfileVersion[];
  onCreate(draft: CompositionHypothesisDraft): void | Promise<void>;
}>;

const COSTS: readonly Readonly<{ key: Exclude<keyof CostPremises, 'iof_por_finalidade'>; label: string }>[] = [
  { key: 'iof_out', label: 'IOF OUT' }, { key: 'iof_in', label: 'IOF IN' },
  { key: 'carry_cnr', label: 'Carry CNR' }, { key: 'spread_rail_bps', label: 'Spread do rail em bps' },
  { key: 'custo_fixo_remessa', label: 'Custo fixo por remessa' },
  { key: 'custo_oportunidade_aa', label: 'Custo de oportunidade ao ano' },
  { key: 'ptax', label: 'PTAX' },
];

function lineageProfileId(input: EffectiveInput, participantId: string): string | null {
  const source = input.sources[`/participants/${participantId}/profile`]?.source;
  return source?.match(/^profile-mvp:(.+)@[0-9a-f]{64}:/)?.[1] ?? null;
}

function changedPatch(base: Participant, current: Participant): CompositionParticipantPatch {
  const patch: Record<string, unknown> = {};
  if (base.monthly_volume_brl !== current.monthly_volume_brl) patch.monthlyVolumeBrl = current.monthly_volume_brl;
  if (base.ticket_median_brl !== current.ticket_median_brl) patch.ticketMedianBrl = current.ticket_median_brl;
  if (base.out_fraction !== current.out_fraction) patch.outFraction = current.out_fraction;
  if (base.profile !== current.profile) patch.generatorProfile = current.profile;
  if (JSON.stringify(base.deadline) !== JSON.stringify(current.deadline)) patch.deadline = current.deadline;
  if (base.eh_efx !== current.eh_efx) patch.efx = current.eh_efx;
  if (base.purpose_out !== current.purpose_out) patch.purposeOut = current.purpose_out;
  if (base.purpose_in !== current.purpose_in) patch.purposeIn = current.purpose_in;
  return patch as CompositionParticipantPatch;
}

export function CompositionHypothesisBuilder({ baseScenario, availableProfiles, onCreate }: Props) {
  const input = baseScenario.sourceSnapshot.generationInputSnapshot;
  if (input === undefined) throw new Error('Cenário sem entrada de geração por Perfil.');
  const [name, setName] = useState('Nova hipótese');
  const [participants, setParticipants] = useState(() => structuredClone(input.participants) as Participant[]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<AddedParticipant[]>([]);
  const [windowDays, setWindowDays] = useState(baseScenario.premises.windowDays);
  const [costs, setCosts] = useState<CostPremises>(() => structuredClone(baseScenario.premises.costs));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const profileById = useMemo(() => new Map(availableProfiles.map((profile) => [profile.id, profile])), [availableProfiles]);
  const companyFor = (participant: Participant) => {
    const profileId = lineageProfileId(input, participant.id);
    return profileById.get(profileId ?? '')?.companyId ?? profileId ?? participant.id;
  };
  const visible = participants.filter((participant) => !removed.includes(participant.id));
  const usedProfiles = new Set(visible.map((participant) => lineageProfileId(input, participant.id)).filter(Boolean));
  for (const item of added) usedProfiles.add(item.profile.id);
  const usedCompanies = new Set([
    ...visible.map((participant) => profileById.get(lineageProfileId(input, participant.id) ?? '')?.companyId),
    ...added.map((item) => item.profile.companyId),
  ].filter((company): company is string => company !== undefined));

  const participantChanges = useMemo<CompositionParticipantChange[]>(() => {
    const changes: CompositionParticipantChange[] = removed.map((participantId) => ({ kind: 'REMOVE_PARTICIPANT', participantId }));
    for (const participant of participants) {
      if (removed.includes(participant.id)) continue;
      const base = input.participants.find((item) => item.id === participant.id)!;
      const patch = changedPatch(base, participant);
      if (Object.keys(patch).length > 0) changes.push({ kind: 'UPDATE_PARTICIPANT', participantId: participant.id, patch });
    }
    for (const item of added) changes.push({
      kind: 'ADD_PROFILE', profile: item.profile,
      explicit: {
        participantId: item.participantId, generatorProfile: 'tesouraria_corporativa', seed: item.seed,
        deadline: { mode: 'FIXED', days: 7 }, efx: false,
        purposeOut: 'ANEXO_V_REMESSA_TERCEIRO', purposeIn: 'ANEXO_V_DISPONIBILIDADE',
      },
    });
    return changes;
  }, [added, input.participants, participants, removed]);
  const commonChanged = windowDays !== baseScenario.premises.windowDays
    || JSON.stringify(costs) !== JSON.stringify(baseScenario.premises.costs);
  const hasChanges = participantChanges.length > 0 || commonChanged;

  const updateParticipant = (id: string, update: Partial<Participant>) => {
    setParticipants((current) => current.map((participant) => participant.id === id
      ? { ...participant, ...update } : participant));
    setError(null);
  };
  const removeParticipant = (id: string) => {
    if (visible.length + added.length <= 1) {
      setError('A composição precisa de ao menos um participante.');
      return;
    }
    setRemoved((current) => [...current, id]); setError(null);
  };
  const addProfile = (profileId: string) => {
    const profile = profileById.get(profileId);
    if (profile !== undefined) setAdded((current) => [...current, {
      profile, participantId: crypto.randomUUID(), seed: String(current.length + input.participants.length + 1),
    }]);
    setError(null);
  };
  const updateAdded = (participantId: string, update: Partial<Pick<AddedParticipant, 'participantId' | 'seed'>>) => {
    setAdded((current) => current.map((item) => item.participantId === participantId ? { ...item, ...update } : item));
    setError(null);
  };
  const removeAdded = (participantId: string) => {
    if (visible.length + added.length <= 1) {
      setError('A composição precisa de ao menos um participante.');
      return;
    }
    setAdded((current) => current.filter((item) => item.participantId !== participantId));
    setError(null);
  };
  const submit = async () => {
    if (!hasChanges || name.trim().length === 0) return;
    setSubmitting(true); setError(null);
    try {
      await onCreate({ kind: 'PROFILE_COMPOSITION', name: name.trim(), participantChanges, windowDays, costs });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a hipótese.');
    } finally { setSubmitting(false); }
  };

  return <section className="hypothesis-card" aria-labelledby="composition-hypothesis-title">
    <h2 id="composition-hypothesis-title">Criar hipótese de composição</h2>
    <label>Nome da hipótese<input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <fieldset><legend>Composição</legend>
      <label>Adicionar Perfil<select value="" onChange={(event) => addProfile(event.target.value)}>
        <option value="">Selecione</option>
        {availableProfiles.filter((profile) => profile.compatibility.compatible
          && !usedProfiles.has(profile.id) && !usedCompanies.has(profile.companyId))
          .map((profile) => <option key={profile.id} value={profile.id}>{profile.companyId}</option>)}
      </select></label>
      {added.map((item) => <div key={item.profile.id} className="composition-participant">
        <p>Adicionar {item.profile.companyId}</p>
        <label>ID do participante — {item.profile.companyId}<input value={item.participantId}
          onChange={(event) => updateAdded(item.participantId, { participantId: event.target.value })} /></label>
        <label>Seed — {item.profile.companyId}<input value={item.seed}
          onChange={(event) => updateAdded(item.participantId, { seed: event.target.value })} /></label>
        <Button variant="secondary" onClick={() => removeAdded(item.participantId)}>
          Remover {item.profile.companyId}
        </Button>
      </div>)}
    </fieldset>
    <fieldset><legend>Participantes</legend>{visible.map((participant) => {
      const company = companyFor(participant);
      return <div className="composition-participant" key={participant.id}>
        <h3>{company}</h3>
        <label>Volume mensal — {company}<input type="number" step="any" value={participant.monthly_volume_brl}
          onChange={(event) => updateParticipant(participant.id, { monthly_volume_brl: event.target.value })} /></label>
        <label>Fração OUT — {company}<input type="number" step="any" value={participant.out_fraction}
          onChange={(event) => updateParticipant(participant.id, { out_fraction: event.target.value })} /></label>
        <label>Ticket mediano — {company}<input type="number" step="any" value={participant.ticket_median_brl}
          onChange={(event) => updateParticipant(participant.id, { ticket_median_brl: event.target.value })} /></label>
        <label>Arquétipo — {company}<select value={participant.profile}
          onChange={(event) => updateParticipant(participant.id, { profile: event.target.value as Participant['profile'] })}>
          <option value="tesouraria_corporativa">Tesouraria corporativa</option>
          <option value="exportador">Exportador</option><option value="remessa_outbound_massiva">Remessa outbound massiva</option>
          <option value="psp_inbound">PSP inbound</option><option value="cripto_native_sem_fiat">Cripto sem fiat</option>
          <option value="payroll_fornecedor">Payroll fornecedor</option>
        </select></label>
        <label>Prazo — {company}<select value={participant.deadline.mode}
          onChange={(event) => updateParticipant(participant.id, {
            deadline: event.target.value === 'FIXED' ? { mode: 'FIXED', days: 7 } : { mode: 'PROFILE' },
          })}>
          <option value="FIXED">Fixo</option><option value="PROFILE">Derivado do Perfil</option>
        </select></label>
        {participant.deadline.mode === 'FIXED' ? <label>Dias de prazo — {company}<input type="number" min="0"
          value={participant.deadline.days} onChange={(event) => updateParticipant(participant.id, {
            deadline: { mode: 'FIXED', days: Number(event.target.value) },
          })} /></label> : null}
        <label><input type="checkbox" checked={participant.eh_efx}
          onChange={(event) => updateParticipant(participant.id, { eh_efx: event.target.checked })} /> eFX — {company}</label>
        <label>Finalidade OUT — {company}<input value={participant.purpose_out}
          onChange={(event) => updateParticipant(participant.id, { purpose_out: event.target.value })} /></label>
        <label>Finalidade IN — {company}<input value={participant.purpose_in}
          onChange={(event) => updateParticipant(participant.id, { purpose_in: event.target.value })} /></label>
        <Button variant="secondary" onClick={() => removeParticipant(participant.id)}>Remover {company}</Button>
      </div>;
    })}</fieldset>
    <fieldset><legend>Premissas comuns</legend><div className="parameter-grid">
      <label>Janela em dias<input type="number" min="1" value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))} /></label>
      {COSTS.map((item) => <label key={item.key}>{item.label}<input type="number" step="any" value={costs[item.key]}
        onChange={(event) => setCosts((current) => ({ ...current, [item.key]: event.target.value }))} /></label>)}
    </div>
      <fieldset><legend>IOF por finalidade</legend>
        {costs.iof_por_finalidade.map((rule, index) => <div className="parameter-grid" key={`${index}-${rule.finalidade}-${rule.direcao}`}>
          <label>Finalidade da regra {index + 1}<input value={rule.finalidade} onChange={(event) => setCosts((current) => ({
            ...current, iof_por_finalidade: current.iof_por_finalidade.map((item, itemIndex) => itemIndex === index
              ? { ...item, finalidade: event.target.value } : item),
          }))} /></label>
          <label>Direção da regra {index + 1}<select value={rule.direcao} onChange={(event) => setCosts((current) => ({
            ...current, iof_por_finalidade: current.iof_por_finalidade.map((item, itemIndex) => itemIndex === index
              ? { ...item, direcao: event.target.value as 'OUT' | 'IN' } : item),
          }))}><option value="OUT">OUT</option><option value="IN">IN</option></select></label>
          <label>Alíquota da regra {index + 1}<input type="number" step="any" value={rule.aliquota} onChange={(event) => setCosts((current) => ({
            ...current, iof_por_finalidade: current.iof_por_finalidade.map((item, itemIndex) => itemIndex === index
              ? { ...item, aliquota: event.target.value } : item),
          }))} /></label>
          <Button variant="secondary" onClick={() => setCosts((current) => ({
            ...current, iof_por_finalidade: current.iof_por_finalidade.filter((_, itemIndex) => itemIndex !== index),
          }))}>Remover regra {index + 1}</Button>
        </div>)}
        <Button variant="secondary" onClick={() => setCosts((current) => ({
          ...current, iof_por_finalidade: [...current.iof_por_finalidade, { finalidade: '', direcao: 'OUT', aliquota: '0' }],
        }))}>Adicionar regra de IOF</Button>
      </fieldset>
    </fieldset>
    <InlineNotice>{participantChanges.length > 0 ? 'As ordens serão regeneradas' : 'As mesmas ordens serão reutilizadas'}</InlineNotice>
    <div className="table-scroll"><table className="hypothesis-changes">
      <caption>Resumo antes e depois</caption><thead><tr><th>Alteração</th><th>Antes</th><th>Depois</th></tr></thead>
      <tbody>{hasChanges ? <>
        {participantChanges.map((change, index) => <tr key={`${change.kind}-${index}`}><th scope="row">{change.kind}</th><td>Composição base</td><td>Composição proposta</td></tr>)}
        {windowDays === baseScenario.premises.windowDays ? null : <tr><th scope="row">Janela</th><td>{baseScenario.premises.windowDays}</td><td>{windowDays}</td></tr>}
        {JSON.stringify(costs) === JSON.stringify(baseScenario.premises.costs) ? null : <tr><th scope="row">Custos e IOF</th><td>Premissas base</td><td>Premissas propostas</td></tr>}
      </> : <tr><td colSpan={3}>Nenhuma alteração.</td></tr>}</tbody>
    </table></div>
    {error === null ? null : <InlineNotice tone="error">{error}</InlineNotice>}
    <Button disabled={submitting || !hasChanges || name.trim().length === 0} onClick={() => void submit()}>
      {error === null ? (submitting ? 'Criando…' : 'Criar hipótese') : 'Tentar novamente'}
    </Button>
  </section>;
}
