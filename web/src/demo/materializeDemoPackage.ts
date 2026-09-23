import { validateReplayDocument } from '../api/validators';
import { validateObservedCase } from '../cases/validation';
import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import { fingerprintObservedCase, fingerprintOperationalProfile, fingerprintProfileSelection } from '../profiles/fingerprints';
import { validateOperationalProfile } from '../profiles/validation';
import { InvalidDocumentError } from '../storage/errors';
import { canonical, fingerprintPortfolioSource, fingerprintScenarioInput } from '../study/fingerprints';
import type { DeepMutable } from '../study/model';
import { validateStudyDocument } from '../study/validation';
import type { DemoStudyPackageV1 } from './domain';
import { validateDemoStudyPackage } from './validation';

export type MaterializedDemoPackage = Pick<DemoStudyPackageV1,
  'companies' | 'observedCases' | 'profiles' | 'study' | 'replays'>;

function invalid(detail: string): never {
  throw new InvalidDocumentError(`Pacote demonstrativo inválido: ${detail}.`);
}

/** Inspect descriptors before cloning: cloning must never sanitize hidden input. */
function assertClosedJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') invalid('valor não JSON');
  if (ancestors.has(value)) invalid('referência circular');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== null && prototype !== Object.prototype) invalid('protótipo');
  if (array && prototype !== Array.prototype) invalid('protótipo de array');
  const keys = Reflect.ownKeys(value);
  if (array && (keys.length !== value.length + 1 || keys.some((key) =>
    key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)
      || Number(key) >= value.length)))) invalid('propriedade de array');
  ancestors.add(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !('value' in descriptor)
      || (!descriptor.enumerable && !(array && key === 'length'))) invalid('propriedade oculta');
    assertClosedJson(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

/** IDs use the same SHA-256/UUID bit convention as diagnostic request IDs. */
async function installationUuid(owner: string, installation: string, id: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(canonical(['demo-installation-v1', owner, installation, id])))).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function transform<T>(value: T, replace: (text: string) => string): T {
  if (typeof value === 'string') return replace(value) as T;
  if (Array.isArray(value)) return value.map((item) => transform(item, replace)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [replace(key), transform(item, replace)])) as T;
  }
  return value;
}

async function assertEvidenceLinks(value: MaterializedDemoPackage): Promise<void> {
  const companies = new Set(value.companies.map((item) => item.id));
  const cases = new Map(value.observedCases.map((item) => [item.id, item]));
  const profiles = new Map(value.profiles.map((item) => [item.id, item]));
  if (companies.size !== value.companies.length || cases.size !== value.observedCases.length
    || profiles.size !== value.profiles.length) invalid('identidade duplicada');
  for (const item of value.observedCases) {
    if (!companies.has(item.companyId) || item.ownerSub !== value.study.ownerSub) invalid('empresa do caso');
  }
  for (const profile of value.profiles) {
    const selected = profile.selectedCases.map((item) => cases.get(item.caseId));
    if (selected.some((item) => item === undefined)) invalid('caso do perfil ausente');
    const expected = await calculateOperationalProfile({
      id: profile.id, ownerSub: profile.ownerSub, companyId: profile.companyId,
      version: profile.version, createdAt: profile.createdAt,
      cases: selected.filter((item) => item !== undefined),
    });
    if (canonical(expected) !== canonical(profile)) invalid('evidência do perfil divergente');
  }
  const evidenceIds = new Set(value.study.evidenceSnapshots.map((item) => item.profile.id));
  if (evidenceIds.size !== profiles.size || value.study.evidenceSnapshots.length !== profiles.size)
    invalid('conjunto de evidências');
  for (const evidence of value.study.evidenceSnapshots) {
    const profile = profiles.get(evidence.profile.id);
    if (profile === undefined || canonical(profile) !== canonical(evidence.profile)) invalid('snapshot do perfil');
  }
  transform(value.study, (text) => {
    if (!text.startsWith('profile-mvp:')) return text;
    const match = /^profile-mvp:([^@]+)@([a-f0-9]{64}):derived$/.exec(text);
    if (match === null || profiles.get(match[1]!)?.documentFingerprint !== match[2])
      invalid('referência de proveniência');
    return text;
  });
}

export function snapshotDemoPackage(value: DemoStudyPackageV1): DemoStudyPackageV1 {
  assertClosedJson(value);
  return structuredClone(value);
}

