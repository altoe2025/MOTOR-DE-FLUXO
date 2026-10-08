import type { CompanyRecord, FieldProvenance, ObservedCase, ObservedCaseWindow } from '../cases/domain';
import type { DeepReadonly } from '../study/model';

export type EvidenceValue<T> =
  | Readonly<{ state: 'AVAILABLE'; value: T; evidence: readonly string[] }>
  | Readonly<{ state: 'NOT_COLLECTED'; reason: string; evidence: readonly string[] }>
  | Readonly<{ state: 'INSUFFICIENT_COVERAGE'; reason: string; evidence: readonly string[] }>
  | Readonly<{ state: 'INCOMPATIBLE'; reason: string; evidence: readonly string[] }>;

export type ProfileCompatibilityBlockerCode =
  | 'EMPTY_SELECTION'
  | 'MULTIPLE_OWNERS'
  | 'MULTIPLE_COMPANIES'
  | 'DUPLICATE_CASE_REVISION'
  | 'INVALID_STATUS'
  | 'INVALID_DOCUMENT'
  | 'DUPLICATE_SOURCE_SHA256';

export type ProfileCompatibilityWarningCode =
  | 'OVERLAPPING_WINDOWS'
  | 'MIXED_NORMALIZATION_VERSIONS'
  | 'DISCONTINUOUS_COVERAGE';

export type ProfileCompatibilityIssue<Code extends string = string> = Readonly<{
  code: Code;
  message: string;
  caseIds: readonly string[];
}>;

export type ProfileCompatibilityReport = Readonly<{
  compatible: boolean;
  blockers: readonly ProfileCompatibilityIssue<ProfileCompatibilityBlockerCode>[];
  warnings: readonly ProfileCompatibilityIssue<ProfileCompatibilityWarningCode>[];
}>;

export type ProfileCoverage = Readonly<{
  caseCount: number;
  firstDate: string;
  lastDate: string;
  totalWindowDays: number;
  coveredDays: number;
  overlapDays: number;
  gapDays: number;
  windows: readonly Readonly<{
    caseId: string;
    caseRevision: number;
    startDate: string;
    endDate: string;
    durationDays: number;
  }>[];
}>;

export type PurposeMetric = Readonly<{
  code: string;
  volumeBrl: string;
  orderCount: number;
  volumeFraction: string;
  orderFraction: string;
}>;

export type CivilMonthObservation = Readonly<{
  month: string;
  volumeBrl: string;
  orderCount: number;
  coveredDays: number;
  averageVolumePerCoveredDay: string;
  averageOrdersPerCoveredDay: string;
}>;

export type OperationalProfileMetrics = DeepReadonly<{
  volume: {
    outBrl: EvidenceValue<string>;
    inBrl: EvidenceValue<string>;
    totalBrl: EvidenceValue<string>;
  };
  frequency: {
    orderCount: EvidenceValue<number>;
    ordersPerCoveredDay: EvidenceValue<string>;
    ordersPer30Days: EvidenceValue<string>;
  };
  ticketsBrl: {
    min: EvidenceValue<string>;
    p25: EvidenceValue<string>;
    p50: EvidenceValue<string>;
    p75: EvidenceValue<string>;
    max: EvidenceValue<string>;
  };
  direction: EvidenceValue<{
    out: { volumeBrl: string; fraction: string };
    in: { volumeBrl: string; fraction: string };
  }>;
  deadlineDays: {
    p50ByCount: EvidenceValue<string>;
    p90ByCount: EvidenceValue<string>;
    p50ByVolume: EvidenceValue<string>;
    p90ByVolume: EvidenceValue<string>;
  };
  purposes: {
    byCode: EvidenceValue<readonly PurposeMetric[]>;
    knownCoverage: EvidenceValue<{ volumeFraction: string; orderFraction: string }>;
    missing: EvidenceValue<{ volumeBrl: string; orderCount: number }>;
  };
  windows: EvidenceValue<ProfileCoverage>;
  seasonality: {
    observations: EvidenceValue<readonly CivilMonthObservation[]>;
    comparison: EvidenceValue<{ coveredMonthCount: number }>;
  };
}>;

export type ProfileProvenance = DeepReadonly<{
  caseEvidence: readonly string[];
  sourceFiles: readonly string[];
  normalizationVersions: readonly string[];
  fields: readonly FieldProvenance[];
}>;

export type SelectedProfileCase = DeepReadonly<{
  caseId: string;
  caseRevision: number;
  caseFingerprint: string;
  window: ObservedCaseWindow;
}>;

export type OperationalProfileVersion = DeepReadonly<{
  schemaVersion: '1.0.0';
  id: string;
  ownerSub: string;
  companyId: string;
  version: number;
  createdAt: string;
  method: {
    id: 'operational-profile-v1';
    version: '1.0.0';
    percentileMethod: 'NEAREST_RANK';
  };
  selectedCases: readonly SelectedProfileCase[];
  selectionFingerprint: string;
  documentFingerprint: string;
  compatibility: ProfileCompatibilityReport;
  coverage: ProfileCoverage;
  metrics: OperationalProfileMetrics;
  provenance: ProfileProvenance;
}>;

export type ProfileCompatibilityOptions = Readonly<{
  company?: CompanyRecord;
  confirmedDistinctSourceSha256?: readonly string[];
}>;

export type CalculateOperationalProfileInput = Readonly<{
  id: string;
  ownerSub: string;
  companyId: string;
  version: number;
  createdAt: string;
  cases: readonly ObservedCase[];
  company?: CompanyRecord;
  confirmedDistinctSourceSha256?: readonly string[];
}>;

export type ProfileValidationIssue = Readonly<{
  path: string;
  code: 'INVALID_STRUCTURE' | 'SELECTION_FINGERPRINT_MISMATCH' | 'DOCUMENT_FINGERPRINT_MISMATCH';
  message: string;
}>;

export type ProfileValidation =
  | Readonly<{ ok: true; value: OperationalProfileVersion }>
  | Readonly<{ ok: false; issues: readonly ProfileValidationIssue[] }>;
