# Front-end — Etapa 5: Replay temporal

**Data:** 2026-09-22  
**Status:** aprovada para o MVP e reconciliada com os contratos da base  
**Deriva de:** `2026-09-19-frontend-motor-de-fluxo-design-v2.md`  
**Base técnica:** `origin/main` em `6c623a806d03962ef6e21af22a3edc69f9b1aa78`  
**Referência visual aprovada:** `Fronteira Viva`, fornecida pelo Gabriel em 2026-09-22

## 1. Objetivo

Permitir que o usuário acompanhe uma repetição específica do Motor de Fluxo ao
longo de todo o horizonte, entendendo quando ordens chegam, como as filas evoluem,
quando a P0 fecha um ciclo, quanto volume fica casado no agregado e quanto resíduo
cruza a fronteira em cada direção.

O Replay precisa ser fiel ao resultado canônico, determinístico ao avançar ou voltar
no tempo e visualmente legível. Movimento representa somente uma transição real:
chegada, fechamento, composição visual do casado, atualização de saldo ou remessa.

## 2. Resultado do MVP rápido

O primeiro incremento funcional entrega:

- uma rota de Replay acessível a partir de uma execução diagnóstica concluída;
- uma repetição selecionada e identificada por seed;
- todos os dias do horizonte, inclusive dias sem eventos;
- play, pause, velocidades 1×/2×/4×, dia anterior, próximo dia, seleção direta e
  próximo fechamento;
- cena `Brasil → CNR/Fronteira → Exterior`, baseada na direção visual aprovada;
- cartões de ordens abertas dos lados OUT e IN;
- animações discretas acionadas somente por eventos;
- linhas temporárias que explicam a decomposição do casado agregado;
- valores acumulados e do dia para casado, remetido OUT, remetido IN e aberto;
- diário textual sincronizado com o estado visual;
- ordenação por chegada e por prioridade EDF;
- reconstrução idêntica ao voltar, avançar, arrastar a linha do tempo ou recarregar.

Este recorte é suficiente para testes internos da Etapa 5. Comparação sincronizada
com baseline, troca entre várias repetições, modo Apresentação e inspeção avançada
entram nas evoluções posteriores descritas na seção 14.

## 3. Fonte de verdade e fronteiras

O pacote Python `motor` continua sendo a única fonte de verdade para ordens, ciclos,
alocações, P0, EDF, custos e conservação. O servidor transforma um resultado já
calculado em um contrato temporal; não reexecuta regras no navegador.

O front-end possui somente três responsabilidades:

1. reconstruir um `ReplayState` a partir de eventos canônicos;
2. escolher quais transições animar quando o dia muda;
3. apresentar valores já reconciliados pelo servidor.

React não calcula netting, não escolhe cobertura EDF, não decide vencimento e não
recalcula custo. A camada visual também não infere eventos pela diferença entre
dois totais: cada chegada, fechamento, alocação e remessa vem explicitamente no
contrato.

## 4. Lacunas atuais que a Etapa 5 precisa fechar

A `main` já possui ordens, ciclos e alocações completos para a repetição diagnóstica
selecionada. Ainda faltam, como contrato publicado:

- série com todos os dias, inclusive vazios;
- gatilho explícito de cada fechamento;
- eventos temporais ordenados e estáveis;
- estado aberto ao fim de cada dia;
- decomposição separada de remessa OUT e IN;
- seleção de Replay ligada de forma persistente à execução;
- baseline temporal sem agrupamento;
- endpoint e tipos TypeScript próprios para Replay.

O MVP fecha as cinco primeiras lacunas e usa a repetição diagnóstica selecionada já
existente. Persistência explícita da seleção e baseline sincronizado são evoluções
posteriores para evitar ampliar o primeiro recorte.

## 5. Contrato temporal

O servidor publica um documento imutável e versionado:

