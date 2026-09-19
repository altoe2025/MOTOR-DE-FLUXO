export type ISODate = string;
export type DecimalBrl = string;

export type CompanyRecord = {
  readonly id: string;
  readonly ownerSub: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
};

export type ProvenanceKind =
  | 'OBSERVED'
  | 'INFERRED'
  | 'DERIVED'
  | 'USER_CORRECTED'
  | 'USER_ESTIMATE'
  | 'SYNTHETIC_DEFAULT'
  | 'NOT_COLLECTED';

type ProvenanceBase = {
  readonly source: string;
  readonly version: string;
  readonly recordedAt: string;
};

export type FieldProvenance =
  | (ProvenanceBase & { readonly kind: 'OBSERVED' })
  | (ProvenanceBase & { readonly kind: 'INFERRED'; readonly rule: string })
  | (ProvenanceBase & {
      readonly kind: 'DERIVED';
      readonly rule: string;
      readonly inputs: readonly string[];
    })
  | (ProvenanceBase & { readonly kind: 'USER_CORRECTED'; readonly actionId: string })
  | (ProvenanceBase & { readonly kind: 'USER_ESTIMATE' })
  | (ProvenanceBase & { readonly kind: 'SYNTHETIC_DEFAULT'; readonly rule: string })
  | (ProvenanceBase & { readonly kind: 'NOT_COLLECTED' });

export type ObservedOrder = {
  readonly id: string;
  readonly clientId: string;
  readonly direction: 'OUT' | 'IN';
  readonly knownDate: ISODate;
  readonly deadlineDate: ISODate;
  readonly valueBrl: DecimalBrl;
  readonly purposeCode: string | null;
  readonly efxStatus: 'YES' | 'NO' | 'NOT_COLLECTED';
  readonly provenance: readonly FieldProvenance[];
};

export type ControlTotal = {
  readonly code: 'GROSS_OUT_BRL' | 'GROSS_IN_BRL';
  readonly valueBrl: DecimalBrl;
  readonly provenance: FieldProvenance;
};

export type SourceFileRecord = {
  readonly name: string;
  readonly sizeBytes: number;
  readonly sha256: string;
};

export type SourceManifest = {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sourceKind: string;
  readonly files: readonly SourceFileRecord[];
};

export type NormalizationManifest = {
  readonly rulesetId: string;
  readonly rulesetVersion: string;
  readonly normalizedAt: string;
};

export type DataQualityIssue = {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
};

export type DataQualityReport = {
  readonly blockers: readonly DataQualityIssue[];
  readonly warnings: readonly DataQualityIssue[];
};

export type CorrectionRecord = {
  readonly id: string;
  readonly fieldPath: string;
  readonly originalValue: string | null;
  readonly previousValue: string | null;
  readonly nextValue: string | null;
  readonly actionAt: string;
  readonly actorSub: string;
};

export type ObservedMetricCode =
  | 'GROSS_OUT_BRL'
  | 'GROSS_IN_BRL'
  | 'MATCHED_BRL'
  | 'REMITTED_OUT_BRL'
  | 'REMITTED_IN_BRL'
  | 'TOTAL_COST_BRL';

export type ObservedMetric = {
  readonly code: ObservedMetricCode;
  readonly value: DecimalBrl;
  readonly unit: 'BRL';
  readonly definitionVersion: string;
  readonly provenance: FieldProvenance;
};

export type ObservedOutcome = {
  readonly schemaVersion: '1.0.0';
  readonly metrics: readonly ObservedMetric[];
};

export type ObservedCaseWindow = {
  readonly startDate: ISODate;
  readonly endDate: ISODate;
  readonly closingDate: ISODate;
};

type ObservedCaseFields = {
  readonly schemaVersion: '2.0.0';
  readonly id: string;
  readonly ownerSub: string;
  readonly companyId: string;
  readonly revision: number;
  readonly window: ObservedCaseWindow;
  readonly orders: readonly ObservedOrder[];
  readonly controlTotals: readonly ControlTotal[];
  readonly sourceManifest: SourceManifest;
  readonly normalization: NormalizationManifest;
  readonly quality: DataQualityReport;
  readonly corrections: readonly CorrectionRecord[];
};

export type ObservedCaseDraft = ObservedCaseFields & {
  readonly status: 'DRAFT';
  readonly observedOutcome?: ObservedOutcome | null;
  readonly confirmedAt: null;
};

export type ObservedCase = ObservedCaseFields & {
  readonly status: 'CONFIRMED' | 'ARCHIVED';
  readonly observedOutcome: ObservedOutcome | null;
  readonly confirmedAt: string;
};

export type CaseValidationIssue = {
  readonly path: string;
  readonly code:
    | 'INVALID_STRUCTURE'
    | 'INVALID_WINDOW'
    | 'DUPLICATE_ORDER'
    | 'CONTROL_TOTAL_MISMATCH';
  readonly message: string;
};

export type CaseValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly CaseValidationIssue[] };
