import { useEffect, useState } from 'react';

import { useStudyController } from '../app/providers';
import { useAuth } from '../auth/AuthProvider';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type { StudyDocument } from '../study/model';

export type CompanyResources = Readonly<{
  loading: boolean;
  company: CompanyRecord | null;
  cases: readonly ObservedCase[];
  profiles: readonly OperationalProfileVersion[];
  studies: readonly StudyDocument[];
  error: string | null;
}>;

export function useCompanyResources(companyId: string | undefined): CompanyResources {
  const controller = useStudyController();
  const { userId } = useAuth();
  const [resources, setResources] = useState<CompanyResources>({
    loading: true, company: null, cases: [], profiles: [], studies: [], error: null,
  });
  useEffect(() => {
    let current = true;
    setResources({ loading: true, company: null, cases: [], profiles: [], studies: [], error: null });
    if (companyId === undefined || userId === null) {
      setResources({ loading: false, company: null, cases: [], profiles: [], studies: [], error: null });
      return () => { current = false; };
    }
    void Promise.all([
      controller.listCompanies(),
      controller.listObservedCases(companyId),
      controller.listOperationalProfileVersions(companyId),
      controller.listStudies(false),
    ]).then(([companies, cases, profiles, studies]) => {
      if (!current) return;
      const company = companies.find((item) => item.id === companyId && item.ownerSub === userId) ?? null;
      setResources({
        loading: false,
        company,
        cases: company === null ? [] : cases.filter((item) => item.companyId === company.id && item.ownerSub === userId),
        profiles: company === null ? [] : profiles.filter((item) => item.companyId === company.id && item.ownerSub === userId),
        studies: studies.filter((item) => item.ownerSub === userId),
        error: null,
      });
    }).catch((reason: unknown) => {
      if (current) setResources({
        loading: false, company: null, cases: [], profiles: [], studies: [],
        error: reason instanceof Error ? reason.message : 'Não foi possível carregar a empresa.',
      });
    });
    return () => { current = false; };
  }, [companyId, controller, userId]);
  return resources;
}
