import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type { ReplayDocument } from '../replay/domain';
import type { StudyDocument } from '../study/model';

export type DemoMixV1 = Readonly<{
  id: string;
  label: string;
  scenarioId: string;
  requestedWeights: Readonly<Record<string, number>>;
  realizedCounts: Readonly<Record<string, number>>;
}>;

export type DemoStudyPackageV1 = Readonly<{
  apiVersion: '1.0.0';
  packageVersion: '1.0.0';
  generatedAt: string;
  motorBuildSha: string;
  recipeFingerprint: string;
  ownerPlaceholder: '$OWNER_SUB';
  syntheticWarning: 'Hipótese sintética demonstrativa — não calibrada com carteira real';
  recipe: Readonly<{
    version: '1.0.0';
    participants: 12;
    warmupDays: 30;
    measurementDays: 30;
    windowDays: 7;
    monthlyOrderCapPerParticipant: 4;
    selectedRepetitionCriterion: 'FIRST_PLANNED_REPETITION';
    repetitionSeedOffsetByMix: Readonly<Record<string, number>>;
    mixes: readonly DemoMixV1[];
  }>;
  companies: readonly CompanyRecord[];
  observedCases: readonly ObservedCase[];
  profiles: readonly OperationalProfileVersion[];
  mixes: readonly DemoMixV1[];
  study: StudyDocument;
  replays: Readonly<Record<string, ReplayDocument>>;
}>;

export type DemoPackageValidation =
  | Readonly<{ ok: true; value: DemoStudyPackageV1 }>
  | Readonly<{ ok: false; issues: readonly string[] }>;