```ts
type ReplayDocumentV1 = Readonly<{
  apiVersion: '1.0.0';
  diagnosticExecutionId: string;
  scenarioId: string;
  scenarioRevision: number;
  repetitionId: string;
  participantSeeds: Readonly<Record<string, string>>;
  period: ReplayPeriod;
  policy: 'P0';
  currency: 'BRL';
  orders: readonly ReplayOrder[];
  days: readonly ReplayDay[];
  totals: ReplayTotals;
  motorVersion: string;
  executionFingerprint: string;
  resultFingerprint: string;
}>;

type ReplayPeriod = Readonly<{
  mode: 'LEGADO' | 'NATURAL';
  warmupDays: number;
  measurementStartDay: number;
  measurementEndDay: number;
  settlementEndDay: number;
}>;

type ReplayOrder = Readonly<{
  id: string;
  clientId: string;
  direction: 'OUT' | 'IN';
  knownDay: number;
  deadlineDay: number;
  valueBrl: string;
  cohort: 'WARMUP' | 'MEASUREMENT';
}>;

type ReplayDay = Readonly<{
  day: number;
  events: readonly ReplayEvent[];
  closing: ReplayClosing | null;
  endState: ReplayEndState;
}>;

type ReplayEvent =
  | Readonly<{ sequence: number; kind: 'ORDER_ARRIVED'; orderId: string }>
  | Readonly<{
      sequence: number;
      kind: 'ALLOCATION';
      orderId: string;
      allocationType: 'CASADO' | 'REMETIDO';
      valueBrl: string;
      direction: 'OUT' | 'IN';
      matchingOrigin: 'INTRA_CLIENTE' | 'INTER_CLIENTE' | null;
    }>;

type ReplayClosing = Readonly<{
  triggers: readonly ('WINDOW' | 'DEADLINE' | 'HORIZON_END')[];
  grossOutBrl: string;
  grossInBrl: string;
  matchedPositionBrl: string;
  matchedContributionBrl: string;
  intraClientPositionBrl: string;
  interClientPositionBrl: string;
  remittedOutBrl: string;
  remittedInBrl: string;
  flowSegments: readonly ReplayFlowSegment[];
}>;

type ReplayEndState = Readonly<{
  openOutBrl: string;
  openInBrl: string;
  matchedPositionAccumulatedBrl: string;
  measuredMatchedContributionAccumulatedBrl: string;
  remittedOutAccumulatedBrl: string;
  remittedInAccumulatedBrl: string;
}>;

type ReplayTotals = Readonly<{
  measuredGrossBrl: string;
  measuredMatchedContributionBrl: string;
  measuredAutonettingContributionBrl: string;
  measuredMultilateralContributionBrl: string;
  measuredRemittedBrl: string;
  netabilityFraction: string;
  executionMatchedPositionBrl: string;
  executionRemittedOutBrl: string;
  executionRemittedInBrl: string;
}>;
```

Valores monetários atravessam o fio como decimais canônicos em string. `days` possui
exatamente `settlementEndDay + 1` itens, em ordem crescente, do dia `0` ao fim da
liquidação, seguindo a semântica inclusiva de `executar_p0`. Em período `NATURAL`,
`measurementStartDay = warmupDays`, `measurementEndDay = warmupDays +
measurementDays - 1` e `settlementEndDay` pode ser posterior para respeitar os
prazos das ordens conhecidas durante a medição. Ordens conhecidas antes do início
são `WARMUP`; ordens conhecidas dentro da janela medida são `MEASUREMENT`.
`sequence` é único dentro do dia e fixa a ordem de animação e do diário.

`matchedPositionBrl` conta a posição agregada uma vez, como `Ciclo.casado`.
`matchedContributionBrl` soma as alocações `CASADO` dos dois lados e é a grandeza
que entra na fórmula canônica `netabilityFraction =
measuredMatchedContributionBrl / measuredGrossBrl`. Em período natural, somente a
contribuição de ordens da coorte `MEASUREMENT` entra nessa razão; o Replay continua
mostrando o aquecimento e a liquidação para explicar o estado operacional.

## 6. Validação e reconciliação no servidor

Antes de publicar `ReplayDocumentV1`, o servidor verifica:

- todos os IDs de alocação referenciam ordens do documento;
- soma das alocações por ordem é igual ao valor da ordem no fim do horizonte;
- nenhuma soma parcial por ordem excede seu valor;
- `CASADO` OUT e `CASADO` IN são iguais por ciclo;
- a soma das contribuições `CASADO` de cada ciclo é duas vezes sua posição casada;
- totais diários reconciliam com os ciclos canônicos;
- acumulados do último dia reconciliam com o resultado da repetição;
- `REMETIDO` é separado por direção da ordem;
- dias são contínuos, eventos são ordenados e valores são finitos e não negativos;
- execução, cenário, repetição, seed, versão e fingerprint correspondem ao resultado
  solicitado;
- em período natural, coorte, início/fim de medição e fim de liquidação reconciliam
  com `ids_ordens_medidas` e com o manifesto canônico.

Falha de qualquer invariante impede a publicação do Replay e retorna erro público
`REPLAY_INCONSISTENTE`, sem enviar um documento parcial. Os gatilhos de fechamento
são uma lista em ordem canônica `WINDOW`, `DEADLINE`, `HORIZON_END`, pois mais de
um pode ocorrer no mesmo dia.

