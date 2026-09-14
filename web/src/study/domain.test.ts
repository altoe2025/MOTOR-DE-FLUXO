import { describe, expect, it } from 'vitest';

import { duplicateStudy, resolveInput } from './domain';
import { makeGroup, makeParticipant, makeStudy } from './fixtures';

describe('resolveInput', () => {
  it('não compartilha origens mutáveis com o rascunho', () => {
    const input = authoredInput();
    const result = resolveInput(input);
    if (!result.ok) throw new Error('fixture');
    const before = structuredClone(result.value.sources);
    input.groups[0]!.fields.profile.origin!.source = 'Editada';
    expect(result.value.sources).toEqual(before);
  });

  it('exige nome do grupo somente para executar', () => {
    const input = authoredInput();
    input.groups[0]!.name = '';
    expect(resolveInput(input).ok).toBe(false);
  });

  it('resolve herança por campo sem substituir override próprio', () => {
    const study = makeStudy();
    if (study.content.kind !== 'AUTHORED') throw new Error('fixture');
    const group = makeGroup('00000000-0000-4000-8000-000000000101');
    group.fields.monthly_volume_brl.raw = '10000000';
    const inheritedA = makeParticipant('00000000-0000-4000-8000-000000000102', group.id);
    const inheritedB = makeParticipant('00000000-0000-4000-8000-000000000103', group.id);
    const own = makeParticipant('00000000-0000-4000-8000-000000000104', group.id);
    own.fields.monthly_volume_brl = {
      mode: 'own',
      field: { raw: '20000000', origin: group.fields.monthly_volume_brl.origin },
    };
    study.content.input.groups = [group];
    study.content.input.participants = [inheritedA, inheritedB, own];

    group.fields.monthly_volume_brl.raw = '12000000';
    const resolved = resolveInput(study.content.input);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error('entrada deveria resolver');
    expect(resolved.value.participants.map((participant) => participant.monthly_volume_brl))
      .toEqual(['12000000', '12000000', '20000000']);
  });

  it.each([
    ['grupo inexistente', (input: ReturnType<typeof authoredInput>) => {
      input.participants[0]!.group_id = '00000000-0000-4000-8000-000000000199';
    }, 'REFERENCIA_INVALIDA'],
    ['inherit sem grupo', (input: ReturnType<typeof authoredInput>) => {
      input.participants[0]!.group_id = null;
    }, 'REFERENCIA_INVALIDA'],
    ['origem nula', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.profile.origin = null;
    }, 'ORIGEM_AUSENTE'],
    ['data UTC impossível', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.profile.origin!.recorded_at = '2026-02-31T00:00:00Z';
    }, 'ORIGEM_INVALIDA'],
    ['número incompleto', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.monthly_volume_brl.raw = '1,';
    }, 'DECIMAL_INVALIDO'],
    ['volume zero', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.monthly_volume_brl.raw = '0';
    }, 'FORA_DO_LIMITE'],
    ['volume negativo', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.monthly_volume_brl.raw = '-1';
    }, 'DECIMAL_INVALIDO'],
    ['expoente', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.monthly_volume_brl.raw = '1e3';
    }, 'DECIMAL_INVALIDO'],
    ['decimal ambíguo', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.monthly_volume_brl.raw = '1.000,00';
    }, 'DECIMAL_INVALIDO'],
    ['custo inválido', (input: ReturnType<typeof authoredInput>) => {
      input.costs.ptax.raw = '0';
    }, 'FORA_DO_LIMITE'],
    ['soma temporal 731', (input: ReturnType<typeof authoredInput>) => {
      input.warmup_days.raw = '365';
      input.measurement_days.raw = '366';
    }, 'FORA_DO_LIMITE'],
    ['prazo 366', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.deadline_days.raw = '366';
    }, 'FORA_DO_LIMITE'],
    ['prazo vazio', (input: ReturnType<typeof authoredInput>) => {
      input.groups[0]!.fields.deadline_days.raw = '';
    }, 'OBRIGATORIO'],
  ])('retorna issue estável para %s', (_, mutate, code) => {
    const input = authoredInput();
    mutate(input);
    const result = resolveInput(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('entrada deveria ser inválida');
    expect(result.issues.some((issue) => issue.code === code)).toBe(true);
  });

  it('recusa IDs repetidos e mais de cem participantes', () => {
    const duplicate = authoredInput();
    duplicate.participants.push(structuredClone(duplicate.participants[0]!));
    const duplicateResult = resolveInput(duplicate);
    expect(duplicateResult.ok).toBe(false);
    if (!duplicateResult.ok) {
      expect(duplicateResult.issues).toContainEqual(expect.objectContaining({ code: 'DUPLICADO' }));
    }

    const oversized = authoredInput();
    oversized.participants = Array.from({ length: 101 }, (_, index) =>
      makeParticipant(`00000000-0000-4000-8000-${String(index + 200).padStart(12, '0')}`));
    const oversizedResult = resolveInput(oversized);
    expect(oversizedResult.ok).toBe(false);
    if (!oversizedResult.ok) {
      expect(oversizedResult.issues).toContainEqual(expect.objectContaining({ code: 'FORA_DO_LIMITE' }));
    }
  });

  it('aceita carteira vazia e materializa fontes por UUID', () => {
    const input = authoredInput();
    input.groups = [];
    input.participants = [];
    const result = resolveInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('carteira vazia deveria ser válida');
    expect(result.value.participants).toEqual([]);
    expect(Object.keys(result.value.sources)).toContain('/costs/ptax');
  });
});

