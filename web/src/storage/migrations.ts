import { validatePreviewEnvelope } from '../api/validators';
import { createStudy } from '../study/domain';
import { canonical } from '../study/fingerprints';
import type {
  DeepMutable,
  ExecutionRecord,
  PortfolioSourceSnapshot,
  PreviewEnvelope,
  StudyDocument,
} from '../study/model';
import { validateStudyDocument } from '../study/validation';
import type { ApplicationRepository } from './applicationRepository';
import {
  DocumentCorruptError,
  NotFoundError,
  RevisionConflictError,
  SchemaUnsupportedError,
} from './errors';

const DATABASE_SCHEMA_VERSION = 1;

export type LegacySource = Readonly<{
  sourceKey: string;
  raw: string;
}>;

export type RecoveredDraft = Readonly<{
  sourceKey: string;
  ownerSub: string;
  legacyStudyId: string;
  name: string;
  updatedAt: string;
  saved: false;
}>;

export type MigrationOptions = Readonly<{
  ownerSub: string;
  stage1Drafts?: readonly LegacySource[];
  legacyStudies?: readonly LegacySource[];
  importerDatabases?: readonly LegacySource[];
}>;

export type MigrationResult = Readonly<{
  migratedStudyIds: readonly string[];
  recoveredDrafts: readonly RecoveredDraft[];
  archivedImporterSourceKeys: readonly string[];
}>;

type MetaRow = Readonly<{ key: string; value: unknown }>;

type MigrationMarker = Readonly<{
  schemaVersion: 1;
  sourceKey: string;
  sourceDigest: string;
  disposition: 'MIGRATED_STUDY' | 'RECOVERABLE_DRAFT' | 'ARCHIVED_IMPORTER';
}>;

type LegacyProvenance = Readonly<{
  tipo: 'PADRAO_SINTETICO' | 'ESTIMATIVA_USUARIO';
  fonte: string;
  registrado_em_utc: string;
}>;

type LegacyStudy = Readonly<{
  study_schema_version: string;
  id: string;
  owner_sub: string;
  name: string;
  created_at: string;
  updated_at: string;
  base: Readonly<{
    id: string;
    revision: number;
    input: Readonly<{
      ordens: readonly unknown[];
      janela_dias: number;
      horizonte_dias: number;
      custo: Record<string, unknown>;
    }>;
    period: Record<string, unknown>;
    provenance: Readonly<Record<string, LegacyProvenance>>;
  }>;
  variants: readonly unknown[];
  results: readonly unknown[];
  selected_replay: unknown;
}>;

type PreparedMigration = Readonly<{
  source: LegacySource;
  digest: string;
  disposition: MigrationMarker['disposition'];
  study?: StudyDocument;
  draft?: RecoveredDraft;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function validInstant(value: unknown): value is string {
  return typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new DocumentCorruptError('JSON legado inválido; o original foi preservado.');
  }
}

