# Aceitação técnica — Front-end Etapa 4 MVP

Estado: em execução. Este documento registra evidências incrementais; não declara
prontidão para produção.

## Base

- base: `origin/main` em `a9a633ca9acb2228af7b775edf993d9b818ab8d4`;
- ambiente: Node 24.19.0, npm 11.17.0 e Python 3.14.4;
- planejamento copiado para worktree isolado e verificado contra
  `docs/frontend/etapa-4-planejamento.sha256`: 5/5 arquivos íntegros.

## Baseline antes da implementação

- `npm run test:unit`: 388 testes aprovados em 51 arquivos;
- `npm run lint`: exit code 0;
- `npm run typecheck`: exit code 0;
- `npm run build`: exit code 0;
- `npm run test:e2e`: 15 testes aprovados;
- `.venv\Scripts\python.exe -m pytest -q`: 772 aprovados, 2 ignorados;
- `.venv\Scripts\python.exe -O -m pytest -q`: 772 aprovados, 2 ignorados.

Na primeira partida fria da suíte unitária, dois testes de roteamento excederam o
timeout de cinco segundos sob concorrência. O arquivo isolado passou 25/25 e a
reexecução integral passou 388/388. Nenhum código foi alterado para mascarar o
evento.

## Checkpoint T1 — MOT-78

- RED observado para derivação por Perfil antes de `profileMvp.ts` existir;
- RED observado para request/sources antes da implementação;
- RED observado para proveniência sintética por ordem;
- RED observado para fingerprints com proveniência trocada;
- RED observado para transformações de hipótese;
- RED observado para criação de Estudo por Perfil e append de cenário;
- auditoria encontrou e levou a testes adicionais de precisão decimal, PTAX
  estritamente positiva, validação na fronteira HTTP e divergência de linhagem;
- gate focado: 59 testes aprovados em seis arquivos;
- gate adicional pós-auditoria: 15 testes de Perfil e 16 testes de domínio aprovados;
- `npm run typecheck`: exit code 0.

O checkpoint T1 não cria commit. As evidências finais, navegador, duração e os dois
fluxos E2E serão registrados no fechamento da T4.

## Checkpoint T2 — MOT-79

- seleção de Perfis restrita a versões ativas com evidência anexada;
- aviso explícito de origem real agregada ou sintética;
- criação de um novo Estudo sintético, sem sobrescrever o Estudo aberto;
- hipóteses observadas limitadas a janela e custos; hipóteses por Perfil incluem
  volume, mix, ticket e prazo;
- retry de persistência preserva a hipótese pendente e devolve foco ao erro;
- gate focado: 35 testes aprovados; lint e typecheck aprovados.

## Checkpoint T3 — MOT-80

- diagnóstico seleciona cenário por `scenarioId`, com fallback documentado para a
  base, e isola histórico, terminal, retry e resume por cenário;
- comparação exige seleção explícita de duas execuções atuais e compatíveis;
- 30 métricas distribuídas nos sete eixos, delta decimal e indisponibilidade
  preservada;
- p50 sintético marcado como descritivo e não pareado;
- gate focado: 31 testes aprovados; lint, typecheck e build aprovados.

## Checkpoint T4 — MOT-81

- dois percursos Chromium cobrem Caso Observado e dois Perfis, inclusive criação da
  hipótese e preservação da autoridade de origem;
- regressões antigas de Caso Observado e sintético passaram a conferir a rota
  canônica `/carteira/:studyId`, já exigida pelo roteador;
- documentação operacional registra leitura segura e evolução posterior A/B/C;
- suíte unitária final: 430 testes aprovados em 59 arquivos;
- Python normal e `-O`: 772 aprovados e 2 ignorados em cada execução;
- lint, typecheck e build aprovados; o build mantém apenas o aviso informativo de
  chunk superior a 500 kB;
- os dois E2E novos passaram duas vezes seguidas: 2/2 em 16,7 s e 2/2 em 17,7 s;
- Playwright integral: 17/17 aprovados em Chromium local, em 1,2 min.

## Decisão

**PASS para testes internos do MVP.** A decisão não autoriza push, PR, merge, deploy
ou uso em produção.

O MVP entrega hipótese e comparação sem descartar o Motor: mantém dados reais
importados, geração sintética por Perfil, P0, custos, diagnóstico robusto e os sete
eixos. Comparação estatística pareada, modelos temporais/comportamentais mais ricos
e endurecimento operacional permanecem explicitamente nas evoluções A/B/C descritas
em `docs/frontend/etapa-4-mvp-operacao.md`.

Durante o E2E sintético foi reproduzida uma limitação anterior à Etapa 4: algumas
sementes com custos não nulos falham na igualdade decimal exata entre economia
agregada e economia por mecanismo. Como `motor/` e `servidor/` estão fora deste
escopo, a fixture de dez repetições é economicamente neutra. O request capturado foi
reexecutado diretamente no worker para confirmar a causa; ela está registrada no
guia operacional e não foi apresentada como correção do Motor.
