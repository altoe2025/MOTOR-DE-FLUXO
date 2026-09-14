import { describe, expect, it } from 'vitest';

import { fingerprintInput } from './fingerprints';
import { makeGroup, makeParticipant, makeStudy } from './fixtures';

function input() {
  const study = makeStudy();
  if (study.content.kind !== 'AUTHORED') throw new Error('fixture');
  return study.content.input;
}

describe('fingerprintInput', () => {
  it('nome vazio não altera fingerprints', async () => {
    const value = input();
    const before = await fingerprintInput(value);
    value.participants[0]!.name = '';
    value.groups[0]!.name = '';
    expect(await fingerprintInput(value)).toEqual(before);
  });

  it('geração incompleta também exclui custos e janela', async () => {
    const value = input();
    value.groups[0]!.fields.monthly_volume_brl.raw = '1,';
    const before = await fingerprintInput(value);
    value.costs.ptax.raw = '9';
    value.window_days.raw = '99';
    expect((await fingerprintInput(value)).generation).toBe(before.generation);
  });

  it('nome não altera identidade numérica', async () => {
    const a = makeStudy();
    if (a.content.kind !== 'AUTHORED') throw new Error('fixture');
    const before = await fingerprintInput(a.content.input);
    a.content.input.participants[0]!.name = 'Nome revisto';
    expect((await fingerprintInput(a.content.input)).numeric).toBe(before.numeric);
  });

  it('ordem de grupos, participantes e regras IOF não altera as chaves', async () => {
    const value = input();
    const groupB = makeGroup('00000000-0000-4000-8000-000000000120');
    value.groups.push(groupB);
    value.participants.push(makeParticipant('00000000-0000-4000-8000-000000000121', groupB.id));
    value.iof_rules.push({
      id: '00000000-0000-4000-8000-000000000122',
      purpose: { raw: 'PAGAMENTO', origin: value.costs.iof_out.origin },
      direction: { raw: 'OUT', origin: value.costs.iof_out.origin },
      rate: { raw: '0,01', origin: value.costs.iof_out.origin },
    });
    const before = await fingerprintInput(value);
    value.groups.reverse();
    value.participants.reverse();
    value.iof_rules.reverse();
    expect(await fingerprintInput(value)).toEqual(before);
  });

  it('normaliza 1,0 e 1,00 sem usar Number', async () => {
    const a = input();
    const b = structuredClone(a);
    a.groups[0]!.fields.out_fraction.raw = '1,0';
    b.groups[0]!.fields.out_fraction.raw = '1,00';
    b.groups[0]!.fields.monthly_volume_brl.raw = '999999999999,999999';
    a.groups[0]!.fields.monthly_volume_brl.raw = '999999999999,999999';
    expect((await fingerprintInput(a)).numeric).toBe((await fingerprintInput(b)).numeric);
  });

  it('mudança somente de origem altera evidence e semantic, não numeric nem generation', async () => {
    const value = input();
    const before = await fingerprintInput(value);
    value.groups[0]!.fields.ticket_median_brl.origin = {
      kind: 'ESTIMATIVA_USUARIO',
      source: 'Revisão manual',
      recorded_at: '2026-09-13T01:00:00Z',
    };
    const after = await fingerprintInput(value);
    expect(after.numeric).toBe(before.numeric);
    expect(after.generation).toBe(before.generation);
    expect(after.evidence).not.toBe(before.evidence);
    expect(after.semantic).not.toBe(before.semantic);
  });

  it('A→B→A restaura todas as chaves', async () => {
    const value = input();
    const initial = await fingerprintInput(value);
    value.groups[0]!.fields.ticket_median_brl.raw = '2000';
    expect((await fingerprintInput(value)).numeric).not.toBe(initial.numeric);
    value.groups[0]!.fields.ticket_median_brl.raw = '1000';
    expect(await fingerprintInput(value)).toEqual(initial);
  });

  it('custos e janela não alteram generation, mas período e seed alteram', async () => {
    const value = input();
    const initial = await fingerprintInput(value);
    value.costs.ptax.raw = '6,00';
    value.window_days.raw = '14';
    const economic = await fingerprintInput(value);
    expect(economic.generation).toBe(initial.generation);
    expect(economic.numeric).not.toBe(initial.numeric);
    value.measurement_days.raw = '31';
    expect((await fingerprintInput(value)).generation).not.toBe(initial.generation);
    value.measurement_days.raw = '30';
    value.participants[0]!.seed = '9223372036854775807';
    expect((await fingerprintInput(value)).generation).not.toBe(initial.generation);
  });

  it('separa raw e evidência mesmo enquanto a entrada está incompleta', async () => {
    const value = input();
    value.groups[0]!.fields.monthly_volume_brl.raw = '1,';
    const before = await fingerprintInput(value);
    value.groups[0]!.fields.monthly_volume_brl.origin = {
      kind: 'ESTIMATIVA_USUARIO',
      source: 'Outra origem',
      recorded_at: '2026-09-13T02:00:00Z',
    };
    const after = await fingerprintInput(value);
    expect(after.numeric).toBe(before.numeric);
    expect(after.evidence).not.toBe(before.evidence);
    expect(after.semantic).not.toBe(before.semantic);
  });

  it('inclui todas as origens da regra IOF sem incluir seu ID na chave numérica', async () => {
    const value = input();
    const origin = structuredClone(value.costs.iof_out.origin);
    value.iof_rules.push({
      id: '00000000-0000-4000-8000-000000000151',
      purpose: { raw: 'PAGAMENTO', origin },
      direction: { raw: 'OUT', origin },
      rate: { raw: '0,01', origin },
    });
    const before = await fingerprintInput(value);
    value.iof_rules[0]!.id = '00000000-0000-4000-8000-000000000152';
    value.iof_rules[0]!.purpose.origin = {
      kind: 'ESTIMATIVA_USUARIO',
      source: 'Finalidade confirmada pelo usuário',
      recorded_at: '2026-09-13T03:00:00Z',
    };
    const after = await fingerprintInput(value);
    expect(after.numeric).toBe(before.numeric);
    expect(after.evidence).not.toBe(before.evidence);
  });
});
