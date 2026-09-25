import type { ApplicationRepository, DemoInstallMode } from '../storage/applicationRepository';
import { DemoInstallSkippedError } from '../storage/errors';
import type { StudyDocument } from '../study/model';
import type { DemoStudyPackageV1 } from './domain';

export type DemoPackageLoader = () => Promise<DemoStudyPackageV1>;

const loadBundledPackage: DemoPackageLoader = async () =>
  (await import('./generated/demo-study.v1.json')).default as unknown as DemoStudyPackageV1;

/** The transaction rechecks eligibility: this early query only avoids loading an unnecessary bundle. */
export async function installDemoStudy(input: Readonly<{
  repository: Pick<ApplicationRepository, 'listStudies' | 'installDemoStudy'>;
  mode: DemoInstallMode;
  operationId: () => string;
  loadPackage?: DemoPackageLoader;
  signal?: AbortSignal;
}>): Promise<StudyDocument | null> {
  if (input.signal?.aborted) return null;
  if (input.mode === 'FIRST_EMPTY_SESSION') {
    const studies = await input.repository.listStudies({ includeDeleted: true });
    if (studies.length > 0 || input.signal?.aborted) return null;
  }
  const packageValue = await (input.loadPackage ?? loadBundledPackage)();
  if (input.signal?.aborted) return null;
  try {
    return await input.repository.installDemoStudy({
      package: packageValue,
      mode: input.mode,
      operationId: input.operationId(),
    });
  } catch (error) {
    if (error instanceof DemoInstallSkippedError) return null;
    throw error;
  }
}
