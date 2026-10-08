# Front-end — Etapa 4 MVP de análise em quatro dias

**Data:** 2026-09-20

**Status:** desenho aprovado para planejamento; não autoriza implementação

**Prazo máximo:** quatro dias úteis de implementação

**Base técnica:** `origin/main` em
`a9a633ca9acb2228af7b775edf993d9b818ab8d4`

**Auditoria:** `docs/frontend/etapa-4-auditoria-partida.md`

**Visão completa posterior:**
`docs/superpowers/specs/2026-09-20-frontend-etapa-4-design.md`

## 1. Decisão

Entregar primeiro um recorte vertical para testes internos, reutilizando os contratos,
a preparação, o executor e o `StudyDocument` V3 existentes. O MVP preserva dois
caminhos: executar ordens reais já importadas e simular carteiras explicitamente
derivadas de Perfis Operacionais reais. Em ambos, o usuário cria uma hipótese,
executa base e hipótese e compara seus resultados.

O prazo é obtido adiando infraestrutura de produção, não reduzindo o motor. Netting,
P0, EDF, custos e resultados continuam sendo calculados pelo backend existente. A UI
não reimplementa o motor.

## 2. Resultado observável

Ao final do MVP, o usuário consegue:

1. escolher uma carteira observada confirmada e executá-la sem alterar suas ordens;
2. criar uma hipótese observada que muda apenas janela ou os sete custos escalares;
3. escolher uma ou mais versões imutáveis e disponíveis de Perfil Operacional;
4. ver volume mensal, ticket mediano e fração OUT derivados de cada Perfil;
5. preencher, por Perfil, os campos não determinados: arquétipo, seed, prazo, eFX,
   finalidade OUT e finalidade IN;
6. confirmar os valores e materializar um cenário-base sintético por meio de
   `/api/v1/preparacoes`;
7. criar uma hipótese simulada sem alterar o cenário-base;
8. modificar volume, mix OUT/IN, ticket, prazo, janela e os sete custos escalares;
9. regenerar as ordens quando a hipótese simulada altera geração;
10. executar base e hipótese pelo executor já entregue na Etapa 3;
11. visualizar diferenças de entrada e de resultado nos sete eixos já existentes;
12. recarregar o Estudo e reencontrar cenários e execuções como documentos V3 comuns.

O produto chama o resultado de **diferença agregada simulada**. Não usa “efeito
marginal”, “causa”, “previsão” ou “benefício individual”.

## 3. Dois caminhos e escopo de hipóteses

### 3.1 Caminho observado

O caminho observado reutiliza `PortfolioSource.kind = 'OBSERVED_CASE'`. As ordens,
identidades, valores, direções, datas, eFX, finalidades e proveniência permanecem
exatamente como foram confirmados na importação. A hipótese pode mudar apenas janela
e as sete premissas escalares de custo; `iof_por_finalidade` permanece congelado.
Nenhuma ação da Etapa 4 sobrescreve ou transforma o caso importado.

### 3.2 Caminho simulado a partir de Perfil

O caminho simulado começa em um ou mais Perfis imutáveis anexados ao Estudo observado.
Ao confirmar a preparação, a aplicação cria **outro Estudo V3**, cuja base é a
simulação por Perfil; nunca substitui o cenário observado que serviu de ponto de
partida. Cada
Perfil selecionado representa um participante sintético distinto e preserva
`profile.id`, `companyId` e `documentFingerprint` no rascunho da tela. Selecionar dois
ou mais Perfis permite testar o comportamento multilateral sem inventar empresas
adicionais. Com apenas um Perfil, a interface avisa que o cenário não representa uma
pool multilateral.

A carteira resultante continua sendo `SYNTHETIC`: os Perfis são evidência real
agregada, mas as ordens geradas não são apresentadas como observadas nem como previsão.

### 3.3 Matriz de alterações

