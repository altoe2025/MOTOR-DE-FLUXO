/** Read-only projection of already validated canonical publications. */
export type CommunicationMetric = Readonly<{
  code: string;
  label: string;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  value: string | null;
  unit: 'BRL' | 'FRACTION' | 'DAYS' | 'COUNT' | 'BPS' | 'TEXT';
  meaning: string;
  evidenceRefs: readonly string[];
}>;

export type CommunicationFact = Readonly<{
  code: string;
  label: string;
  value: string;
  evidenceRefs: readonly string[];
}>;

export type CommunicationLimitation = Readonly<{
  code: string;
  severity: 'INFO' | 'WARNING';
  statement: string;
  evidenceRefs: readonly string[];
}>;

export type CommunicationSection = Readonly<{
  title: string;
  metrics: readonly CommunicationMetric[];
  facts: readonly CommunicationFact[];
}>;

export type CommunicationReplaySnapshot = Readonly<{
  day: number;
  metrics: readonly CommunicationMetric[];
  facts: readonly CommunicationFact[];
}>;

export type CommunicationEvidence = Readonly<{
  source: 'STUDY' | 'DIAGNOSTIC' | 'COMPARISON' | 'REPLAY';
  sourceId: string;
  studyId: string;
  scenarioId: string;
  scenarioRevision: number;
  diagnosticExecutionId: string;
  repetitionId: string;
  path: string;
  value: string | null;
}>;

export type CommunicationDocumentV1 = Readonly<{
  apiVersion: '1.0.0';
  presentationVersion: '1.0.0';
  generatedAt: string;
  study: Readonly<{ id: string; name: string; revision: number }>;
  selection: Readonly<{
    scenarioId: string;
    scenarioRevision: number;
    diagnosticExecutionId: string;
    repetitionId: string;
    comparisonExecutionId: string | null;
    replayDay: number | null;
  }>;
  source: Readonly<{
    family: 'OBSERVED' | 'PROFILE_SIMULATION';
    label: string;
    synthetic: boolean;
  }>;
  executiveMetrics: readonly CommunicationMetric[];
  composition: CommunicationSection;
  mechanism: CommunicationSection;
  economics: CommunicationSection;
  robustness: CommunicationSection;
  comparison: CommunicationSection | null;
  replaySnapshot: CommunicationReplaySnapshot | null;
  assumptions: readonly CommunicationFact[];
  provenance: readonly CommunicationFact[];
  limitations: readonly CommunicationLimitation[];
  versions: readonly CommunicationFact[];
  evidenceIndex: Readonly<Record<string, CommunicationEvidence>>;
  contextFingerprint: string;
}>;
