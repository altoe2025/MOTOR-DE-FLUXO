import { useEffect, useMemo, useState } from 'react';

import type { OperationalProfileVersion } from '../../profiles/domain';
import { Button } from '../../ui/Button';
import { InlineNotice } from '../../ui/InlineNotice';
import type {
  ProfileMvpExplicitFields,
  ProfileMvpParticipantDraft,
} from '../profileMvp';
import { deriveProfileMvpSelection } from '../profileMvp';

type ProfileScenarioBuilderProps = Readonly<{
  profiles: readonly OperationalProfileVersion[];
  ownerSub: string;
  horizonDays: number;
  onPrepare(
    participants: readonly ProfileMvpParticipantDraft[],
    profiles: readonly OperationalProfileVersion[],
  ): void | Promise<void>;
}>;

const GENERATOR_PROFILES = [
  'remessa_outbound_massiva', 'psp_inbound', 'cripto_native_sem_fiat',
  'payroll_fornecedor', 'exportador', 'tesouraria_corporativa',
] as const;

function freshExplicit(): ProfileMvpExplicitFields {
  return {
    participantId: crypto.randomUUID(),
    generatorProfile: 'tesouraria_corporativa',
    seed: '1',
    deadline: { mode: 'PROFILE' },
    efx: false,
    purposeOut: '',
    purposeIn: '',
  };
}

