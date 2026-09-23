import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import Decimal from 'decimal.js';

import httpSchemas from '../api/schemas.json';
import { validateDiagnosticEnvelope, validateDiagnosticRequest, validateReplayDocument } from '../api/validators';
import observedCaseSchema from '../cases/observedCase.schema.json';
import { validateObservedCase } from '../cases/validation';
import operationalProfileSchema from '../profiles/operationalProfile.schema.json';
import { validateOperationalProfile } from '../profiles/validation';
import studySchema from '../study/study.schema.json';
import { canonical } from '../study/fingerprints';
import { validateStudyDocument } from '../study/validation';
import type { DemoPackageValidation, DemoStudyPackageV1 } from './domain';
import packageSchema from './demoStudyPackage.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(httpSchemas);
ajv.addSchema(observedCaseSchema);
ajv.addSchema(operationalProfileSchema);
ajv.addSchema(studySchema);
const validateSchema = ajv.compile<DemoStudyPackageV1>(packageSchema);
const LABELS = [
  'equilibrado', 'retail pesado', 'corporativo pesado',
  'PSP dominante', 'outbound extremo',
] as const;

async function digest(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonical(value));
  const bytes = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameMoney(left: string, right: string): boolean {
  return new Decimal(left).eq(right);
}

export async function validateDemoStudyPackage(value: unknown): Promise<DemoPackageValidation> {
  if (!validateSchema(value)) {
    return { ok: false, issues: (validateSchema.errors ?? []).map((error) =>
      `SCHEMA:${error.instancePath || '/'}:${error.keyword}`) };
  }
  const issues: string[] = [];
  const fail = (condition: boolean, issue: string) => { if (!condition) issues.push(issue); };
  fail(value.recipeFingerprint === await digest(value.recipe), 'RECIPE_FINGERPRINT');
  fail(canonical(value.mixes) === canonical(value.recipe.mixes), 'RECIPE_MIXES');
  fail(canonical(value.mixes.map((mix) => mix.label)) === canonical(LABELS), 'MIX_LABELS');
  fail(canonical(Object.keys(value.recipe.repetitionSeedOffsetByMix).sort())
    === canonical(value.mixes.map((mix) => mix.id).sort()), 'SEED_OFFSET_SET');
  const companyIds = new Set(value.companies.map((company) => company.id));
  fail(companyIds.size === 12, 'COMPANIES_UNIQUE');
  for (const [index, caseRecord] of value.observedCases.entries()) {
    fail(validateObservedCase(caseRecord).ok, `CASE_VALID:${index}`);
    fail(caseRecord.ownerSub === value.ownerPlaceholder
      && companyIds.has(caseRecord.companyId)
      && caseRecord.sourceManifest.sourceKind === 'SYNTHETIC'
      && caseRecord.orders.every((order) => order.provenance.every((source) =>
        source.kind === 'SYNTHETIC_DEFAULT')), `CASE_SYNTHETIC:${index}`);
  }
  const profileIds = new Set<string>();
  for (const [index, profile] of value.profiles.entries()) {
    fail((await validateOperationalProfile(profile)).ok, `PROFILE_VALID:${index}`);
    fail(profile.ownerSub === value.ownerPlaceholder && companyIds.has(profile.companyId),
      `PROFILE_OWNER:${index}`);
    profileIds.add(profile.id);
  }
  fail(profileIds.size === 12, 'PROFILES_UNIQUE');
  const studyValidation = await validateStudyDocument(value.study, value.ownerPlaceholder);
  if (!studyValidation.ok) issues.push(...studyValidation.issues.map((item) =>
    `STUDY_VALID:${item.path}:${item.code}`));
  fail(value.study.evidenceSnapshots.length === 12, 'STUDY_PROFILES');
  const scenarioIds = new Set(value.study.scenarios.map((scenario) => scenario.id));
  fail(scenarioIds.size === 5 && value.study.executions.length === 10, 'STUDY_SIZE');
  fail(canonical([...scenarioIds].sort()) === canonical(Object.keys(value.replays).sort()),
    'REPLAY_SET');
  const buildShas = new Set<string>();
  for (const [index, mix] of value.mixes.entries()) {
    const scenario = value.study.scenarios.find((item) => item.id === mix.scenarioId);
    const terminals = value.study.executions.filter((item) =>
      item.kind === 'DIAGNOSTIC' && item.scenarioId === mix.scenarioId && item.status === 'SUCCEEDED');
    const replay = value.replays[mix.scenarioId];
    fail(scenario !== undefined && terminals.length === 1 && replay !== undefined,
      `SCENARIO_LINK:${index}`);
    if (scenario === undefined || terminals.length !== 1 || replay === undefined) continue;
    const terminal = terminals[0]!;
    if (terminal.kind !== 'DIAGNOSTIC' || terminal.envelope === null) continue;
    const request = terminal.requestSnapshot;
    const envelope = terminal.envelope;
    fail(validateDiagnosticRequest(request) && validateDiagnosticEnvelope(envelope),
      `DIAGNOSTIC_VALID:${index}`);
    fail(validateReplayDocument(replay), `REPLAY_VALID:${index}`);
    fail(request.sampling.kind === 'GENERATED_INPUT' && request.sampling.count === 10
      && request.sampling.repetitions.length === 10
      && request.selected_repetition_id === request.sampling.repetitions[0]?.repetition_id
      && envelope.statistics.count === 10 && envelope.repetitions.length === 10,
    `REPETITIONS:${index}`);
    const count = Object.values(mix.realizedCounts).reduce((sum, item) => sum + item, 0);
    fail(count === 12 && Object.keys(mix.requestedWeights).length === 6
      && Object.keys(mix.realizedCounts).length === 6, `COMPOSITION:${index}`);
    const sampling = request.sampling;
    if (sampling.kind === 'GENERATED_INPUT') {
      const realized = Object.fromEntries(Object.keys(mix.realizedCounts).map((name) => [
        name,
        sampling.preparation_input.participants.filter((participant) =>
          participant.profile === name).length,
      ]));
      fail(canonical(realized) === canonical(mix.realizedCounts),
        `COMPOSITION_REALIZED:${index}`);
    }
    fail(replay.orders.length <= 98 && replay.period.settlement_end_day <= 365,
      `REPLAY_LIMIT:${index}`);
    fail(replay.repetition_id === envelope.statistics.selected_repetition_id
      && replay.execution_fingerprint === envelope.selected_execution.execution_fingerprint
      && replay.diagnostic_execution_id === terminal.id,
    `REPLAY_IDENTITY:${index}`);
    const aggregate = envelope.selected_execution.result.agregado;
    fail(sameMoney(replay.totals.measured_gross_brl, aggregate.volume_bruto_periodo_brl)
      && sameMoney(replay.totals.measured_matched_contribution_brl,
        aggregate.volume_casado_periodo_brl)
      && sameMoney(replay.totals.netability_fraction,
        aggregate.taxa_netabilidade_periodo), `REPLAY_TOTALS:${index}`);
    fail(replay.result_fingerprint === await digest(envelope.selected_execution.result),
      `REPLAY_RESULT_FINGERPRINT:${index}`);
    const allocations = new Map<string, Decimal>();
    for (const day of replay.days) for (const event of day.events) {
      if (event.kind !== 'ALLOCATION') continue;
      allocations.set(event.order_id,
        (allocations.get(event.order_id) ?? new Decimal(0)).plus(event.value_brl));
    }
    fail(replay.orders.every((order) =>
      (allocations.get(order.id) ?? new Decimal(0)).eq(order.value_brl)),
    `REPLAY_CONSERVATION:${index}`);
    buildShas.add(envelope.selected_execution.motor_build_sha);
    fail(scenario.sourceSnapshot.source.kind === 'SYNTHETIC'
      && scenario.sourceSnapshot.generationInputSnapshot !== undefined,
    `SCENARIO_SYNTHETIC:${index}`);
  }
  fail(buildShas.size === 1 && buildShas.has(value.motorBuildSha), 'BUILD_SHA');
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}
