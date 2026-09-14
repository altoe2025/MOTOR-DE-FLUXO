import {
  validatePreparationResponse, validatePreviaRequest, validatePreviewEnvelope,
} from '../api/validators';
import type {
  Clock, ExecutionRecord, PreparationRecord, PublicFailure, Scope, StudyDocument, UUID,
} from './model';
import {
  repositoryError, type StudyRepository, type StudySummary, type WriteOptions,
} from './repository';
import { validateStudyDocument, validatePreparationRecord, validateExecutionRecord } from './validation';
import { canonical } from './fingerprints';
import { resolveInput } from './domain';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function copy<T>(value: T): T {
  return structuredClone(value);
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.project_ref === right.project_ref && left.owner_sub === right.owner_sub;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

export class MemoryStudyRepository implements StudyRepository {
  readonly #studies = new Map<UUID, StudyDocument>();
  readonly #preparations = new Map<UUID, PreparationRecord>();
  readonly #executions = new Map<UUID, ExecutionRecord>();
  #closed = false;
  readonly #saveIntents = new Map<UUID, string>();
  readonly #attemptRepetitions = new Map<UUID, number>();
  private readonly scope: Scope;

  constructor(scope: Scope, private readonly clock: Clock = () => new Date().toISOString()) {
    this.scope = copy(scope);
  }

  #validateWrite(study: StudyDocument): void {
    if (!validateStudyDocument(study).ok) throw repositoryError('INVALID_DOCUMENT', 'Documento resultante inválido.');
  }

  #operation(options: WriteOptions, intent: string): void {
    if (!UUID_PATTERN.test(options.operation_id)
      || (options.expected_revision !== null && (!Number.isSafeInteger(options.expected_revision) || options.expected_revision < 1))) {
      throw repositoryError('INVALID_DOCUMENT', 'Opções de escrita inválidas.');
    }
    const previous = this.#saveIntents.get(options.operation_id);
    if (previous !== undefined && previous !== intent) {
      throw repositoryError('INVALID_DOCUMENT', 'Operação repetida com intenção divergente.');
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw repositoryError('STORAGE_CLOSED', 'Repositório fechado.');
  }

  #assertScope(value: Scope): void {
    if (!sameScope(value, this.scope)) {
      throw repositoryError('OWNER_MISMATCH', 'Registro pertence a outro escopo.');
    }
  }

  #study(id: UUID): StudyDocument {
    const study = this.#studies.get(id);
    if (study === undefined) throw repositoryError('NOT_FOUND', 'Estudo não encontrado.');
    this.#assertScope(study.scope);
    return study;
  }

  #cas(id: UUID, options: WriteOptions, intent: string): StudyDocument {
    this.#operation(options, intent);
    const study = this.#study(id);
    if (study.last_operation_id === options.operation_id) return study;
    if (options.expected_revision === null || study.revision !== options.expected_revision) {
      throw repositoryError('REVISION_CONFLICT', 'A revisão do estudo mudou.');
    }
    return study;
  }

  async list(includeTrash: boolean): Promise<StudySummary[]> {
    this.#assertOpen();
    return [...this.#studies.values()]
      .filter((study) => includeTrash || study.deleted_at === null)
      .map((study) => ({
        id: study.id,
        name: study.name,
        revision: study.revision,
        updated_at: study.updated_at,
        deleted_at: study.deleted_at,
        availability: 'READY' as const,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copy);
  }

  async get(id: UUID): Promise<StudyDocument | null> {
    this.#assertOpen();
    const study = this.#studies.get(id);
    if (study === undefined) return null;
    this.#assertScope(study.scope);
    return copy(study);
  }

  async save(study: StudyDocument, options: WriteOptions): Promise<StudyDocument> {
    this.#assertOpen();
    this.#operation(options, canonical(study));
    if (!UUID_PATTERN.test(options.operation_id)) {
      throw repositoryError('INVALID_DOCUMENT', 'Identificador de operação inválido.');
    }
    this.#assertScope(study.scope);
    const validation = validateStudyDocument(study);
    if (!validation.ok) throw repositoryError('INVALID_DOCUMENT', validation.issues[0]?.message ?? 'Documento inválido.');
    const current = this.#studies.get(study.id);
    if (current === undefined) {
      if (options.expected_revision !== null) {
        throw repositoryError('REVISION_CONFLICT', 'Estudo ainda não existe.');
      }
      const created = copy(study);
      if (created.execution_ids.length !== 0 || created.current_preparation_id !== null) {
        throw repositoryError('INVALID_DOCUMENT', 'Novo estudo não pode referenciar resultados inexistentes.');
      }
      created.revision = 1;
      created.last_operation_id = options.operation_id;
      if (created.attempt !== null && created.content.kind === 'AUTHORED') {
        this.#attemptRepetitions.set(created.attempt.id, created.content.input.repetition);
      }
      this.#studies.set(created.id, created);
      this.#saveIntents.set(options.operation_id, canonical(study));
      return copy(created);
    }
    this.#assertScope(current.scope);
    if (current.last_operation_id === options.operation_id) {
      if (this.#saveIntents.get(options.operation_id) !== canonical(study)) {
        throw repositoryError('INVALID_DOCUMENT', 'Operação repetida com intenção divergente.');
      }
      return copy(current);
    }
    if (options.expected_revision === null || current.revision !== options.expected_revision) {
      throw repositoryError('REVISION_CONFLICT', 'A revisão do estudo mudou.');
    }
    if (study.id !== current.id || study.scenario_id !== current.scenario_id
      || !sameScope(study.scope, current.scope) || study.created_at !== current.created_at
      || study.created_by !== current.created_by) {
      throw repositoryError('INVALID_DOCUMENT', 'Identidade protegida do estudo mudou.');
    }
    if (!sameJson(study.execution_ids, current.execution_ids)
      || study.current_preparation_id !== current.current_preparation_id
      || study.deleted_at !== current.deleted_at
      || (current.attempt !== null && !sameJson(study.attempt, current.attempt))) {
      throw repositoryError('INVALID_DOCUMENT', 'Estado de execução não pode ser alterado por save.');
    }
    const updated = copy(study);
    updated.revision = current.revision + 1;
    updated.scenario_revision = current.semantic_key === updated.semantic_key
      ? current.scenario_revision : current.scenario_revision + 1;
    updated.last_operation_id = options.operation_id;
    this.#validateWrite(updated);
    if (current.attempt === null && updated.attempt !== null && updated.content.kind === 'AUTHORED') {
      this.#attemptRepetitions.set(updated.attempt.id, updated.content.input.repetition);
    }
    this.#studies.set(updated.id, updated);
    this.#saveIntents.set(options.operation_id, canonical(study));
    return copy(updated);
  }

  async getPreparation(id: UUID): Promise<PreparationRecord | null> {
    this.#assertOpen();
    const record = this.#preparations.get(id);
    if (record === undefined) return null;
    this.#assertScope(record.scope);
    return copy(record);
  }

  async savePreparation(
    id: UUID,
    attemptId: UUID,
    preparation: PreparationRecord,
  ): Promise<StudyDocument> {
    this.#assertOpen();
    const study = this.#study(id);
    if (!validatePreparationRecord(preparation)) {
      throw repositoryError('INVALID_DOCUMENT', 'Registro de preparação inválido.');
    }
    this.#assertScope(preparation.scope);
    if (study.attempt?.id !== attemptId) throw repositoryError('ATTEMPT_CONFLICT', 'Tentativa substituída.');
    if (preparation.study_id !== id || preparation.envelope.study_id !== id
      || preparation.id !== preparation.envelope.preparation_id
      || preparation.envelope.scenario_id !== study.scenario_id
      || preparation.envelope.scenario_revision !== study.attempt.scenario_revision
      || preparation.envelope.request_id !== study.attempt.request_id
      || !validatePreparationResponse(preparation.envelope)) {
      throw repositoryError('INVALID_DOCUMENT', 'Preparação inválida.');
    }
    const existing = this.#preparations.get(preparation.id);
    if (existing !== undefined) {
      if (!sameJson(existing, preparation)) throw repositoryError('DOCUMENT_CORRUPT', 'Preparação divergente.');
      return copy(study);
    }
    const updated = copy(study);
    if (updated.attempt !== null) updated.attempt.phase = 'EXECUTANDO';
    if (study.content.kind === 'AUTHORED') {
      const resolved = resolveInput(study.content.input);
      const snapshot = preparation.envelope.input_snapshot;
      if (resolved.ok && sameJson(resolved.value.participants, snapshot.participants)
        && resolved.value.warmup_days === snapshot.warmup_days
        && resolved.value.measurement_days === snapshot.measurement_days
        && study.content.input.repetition === this.#attemptRepetitions.get(attemptId)) {
        updated.current_preparation_id = preparation.id;
      }
    }
    updated.revision += 1;
    this.#validateWrite(updated);
    this.#preparations.set(preparation.id, copy(preparation));
    this.#studies.set(id, updated);
    return copy(updated);
  }

  async getExecution(id: UUID): Promise<ExecutionRecord | null> {
    this.#assertOpen();
    const record = this.#executions.get(id);
    if (record === undefined) return null;
    this.#assertScope(record.scope);
    return copy(record);
  }

  async appendExecution(id: UUID, attemptId: UUID, record: ExecutionRecord): Promise<StudyDocument> {
    this.#assertOpen();
    const study = this.#study(id);
    if (!validateExecutionRecord(record)) {
      throw repositoryError('INVALID_DOCUMENT', 'Registro de execução inválido.');
    }
    this.#assertScope(record.scope);
    const existing = this.#executions.get(record.id);
    if (existing !== undefined) {
      if (!sameJson(existing, record)) throw repositoryError('DOCUMENT_CORRUPT', 'ID de execução possui conteúdo divergente.');
      return copy(study);
    }
    if (study.attempt?.id !== attemptId) throw repositoryError('ATTEMPT_CONFLICT', 'Tentativa substituída.');
    if (record.study_id !== id || record.envelope.study_id !== id || record.request_snapshot.study_id !== id
      || record.id !== record.envelope.execution_id
      || record.request_snapshot.request_id !== study.attempt.request_id
      || record.envelope.request_id !== study.attempt.request_id
      || record.request_snapshot.scenario_id !== study.scenario_id
      || record.envelope.scenario_id !== study.scenario_id
      || record.request_snapshot.scenario_revision !== study.attempt.scenario_revision
      || record.envelope.scenario_revision !== study.attempt.scenario_revision
      || !sameJson(record.envelope.input_snapshot, {
        cenario: record.request_snapshot.cenario, periodo: record.request_snapshot.periodo,
        proveniencia: record.request_snapshot.proveniencia,
      })
      || !validatePreviaRequest(record.request_snapshot) || !validatePreviewEnvelope(record.envelope)) {
      throw repositoryError('INVALID_DOCUMENT', 'Execução inválida.');
    }
    const updated = copy(study);
    if (!updated.execution_ids.includes(record.id)) updated.execution_ids.push(record.id);
    updated.attempt = null;
    updated.last_failure = null;
    updated.revision += 1;
    this.#validateWrite(updated);
    this.#executions.set(record.id, copy(record));
    this.#studies.set(id, updated);
    return copy(updated);
  }

  async finishAttempt(id: UUID, attemptId: UUID, failure: PublicFailure): Promise<StudyDocument> {
    this.#assertOpen();
    const study = this.#study(id);
    if (study.attempt?.id !== attemptId) throw repositoryError('ATTEMPT_CONFLICT', 'Tentativa substituída.');
    const updated = copy(study);
    updated.attempt = null;
    updated.last_failure = copy(failure);
    updated.revision += 1;
    this.#validateWrite(updated);
    this.#studies.set(id, updated);
    return copy(updated);
  }

  async trash(id: UUID, options: WriteOptions): Promise<StudyDocument> {
    this.#assertOpen();
    const intent = canonical({ action: 'trash', id });
    const current = this.#cas(id, options, intent);
    if (current.last_operation_id === options.operation_id) return copy(current);
    const updated = copy(current);
    updated.deleted_at = this.clock();
    updated.revision += 1;
    updated.last_operation_id = options.operation_id;
    this.#validateWrite(updated);
    this.#saveIntents.set(options.operation_id, intent);
    this.#studies.set(id, updated);
    return copy(updated);
  }

  async restore(id: UUID, options: WriteOptions): Promise<StudyDocument> {
    this.#assertOpen();
    const intent = canonical({ action: 'restore', id });
    const current = this.#cas(id, options, intent);
    if (current.last_operation_id === options.operation_id) return copy(current);
    const updated = copy(current);
    updated.deleted_at = null;
    updated.revision += 1;
    updated.last_operation_id = options.operation_id;
    this.#validateWrite(updated);
    this.#saveIntents.set(options.operation_id, intent);
    this.#studies.set(id, updated);
    return copy(updated);
  }

  async purge(id: UUID, options: WriteOptions): Promise<void> {
    this.#assertOpen();
    const intent = canonical({ action: 'purge', id });
    this.#operation(options, intent);
    if (this.#saveIntents.get(options.operation_id) === intent) return;
    const current = this.#cas(id, options, intent);
    if (current.attempt !== null) throw repositoryError('ATTEMPT_CONFLICT', 'Estudo possui tentativa ativa.');
    for (const executionId of current.execution_ids) this.#executions.delete(executionId);
    for (const [preparationId, record] of this.#preparations) {
      if (record.study_id === id) this.#preparations.delete(preparationId);
    }
    this.#studies.delete(id);
    this.#saveIntents.set(options.operation_id, intent);
  }

  async removeExecution(id: UUID, executionId: UUID, options: WriteOptions): Promise<StudyDocument> {
    this.#assertOpen();
    const intent = canonical({ action: 'removeExecution', id, executionId });
    const current = this.#cas(id, options, intent);
    if (current.last_operation_id === options.operation_id) return copy(current);
    if (current.attempt !== null) throw repositoryError('ATTEMPT_CONFLICT', 'Estudo possui tentativa ativa.');
    if (!current.execution_ids.includes(executionId)) throw repositoryError('NOT_FOUND', 'Execução não encontrada.');
    const updated = copy(current);
    updated.execution_ids = updated.execution_ids.filter((candidate) => candidate !== executionId);
    updated.revision += 1;
    updated.last_operation_id = options.operation_id;
    this.#validateWrite(updated);
    this.#saveIntents.set(options.operation_id, intent);
    this.#executions.delete(executionId);
    this.#studies.set(id, updated);
    return copy(updated);
  }

  async importLegacy(...args: [sourceKey: string, raw: string]): Promise<StudyDocument> {
    void args;
    this.#assertOpen();
    throw repositoryError('MIGRATION_FAILED', 'Migração pertence à MOT-27.');
  }

  close(): void {
    this.#closed = true;
  }
}