export function ProfileScenarioBuilder({
  profiles, ownerSub, horizonDays, onPrepare,
}: ProfileScenarioBuilderProps) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProfileMvpExplicitFields>>({});
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const actionId = 'profile-simulation-action';
  useEffect(() => { if (retryable) document.getElementById(actionId)?.focus(); }, [retryable]);
  const selectedProfiles = useMemo(
    () => selectedIds.map((id) => profiles.find((profile) => profile.id === id)!).filter(Boolean),
    [profiles, selectedIds],
  );

  const toggle = (profile: OperationalProfileVersion) => {
    setErrors([]);
    setRetryable(false);
    setSelectedIds((current) => current.includes(profile.id)
      ? current.filter((id) => id !== profile.id)
      : [...current, profile.id]);
    setDrafts((current) => current[profile.id] === undefined
      ? { ...current, [profile.id]: freshExplicit() }
      : current);
  };
  const update = (profileId: string, patch: Partial<ProfileMvpExplicitFields>) => {
    setRetryable(false);
    setDrafts((current) => ({
      ...current,
      [profileId]: { ...(current[profileId] ?? freshExplicit()), ...patch },
    }));
  };
  const submit = async () => {
    const localErrors: string[] = [];
    for (const profile of selectedProfiles) {
      const draft = drafts[profile.id];
      if (draft?.purposeOut.trim() === '') localErrors.push('Informe a finalidade OUT.');
      if (draft?.purposeIn.trim() === '') localErrors.push('Informe a finalidade IN.');
    }
    if (localErrors.length > 0) { setErrors(localErrors); setRetryable(false); return; }
    const selection = await deriveProfileMvpSelection(selectedProfiles, drafts, ownerSub);
    if (!selection.ok) { setErrors(selection.blockers.map((item) => item.message)); setRetryable(false); return; }
    setSubmitting(true);
    setErrors([]);
    try {
      await onPrepare(selection.value, selectedProfiles);
    } catch (reason) {
      setErrors([reason instanceof Error ? reason.message : 'Não foi possível preparar a simulação.']);
      setRetryable(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (profiles.length === 0) {
    return <section className="hypothesis-card"><h2>Simulação por Perfil</h2><p>Nenhum Perfil Operacional está anexado a este estudo. Anexe um Perfil na página da empresa para continuar.</p></section>;
  }
  return (
    <section className="hypothesis-card" aria-labelledby="profile-simulation-title">
      <h2 id="profile-simulation-title">Criar simulação por Perfil</h2>
      <div className="evidence-boundary">
        <strong>Evidência real agregada</strong>
        <span>As ordens geradas serão sintéticas</span>
      </div>
      <fieldset className="profile-selection">
        <legend>Perfis que formarão a simulação</legend>
        {profiles.map((profile) => {
          const selected = selectedIds.includes(profile.id);
          const draft = drafts[profile.id];
          return <fieldset key={profile.id} className="profile-participant" aria-label={profile.companyId}>
            <legend>
              <label><input type="checkbox" checked={selected} onChange={() => toggle(profile)} /> {profile.companyId} · versão {profile.version}</label>
            </legend>
            {selected && draft !== undefined ? <>
              <div className="parameter-grid">
                <label>Participante<input value={draft.participantId} onChange={(event) => update(profile.id, { participantId: event.target.value })} /></label>
                <label>Perfil do gerador<select value={draft.generatorProfile} onChange={(event) => update(profile.id, { generatorProfile: event.target.value as ProfileMvpExplicitFields['generatorProfile'] })}>{GENERATOR_PROFILES.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>Seed<input value={draft.seed} onChange={(event) => update(profile.id, { seed: event.target.value })} /></label>
                <label>Prazo<select value={draft.deadline.mode} onChange={(event) => update(profile.id, { deadline: event.target.value === 'FIXED' ? { mode: 'FIXED', days: 7 } : { mode: 'PROFILE' } })}><option value="PROFILE">Derivado do Perfil</option><option value="FIXED">Fixo</option></select></label>
                {draft.deadline.mode === 'FIXED' ? <label>Dias de prazo<input type="number" min="0" value={draft.deadline.days} onChange={(event) => update(profile.id, { deadline: { mode: 'FIXED', days: Number(event.target.value) } })} /></label> : null}
                <label>Finalidade OUT<input value={draft.purposeOut} onChange={(event) => update(profile.id, { purposeOut: event.target.value })} /></label>
                <label>Finalidade IN<input value={draft.purposeIn} onChange={(event) => update(profile.id, { purposeIn: event.target.value })} /></label>
                <label className="checkbox-field"><input type="checkbox" checked={draft.efx} onChange={(event) => update(profile.id, { efx: event.target.checked })} /> eFX</label>
              </div>
              <dl className="frozen-values" role="group" aria-label={`Valores congelados de ${profile.companyId}`}>
                <div><dt>ID do Perfil</dt><dd>{profile.id}</dd></div>
                <div><dt>Fingerprint do Perfil</dt><dd>{profile.documentFingerprint}</dd></div>
                <div><dt>Empresa</dt><dd>{profile.companyId}</dd></div>
                <div><dt>Participante</dt><dd>{draft.participantId}</dd></div>
                <div><dt>Perfil do gerador</dt><dd>{draft.generatorProfile}</dd></div>
                <div><dt>Seed</dt><dd>{draft.seed}</dd></div>
                <div><dt>eFX</dt><dd>{draft.efx ? 'Sim' : 'Não'}</dd></div>
                <div><dt>Finalidade OUT</dt><dd>{draft.purposeOut || 'Não informado'}</dd></div>
                <div><dt>Finalidade IN</dt><dd>{draft.purposeIn || 'Não informado'}</dd></div>
                <div><dt>Horizonte</dt><dd>{horizonDays} dias</dd></div>
              </dl>
            </> : null}
          </fieldset>;
        })}
      </fieldset>
      {selectedProfiles.length === 1 || errors.length > 0 ? <InlineNotice tone="error">
        {selectedProfiles.length === 1 ? <p>Uma única empresa não representa uma pool multilateral.</p> : null}
        {errors.length > 0 ? <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
      </InlineNotice> : null}
      <Button id={actionId} disabled={submitting || selectedProfiles.length === 0} onClick={() => void submit()}>{submitting ? 'Preparando…' : retryable ? 'Tentar novamente' : 'Preparar simulação por Perfil'}</Button>
    </section>
  );
}
