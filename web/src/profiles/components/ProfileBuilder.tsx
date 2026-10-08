import { useEffect, useMemo, useState } from 'react';

import type { CompanyRecord, ObservedCase } from '../../cases/domain';
import { calculateOperationalProfile } from '../calculateOperationalProfile';
import { checkProfileCompatibility, orderedCases } from '../compatibility';
import type { OperationalProfileVersion } from '../domain';
import { CoverageSummary } from './ProfileCoverage';

type Props = Readonly<{
  company: CompanyRecord;
  cases: readonly ObservedCase[];
  versions: readonly OperationalProfileVersion[];
  onConfirm(profile: OperationalProfileVersion): Promise<unknown>;
  idFactory?: () => string;
  now?: () => string;
  preselectedCase?: Readonly<{ id: string; revision: number }> | null;
}>;

function duplicateSourceShas(cases: readonly ObservedCase[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const sha of cases.flatMap((item) => item.sourceManifest.files.map((file) => file.sha256))) {
    if (seen.has(sha)) duplicates.add(sha);
    seen.add(sha);
  }
  return [...duplicates].sort();
}

export function ProfileBuilder({
  company,
  cases,
  versions,
  onConfirm,
  idFactory = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
  preselectedCase = null,
}: Props) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [confirmedShas, setConfirmedShas] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<OperationalProfileVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [draftIdentity] = useState(() => ({ id: idFactory(), createdAt: now() }));
  const nextVersion = Math.max(0, ...versions.map((item) => item.version)) + 1;
  const candidates = useMemo(() => cases.map((item, index) => ({ item, key: `${item.id}@${item.revision}#${index}` })), [cases]);
  useEffect(() => {
    if (preselectedCase === null) return;
    const match = candidates.find(({ item }) => item.id === preselectedCase.id && item.revision === preselectedCase.revision);
    if (match !== undefined) setSelectedKeys(new Set([match.key]));
  }, [candidates, preselectedCase?.id, preselectedCase?.revision]);
  const selected = useMemo(
    () => candidates.filter(({ key }) => selectedKeys.has(key)).map(({ item }) => item),
    [candidates, selectedKeys],
  );
  const duplicates = duplicateSourceShas(selected);
  const compatibility = checkProfileCompatibility(selected, {
    company,
    confirmedDistinctSourceSha256: [...confirmedShas],
  });

  useEffect(() => {
    let current = true;
    setPreview(null);
    setError(null);
    if (!compatibility.compatible) return () => { current = false; };
    void calculateOperationalProfile({
      ...draftIdentity,
      ownerSub: company.ownerSub,
      companyId: company.id,
      company,
      version: nextVersion,
      cases: selected,
      confirmedDistinctSourceSha256: [...confirmedShas],
    }).then((result) => { if (current) setPreview(result); })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Não foi possível calcular a prévia.'); });
    return () => { current = false; };
  }, [company, confirmedShas, draftIdentity, nextVersion, selected, compatibility.compatible]);

  const toggleCase = (key: string) => setSelectedKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <section className="profile-builder" aria-labelledby="profile-builder-title">
      <h2 id="profile-builder-title">Criar Perfil Operacional</h2>
      <fieldset>
        <legend>Casos observados</legend>
        {candidates.length === 0 ? <p>Nenhum caso disponível.</p> : candidates.map(({ item, key }) => (
          <label key={key}>
            <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggleCase(key)} />
            {item.id} — revisão {item.revision} — {item.window.startDate} a {item.window.endDate}
          </label>
        ))}
      </fieldset>
      {duplicates.map((sha) => <label className="profile-confirmation" key={sha}>
        <input type="checkbox" checked={confirmedShas.has(sha)} onChange={() => setConfirmedShas((current) => {
          const next = new Set(current);
          if (next.has(sha)) next.delete(sha); else next.add(sha);
          return next;
        })} />
        Confirmo que as fontes com o mesmo SHA-256 representam operações distintas ({sha.slice(0, 12)}…)
      </label>)}
      {compatibility.blockers.map((issue) => <p className="inline-notice inline-notice--error" key={issue.code}>{issue.message}</p>)}
      {compatibility.warnings.map((issue) => <p className="inline-notice" key={issue.code}>{issue.message}</p>)}
      {error === null ? null : <p role="alert" className="inline-notice inline-notice--error">{error}</p>}
      {preview === null ? null : (
        <section className="profile-preview" role="region" aria-label="Prévia do Perfil Operacional">
          <h3>Prévia do Perfil Operacional</h3>
          <p><strong>{company.displayName}</strong> · {preview.selectedCases.length} casos · versão {preview.version}</p>
          <p data-testid="profile-selection">{orderedCases(selected).map((item) => `${item.id}@${item.revision}`).join(' · ')}</p>
          <CoverageSummary coverage={preview.coverage} />
        </section>
      )}
      <button className="button" type="button" disabled={preview === null || confirming} onClick={() => {
        if (preview === null) return;
        setConfirming(true);
        setError(null);
        void onConfirm(preview).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar a versão.');
        }).finally(() => setConfirming(false));
      }}>{confirming ? 'Confirmando…' : 'Confirmar versão'}</button>
    </section>
  );
}