| Grupo | Observado | Simulado por Perfil | Regenera ordens sintéticas? | Valor analítico |
|---|---:|---:|---:|---|
| Volume | não | multiplicador global positivo | sim | efeito de escala |
| Mix | não | deslocamento global da fração OUT, limitado a 0–1 | sim | equilíbrio direcional |
| Ticket | não | multiplicador global positivo | sim | granularidade |
| Prazo | não | manter atual, regra comum `PROFILE` ou prazo fixo válido | sim quando alterado | urgência |
| Janela | sim | sim | não | trade-off netting × espera |
| Custos | sete premissas escalares | sete premissas escalares | não | sensibilidade econômica |

No caminho simulado, os parâmetros não listados permanecem congelados entre base e
hipótese: seleção de Perfis, identidade de participante, arquétipo do gerador, seed,
eFX, finalidade por direção, horizonte, versão do gerador e versão do motor. O
formulário sempre mostra os valores congelados. Os multiplicadores de volume e ticket
e o deslocamento de mix são aplicados igualmente a todos os participantes; mudanças
por participante e regras de IOF por finalidade ficam para a Evolução B. As sete
premissas escalares são `iof_out`, `iof_in`, `carry_cnr`, `spread_rail_bps`,
`custo_fixo_remessa`, `custo_oportunidade_aa` e `ptax`.

## 4. Arquitetura mínima

### 4.1 Carteira observada

O fluxo existente de `resolvePortfolioSource` materializa `OBSERVED_CASE` diretamente
das ordens confirmadas. A Etapa 4 apenas cria um cenário-base V3 com esse snapshot e
clona premissas para a hipótese. Não chama preparação e não cria ordens sintéticas.

### 4.2 Perfil para entrada efetiva

Um adaptador puro no front-end produz um rascunho de `EffectiveInput`:

```ts
type ProfileMvpParticipantDraft = Readonly<{
  profileId: string;
  companyId: string;
  profileFingerprint: string;
  participantId: string;
  monthlyVolumeBrl: string;
  ticketMedianBrl: string;
  outFraction: string;
  generatorProfile: EffectiveParticipant['profile'];
  seed: EffectiveParticipant['seed'];
  deadline: EffectiveParticipant['deadline'];
  efx: boolean;
  purposeOut: string;
  purposeIn: string;
}>;

async function deriveProfileMvpParticipantDraft(
  profile: OperationalProfileVersion,
  explicit: ProfileMvpExplicitFields,
  expectedOwnerSub: string,
): Promise<ProfileMvpDerivation>;

function buildProfileMvpEffectiveInput(
  participants: readonly ProfileMvpParticipantDraft[],
  context: ExistingScenarioContext,
): EffectiveInput;
```

Somente três valores são derivados:

- volume mensal = `metrics.volume.totalBrl / coverage.coveredDays * 30`;
- ticket mediano = `metrics.ticketsBrl.p50`;
- fração OUT = `metrics.direction.value.out.fraction`.

Qualquer métrica necessária diferente de `AVAILABLE`, cobertura não positiva ou campo
explícito ausente bloqueia a materialização. Não há fallback silencioso.
Antes da derivação, a aplicação recalcula e valida fingerprints do Perfil, owner,
compatibilidade e unicidade de empresa; não confia apenas nos campos armazenados.

O usuário confirma todos os rascunhos. A aplicação chama uma vez o endpoint de
preparação existente com a lista completa e resolve a resposta pelo fluxo atual de
`PortfolioSourceSnapshot`. A fonte executável permanece honestamente `SYNTHETIC`;
cada Perfil é copiado integralmente para `evidenceSnapshots` do novo Estudo. Como
uma resposta pode conter ordens de Perfis diferentes, o snapshot associa
`provenanceByOrder` a cada ordem a partir do seu `cliente_id`; não usa uma origem
agregada ambígua. Para esses novos snapshots sintéticos, a associação por ordem
também participa dos fingerprints; documentos legados sem o campo mantêm o hash
anterior.

### 4.3 Cenário-base e hipótese