/** Clone synchronously before any digest/validator yields, then change identity only. */
export async function materializeDemoPackage(
  packageValue: DemoStudyPackageV1,
  ownerSub: string,
  installationId: string,
): Promise<MaterializedDemoPackage> {
  const snapshot = snapshotDemoPackage(packageValue);
  if (typeof ownerSub !== 'string' || ownerSub.trim() === '' || ownerSub === '$OWNER_SUB'
    || typeof installationId !== 'string' || installationId.trim() === '') invalid('owner ou instalação');
  const validation = await validateDemoStudyPackage(snapshot);
  if (!validation.ok) invalid(validation.issues.join(', '));
  await assertEvidenceLinks(snapshot);

  // Motor order/participant/repetition IDs live inside snapshots. Renaming those
  // would change generation determinants and EDF tie-breaks, not installation identity.
  const ids = new Set([
    snapshot.study.id,
    ...snapshot.companies.map((item) => item.id),
    ...snapshot.observedCases.flatMap((item) => [item.id, ...item.orders.map((order) => order.id)]),
    ...snapshot.profiles.map((item) => item.id),
    ...snapshot.study.scenarios.map((item) => item.id),
  ]);
  for (const execution of snapshot.study.executions) {
    ids.add(execution.id);
    ids.add(execution.requestSnapshot.request_id);
    if (execution.attemptId !== undefined) ids.add(execution.attemptId);
    if (execution.kind === 'DIAGNOSTIC') {
      ids.add(execution.requestSnapshot.idempotency_key);
      if (execution.jobId !== null) ids.add(execution.jobId);
      if (execution.envelope !== null) ids.add(execution.envelope.selected_execution.request_id);
    }
  }
  const replacements = new Map(await Promise.all([...ids].map(async (id) =>
    [id, await installationUuid(ownerSub, installationId, id)] as const)));
  replacements.set(snapshot.ownerPlaceholder, ownerSub);
  for (const item of snapshot.observedCases) {
    replacements.set(`case:${item.id}@${item.revision}`, `case:${replacements.get(item.id)!}@${item.revision}`);
  }
  let result = transform<DeepMutable<MaterializedDemoPackage>>({
    companies: structuredClone(snapshot.companies) as DeepMutable<typeof snapshot.companies>,
    observedCases: structuredClone(snapshot.observedCases) as DeepMutable<typeof snapshot.observedCases>,
    profiles: structuredClone(snapshot.profiles) as DeepMutable<typeof snapshot.profiles>,
    study: structuredClone(snapshot.study) as DeepMutable<typeof snapshot.study>,
    replays: structuredClone(snapshot.replays) as DeepMutable<typeof snapshot.replays>,
  }, (text) => replacements.get(text) ?? text);
  const cases = new Map(result.observedCases.map((item) => [item.id, item]));
  const profileReferences = new Map<string, string>();
  for (const [index, profile] of result.profiles.entries()) {
    for (const selected of profile.selectedCases) {
      selected.caseFingerprint = await fingerprintObservedCase(cases.get(selected.caseId)!);
    }
    profile.selectionFingerprint = await fingerprintProfileSelection(profile.selectedCases);
    profile.documentFingerprint = await fingerprintOperationalProfile(profile);
    const original = snapshot.profiles[index]!;
    profileReferences.set(`profile-mvp:${original.id}@${original.documentFingerprint}:derived`,
      `profile-mvp:${profile.id}@${profile.documentFingerprint}:derived`);
  }
  const profiles = new Map(result.profiles.map((item) => [item.id, item]));
  for (const evidence of result.study.evidenceSnapshots) evidence.profile = structuredClone(profiles.get(evidence.profile.id)!);
  result = transform(result, (text) => profileReferences.get(text) ?? text);
  for (const scenario of result.study.scenarios) {
    scenario.sourceSnapshot.sourceFingerprint = await fingerprintPortfolioSource(scenario.sourceSnapshot);
    scenario.inputFingerprint = await fingerprintScenarioInput(scenario);
  }
  for (const execution of result.study.executions) {
    if (execution.sourceSnapshot !== undefined) {
      execution.sourceSnapshot.sourceFingerprint = await fingerprintPortfolioSource(execution.sourceSnapshot);
      execution.inputFingerprint = await fingerprintScenarioInput({
        id: execution.scenarioId, revision: execution.scenarioRevision, name: '',
        sourceSnapshot: execution.sourceSnapshot, premises: execution.premisesSnapshot!,
        period: execution.periodSnapshot!,
      });
    }
    if (execution.kind === 'DIAGNOSTIC') {
      execution.requestSnapshot.input_fingerprint = execution.inputFingerprint;
      if (execution.envelope !== null) execution.envelope.request_fingerprint = execution.inputFingerprint;
    }
  }
  for (const item of result.observedCases) if (!validateObservedCase(item).ok) invalid('caso materializado');
  for (const profile of result.profiles) if (!(await validateOperationalProfile(profile)).ok) invalid('perfil materializado');
  const studyValidation = await validateStudyDocument(result.study, ownerSub);
  if (!studyValidation.ok) invalid(studyValidation.issues.map((item) => item.code).join(', '));
  for (const replay of Object.values(result.replays)) if (!validateReplayDocument(replay)) invalid('Replay materializado');
  await assertEvidenceLinks(result);
  return result;
}
