import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { StudyDocument } from '../study/model';
import type { OperationalProfileVersion } from '../profiles/domain';
import type { DemoStudyPackageV1 } from '../demo/domain';
import type { ChatConversation } from '../chat/domain';

export type DemoInstallMode = 'FIRST_EMPTY_SESSION' | 'EXPLICIT_RESTORE';
export type DemoInstallMutation = Readonly<{
  package: DemoStudyPackageV1;
  mode: DemoInstallMode;
  operationId: string;
}>;

export type CASMutation<T> = Readonly<{
  expectedRevision: number;
  operationId: string;
  document: T;
}>;

export type ImportBatchRecord = Readonly<{
  id: string;
  caseId: string;
  batchSequence: number;
  ownerSub: string;
  companyId: string;
  sha256: string;
  byteSize: number;
  layout: 'xlsx-operacoes/1.0.0';
  counts: Readonly<{ total: number; valid: number; invalid: number }>;
}>;

export type ImportEventRecord = Readonly<{
  id: string;
  caseId: string;
  eventSequence: number;
  ownerSub: string;
  companyId: string;
  occurredAt: string;
  kind: 'BATCH_IMPORTED' | 'BATCH_REVERTED' | 'CONFLICT_RESOLVED'
    | 'OPERATION_EXCLUDED' | 'OPERATION_RESTORED' | 'OPERATION_CORRECTED'
    | 'CLIENT_ALIAS_ASSOCIATED';
  path: string;
  audit: Readonly<{
    originalValue: string | null;
    previousValue: string | null;
    nextValue: string | null;
  }> | null;
}>;

export type ConfirmObservedCaseMutation = Readonly<{
  expectedRevision: number;
  operationId: string;
  company: CompanyRecord;
  observedCase: ObservedCase;
  batches: readonly ImportBatchRecord[];
  events: readonly ImportEventRecord[];
}>;

export type AppendProfileVersionMutation = Readonly<{
  operationId: string;
  document: OperationalProfileVersion;
}>;

export interface ApplicationRepository {
  getDemoInstallationStatus(): Promise<'INSTALLED' | 'REMOVED' | null>;
  listChatConversations(studyId: string | null): Promise<ChatConversation[]>;
  getChatConversation(id: string): Promise<ChatConversation | null>;
  saveChatConversation(input: CASMutation<ChatConversation>): Promise<ChatConversation>;
  deleteChatConversation(id: string, expectedRevision: number, operationId: string): Promise<void>;
  installDemoStudy(input: DemoInstallMutation): Promise<StudyDocument>;
  listCompanies(): Promise<CompanyRecord[]>;
  /** Apaga a empresa com seus casos, lotes, eventos e perfis. Estudos guardam cópia e ficam. */
  deleteCompany?(id: string): Promise<void>;
  listObservedCases(companyId?: string): Promise<ObservedCase[]>;
  getObservedCase(id: string): Promise<ObservedCase | null>;
  confirmObservedCase(input: ConfirmObservedCaseMutation): Promise<ObservedCase>;
  listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]>;
  getOperationalProfileVersion(id: string): Promise<OperationalProfileVersion | null>;
  appendOperationalProfileVersion(
    input: AppendProfileVersionMutation,
  ): Promise<OperationalProfileVersion>;
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