Não há `StudyDocument` V4 no MVP. Dentro de cada Estudo, uma operação de domínio acrescenta um novo
`ScenarioDocument` à lista `StudyDocumentV3.scenarios`, preservando o cenário-base:

```ts
async function appendScenario(
  study: StudyDocument,
  draft: ScenarioDraft,
  now: string,
): Promise<StudyDocument>;
```

A hipótese é um cenário V3 comum com novo ID, revisão 1, nome explícito e snapshots
integrais. Sua relação com a base é mantida no estado da tela de comparação; ainda
não é uma entidade persistida de linhagem. Após reload, os dois cenários e as
execuções continuam disponíveis, mas o usuário pode precisar selecioná-los novamente.
O cenário novo é salvo por `StudyController.flush()` antes de qualquer navegação;
conflito ou falha preserva o formulário e oferece retry explícito.

No caminho simulado, alterações de volume, mix, ticket ou prazo clonam o
`generationInputSnapshot`, mudam somente os campos autorizados de todos os
participantes, preservam as seeds e chamam novamente
`/api/v1/preparacoes`. Alterações apenas de janela ou custo reutilizam as mesmas
ordens. No caminho observado, toda hipótese reutiliza as ordens importadas. O
resultado sempre passa pelos fingerprints e validadores já existentes.

Campos de geração que mudarem recebem nova `EffectiveSource` de estimativa do usuário
com o instante da hipótese. Campos preservados mantêm a origem anterior. Trocar a
regra de prazo também reconcilia `/deadline/mode` e a presença ou ausência de
`/deadline/days`; proveniência obsoleta nunca é carregada para a nova preparação.

### 4.4 Execução e comparação

Base e hipótese usam, sem bifurcação, o diagnóstico da Etapa 3. O MVP compara um
registro diagnóstico terminal selecionado de cada cenário. Quando o diagnóstico já
contiver 10, 30 ou 100 repetições, o MVP pode mostrar p50 contra p50 como descrição,
mas não pareia nem atribui diferenças por repetição; exibe a limitação
`UNPAIRED_DIAGNOSTICS`. Para entrada fixa observada, o eixo de robustez econômica
continua indisponível como determina o contrato atual, enquanto os valores econômicos
da execução selecionada permanecem visíveis fora da alegação de distribuição.

Um módulo puro TypeScript, separado de componentes React, recebe dois registros
terminais válidos e devolve:

```ts
type MvpComparison = Readonly<{
  baseExecutionId: string;
  hypothesisExecutionId: string;
  inputChanges: readonly MvpInputChange[];
  axes: readonly MvpAxisDifference[];
  limitations: readonly MvpComparisonLimitation[];
}>;
```

O comparador:

- exige execuções `SUCCEEDED`;
- exige mesma versão do motor, contrato, horizonte e unidade;
- lê métricas já calculadas nos envelopes; não executa netting nem custo;
- calcula apenas `hipótese − base`, com unidade e direção visíveis;
- informa eixo indisponível sem convertê-lo em zero;
- rejeita diferenças fora dos seis grupos autorizados;
- compara somente pares da mesma família: observado × observado ou simulado ×
  simulado com a mesma seleção de Perfis;
- no observado, exige mesmo caso/revisão/ordens/proveniência; no simulado, exige o
  mesmo vínculo `(Perfil, fingerprint, participante)`, seeds, campos congelados e
  versões de preparação, gerador e motor;
- sempre mostra a ressalva de simulação sintética e comparação agregada.

Não existe endpoint de comparação no MVP. A subtração de resultados canônicos ocorre
no domínio do front-end, nunca dentro dos componentes de apresentação.

## 5. Interface

O fluxo fica dentro do Estudo:

1. **Escolher a origem** — carteira observada confirmada ou simulação por Perfis;
2. **Preparar a base** — ordens reais intactas ou valores derivados, campos
   explícitos, confirmação e geração sintética;
3. **Criar hipótese** — formulário mostra apenas alterações válidas para a origem,
   valores antes/depois e aviso quando haverá regeneração;