## 7. Decomposição visual do casado

O motor calcula posição agregada de tesouraria e não cria pareamento físico entre
ordens. A direção visual aprovada, entretanto, usa conexões entre cartões para tornar
o fechamento compreensível. Essas conexões obedecem a um contrato separado de
apresentação:

- são calculadas exclusivamente no servidor, numa função pura, a partir das
  alocações `CASADO` do mesmo ciclo;
- reproduzem a hierarquia observada: primeiro `INTRA_CLIENTE`, agrupado por cliente,
  e depois `INTER_CLIENTE`; cada fase usa waterfall determinístico em ordem EDF
  `(deadlineDay, orderId)`;
- cada segmento liga somente parcelas contábeis do mesmo fechamento;
- a soma dos segmentos é exatamente `matchedBrl`;
- não são persistidas como relação de domínio;
- não aparecem na API como “match”, “contraparte” ou “liquidação entre clientes”;
- a tela mantém visível a legenda “decomposição ilustrativa do agregado casado”.

O tipo de apresentação é:

```ts
type ReplayFlowSegment = Readonly<{
  closingDay: number;
  outOrderId: string;
  inOrderId: string;
  valueBrl: string;
  matchingOrigin: 'INTRA_CLIENTE' | 'INTER_CLIENTE';
  meaning: 'ILLUSTRATIVE_AGGREGATE_DECOMPOSITION';
}>;
```

Essa decisão substitui, apenas para o Replay, a proibição absoluta de linhas entre
cartões da especificação global. Continua proibido tratar a linha como pareamento
físico, custódia, benefício individual ou fato jurídico.

## 8. Máquina temporal e reconstrução

O front-end recebe o documento inteiro e usa funções puras:

```ts
type ReplayVisibleOrder = Readonly<{
  orderId: string;
  clientId: string;
  direction: 'OUT' | 'IN';
  knownDay: number;
  deadlineDay: number;
  originalValueBrl: string;
  openValueBrl: string;
  cohort: 'WARMUP' | 'MEASUREMENT';
}>;

type ReplayState = Readonly<{
  day: number;
  periodPhase: 'WARMUP' | 'MEASUREMENT' | 'SETTLEMENT';
  openOrders: readonly ReplayVisibleOrder[];
  events: readonly ReplayEvent[];
  closing: ReplayClosing | null;
  endState: ReplayEndState;
  totals: ReplayTotals;
}>;

type ReplayVisualTransition =
  | Readonly<{ kind: 'ARRIVAL'; orderId: string }>
  | Readonly<{ kind: 'CLOSING'; triggers: ReplayClosing['triggers'] }>
  | Readonly<{ kind: 'FLOW_SEGMENT'; segment: ReplayFlowSegment }>
  | Readonly<{ kind: 'BALANCE_UPDATED'; orderId: string; openValueBrl: string }>
  | Readonly<{ kind: 'REMITTANCE'; orderId: string; direction: 'OUT' | 'IN'; valueBrl: string }>
  | Readonly<{ kind: 'ORDER_SETTLED'; orderId: string }>;

function replayStateAt(document: ReplayDocumentV1, day: number): ReplayState;
function replayTransition(
  previous: ReplayState,
  next: ReplayState,
): readonly ReplayVisualTransition[];
```

`replayStateAt` deriva o estado exclusivamente do documento e do dia. Ir do dia 0 ao
9, voltar ao 3 ou carregar diretamente o 3 produz o mesmo `ReplayState` serializado.
`replayTransition` compara dois estados já válidos e gera comandos visuais; seus
resultados nunca alimentam cálculos de negócio.

O reducer somente subtrai alocações explícitas dos valores originais usando decimal
exato e confere os agregados `endState` publicados. Ele não escolhe pares, prioridade,
gatilho, remessa, coorte ou métrica. Divergência é erro de contrato, nunca correção
financeira local.

Ao navegar para frente por um dia, a interface executa, quando existirem:

1. chegada dos novos cartões;
2. reposicionamento estável das filas;
3. destaque do fechamento e de seu gatilho;
4. desenho dos segmentos da decomposição;
5. atualização das parcelas e saída dos cartões liquidados;
6. remessa dos resíduos vencidos na direção correta;
7. atualização dos valores do dia e acumulados.

Salto, retorno, seleção direta ou reload aplicam o estado final sem reproduzir todas
as animações intermediárias. O usuário pode solicitar novamente a animação do dia
atual por uma ação explícita.

## 9. Cena e comportamento visual

A cena segue a referência `Fronteira Viva`:

