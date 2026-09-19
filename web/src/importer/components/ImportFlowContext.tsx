import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import type { ApiClient } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { usePreview } from '../../preview/PreviewProvider';
import { importCatalogQueryOptions } from '../catalogClient';
import { ImportController } from '../controller';
import { IndexedDbImportRepository } from '../indexedDbRepository';
import type { ImportCatalog } from '../domain';
import type { ImportRepository } from '../repository';
import { createImporterWorkerClient, type ImporterWorkerClient } from '../workerClient';

export type ImportFlowServices = {
  ownerSub: string;
  repository: ImportRepository;
  worker: ImporterWorkerClient;
  controller: ImportController;
  catalog: ImportCatalog | null;
  catalogLoading: boolean;
  catalogError: string | null;
};

const ImportFlowContext = createContext<ImportFlowServices | null>(null);

function projectRef(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (url === undefined || url.trim() === '') return 'local';
  try { return new URL(url).hostname.split('.')[0] || 'local'; } catch { return 'local'; }
}

export function ImportFlowProvider({ children, client }: { children: ReactNode; client: ApiClient }) {
  const { userId } = useAuth();
  const preview = usePreview();
  const resources = useMemo(() => {
    if (userId === null) return null;
    const repository = new IndexedDbImportRepository({ projectRef: projectRef(), ownerSub: userId });
    const worker = createImporterWorkerClient();
    const controller = new ImportController({
      executeRequest: preview.executeRequest,
      persistPending: async (study) => (await repository.loadStudy(study.id)) ?? study,
      reserveAttempt: async ({ studyId, expectedRevision, attemptId }) => repository.reserveExecutionAttempt(studyId, expectedRevision, attemptId),
      saveExecution: async (record) => repository.saveExecution({
        id: record.envelope.execution_id, studyId: record.studyId, ownerSub: record.ownerSub,
        studyRevision: record.studyRevision, createdAtUtc: record.createdAtUtc,
        operationIds: record.request.cenario.ordens.map((order) => order.id),
        request: record.request, response: record.envelope, catalogVersion: record.catalogVersion,
        current: record.current,
      }, record.studyRevision, { allowHistorical: !record.current }),
      currentOwnerSub: () => userId,
      currentStudyRevision: async (studyId) => (await repository.loadStudy(studyId))?.revision ?? null,
    });
    return { repository, worker, controller };
  }, [preview.executeRequest, userId]);
  useEffect(() => () => {
    resources?.worker.dispose();
    resources?.repository.close();
  }, [resources]);
  const catalogQuery = useQuery({
    ...importCatalogQueryOptions(client, userId ?? 'anonymous'),
    enabled: userId !== null,
  });
  if (userId === null || resources === null) return <>{children}</>;
  return <ImportFlowContext.Provider value={{
    ownerSub: userId, ...resources, catalog: catalogQuery.data ?? null,
    catalogLoading: catalogQuery.isLoading,
    catalogError: catalogQuery.error === null ? null : 'Não foi possível carregar o catálogo.',
  }}>{children}</ImportFlowContext.Provider>;
}

export function useImportFlow(): ImportFlowServices {
  const value = useContext(ImportFlowContext);
  if (value === null) throw new Error('ImportFlowProvider ausente');
  return value;
}
