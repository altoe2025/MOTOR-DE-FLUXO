import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { StudyDocument } from '../study/model';

export type CASMutation<T> = Readonly<{
  expectedRevision: number;
  operationId: string;
  document: T;
}>;

export type ImportBatchRecord = Readonly<{
  caseId: string;
  batchSequence: number;
  ownerSub: string;
  companyId: string;
}>;

export type ImportEventRecord = Readonly<{
  caseId: string;
  eventSequence: number;
  ownerSub: string;
  companyId: string;
}>;

export type ConfirmObservedCaseMutation = Readonly<{
  expectedRevision: number;
  operationId: string;
  company: CompanyRecord;
  observedCase: ObservedCase;
  batches: readonly ImportBatchRecord[];
  events: readonly ImportEventRecord[];
}>;

export interface ApplicationRepository {
  listCompanies(): Promise<CompanyRecord[]>;
  listObservedCases(companyId?: string): Promise<ObservedCase[]>;
  getObservedCase(id: string): Promise<ObservedCase | null>;
  confirmObservedCase(input: ConfirmObservedCaseMutation): Promise<ObservedCase>;
  listStudies(options?: { includeDeleted?: boolean }): Promise<StudyDocument[]>;
  getStudy(id: string): Promise<StudyDocument | null>;
  saveStudy(input: CASMutation<StudyDocument>): Promise<StudyDocument>;
  restoreStudy(
    id: string,
    expectedRevision: number,
    operationId: string,
  ): Promise<StudyDocument>;
  purgeStudy(id: string): Promise<void>;
  close(): void;
}
