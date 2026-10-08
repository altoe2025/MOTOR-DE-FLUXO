import { describe, expect, it, vi } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { ParsedImport } from './xlsxParser';
import { ImportFlowController } from './controller';

const company: CompanyRecord = {
  id: 'company-1', ownerSub: 'owner-1', displayName: 'Empresa', aliases: [],
  createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z', revision: 1,
};
const parsed: ParsedImport = {
  layout: 'xlsx-operacoes/1.0.0', sha256: 'a'.repeat(64), byteSize: 100,
  rows: [{ operacao_id: 'OP-1', cliente_nome: 'Cliente', classificacao_perfil: null,
    direcao: 'OUT', data_conhecida: '2026-09-22', data_limite: '2026-09-23',
    valor_brl: '100', finalidade_codigo: null }],
};
const file = new File(['xlsx'], 'operacoes.xlsx');

describe('ImportFlowController', () => {
  it('lê somente após ação explícita, revisa e confirma somente o Caso Observado', async () => {
    const parse = vi.fn(async () => parsed);
    const publish = vi.fn(async (review) => ({ ...review.draft, status: 'CONFIRMED', revision: 1 }) as ObservedCase);
    const flow = new ImportFlowController({ parse, publish, operationId: () => 'operation-1', now: () => '2026-09-23T00:00:00Z' });
    const states: string[] = [];
    flow.subscribe(() => states.push(flow.snapshot.status));

    flow.selectFile(file);
    expect(parse).not.toHaveBeenCalled();
    await flow.read({ company, ownerSub: 'owner-1', positionIdentified: true });
    expect(flow.snapshot.status).toBe('READY_TO_CONFIRM');
    expect(states).toEqual(expect.arrayContaining(['INSPECTING', 'PARSING', 'REVIEW_REQUIRED', 'READY_TO_CONFIRM']));
    const result = await flow.confirm();
    expect(result).toMatchObject({ status: 'CONFIRMED', revision: 1 });
    expect(flow.snapshot.status).toBe('CONFIRMED');
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ status: 'DRAFT' }) }), 'operation-1');
  });

  it('mantém operationId no retry após resultado incerto', async () => {
    const publish = vi.fn().mockRejectedValueOnce(new Error('resultado incerto')).mockResolvedValueOnce({ id: 'case-1', revision: 1 });
    const flow = new ImportFlowController({ parse: async () => parsed, publish, operationId: () => 'stable-id' });
    flow.selectFile(file);
    await flow.read({ company, ownerSub: 'owner-1', positionIdentified: true });
    await expect(flow.confirm()).rejects.toThrow('resultado incerto');
    expect(flow.snapshot.status).toBe('READY_TO_CONFIRM');
    await flow.confirm();
    expect(publish.mock.calls.map((call) => call[1])).toEqual(['stable-id', 'stable-id']);
  });

  it('cancela leitura e descarta resultado tardio após troca de sessão', async () => {
    let resolveParse!: (value: ParsedImport) => void;
    const flow = new ImportFlowController({ parse: () => new Promise((resolve) => { resolveParse = resolve; }), publish: vi.fn() });
    flow.selectFile(file);
    const reading = flow.read({ company, ownerSub: 'owner-1', positionIdentified: true });
    flow.cancel();
    resolveParse(parsed);
    await reading;
    expect(flow.snapshot.status).toBe('SELECTING_SOURCE');
    expect(flow.snapshot.review).toBeNull();
    flow.dispose();
    expect(() => flow.selectFile(file)).toThrow('Sessão');
  });
});