4. **Executar** — estado independente de base e hipótese, reutilizando progresso e
   erros existentes;
5. **Comparar** — resumo das entradas alteradas e tabela/gráfico dos sete eixos.

Para caber no hosting atual, a seleção usa somente queries sobre rotas existentes:
`/estudos/:studyId/diagnostico?scenarioId=...` e `/comparar?studyId=...`; o MVP não
cria deep links aninhados novos.

Os rótulos **Dados observados** e **Simulação baseada em Perfil** permanecem visíveis
na preparação, execução e comparação. Cor não é o único meio de distingui-los.

A tabela é a representação completa e acessível; gráfico é complementar. O fluxo
funciona por teclado, mantém foco visível, não depende apenas de cor e permanece
legível em zoom de 200%.

## 6. Erros e limites

Bloqueios obrigatórios:

- caso observado inválido, não confirmado, de outro owner ou com revisão divergente;
- Perfil inválido, de outro owner ou sem as três métricas disponíveis;
- campo explícito ausente;
- volume, ticket, fração OUT, prazo, janela ou custo fora do contrato atual;
- preparação ou execução sem resposta válida;
- tentativa de comparar execução não terminal, stale ou incompatível;
- mudança detectada fora do conjunto permitido para a origem;
- tentativa de comparar observado com simulado ou simulações baseadas em seleções de
  Perfis diferentes.

O MVP respeita integralmente os limites atuais de `EffectiveInput`, preparação e
execução. Não cria um novo limite de produto sem medição. Erros preservam o rascunho
do usuário e oferecem nova tentativa explícita; não há retry automático.

## 7. Testes e aceite de quatro dias

O aceite mínimo exige:

- teste de que o caminho observado preserva integralmente ordens e proveniência;
- testes unitários das três derivações por Perfil e de cada bloqueio por ausência;
- teste de dois Perfis produzindo dois participantes distintos na preparação;
- teste de transformação para os seis grupos de hipótese;
- prova de que as seeds, Perfis selecionados e campos congelados não mudam;
- prova de que base permanece imutável após criar hipótese;
- teste de regeneração para volume, mix, ticket e prazo;
- teste de reutilização das ordens reais e sintéticas para janela e custo;
- teste dos sete eixos, indisponibilidade e incompatibilidade;
- teste de componente do fluxo completo;
- um E2E observado → hipótese de janela → execução → comparação;
- um E2E Perfis → base sintética → hipótese de mix → execução → comparação;
- suíte completa Python normal e otimizada, testes web, typecheck e build.

O cronograma de implementação não pode exceder quatro dias úteis. Se um bloqueio
inesperado ameaçar o prazo, a ordem de preservação é: fluxo completo, seis grupos de
análise, correção dos resultados, testes de regressão e, por último, acabamento
visual não funcional. Nenhum corte pode mover cálculo do motor para a UI ou inventar
valores ausentes.

## 8. O que será adicionado depois

O pós-MVP é explícito e não está descartado. Ele fica organizado em três incrementos:

### Evolução A — proveniência e persistência de produto

- entidade imutável e versionada de Receita;
- endpoint próprio Perfil → Receita → materialização;
- origem `OPERATIONAL_PROFILE` com fingerprints encadeados;
- linhagem persistida entre cenário-base e hipótese;
- `StudyDocument` V4 e migrations V1/V2/V3 → V4;
- histórico append-only de variantes e comparações;
- reabertura da comparação já selecionada após reload;
- proteção e testes específicos de múltiplas abas, CAS e respostas tardias.

Essa evolução transforma o fluxo testável em histórico auditável e durável.

### Evolução B — hipóteses de composição

- adicionar e remover Perfis/participantes dentro de uma hipótese;
- mudanças específicas por participante;
- alterar arquétipo, eFX e finalidade por direção;
- alterar regras de IOF por finalidade;
- múltiplas receitas e múltiplas hipóteses por base;
- pareamento formal de seeds para participantes comuns;
- compatibilidade tipada entre estruturas diferentes.

