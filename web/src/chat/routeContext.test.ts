import { describe, expect, it } from 'vitest';

import { routeChatContext } from './routeContext';

describe('chat route context', () => {
  it.each([
    ['/empresas', 'companies', null],
    ['/empresas/acme/perfis', 'profiles', null],
    ['/empresas/acme/importar', 'import', null],
    ['/importar', 'import', null],
    ['/estudos', 'studies', null],
    ['/carteira/study-1', 'portfolio', 'study-1'],
    ['/estudos/study-1/diagnostico?scenarioId=sc-1', 'diagnostic', 'study-1'],
    ['/comparar?studyId=study-1', 'comparison', 'study-1'],
    ['/estudos/study-1/replay?executionId=run-1&day=3', 'replay', 'study-1'],
    ['/estudos/study-1/apresentacao', 'presentation', 'study-1'],
  ])('maps %s to typed %s context', (url, routeId, studyId) => {
    expect(routeChatContext(url)).toMatchObject({ routeId, studyId, helpId: null });
  });

  it('preserves selected scenario, execution and replay day without accepting malformed day', () => {
    expect(routeChatContext('/estudos/s/diagnostico?scenarioId=base')).toMatchObject({ scenarioId: 'base', diagnosticExecutionId: null, replayDay: null });
    expect(routeChatContext('/estudos/s/replay?executionId=run&day=4')).toMatchObject({ diagnosticExecutionId: 'run', replayDay: 4 });
    expect(routeChatContext('/estudos/s/replay?executionId=run&day=-1')?.replayDay).toBeNull();
    expect(routeChatContext('/estudos/s/diagnostico?scenarioId=base&executionId=run-1')?.diagnosticExecutionId).toBe('run-1');
    expect(routeChatContext('/estudos/s/apresentacao?cenario=base&execucao=run-1#premissas'))
      .toMatchObject({ routeId: 'presentation', studyId: 's', scenarioId: 'base', diagnosticExecutionId: 'run-1' });
    expect(routeChatContext('/estudos/s/apresentacao?cenario=hyp&execucao=run-2&comparacao=run-1&dia=31'))
      .toMatchObject({ routeId: 'presentation', comparisonExecutionId: 'run-1', replayDay: 31 });
    expect(routeChatContext('/comparar?studyId=s&baseExecutionId=base-1&hypothesisExecutionId=hyp-1'))
      .toMatchObject({ comparisonExecutionId: 'base-1', diagnosticExecutionId: 'hyp-1' });
    expect(routeChatContext('/comparar?studyId=s&baseExecutionId=%20&hypothesisExecutionId=hyp-1')?.comparisonExecutionId).toBeNull();
  });

  it.each(['/login', '/auth/callback', '/auth/definir-senha', '/estudos/s/imprimir', '/estudos/s/print'])
  ('omits chat on %s', (url) => expect(routeChatContext(url)).toBeNull());
});
