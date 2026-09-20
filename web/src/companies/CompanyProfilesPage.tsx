import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useStudyController } from '../app/providers';
import { ProfileBuilder } from '../profiles/components/ProfileBuilder';
import { ProfileVersionList } from '../profiles/components/ProfileVersionList';
import type { OperationalProfileVersion } from '../profiles/domain';
import { CompanyPageFrame, CompanyRouteState } from './components/CompanyPageFrame';
import { useCompanyResources } from './useCompanyResources';

export function CompanyProfilesPage() {
  const { companyId } = useParams();
  const controller = useStudyController();
  const resources = useCompanyResources(companyId);
  const [profiles, setProfiles] = useState<readonly OperationalProfileVersion[]>([]);
  const [studyId, setStudyId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setProfiles(resources.profiles), [resources.profiles]);
  if (resources.loading || resources.company === null) return <CompanyRouteState loading={resources.loading} error={resources.error} />;
  const studies = resources.studies.filter((study) => study.deletedAt === null);
  return (
    <CompanyPageFrame company={resources.company} title={`Perfis de ${resources.company.displayName}`} introduction="Selecione casos, confirme uma versão imutável e preserve o snapshot como evidência de um estudo.">
      <ProfileBuilder
        company={resources.company}
        cases={resources.cases}
        versions={profiles}
        onConfirm={async (profile) => {
          setMessage(null);
          const stored = await controller.appendOperationalProfileVersion(profile);
          setProfiles((current) => [...current, stored]);
          setMessage(`Versão ${stored.version} confirmada.`);
          return stored;
        }}
      />
      <div className="profile-study-target">
        <label htmlFor="profile-study">Estudo para receber a evidência</label>
        <select id="profile-study" value={studyId} onChange={(event) => setStudyId(event.currentTarget.value)}>
          <option value="">Selecione um estudo</option>
          {studies.map((study) => <option key={study.id} value={study.id}>{study.name}</option>)}
        </select>
      </div>
      {message === null ? null : <p role="status" className="inline-notice">{message}</p>}
      <ProfileVersionList
        profiles={profiles}
        attachDisabled={studyId === ''}
        onAttach={async (profile) => {
          setMessage(null);
          const study = await controller.loadStudy(studyId);
          if (study === null) throw new Error('Estudo não encontrado.');
          const attached = await controller.attachProfileToCurrentStudy(profile);
          setMessage(`Perfil v${profile.version} anexado ao estudo ${attached.name}.`);
        }}
      />
    </CompanyPageFrame>
  );
}