Essa evolução amplia a pergunta de “como esta carteira reage?” para “como outra
composição de carteira reagiria?”.

### Evolução C — análise avançada e escala

- comparação canônica no servidor;
- distribuições pareadas de 10, 30 e 100 repetições;
- incerteza, percentis e estados parciais tipados;
- efeito marginal somente para alteração elementar elegível;
- benchmark de participantes, ordens, variantes, tempo, memória e payload;
- limites de produto baseados em medição;
- robustez completa de acessibilidade, reload, retry e concorrência;
- evidência formal de aceite e documentação operacional.

Essa evolução permite conclusões estatísticas mais robustas sem confundi-las com
causalidade real ou benefício individual.

## 9. Matriz agora × depois

| Capacidade | MVP de quatro dias | Evolução posterior |
|---|---|---|
| Dados reais importados | execução direta, ordens intactas | linhagem de comparação persistida |
| Perfil real como ponto de partida | um participante por Perfil, com três derivações confirmadas | Receita própria e proveniência por campo |
| Motor P0, EDF, netting e custos | integral, via backend atual | sem mudança prevista |
| Volume, mix, ticket e prazo | hipótese agregada | por participante e composição completa |
| Janela e custos | janela + sete escalares; IOF por finalidade congelado | regras por finalidade, histórico tipado e comparações múltiplas |
| Comparação | execução selecionada, sete eixos | servidor + distribuições pareadas |
| Marginal | não | somente alteração elementar elegível |
| Persistência | cenários e execuções V3 | variantes/comparações V4 append-only |
| Proveniência | Perfil no Estudo + source por campo e por ordem, sem entidade de linhagem | cadeia Perfil → Receita → materialização |
| Concorrência | garantias herdadas, sem casos novos | testes e guards específicos da Etapa 4 |
| Capacidade | limites atuais | benchmark e caps medidos |

## 10. Premissas e riscos aceitos

Premissas necessárias para cumprir quatro dias:

- `origin/main` integrado continua sendo a base de implementação;
- `/api/v1/preparacoes` e o executor da Etapa 3 permanecem estáveis;
- não há alteração em `motor/`, contratos Python ou regras regulatórias;
- o caminho simulado usa um participante sintético por Perfil selecionado;
- o MVP é para testes internos, não para histórico regulatório ou produção ampla.

Riscos conscientemente aceitos:

- a ligação Perfil → cenário é visível e os snapshots guardam sources por campo e
  por ordem, mas ainda não existe uma entidade de Receita/linhagem de produto;
- a carteira observada e a carteira sintética não são comparadas como se fossem o
  mesmo contrafactual;
- após reload, a seleção do par base/hipótese pode precisar ser refeita;
- uma execução por lado não mede variabilidade estatística;
- manter a mesma seed reduz variação acidental, mas não constitui pareamento
  estatístico formal quando volume, ticket ou prazo alteram a quantidade de ordens;
- hipóteses agregadas não descrevem efeito por cliente.

Esses riscos devem aparecer na interface e no aceite. Eles não podem ser ocultados
por linguagem de produção.

## 11. Fora de escopo do MVP

- modificar `motor/`, P0, EDF, custo, IOF ou prioridade operacional;
- inferir causalidade, previsão, recomendação comercial ou benefício individual;
- usar o leave-one-out legado de `motor/analise/marginal.py`;
- criar Recipe store, comparação remota, fila durável, Replay, Etapa 5, PDF ou chat;
- criar ou alterar issues no Linear sem autorização;
- push, PR, merge ou deploy durante o planejamento.

## 12. Decisão de continuidade

Esta especificação substitui apenas o escopo imediato da Etapa 4. A especificação
completa anterior permanece como referência para as Evoluções A, B e C, mas nenhuma
delas entra implicitamente no MVP. Cada evolução exige novo aceite de escopo e plano
próprio.
