import { duplicateStudy } from './domain';
import type { IdFactory, StudyDocument } from './model';
import { uniqueName } from './naming';
import { assertValidStudy, validateStudyDocument } from './validation';

/**
 * Cópia de segurança de um estudo num arquivo JSON. O estudo já é autocontido: cada cenário
 * guarda o snapshot normalizado da origem (ordens e proveniência), as premissas e o período,
 * e as execuções guardam pedido e resultado do motor.
 */
export const STUDY_EXPORT_FORMAT = 'motor-de-fluxo/estudo';
export const STUDY_EXPORT_VERSION = 1;

export type StudyExportFile = Readonly<{
  format: typeof STUDY_EXPORT_FORMAT;
  formatVersion: typeof STUDY_EXPORT_VERSION;
  exportedAt: string;
  buildSha: string | null;
  study: StudyDocument;
}>;

export type ParsedStudyExport =
  | Readonly<{ ok: true; study: StudyDocument; buildSha: string | null }>
  | Readonly<{ ok: false; error: string }>;

export function buildStudyExport(study: StudyDocument, { now, buildSha }: Readonly<{ now: string; buildSha: string | null }>): StudyExportFile {
  return { format: STUDY_EXPORT_FORMAT, formatVersion: STUDY_EXPORT_VERSION, exportedAt: now, buildSha, study: structuredClone(study) as StudyDocument };
}

export function studyExportFileName(study: StudyDocument, now: string): string {
  const slug = study.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'estudo';
  return `estudo-${slug}-${now.slice(0, 10)}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Lê o arquivo e valida o estudo como se fosse gravado agora nesta conta. */
export async function parseStudyExport(text: string, ownerSub: string): Promise<ParsedStudyExport> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { ok: false, error: 'O arquivo não é um JSON válido. Escolha o arquivo gerado por “Exportar”.' }; }
  if (!isRecord(value) || value.format !== STUDY_EXPORT_FORMAT) {
    return { ok: false, error: 'Este arquivo não é um estudo exportado do Motor de Fluxo.' };
  }
  if (value.formatVersion !== STUDY_EXPORT_VERSION) {
    return { ok: false, error: `O arquivo usa a versão ${String(value.formatVersion)} do formato; esta versão do app só lê a versão ${STUDY_EXPORT_VERSION}. Atualize o app ou exporte de novo.` };
  }
  if (!isRecord(value.study)) return { ok: false, error: 'O arquivo não contém um estudo.' };
  // A conta ativa passa a ser a dona; lixeira e revisões anteriores não vêm junto.
  const study = { ...structuredClone(value.study), ownerSub, revision: 1, deletedAt: null };
  const validation = await validateStudyDocument(study, ownerSub);
  if (!validation.ok) {
    const first = validation.issues[0];
    return { ok: false, error: `O estudo do arquivo é inválido${first === undefined ? '' : ` (${first.path}: ${first.message})`}. Ele pode ter sido editado à mão ou vir de uma versão incompatível.` };
  }
  return { ok: true, study: validation.value, buildSha: typeof value.buildSha === 'string' ? value.buildSha : null };
}

/**
 * Sem conflito, o estudo volta exatamente como foi exportado. Com o mesmo id já neste
 * navegador, entra como cópia: id novo e nome “(importado)”, sem os resultados — as execuções
 * carregam o id do estudo de origem e teriam de ser rodadas de novo, como no “Duplicar”.
 */
export async function prepareStudyImport(study: StudyDocument, options: Readonly<{
  ownerSub: string; existing: readonly StudyDocument[]; now: string; ids: IdFactory;
}>): Promise<Readonly<{ study: StudyDocument; asCopy: boolean }>> {
  if (!options.existing.some((item) => item.id === study.id)) return { study, asCopy: false };
  const copy = await duplicateStudy(study, options.now, options.ids);
  const name = uniqueName(`${study.name.slice(0, 108)} (importado)`, options.existing.map((item) => item.name));
  const renamed = { ...structuredClone(copy), name } as StudyDocument;
  await assertValidStudy(renamed, options.ownerSub);
  return { study: renamed, asCopy: true };
}
