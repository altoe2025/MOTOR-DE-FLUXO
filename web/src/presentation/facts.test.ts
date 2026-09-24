import { describe, expect, it } from 'vitest';
import type { CommunicationFact } from '../communication/domain';
import { presentFact } from './facts';

describe('receita de origem na apresentação', () => {
  it('resume a receita sintética sem alterar o JSON canônico publicado', () => {
    const fact: CommunicationFact = { code: 'SOURCE', label: 'Origem da carteira',
      value: '{"kind":"SYNTHETIC","recipe":{"exampleId":"perfil-operacional-mvp","generatorVersion":"dimensionamento-v1","composition":[{},{}],"seeds":["1","2"]}}',
      evidenceRefs: ['STUDY:/source'] };
    expect(presentFact(fact)).toEqual({ label: 'Origem da carteira',
      value: 'Receita sintética perfil-operacional-mvp · gerador dimensionamento-v1 · 2 participantes · 2 sementes',
      explanation: 'A receita e suas sementes identificam a geração desta carteira.' });
    expect(fact.value).toContain('"seeds":["1","2"]');
  });

  it('explica o período natural mantendo o registro canônico para auditoria', () => {
    const fact: CommunicationFact = { code: 'PERIOD', label: 'Período',
      value: '{"httpPeriod":{"modo":"NATURAL","dias_aquecimento":30,"periodo_medicao_dias":30}}',
      evidenceRefs: ['STUDY:/period'] };
    expect(presentFact(fact).value).toBe('Período natural · 30 dias de aquecimento · 30 dias de medição');
    expect(fact.value).toContain('"periodo_medicao_dias":30');
  });
});
