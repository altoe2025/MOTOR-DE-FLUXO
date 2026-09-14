import { describe, expect, it } from 'vitest';

import { makeStudy } from './fixtures';
import { makeExecution } from './executionFixture.test-support';
import { deriveResultState } from './resultState';

const EXECUTION_ID = '00000000-0000-4000-8000-000000000301';

const execution = makeExecution;

describe('deriveResultState', () => {
  it('retorna ausente sem execução', () => {
    expect(deriveResultState(makeStudy(), null, null, null)).toEqual({ kind: 'AUSENTE' });
  });

  it('marca entrada incompleta sem chaves atuais', () => {
    expect(deriveResultState(makeStudy(), execution(), null, 'a'.repeat(40))).toEqual({
      kind: 'DESATUALIZADO', execution_id: EXECUTION_ID, reasons: ['ENTRADA_INCOMPLETA'],
    });
  });

  it('distingue alterações numéricas, de evidência e de versão', () => {
    expect(deriveResultState(makeStudy(), execution(), {
      numeric: 'numeric-b', evidence: 'evidence-b',
    }, 'b'.repeat(40))).toEqual({
      kind: 'DESATUALIZADO',
      execution_id: EXECUTION_ID,
      reasons: ['ENTRADAS_ALTERADAS', 'PROVENIENCIA_ALTERADA', 'VERSAO_ALTERADA'],
    });
  });

  it('mantém resultado atual com versão verificada ou não verificada', () => {
    const keys = { numeric: 'a'.repeat(64), evidence: 'b'.repeat(64) };
    expect(deriveResultState(makeStudy(), execution(), keys, 'a'.repeat(40))).toEqual({
      kind: 'ATUAL', execution_id: EXECUTION_ID, server_version: 'VERIFICADA',
    });
    expect(deriveResultState(makeStudy(), execution(), keys, null)).toEqual({
      kind: 'ATUAL', execution_id: EXECUTION_ID, server_version: 'NAO_VERIFICADA',
    });
  });
});