describe('duplicateStudy', () => {
  it('remapeia relações, preserva seeds e zera execução', () => {
    const original = makeStudy();
    if (original.content.kind !== 'AUTHORED') throw new Error('fixture');
    original.execution_ids = ['00000000-0000-4000-8000-000000000080'];
    original.current_preparation_id = '00000000-0000-4000-8000-000000000081';
    original.attempt = {
      id: '00000000-0000-4000-8000-000000000082',
      request_id: '00000000-0000-4000-8000-000000000083',
      tab_id: '00000000-0000-4000-8000-000000000084',
      session_epoch: 1,
      scenario_revision: 1,
      started_at: '2026-09-13T00:00:00Z',
      phase: 'PREPARANDO',
    };
    const values = [
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000202',
      '00000000-0000-4000-8000-000000000203',
      '00000000-0000-4000-8000-000000000204',
      '00000000-0000-4000-8000-000000000205',
      '00000000-0000-4000-8000-000000000206',
    ];
    const duplicate = duplicateStudy(original, '2026-09-13T02:00:00Z', () => values.shift()!);
    if (duplicate.content.kind !== 'AUTHORED') throw new Error('duplicação perdeu autoria');

    expect(duplicate.id).toBe('00000000-0000-4000-8000-000000000201');
    expect(duplicate.scenario_id).toBe('00000000-0000-4000-8000-000000000202');
    expect(duplicate.content.input.portfolio_id).toBe('00000000-0000-4000-8000-000000000203');
    expect(duplicate.content.input.groups[0]!.id).toBe('00000000-0000-4000-8000-000000000204');
    expect(duplicate.content.input.participants[0]!.group_id)
      .toBe('00000000-0000-4000-8000-000000000204');
    expect(duplicate.content.input.participants[0]!.id)
      .toBe('00000000-0000-4000-8000-000000000205');
    expect(duplicate.content.input.participants[0]!.seed)
      .toBe(original.content.input.participants[0]!.seed);
    expect(duplicate.execution_ids).toEqual([]);
    expect(duplicate.current_preparation_id).toBeNull();
    expect(duplicate.attempt).toBeNull();
    duplicate.content.input.groups[0]!.name = 'Alterado';
    expect(original.content.input.groups[0]!.name).toBe('Grupo sintético');
  });
});

function authoredInput() {
  const study = makeStudy();
  if (study.content.kind !== 'AUTHORED') throw new Error('fixture');
  return study.content.input;
}