- Brasil à esquerda, faixa CNR/Fronteira no centro e Exterior à direita;
- ordens OUT entram pelo Brasil; ordens IN entram pelo Exterior;
- cartões mostram ID, cliente, valor aberto e prazo;
- linhas verdes representam somente a decomposição ilustrativa de `CASADO`;
- linhas vinho representam `REMETIDO` e apontam para a direção da travessia;
- cartões parcialmente alocados permanecem com o saldo correto;
- cartões totalmente alocados saem depois da leitura da transição;
- conexões ficam ancoradas aos cartões durante toda a animação;
- não há movimento contínuo, flutuação, partículas ou repetição decorativa.

O cabeçalho mostra três valores acumulados: casado, remetido total e taxa de
netabilidade. A cena mostra também, sem esconder atrás de interação, os valores do
dia: casado, remetido OUT, remetido IN e posição ainda aberta.

## 10. Controles e estados

- **Tocar/Pausar:** controla somente o avanço automático;
- **1×/2×/4×:** altera o intervalo entre dias, não a duração relativa interna de um
  evento;
- **Dia anterior/seguinte:** aplica um único estado;
- **Linha do tempo:** permite selecionar qualquer dia;
- **Próximo fechamento:** pula para o próximo dia com `closing != null`;
- **Chegada/EDF:** reordena somente cartões abertos, preservando IDs e valores;
- **Repetir evento:** reapresenta as transições do dia sem alterar o estado;
- **Fim:** mantém o último dia estável e muda o botão principal para “Recomeçar”.

Se `prefers-reduced-motion` estiver ativo, todas as transições se tornam mudanças
instantâneas e o conteúdo permanece completo.

## 11. Rota, carregamento e recuperação

Rota de tela:

```text
/estudos/:studyId/replay?executionId=:executionId
```

A tela resolve `executionId` no Estudo persistido no IndexedDB, exige um terminal
`DIAGNOSTIC/SUCCEEDED` e envia seu `DiagnosticEnvelope` imutável ao endpoint
autenticado `POST /api/v1/replays`. O endpoint é estateless: valida o envelope e
produz o documento temporal sem consultar o executor efêmero nem presumir que o
backend possui o Estudo local. Assim, um resultado já persistido continua abrindo
depois da expiração do job em memória. O `diagnosticExecutionId` local é mantido
separado de `jobId`, `repetitionId` e `executionId` do envelope canônico.

A rota local valida owner, Estudo, cenário, execução terminal e repetição
selecionada; o servidor valida versões, identidades, fingerprints e reconciliação.
Estados públicos:

- `REPLAY_NAO_DISPONIVEL`: execução sem dados temporais;
- `EXECUCAO_NAO_ENCONTRADA`: ID não pertence ao Estudo ou ao owner;
- `EXECUCAO_NAO_TERMINAL`: execução ainda não terminou;
- `REPETICAO_NAO_SELECIONADA`: diagnóstico sem repetição de referência;
- `REPLAY_INCONSISTENTE`: reconciliação do servidor falhou;
- `VERSAO_REPLAY_NAO_SUPORTADA`: versão futura do documento.

Falha mantém o contexto do Estudo e oferece retorno ao Diagnóstico. Não existe
retry automático para inconsistência; indisponibilidade transitória da API permite
retry explícito.

## 12. Acessibilidade e desempenho

- todos os controles possuem nome, estado e foco visível;
- dia e resumo factual são anunciados por `aria-live="polite"`, sem anunciar cada
  quadro da animação;
- cartões e segmentos possuem alternativa textual no diário;
- cor nunca é o único marcador de direção ou tipo;
- a ordem de foco segue controles, métricas, cena e diário;
- zoom de 200% mantém todo conteúdo alcançável;
- o contrato aceita no máximo 1.000 ordens e 730 dias de liquidação, e o orçamento
  de aceite mede explicitamente o cenário-alvo de 1.000 ordens e 365 dias antes de
  afirmar suporte interativo;
- renderização usa somente ordens visíveis no estado atual e segmentos do fechamento
  atual;
- animações usam transformações e opacidade; geometria das linhas é recalculada no
  início da transição e em resize, não continuamente.

## 13. Testes e critérios de aceite

