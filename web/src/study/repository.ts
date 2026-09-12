import type { StudyDocument } from './types';

export interface StudyRepository {
  list(ownerSub: string): Promise<StudyDocument[]>;
  get(ownerSub: string, id: string): Promise<StudyDocument | null>;
  save(ownerSub: string, study: StudyDocument): Promise<void>;
  remove(ownerSub: string, id: string): Promise<void>;
}
