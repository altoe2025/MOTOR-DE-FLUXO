import type { ObservedCase } from '../cases/domain';
import { validateObservedCase } from '../cases/validation';
import type {
  ProfileCompatibilityBlockerCode,
  ProfileCompatibilityIssue,
  ProfileCompatibilityOptions,
  ProfileCompatibilityReport,
  ProfileCompatibilityWarningCode,
} from './domain';

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedCases(cases: readonly ObservedCase[]): ObservedCase[] {
  return [...cases].sort((left, right) => ordinal(
    `${left.window.startDate}\0${left.window.endDate}\0${left.id}\0${String(left.revision).padStart(16, '0')}`,
    `${right.window.startDate}\0${right.window.endDate}\0${right.id}\0${String(right.revision).padStart(16, '0')}`,
  ));
}

function issue<Code extends string>(
  code: Code,
  message: string,
  caseIds: readonly string[],
): ProfileCompatibilityIssue<Code> {
  return { code, message, caseIds: [...new Set(caseIds)].sort(ordinal) };
}

export function checkProfileCompatibility(
  cases: readonly ObservedCase[],
  options: ProfileCompatibilityOptions = {},
): ProfileCompatibilityReport {
  const blockers: ProfileCompatibilityIssue<ProfileCompatibilityBlockerCode>[] = [];
  const warnings: ProfileCompatibilityIssue<ProfileCompatibilityWarningCode>[] = [];
  if (cases.length === 0) {
    blockers.push(issue('EMPTY_SELECTION', 'Selecione ao menos um Caso Observado.', []));
    return { compatible: false, blockers, warnings };
  }

  const ownerSubs = new Set(cases.map((item) => item.ownerSub));
  const companyIds = new Set(cases.map((item) => item.companyId));
  if (options.company !== undefined) {
    ownerSubs.add(options.company.ownerSub);
    companyIds.add(options.company.id);
  }
  if (ownerSubs.size > 1) {
    blockers.push(issue('MULTIPLE_OWNERS', 'A seleção mistura proprietários.', cases.map((item) => item.id)));
  }
  if (companyIds.size > 1) {
    blockers.push(issue('MULTIPLE_COMPANIES', 'A seleção mistura empresas.', cases.map((item) => item.id)));
  }

  const revisions = new Map<string, string[]>();
  for (const item of cases) {
    const key = `${item.id}\0${item.revision}`;
    revisions.set(key, [...(revisions.get(key) ?? []), item.id]);
  }
  const duplicateRevisions = [...revisions.values()].filter((ids) => ids.length > 1).flat();
  if (duplicateRevisions.length > 0) {
    blockers.push(issue('DUPLICATE_CASE_REVISION', 'A mesma revisão de caso foi selecionada mais de uma vez.', duplicateRevisions));
  }

  for (const item of cases) {
    if (item.status !== 'CONFIRMED' && item.status !== 'ARCHIVED') {
      blockers.push(issue('INVALID_STATUS', 'Somente casos confirmados ou arquivados podem compor o perfil.', [item.id]));
      continue;
    }
    if (!validateObservedCase(item).ok) {
      blockers.push(issue('INVALID_DOCUMENT', 'O documento do caso não satisfaz o contrato validado.', [item.id]));
    }
  }

  const shaCases = new Map<string, Set<string>>();
  for (const item of cases) {
    for (const file of item.sourceManifest.files) {
      const caseIds = shaCases.get(file.sha256) ?? new Set<string>();
      caseIds.add(item.id);
      shaCases.set(file.sha256, caseIds);
    }
  }
  const confirmations = new Set(options.confirmedDistinctSourceSha256 ?? []);
  const duplicatedSources = [...shaCases.entries()]
    .filter(([sha, ids]) => ids.size > 1 && !confirmations.has(sha));
  if (duplicatedSources.length > 0) {
    blockers.push(issue(
      'DUPLICATE_SOURCE_SHA256',
      'A mesma fonte aparece em casos diferentes sem confirmação de operações distintas.',
      duplicatedSources.flatMap(([, ids]) => [...ids]),
    ));
  }

  const ordered = orderedCases(cases);
  const overlapping = new Set<string>();
  let latestEnd = ordered[0]!.window.endDate;
  let latestCaseId = ordered[0]!.id;
  let hasGap = false;
  for (const item of ordered.slice(1)) {
    const previousEnd = Date.parse(`${latestEnd}T00:00:00Z`);
    const start = Date.parse(`${item.window.startDate}T00:00:00Z`);
    if (start <= previousEnd) {
      overlapping.add(latestCaseId);
      overlapping.add(item.id);
    } else if (start > previousEnd + 86_400_000) {
      hasGap = true;
    }
    if (item.window.endDate > latestEnd) {
      latestEnd = item.window.endDate;
      latestCaseId = item.id;
    }
  }
  if (overlapping.size > 0) {
    warnings.push(issue('OVERLAPPING_WINDOWS', 'Há janelas observadas sobrepostas; ordens distintas permanecem separadas.', [...overlapping]));
  }
  const normalizationVersions = new Set(cases.map((item) => `${item.normalization.rulesetId}@${item.normalization.rulesetVersion}`));
  if (normalizationVersions.size > 1) {
    warnings.push(issue('MIXED_NORMALIZATION_VERSIONS', 'A seleção combina versões diferentes de normalização.', cases.map((item) => item.id)));
  }
  if (hasGap) {
    warnings.push(issue('DISCONTINUOUS_COVERAGE', 'Há dias sem cobertura entre as janelas selecionadas.', cases.map((item) => item.id)));
  }

  return { compatible: blockers.length === 0, blockers, warnings };
}

export { orderedCases };
