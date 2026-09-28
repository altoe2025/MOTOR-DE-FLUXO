import { describe, expect, it, vi } from 'vitest';

import type { StudyDocument } from '../study/model';
import { presentationParticipants } from './participants';

const order = (id: string, cliente: string, valor: string) => ({ id, cliente_id: cliente, valor_brl: valor });

function study(source: unknown, orders: readonly ReturnType<typeof order>[]): StudyDocument {
  return { evidenceSnapshots: [], executions: [{ id: 'exec-1', sourceSnapshot: { source, orders } }] } as unknown as StudyDocument;
}

const controller = {
  listCompanies: vi.fn(async () => [{ id: 'company-ap', displayName: 'AstroPay' }] as never),
  listOperationalProfileVersions: vi.fn(async () => []),
  getObservedCase: vi.fn(async () => ({ companyId: 'company-ap' }) as never),
};

describe('nomes dos participantes na apresentação', () => {
  it('usa a empresa de cada ordem na carteira juntada e numera linhas da mesma empresa por volume', async () => {
    const companyByOrder = {
      'AP-1': { companyId: 'a', companyName: 'AstroPay' }, 'AP-2': { companyId: 'a', companyName: 'AstroPay' },
      'X-1': { companyId: 'x', companyName: 'Empresa X' },
    };
    const result = await presentationParticipants(study(
      { kind: 'AUTHORED', definition: { kind: 'EXPLICIT_ORDERS', companyByOrder } },
      [order('AP-1', 'c-pix', '100'), order('AP-2', 'c-multi', '500'), order('X-1', 'c-x', '50')],
    ), 'exec-1', controller);
    expect(result.names).toEqual({ 'c-multi': 'AstroPay · linha 1', 'c-pix': 'AstroPay · linha 2', 'c-x': 'Empresa X' });
    expect(result.companies).toEqual({ 'c-multi': 'AstroPay', 'c-pix': 'AstroPay', 'c-x': 'Empresa X' });
  });

  it('usa o nome da empresa do caso único em vez do prefixo do ID', async () => {
    const result = await presentationParticipants(study(
      { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 1 },
      [order('OP-1', 'c-1', '10'), order('OP-2', 'c-2', '20')],
    ), 'exec-1', controller);
    expect(result.names).toEqual({ 'c-2': 'AstroPay · linha 1', 'c-1': 'AstroPay · linha 2' });
  });
});
