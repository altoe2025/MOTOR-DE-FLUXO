import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, ImportCatalog } from '../api/client';
import { ApiError } from '../api/errors';
import { FIXTURE_NOW, makeObservedCase, makeSyntheticSnapshot } from '../study/fixtures';
import { authoredDefinitionFromObservedCase, resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { fictionalCatalog } from './__fixtures__/catalog';

async function gate() { return import('./executionGate').catch(() => undefined); }
function importedSnapshot() {
  const snapshot = makeSyntheticSnapshot();
  return { ...snapshot, provenance: [{ kind: 'OBSERVED' as const, source: 'xlsx-operacoes', version: '1.0.0', recordedAt: '2026-09-23T12:00:00Z' }] };
}

describe('gate de execução da importação', () => {
  it('bloqueia origem XLSX com catálogo não configurado e porta ausente', async () => {
    const module = await gate();
    expect(module).toBeDefined();
    const getImportCatalog = vi.fn(async () => ({ status: 'NAO_CONFIGURADO' }) as ImportCatalog);
    await expect(module!.assertImportExecutionAvailable(importedSnapshot(), getImportCatalog)).rejects.toThrow('Catálogo da importação não configurado');
    await expect(module!.assertImportExecutionAvailable(importedSnapshot())).rejects.toThrow('Catálogo da importação indisponível');
  });
  it('mantém o gate na autoria derivada e quando a proveniência agregada foi reordenada', async () => {
    const module = await gate(); expect(module).toBeDefined();
    const snapshot = importedSnapshot();
    const derived = { ...snapshot, source: { kind: 'AUTHORED' as const, authoredPortfolioId: 'derivada' } };
    await expect(module!.assertImportExecutionAvailable(derived)).rejects.toThrow('Catálogo da importação indisponível');
  });
  it('permite origem importada apenas após catálogo configurado pela porta autenticada', async () => {
    const module = await gate(); expect(module).toBeDefined();
    const getImportCatalog: ApiClient['getImportCatalog'] = vi.fn(async () => fictionalCatalog([
      { codigo: 'ANEXO_V_REMESSA_TERCEIRO', descricao: 'Fictícia OUT', aliquotas: [{ direcao: 'OUT', aliquota: '0' }] },
      { codigo: 'ANEXO_V_DISPONIBILIDADE', descricao: 'Fictícia IN', aliquotas: [{ direcao: 'IN', aliquota: '0' }] },
    ]));
    const signal = new AbortController().signal;
    await expect(module!.assertImportExecutionAvailable(importedSnapshot(), getImportCatalog, signal)).resolves.toBeUndefined();
    expect(getImportCatalog).toHaveBeenCalledWith(signal);
  });
  it('falha fechado em indisponibilidade e preserva a falha 401 de autenticação', async () => {
    const module = await gate(); expect(module).toBeDefined();
    const unavailable = new ApiError({ status: 503, code: 'TRANSPORTE_INDISPONIVEL', message: 'offline' });
    await expect(module!.assertImportExecutionAvailable(importedSnapshot(), async () => { throw unavailable; })).rejects.toThrow('Catálogo da importação indisponível');
    const unauthorized = new ApiError({ status: 401, code: 'SESSAO_INVALIDA', message: 'sessão expirada' });
    await expect(module!.assertImportExecutionAvailable(importedSnapshot(), async () => { throw unauthorized; })).rejects.toBe(unauthorized);
  });
  it('não consulta catálogo e permite sintético/demo sem origem XLSX', async () => {
    const module = await gate(); expect(module).toBeDefined();
    const getImportCatalog = vi.fn(async () => { throw new Error('offline'); });
    await expect(module!.assertImportExecutionAvailable(makeSyntheticSnapshot(), getImportCatalog)).resolves.toBeUndefined();
    expect(getImportCatalog).not.toHaveBeenCalled();
  });
  it('mantém ancestralidade após substituir toda proveniência de campos e serializar autoria', async () => {
    const fixture = makeObservedCase();
    const original = { ...fixture, sourceManifest: { ...fixture.sourceManifest, adapterId: 'xlsx-canonical' } };
    const definition = authoredDefinitionFromObservedCase(original);
    const manual = { kind: 'USER_CORRECTED' as const, source: 'autoria manual', version: '1', actionId: 'correction', recordedAt: FIXTURE_NOW };
    const reloaded = JSON.parse(JSON.stringify({
      kind: 'AUTHORED', authoredPortfolioId: 'edited', definition: {
        ...definition,
        provenanceByOrder: Object.fromEntries(definition.orders.map((order) => [order.id, Object.fromEntries(Object.keys(order).map((field) => [field, manual]))])),
      },
    }));
    const snapshot = await resolvePortfolioSource(reloaded, { getObservedCase: async () => null, preparePortfolio: async () => { throw new Error('não gerar'); }, now: () => FIXTURE_NOW });
    expect(snapshot.provenance.every((item) => item.source === 'autoria manual')).toBe(true);
    const module = await gate();
    await expect(module!.assertImportExecutionAvailable(snapshot, async () => ({ ...fictionalCatalog(), status: 'NAO_CONFIGURADO' }))).rejects.toThrow('Catálogo da importação não configurado');
  });
  it.each([
    { name: 'finalidade ausente', finalidades: [] },
    { name: 'direção ausente', finalidades: [{ codigo: 'ANEXO_V_REMESSA_TERCEIRO', descricao: 'Fictícia', aliquotas: [{ direcao: 'IN' as const, aliquota: '0' }] }] },
    { name: 'segundo par ausente', finalidades: [{ codigo: 'ANEXO_V_REMESSA_TERCEIRO', descricao: 'Fictícia', aliquotas: [{ direcao: 'OUT' as const, aliquota: '0' }] }] },
  ])('bloqueia catálogo CONFIGURADO com $name', async ({ finalidades }) => {
    const module = await gate();
    await expect(module!.assertImportExecutionAvailable(importedSnapshot(), async () => fictionalCatalog(finalidades))).rejects.toThrow('par finalidade/direção');
  });
  it('não bloqueia autoria derivada de Caso demonstrativo sintético', async () => {
    const fixture = makeObservedCase();
    const demo = { ...fixture, sourceManifest: { ...fixture.sourceManifest, sourceKind: 'SYNTHETIC' as const, adapterId: 'demo-synthetic' } };
    const snapshot = await resolvePortfolioSource({ kind: 'AUTHORED', authoredPortfolioId: 'demo', definition: authoredDefinitionFromObservedCase(demo) }, {
      getObservedCase: async () => null, preparePortfolio: async () => { throw new Error('não gerar'); }, now: () => FIXTURE_NOW,
    });
    const module = await gate();
    await expect(module!.assertImportExecutionAvailable(snapshot)).resolves.toBeUndefined();
  });
});