async function digest(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function transactionResult<T>(
  database: IDBDatabase,
  stores: readonly string[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const transaction = database.transaction(stores, mode);
  let result: T;
  let failure: unknown;
  const completion = new Promise<T>((resolve, reject) => {
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Transação abortada.'));
    transaction.onerror = () => undefined;
  });
  try {
    result = await work(transaction);
  } catch (error) {
    failure = error;
    try {
      transaction.abort();
    } catch {
      // A falha de uma request pode ter iniciado o abort.
    }
  }
  return completion;
}

function parseDraft(source: LegacySource, ownerSub: string): RecoveredDraft {
  const parsed = parseJson(source.raw);
  if (!isRecord(parsed)) throw new DocumentCorruptError();
  if (typeof parsed.version === 'number' && parsed.version > 1) {
    throw new SchemaUnsupportedError('Versão futura de rascunho local.');
  }
  if (!exactKeys(parsed, ['version', 'owner_sub', 'study_id', 'name', 'updated_at'])
    || parsed.version !== 1
    || parsed.owner_sub !== ownerSub
    || typeof parsed.study_id !== 'string'
    || parsed.study_id.length === 0
    || typeof parsed.name !== 'string'
    || parsed.name.length > 120
    || !validInstant(parsed.updated_at)) {
    throw new DocumentCorruptError('Rascunho legado inválido; o original foi preservado.');
  }
  return {
    sourceKey: source.sourceKey,
    ownerSub,
    legacyStudyId: parsed.study_id,
    name: parsed.name,
    updatedAt: parsed.updated_at,
    saved: false,
  };
}

function parseLegacyStudy(source: LegacySource, ownerSub: string): LegacyStudy {
  const parsed = parseJson(source.raw);
  if (!isRecord(parsed)) throw new DocumentCorruptError();
  if (typeof parsed.study_schema_version === 'string'
    && parsed.study_schema_version !== '1.0.0') {
    throw new SchemaUnsupportedError(`StudyDocument ${parsed.study_schema_version} não suportado.`);
  }
  if (parsed.study_schema_version !== '1.0.0'
    || parsed.owner_sub !== ownerSub
    || typeof parsed.id !== 'string'
    || typeof parsed.name !== 'string'
    || parsed.name.length === 0
    || parsed.name.length > 120
    || !validInstant(parsed.created_at)
    || !validInstant(parsed.updated_at)
    || !isRecord(parsed.base)
    || typeof parsed.base.id !== 'string'
    || !Number.isSafeInteger(parsed.base.revision)
    || (parsed.base.revision as number) < 1
    || !isRecord(parsed.base.input)
    || !Array.isArray(parsed.base.input.ordens)
    || !Number.isSafeInteger(parsed.base.input.janela_dias)
    || (parsed.base.input.janela_dias as number) < 1
    || !Number.isSafeInteger(parsed.base.input.horizonte_dias)
    || (parsed.base.input.horizonte_dias as number) < 0
    || !isRecord(parsed.base.input.custo)
    || !isRecord(parsed.base.period)
    || !isRecord(parsed.base.provenance)
    || !Array.isArray(parsed.variants)
    || parsed.variants.length !== 0
    || !Array.isArray(parsed.results)
    || parsed.selected_replay !== null) {
    throw new DocumentCorruptError('StudyDocument 1.0 inválido; o original foi preservado.');
  }
  return parsed as unknown as LegacyStudy;
}

function legacyProvenance(value: Readonly<Record<string, LegacyProvenance>>) {
  const unique = new Map<string, ReturnType<typeof convertProvenance>>();
  for (const item of Object.values(value)) {
    const converted = convertProvenance(item);
    unique.set(canonical(converted), converted);
  }
  return [...unique.values()];
}

function convertProvenance(item: LegacyProvenance) {
  if (!isRecord(item)
    || (item.tipo !== 'PADRAO_SINTETICO' && item.tipo !== 'ESTIMATIVA_USUARIO')
    || typeof item.fonte !== 'string'
    || item.fonte.length === 0
    || !validInstant(item.registrado_em_utc)) {
    throw new DocumentCorruptError('Proveniência legada inválida.');
  }
  return item.tipo === 'PADRAO_SINTETICO'
    ? {
        kind: 'SYNTHETIC_DEFAULT' as const,
        source: item.fonte,
        version: '1.0.0',
        recordedAt: item.registrado_em_utc,
        rule: 'legacy-study-v1',
      }
    : {
        kind: 'USER_ESTIMATE' as const,
        source: item.fonte,
        version: '1.0.0',
        recordedAt: item.registrado_em_utc,
      };
}

async function convertStudy(source: LegacySource, ownerSub: string): Promise<StudyDocument> {
  const legacy = parseLegacyStudy(source, ownerSub);
  const period = legacy.base.period.modo === 'LEGADO'
    ? {
        httpPeriod: structuredClone(legacy.base.period),
        executableHorizonDays: legacy.base.input.horizonte_dias,
      }
    : { httpPeriod: structuredClone(legacy.base.period) };
  const sourceSnapshot: DeepMutable<PortfolioSourceSnapshot> = {
    source: { kind: 'AUTHORED', authoredPortfolioId: legacy.id },
    capturedAt: legacy.updated_at,
    orders: structuredClone(legacy.base.input.ordens) as DeepMutable<PortfolioSourceSnapshot['orders']>,
    provenance: legacyProvenance(legacy.base.provenance),
    observedOutcome: null,
    sourceFingerprint: '0'.repeat(64),
  };
  let converted = await createStudy({
    id: legacy.id,
    ownerSub,
    name: legacy.name,
    baseScenario: {
      id: legacy.base.id,
      revision: legacy.base.revision,
      name: 'Cenário legado',
      sourceSnapshot,
      premises: {
        costs: structuredClone(legacy.base.input.custo) as DeepMutable<StudyDocument['scenarios'][number]['premises']['costs']>,
        windowDays: legacy.base.input.janela_dias,
      },
      period: period as DeepMutable<StudyDocument['scenarios'][number]['period']>,
    },
    now: legacy.created_at,
  });
  const scenario = converted.scenarios[0]!;
  const executions: ExecutionRecord[] = legacy.results.map((value) => {
    if (!validatePreviewEnvelope(value)) {
      throw new DocumentCorruptError('Resultado legado inválido; o original foi preservado.');
    }
    const envelope = value as PreviewEnvelope;
    if (envelope.study_id !== legacy.id
      || envelope.scenario_id !== legacy.base.id
      || envelope.scenario_revision !== legacy.base.revision) {
      throw new DocumentCorruptError('Resultado legado pertence a outro estudo ou cenário.');
    }
    return {
      id: envelope.execution_id,
      scenarioId: envelope.scenario_id,
      scenarioRevision: envelope.scenario_revision,
      inputFingerprint: scenario.inputFingerprint,
      requestSnapshot: {
        api_version: envelope.api_version,
        request_id: envelope.request_id,
        study_id: envelope.study_id,
        scenario_id: envelope.scenario_id,
        scenario_revision: envelope.scenario_revision,
        cenario: structuredClone(envelope.input_snapshot.cenario),
        periodo: structuredClone(envelope.input_snapshot.periodo),
        proveniencia: structuredClone(envelope.input_snapshot.proveniencia),
      },
      engineVersion: envelope.motor_build_sha,
      contractVersion: envelope.api_version,
      status: 'SUCCEEDED',
      envelope: structuredClone(envelope),
      observedComparison: null,
      createdAt: legacy.updated_at,
      finishedAt: legacy.updated_at,
    };
  });
  converted = {
    ...structuredClone(converted),
    executions,
    updatedAt: legacy.updated_at,
  };
  return validateStoredStudy(converted, ownerSub);
}

function validateImporterArchive(source: LegacySource): void {
  const parsed = parseJson(source.raw);
  if (!isRecord(parsed)) throw new DocumentCorruptError('Base experimental inválida.');
  if (typeof parsed.version === 'number' && parsed.version > 1) {
    throw new SchemaUnsupportedError('Versão futura da base experimental do importador.');
  }
  if (parsed.version !== 1 || typeof parsed.databaseName !== 'string' || !isRecord(parsed.stores)) {
    throw new DocumentCorruptError('Base experimental inválida; o original foi preservado.');
  }
}

export async function validateStoredStudy(
  value: unknown,
  ownerSub: string,
): Promise<StudyDocument> {
  if (isRecord(value) && typeof value.schemaVersion === 'string'
    && value.schemaVersion !== '2.0.0') {
    throw new SchemaUnsupportedError(`StudyDocument ${value.schemaVersion} não suportado.`);
  }
  const validation = await validateStudyDocument(value, ownerSub);
  if (!validation.ok) {
    throw new DocumentCorruptError(
      `StudyDocument persistido inválido: ${validation.issues.map((issue) => issue.code).join(', ')}.`,
    );
  }
  return validation.value;
}

async function schemaVersion(database: IDBDatabase): Promise<number> {
  const transaction = database.transaction('meta', 'readonly');
  const row = await requestResult<MetaRow | undefined>(
    transaction.objectStore('meta').get('schema_version'),
  );
  if (row === undefined || !Number.isSafeInteger(row.value)) {
    throw new DocumentCorruptError('Marcador de schema local inválido.');
  }
  if ((row.value as number) > DATABASE_SCHEMA_VERSION) {
    throw new SchemaUnsupportedError(`Schema local ${String(row.value)} é mais novo que o suportado.`);
  }
  if (row.value !== DATABASE_SCHEMA_VERSION) {
    throw new DocumentCorruptError('Marcador de schema local inválido.');
  }
  return row.value;
}

export async function migrateDatabase(
  database: IDBDatabase,
  options: MigrationOptions,
): Promise<MigrationResult> {
  await schemaVersion(database);
  const prepared: PreparedMigration[] = [];
  for (const source of options.stage1Drafts ?? []) {
    prepared.push({
      source,
      digest: await digest(source.raw),
      disposition: 'RECOVERABLE_DRAFT',
      draft: parseDraft(source, options.ownerSub),
    });
  }
  for (const source of options.legacyStudies ?? []) {
    prepared.push({
      source,
      digest: await digest(source.raw),
      disposition: 'MIGRATED_STUDY',
      study: await convertStudy(source, options.ownerSub),
    });
  }
  for (const source of options.importerDatabases ?? []) {
    validateImporterArchive(source);
    prepared.push({
      source,
      digest: await digest(source.raw),
      disposition: 'ARCHIVED_IMPORTER',
    });
  }

  await transactionResult(
    database,
    ['studies', 'executions', 'meta'],
    'readwrite',
    async (transaction) => {
      const meta = transaction.objectStore('meta');
      const studies = transaction.objectStore('studies');
      const executions = transaction.objectStore('executions');
      for (const item of prepared) {
        const markerKey = `migration:${item.source.sourceKey}`;
        const existing = await requestResult<MetaRow | undefined>(meta.get(markerKey));
        if (existing !== undefined) {
          const marker = existing.value as Partial<MigrationMarker>;
          if (marker.sourceDigest !== item.digest || marker.disposition !== item.disposition) {
            throw new DocumentCorruptError('Marcador de migração diverge da origem preservada.');
          }
          continue;
        }
        meta.add({
          key: `original:${item.source.sourceKey}`,
          value: { sourceKey: item.source.sourceKey, sourceDigest: item.digest, raw: item.source.raw },
        } satisfies MetaRow);
        if (item.study !== undefined) {
          const { executions: executionDocuments, ...document } = structuredClone(item.study);
          studies.add({
            study_id: item.study.id,
            owner_sub: item.study.ownerSub,
            deleted: item.study.deletedAt === null ? 0 : 1,
            document,
          });
          for (const [sequence, execution] of executionDocuments.entries()) {
            executions.add({
              study_id: item.study.id,
              execution_id: execution.id,
              owner_sub: item.study.ownerSub,
              sequence,
              document: execution,
            });
          }
        } else if (item.draft !== undefined) {
          meta.add({ key: `recovery:draft:${options.ownerSub}`, value: item.draft } satisfies MetaRow);
        } else {
          meta.add({
            key: `archive:importer:${item.source.sourceKey}`,
            value: { sourceKey: item.source.sourceKey, sourceDigest: item.digest, raw: item.source.raw },
          } satisfies MetaRow);
        }
        meta.add({
          key: markerKey,
          value: {
            schemaVersion: 1,
            sourceKey: item.source.sourceKey,
            sourceDigest: item.digest,
            disposition: item.disposition,
          } satisfies MigrationMarker,
        } satisfies MetaRow);
      }
    },
  );

  return {
    migratedStudyIds: prepared.flatMap((item) => item.study === undefined ? [] : [item.study.id]),
    recoveredDrafts: prepared.flatMap((item) => item.draft === undefined ? [] : [item.draft]),
    archivedImporterSourceKeys: prepared.flatMap((item) =>
      item.disposition === 'ARCHIVED_IMPORTER' ? [item.source.sourceKey] : []),
  };
}

export async function readRecoveredDraft(
  database: IDBDatabase,
  ownerSub: string,
): Promise<RecoveredDraft | null> {
  await schemaVersion(database);
  const transaction = database.transaction('meta', 'readonly');
  const row = await requestResult<MetaRow | undefined>(
    transaction.objectStore('meta').get(`recovery:draft:${ownerSub}`),
  );
  if (row === undefined) return null;
  const value = row.value;
  if (!isRecord(value)
    || value.ownerSub !== ownerSub
    || value.saved !== false
    || typeof value.sourceKey !== 'string'
    || typeof value.legacyStudyId !== 'string'
    || typeof value.name !== 'string'
    || !validInstant(value.updatedAt)) {
    throw new DocumentCorruptError('Rascunho recuperável persistido está corrompido.');
  }
  return structuredClone(value) as RecoveredDraft;
}

export async function recoverInterruptedStudy(
  study: StudyDocument,
  now: string,
): Promise<StudyDocument> {
  await validateStoredStudy(study, study.ownerSub);
  const interrupted = study.executions.some((execution) =>
    execution.status === 'PREPARING' || execution.status === 'RUNNING');
  if (!interrupted) return study;
  if (!validInstant(now)) throw new DocumentCorruptError('Instante de recuperação inválido.');
  const recovered: StudyDocument = {
    ...structuredClone(study),
    revision: study.revision + 1,
    updatedAt: now,
    executions: study.executions.map((execution) =>
      execution.status === 'PREPARING' || execution.status === 'RUNNING'
        ? { ...structuredClone(execution), status: 'INTERRUPTED', finishedAt: now }
        : structuredClone(execution)),
  };
  return validateStoredStudy(recovered, recovered.ownerSub);
}

export async function recoverInterruptedExecution(
  repository: Pick<ApplicationRepository, 'getStudy' | 'saveStudy'>,
  studyId: string,
  expectedRevision: number,
  operationId: string,
  now: string,
): Promise<StudyDocument> {
  const current = await repository.getStudy(studyId);
  if (current === null) throw new NotFoundError('Estudo não encontrado para recuperação.');
  if (current.revision === expectedRevision + 1) {
    return repository.saveStudy({
      expectedRevision,
      operationId,
      document: current,
    });
  }
  if (current.revision !== expectedRevision) {
    throw new RevisionConflictError(expectedRevision, current.revision);
  }
  const recovered = await recoverInterruptedStudy(current, now);
  if (recovered === current) return current;
  return repository.saveStudy({
    expectedRevision,
    operationId,
    document: recovered,
  });
}

export { DATABASE_SCHEMA_VERSION };
