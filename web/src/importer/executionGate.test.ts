import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, ImportCatalog } from '../api/client';
import { ApiError } from '../api/errors';
import { makeSyntheticSnapshot } from '../study/fixtures';

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
    const getImportCatalog: ApiClient['getImportCatalog'] = vi.fn(async () => ({ status: 'CONFIGURADO' }) as ImportCatalog);
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
});
