import { validatePreviaRequest, validatePreviewEnvelope } from '../api/validators';
import type { StudyRepository } from './repository';
import type { StudyDocument } from './types';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function assertIdentifier(label: string, value: string): void {
  if (value.length === 0 || value.length > 128 || value.trim() !== value) {
    throw new Error(`${label} inválido`);
  }
}

function assertStudy(ownerSub: string, study: StudyDocument): void {
  if (study.study_schema_version !== '1.0.0') throw new Error('schema de estudo incompatível');
  assertIdentifier('owner_sub', ownerSub);
  assertIdentifier('study.id', study.id);
  assertIdentifier('base.id', study.base.id);
  if (study.owner_sub !== ownerSub) throw new Error('owner_sub diverge da conta solicitante');
  if (study.name.length === 0 || study.name.length > 120) throw new Error('nome do estudo inválido');
  if (!Number.isSafeInteger(study.base.revision) || study.base.revision < 1) {
    throw new Error('revisão base inválida');
  }
  if (study.variants.length !== 0) throw new Error('variantes pertencem à etapa 2');
  const snapshot = {
    api_version: '1.0.0',
    request_id: '00000000-0000-4000-8000-000000000001',
    study_id: '00000000-0000-4000-8000-000000000002',
    scenario_id: '00000000-0000-4000-8000-000000000003',
    scenario_revision: study.base.revision,
    cenario: study.base.input,
    periodo: study.base.period,
    proveniencia: study.base.provenance,
  };
  if (!validatePreviaRequest(snapshot)) throw new Error('snapshot executável inválido');
  if (!study.results.every((result) => validatePreviewEnvelope(result))) {
    throw new Error('resultado de prévia inválido');
  }
}

export class MemoryStudyRepository implements StudyRepository {
  readonly #byOwner = new Map<string, Map<string, StudyDocument>>();

  async list(ownerSub: string): Promise<StudyDocument[]> {
    assertIdentifier('owner_sub', ownerSub);
    const studies = [...(this.#byOwner.get(ownerSub)?.values() ?? [])];
    if (studies.some((study) => study.owner_sub !== ownerSub)) {
      throw new Error('isolamento owner_sub violado');
    }
    return studies.map(copy).sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(ownerSub: string, id: string): Promise<StudyDocument | null> {
    assertIdentifier('owner_sub', ownerSub);
    assertIdentifier('study.id', id);
    const found = this.#byOwner.get(ownerSub)?.get(id);
    if (found !== undefined && found.owner_sub !== ownerSub) {
      throw new Error('isolamento owner_sub violado');
    }
    return found === undefined ? null : copy(found);
  }

  async save(ownerSub: string, study: StudyDocument): Promise<void> {
    assertStudy(ownerSub, study);
    const ownerStudies = this.#byOwner.get(ownerSub) ?? new Map<string, StudyDocument>();
    ownerStudies.set(study.id, copy(study));
    this.#byOwner.set(ownerSub, ownerStudies);
  }

  async remove(ownerSub: string, id: string): Promise<void> {
    assertIdentifier('owner_sub', ownerSub);
    assertIdentifier('study.id', id);
    const ownerStudies = this.#byOwner.get(ownerSub);
    const found = ownerStudies?.get(id);
    if (found !== undefined && found.owner_sub !== ownerSub) {
      throw new Error('isolamento owner_sub violado');
    }
    ownerStudies?.delete(id);
  }
}
