import { useRef, useState } from 'react';

import type { OperationalProfileVersion } from '../domain';
import { ProfileCoverage } from './ProfileCoverage';

export function ProfileVersionList({
  profiles,
  onAttach,
  attachDisabled,
}: {
  profiles: readonly OperationalProfileVersion[];
  onAttach(profile: OperationalProfileVersion): Promise<unknown>;
  attachDisabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const attachInFlight = useRef(false);
  if (profiles.length === 0) return <p className="empty-copy">Perfil operacional não coletado.</p>;
  return (
    <section className="profile-versions" aria-labelledby="profile-versions-title">
      <h2 id="profile-versions-title">Versões confirmadas</h2>
      {error === null ? null : <p role="alert" className="inline-notice inline-notice--error">{error}</p>}
      {[...profiles].sort((left, right) => right.version - left.version || left.id.localeCompare(right.id)).map((profile) => (
        <article className="profile-version" key={profile.id}>
          <h3>Versão {profile.version}</h3>
          <p>Criada em {profile.createdAt} · {profile.selectedCases.map((item) => `${item.caseId}@${item.caseRevision}`).join(', ')}</p>
          <ProfileCoverage profile={profile} />
          <button className="button button--secondary" type="button" disabled={attachDisabled || attaching} onClick={() => {
            if (attachInFlight.current) return;
            attachInFlight.current = true;
            setAttaching(true);
            setError(null);
            void onAttach(profile).catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : 'Não foi possível anexar o perfil.');
            }).finally(() => {
              attachInFlight.current = false;
              setAttaching(false);
            });
          }}>
            {attaching ? 'Anexando evidência…' : 'Usar como evidência em estudo'}
          </button>
        </article>
      ))}
    </section>
  );
}
