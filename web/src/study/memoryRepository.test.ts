import { describe, expect, it } from 'vitest';

import { MemoryStudyRepository } from './memoryRepository';
import type { StudyDocument } from './types';

function study(ownerSub: string, id = 'study-1'): StudyDocument {
  const origin = {
    tipo: 'PADRAO_SINTETICO' as const,
    fonte: 'fixture unitário',
    registrado_em_utc: '2026-09-11T00:00:00Z',
  };
  const provenance = Object.fromEntries(
    [
      '/janela_dias',
      '/horizonte_dias',
      '/custo/iof_out',
      '/custo/iof_in',
      '/custo/carry_cnr',
      '/custo/spread_rail_bps',
      '/custo/custo_fixo_remessa',
      '/custo/custo_oportunidade_aa',
      '/custo/ptax',
    ].map((path) => [path, origin]),
  );
  return {
    study_schema_version: '1.0.0',
    id,
    owner_sub: ownerSub,
    name: 'Estudo de teste',
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    base: {
      id: 'scenario-1',
      revision: 1,
      input: {
        ordens: [],
        janela_dias: 1,
        horizonte_dias: 0,
        custo: {
          iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
          spread_rail_bps: '0', custo_fixo_remessa: '0',
          custo_oportunidade_aa: '0', ptax: '5.40', iof_por_finalidade: [],
        },
      },
      period: { modo: 'LEGADO' },
      provenance,
    },
    variants: [],
    results: [],
    selected_replay: null,
  };
}

describe('MemoryStudyRepository', () => {
  it('rejects saving a document for another account', async () => {
    const repository = new MemoryStudyRepository();
    await expect(repository.save('user-b', study('user-a'))).rejects.toThrow(/owner_sub/);
  });

  it('isolates get, list and remove by owner', async () => {
    const repository = new MemoryStudyRepository();
    await repository.save('user-a', study('user-a'));
    expect(await repository.get('user-b', 'study-1')).toBeNull();
    expect(await repository.list('user-b')).toEqual([]);
    await repository.remove('user-b', 'study-1');
    expect((await repository.get('user-a', 'study-1'))?.name).toBe('Estudo de teste');
  });

  it('returns copies so callers cannot mutate stored state', async () => {
    const repository = new MemoryStudyRepository();
    await repository.save('user-a', study('user-a'));
    const loaded = await repository.get('user-a', 'study-1');
    if (loaded === null) throw new Error('study missing');
    loaded.name = 'Alterado fora do repositório';
    expect((await repository.get('user-a', 'study-1'))?.name).toBe('Estudo de teste');
  });

  it.each([
    ['empty name', { name: '' }],
    ['oversized name', { name: 'x'.repeat(121) }],
    ['invalid base revision', { base: { ...study('user-a').base, revision: 0 } }],
    ['unsupported schema version', { study_schema_version: '2.0.0' }],
    [
      'invalid executable snapshot',
      {
        base: {
          ...study('user-a').base,
          input: {
            ...study('user-a').base.input,
            custo: { ...study('user-a').base.input.custo, ptax: 0 },
          },
        },
      },
    ],
    [
      'unsupported variant in stage 1',
      {
        variants: [
          {
            id: 'variant-1',
            base_id: 'scenario-1',
            base_revision: 1,
            name: 'Teste',
            changes: [],
          },
        ],
      },
    ],
  ])('rejects %s', async (_, change) => {
    const repository = new MemoryStudyRepository();
    await expect(
      repository.save('user-a', { ...study('user-a'), ...change } as StudyDocument),
    ).rejects.toThrow();
  });
});
