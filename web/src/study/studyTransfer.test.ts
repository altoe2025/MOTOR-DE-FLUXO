import { describe, expect, it } from 'vitest';

import generated from '../demo/generated/demo-study.v1.json';
import type { DemoStudyPackageV1 } from '../demo/domain';
import { materializeDemoPackage } from '../demo/materializeDemoPackage';
import { createStudy } from './domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from './fixtures';
import { canonical } from './fingerprints';
import type { StudyDocument } from './model';
import {
  buildStudyExport, parseStudyExport, prepareStudyImport, STUDY_EXPORT_FORMAT, studyExportFileName,
} from './studyTransfer';

const SHA = 'a'.repeat(40);

async function plainStudy(): Promise<StudyDocument> {
  return createStudy({ id: 'study-1', ownerSub: FIXTURE_OWNER, name: 'Carteira AstroPay', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
}

let counter = 0;
const ids = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

describe('exportar e importar estudo', { timeout: 30_000 }, () => {
  it('ida e volta de um estudo com diagnósticos devolve o mesmo estudo, com os mesmos resultados', async () => {
    const demo = await materializeDemoPackage(generated as unknown as DemoStudyPackageV1, FIXTURE_OWNER, 'transfer-test');
    const original = demo.study;
    expect(original.executions.some((item) => item.kind === 'DIAGNOSTIC' && item.envelope !== null)).toBe(true);

    const text = JSON.stringify(buildStudyExport(original, { now: FIXTURE_NOW, buildSha: SHA }));
    const parsed = await parseStudyExport(text, FIXTURE_OWNER);
    if (!parsed.ok) throw new Error(parsed.error);
    const prepared = await prepareStudyImport(parsed.study, { ownerSub: FIXTURE_OWNER, existing: [], now: FIXTURE_NOW, ids });

    expect(prepared.asCopy).toBe(false);
    expect(prepared.study.revision).toBe(1);
    expect(canonical({ ...prepared.study, revision: 0 })).toBe(canonical({ ...original, revision: 0 }));
  });

  it('grava formato, versão do formato e SHA do build', async () => {
    const file = buildStudyExport(await plainStudy(), { now: FIXTURE_NOW, buildSha: SHA });
    expect(file).toMatchObject({ format: STUDY_EXPORT_FORMAT, formatVersion: 1, exportedAt: FIXTURE_NOW, buildSha: SHA });
    expect(studyExportFileName(file.study, FIXTURE_NOW)).toBe('estudo-carteira-astropay-2026-09-19.json');
  });

  it('recusa arquivo que não é JSON, que não é estudo ou de versão futura, com mensagem clara', async () => {
    expect(await parseStudyExport('{oops', FIXTURE_OWNER)).toEqual({ ok: false, error: expect.stringContaining('não é um JSON') });
    expect(await parseStudyExport('{"a":1}', FIXTURE_OWNER)).toEqual({ ok: false, error: expect.stringContaining('não é um estudo exportado') });
    const future = { ...buildStudyExport(await plainStudy(), { now: FIXTURE_NOW, buildSha: SHA }), formatVersion: 2 };
    expect(await parseStudyExport(JSON.stringify(future), FIXTURE_OWNER)).toEqual({ ok: false, error: expect.stringContaining('versão 2') });
  });

  it('recusa estudo adulterado', async () => {
    const file = buildStudyExport(await plainStudy(), { now: FIXTURE_NOW, buildSha: SHA });
    const broken = JSON.parse(JSON.stringify(file)) as { study: { scenarios: { inputFingerprint: string }[] } };
    broken.study.scenarios[0]!.inputFingerprint = 'f'.repeat(64);
    expect(await parseStudyExport(JSON.stringify(broken), FIXTURE_OWNER)).toEqual({ ok: false, error: expect.stringContaining('inválido') });
  });

  it('com id já existente, importa como cópia com nome novo e sem resultados', async () => {
    const study = await plainStudy();
    const parsed = await parseStudyExport(JSON.stringify(buildStudyExport(study, { now: FIXTURE_NOW, buildSha: SHA })), FIXTURE_OWNER);
    if (!parsed.ok) throw new Error(parsed.error);
    const prepared = await prepareStudyImport(parsed.study, { ownerSub: FIXTURE_OWNER, existing: [study], now: FIXTURE_NOW, ids });
    expect(prepared.asCopy).toBe(true);
    expect(prepared.study.id).not.toBe(study.id);
    expect(prepared.study.name).toBe('Carteira AstroPay (importado)');
    expect(prepared.study.revision).toBe(1);
    expect(prepared.study.executions).toEqual([]);
  });

  it('estudo que estava na lixeira volta ativo', async () => {
    const study = { ...(await plainStudy()), deletedAt: FIXTURE_NOW };
    const parsed = await parseStudyExport(JSON.stringify(buildStudyExport(study, { now: FIXTURE_NOW, buildSha: SHA })), FIXTURE_OWNER);
    if (!parsed.ok) throw new Error(parsed.error);
    const prepared = await prepareStudyImport(parsed.study, { ownerSub: FIXTURE_OWNER, existing: [], now: FIXTURE_NOW, ids });
    expect(prepared.study.deletedAt).toBeNull();
  });
});