1. documento possui `horizonDays + 1` dias, de `0` a `horizonDays`, inclusive vazios;
2. conservação por ordem e global falha fechado no servidor;
3. casado OUT e IN reconciliam por ciclo;
4. remessas OUT e IN aparecem separadas e somam o total canônico;
5. `replayStateAt` é idêntico por avanço, salto, retorno e reload;
6. eventos do dia obedecem `sequence`;
7. cartão novo só anima no dia de chegada;
8. fechamento desenha segmentos cuja soma é exatamente o casado do ciclo;
9. parcela e saldo do cartão permanecem corretos após alocação parcial;
10. cartão liquidado sai somente depois da transição legível;
11. remessa cruza a fronteira na direção correta;
12. linhas permanecem ancoradas durante resize e transição;
13. dia vazio não produz movimento operacional;
14. próximo fechamento ignora dias sem fechamento e respeita o fim;
15. play, pause, velocidades, seleção e recomeço são determinísticos;
16. ordenação Chegada/EDF não altera valores nem identidade;
17. diário descreve os mesmos eventos e valores da cena;
18. modo de movimento reduzido preserva toda a informação;
19. rota rejeita owner, execução ou versão inválidos sem vazar existência;
20. E2E abre execução real da Etapa 4, reproduz chegada, fechamento, casado,
    remessas nas duas direções, salto, retorno e reload;
21. captura visual cobre estado inicial, chegada, fechamento, alocação parcial,
    remessa e fim;
22. regressões das Etapas 1–4 permanecem verdes.

## 14. Evoluções posteriores declaradas

### Evolução 5A — seleção e inspeção

- persistir a repetição escolhida para Replay na execução;
- trocar entre repetições elegíveis;
- painel de inspeção por ordem, ciclo e evento;
- filtros e busca para cenários grandes;
- deep link de dia e fechamento.

### Evolução 5B — comparação temporal

- construir baseline temporal sem agrupamento no backend;
- reproduzir agrupado e baseline no mesmo relógio;
- faixa sincronizada de diferenças por dia;
- reconciliar ambos com os envelopes de comparação existentes.

### Evolução 5C — apresentação e escala

- modo Apresentação com densidade reduzida;
- agregação visual para milhares de ordens sem perder inspeção;
- exportação de quadros para relatório;
- regressão visual ampliada e orçamento de desempenho medido.

As evoluções reutilizam `ReplayDocumentV1`, `ReplayState` e a máquina temporal. Elas
adicionam seletores e projeções, sem substituir o núcleo do MVP.

## 15. Fora do escopo do MVP

- modificar P0, EDF, custos, geração ou simulação;
- executar uma nova simulação dentro do Replay;
- calcular benefício por cliente;
- persistir segmentos ilustrativos como pareamento;
- baseline sincronizado e comparação lado a lado;
- seleção persistente de outra repetição;
- edição de cenário, hipótese ou premissa;
- chat, PDF, publicação, compartilhamento ou colaboração em tempo real;
- layout completo para celular.

## 16. Decomposição executável recomendada

O plano técnico deve dividir o MVP em quatro entregas independentes:

1. **Contrato e reconciliação temporal:** documento V1, adaptador, invariantes e
   endpoint autenticado;
2. **Máquina de Replay:** tipos gerados, `replayStateAt`, transições, controles e
   integração com execução selecionada;
3. **Fronteira Viva:** cena, cartões, segmentos, remessas, diário e acessibilidade;
4. **Integração e aceite:** E2E real, regressão visual, limites, documentação e
   regressão das Etapas 1–4.

Essa divisão entrega algo funcional cedo, mas mantém contrato, cálculo e animação
separados. Erros visuais não alteram números; erro de reconciliação impede o Replay.

## 17. Riscos e respostas

| Risco | Resposta |
|---|---|
| front-end virar segunda implementação do motor | eventos e saldos vêm do servidor; reducer só reconstrói estado |
| linha visual ser interpretada como pareamento físico | tipo e legenda explícitos; segmentos não persistidos; teste de linguagem |
| valor duplicado no casado | reconciliação distingue posição agregada e contribuição por direção |
| voltar no tempo produzir outro resultado | `replayStateAt` puro e testes por caminhos equivalentes |
| linhas se soltarem dos cartões | geometria medida após layout estável e coberta por teste visual |
| animação esconder saldo parcial | saldo canônico permanece no cartão e no diário antes da saída |
| documento grande travar a tela | estado derivado por dia, renderização do conjunto visível e orçamento para 1.000 × 365 |
| baseline improvisado no navegador | comparação temporal fica fora do MVP até existir contrato canônico próprio |

## 18. Decisão técnica

Implementar o MVP sobre um contrato temporal canônico produzido pelo servidor e uma
máquina de estado pura no front-end. A cena aprovada é uma projeção desse estado e
usa movimento apenas para comunicar eventos reais. Linhas entre cartões são uma
decomposição ilustrativa e determinística do agregado, nunca uma nova regra do motor.
