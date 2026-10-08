# Front-end — Etapa 4: Hipóteses, Comparação e Análise Marginal

**Data:** 2026-09-20

**Status:** substituída como escopo de entrega imediata pelo MVP de quatro dias em
`2026-09-20-frontend-etapa-4-mvp-design.md`. Este documento permanece como visão
completa de evolução posterior e não autoriza implementação.

**Base auditada:** `origin/main` em `a9a633ca9acb2228af7b775edf993d9b818ab8d4`

**Deriva de:** `2026-09-19-frontend-motor-de-fluxo-design-v2.md`, seção 29

**Auditoria:** `docs/frontend/etapa-4-auditoria-partida.md`

## S01 — Objetivo e resultado da etapa

Entregar um incremento em que o usuário:

1. transforma uma versão imutável de Perfil Operacional em uma receita sintética
   explícita e reproduzível;
2. confirma toda derivação e informa toda lacuna sem defaults silenciosos;
3. materializa uma carteira `OPERATIONAL_PROFILE` sem alterar o motor;
4. cria variantes imutáveis a partir de um cenário-base;
5. vê diferenças de entrada antes de executar ou interpretar resultados;
6. executa base e hipótese pelo executor robusto da Etapa 3;
7. compara somente execuções compatíveis, com pareamento determinístico quando há
   amostragem;
8. lê diferenças nos sete eixos sem confundir entrada, execução selecionada,
   distribuição e causalidade;
9. usa “efeito marginal” somente para uma alteração elementar declarada;
10. preserva histórico, fingerprints, proveniência e documentos das Etapas 1–3.

O critério funcional de saída é testar uma hipótese baseada em Perfil real, compará-la
com sua base e identificar quais mudanças declaradas explicam o contraste simulado.

## S02 — Limites e não objetivos

Não fazem parte desta etapa:

- alterar `motor/`, P0, netting, custo, IOF ou regras regulatórias;
- implementar um gerador que reproduza sazonalidade ou distribuições empíricas;
- apresentar Perfil Operacional como previsão de fluxo futuro;
- preencher ausência com zero, média, heurística ou default não confirmado;
- comparar versões diferentes do motor, do gerador ou do contrato estatístico;
- inferir causalidade real, recomendação comercial, rateio ou benefício individual;
- publicar o `leave-one-out` de `motor/analise/marginal.py` como contrato de produto;
- Replay, Etapa 5, chat, PDF, publicação ou fila distribuída;
- tornar durável a fila em memória da Etapa 3;
- criar store global de receitas antes de existir necessidade comprovada;
- migrar contexto do vault para o repositório;
- criar ou editar issues no Linear;
- implementar código durante esta sessão de planejamento.

## S03 — Princípios de autoridade

```text
Perfil imutável (evidência)
        │ regras explícitas + confirmações
        ▼
Receita imutável (hipótese de geração)
        │ compilador versionado
        ▼
EffectiveInput + ordens materializadas
        │ snapshot integral
        ▼
Cenário / variante imutável
        │ executor da Etapa 3
        ▼
Execução terminal
        │ comparação pura no servidor
        ▼
ComparisonEnvelope
```

- O Perfil é autoridade sobre evidência histórica agregada, não sobre fluxo futuro.
- A Receita é autoridade sobre escolhas de projeção.
- As ordens materializadas são autoridade sobre a entrada efetivamente executada.
- O cenário materializado é autoridade executável da variante.
- A execução terminal é autoridade sobre resultados do motor.
- O envelope de comparação é autoridade sobre diferenças; componentes React apenas o
  apresentam.
- `ApplicationRepository` continua sendo a única porta de persistência no navegador.

## S04 — Linguagem canônica

| Termo | Definição normativa |
|---|---|
| Perfil | `OperationalProfileVersion` 1.0.0, evidência imutável já existente |
| Receita | projeção confirmada que compila um Perfil em `EffectiveInput` |
| Compilação | validação e transformação pura da Receita em entrada efetiva |
| Materialização | ordens produzidas pelo gerador Python existente |
| Cenário-base | cenário do qual uma variante deriva |
| Hipótese | justificativa humana e conjunto tipado de alterações |
| Delta | alterações declaradas entre base e variante |
| Variante | delta imutável mais snapshots integrais da base e do resultado |
| Compatibilidade | prova de que o contraste preserva as dimensões estruturais exigidas |
| Diferença agregada | hipótese menos base, sem atribuição causal por variável |
| Efeito marginal simulado | diferença para exatamente uma alteração elementar |
| Pareamento | mesma repetição e mesmas seeds para participantes comuns |

“Benefício”, “efeito individual”, “previsão”, “causa” e “garantia” não são sinônimos
dos termos acima e não aparecem como conclusão da interface.

## S05 — Receita baseada em Perfil

### S05.1 Entradas deriváveis

A v1 deriva somente:

| Campo efetivo | Métrica do Perfil | Regra `profile-recipe-v1` |
|---|---|---|
| volume mensal de referência | `metrics.volume.totalBrl` + `coverage.coveredDays` | `totalBrl / coveredDays * 30` |
| ticket mediano | `metrics.ticketsBrl.p50` | cópia decimal canônica |
| fração OUT | `metrics.direction.value.out.fraction` | cópia decimal canônica |

As três métricas precisam estar em `AVAILABLE`; `coveredDays` precisa ser positivo.
Cada valor derivado mostra métrica, fórmula, entradas, valor e fingerprint do Perfil.
O usuário confirma o valor exato antes da compilação.

Sazonalidade, percentis de prazo e finalidades são exibidos como contexto, mas não são
convertidos em regra executável na v1. Em especial, `p50` de prazo não vira prazo fixo
e a lista agregada de finalidades não é dividida silenciosamente entre OUT e IN.

### S05.2 Entradas explícitas

A Receita exige, por participante sintético:

- identidade sintética estável;
- multiplicador de volume sobre a referência do Perfil;
- arquétipo aceito por `EffectiveParticipant.profile`;
- seed congelada e confirmada;
- regra de prazo `GENERATOR_PROFILE` ou `FIXED`, com dias quando fixa;
- `eh_efx`;
- `purpose_out` e `purpose_in`.

Também exige composição completa, dias de aquecimento, dias de medição e um
multiplicador agregado de volume da carteira. Janela e premissas de custo são
contexto obrigatório da compilação, mas continuam sob autoridade do cenário e não
entram na Receita. O navegador pode propor uma seed, mas ela só entra na Receita
depois de exibida e confirmada. Nenhuma entrada obrigatória possui fallback.

Cada multiplicador é uma escolha de hipótese. Valor `1` precisa ser explicitamente
confirmado e nunca é aplicado por omissão. O volume de cada participante é
`referência × portfolioScale × multiplicador do participante`.

`GENERATOR_PROFILE` significa prazo do arquétipo do gerador e é mapeado no fio ao
literal legado `PROFILE`; ele nunca significa percentil do Perfil Operacional.

### S05.3 Documento canônico

```ts
type OperationalProfileRecipe = DeepReadonly<{
  schemaVersion: '1.0.0';
  id: string;
  ownerSub: string;
  createdAt: string;
  compiler: { id: 'profile-recipe-v1'; version: '1.0.0' };
  profileRef: {
    id: string;
    companyId: string;
    version: number;
    documentFingerprint: string;
    methodVersion: '1.0.0';
  };
  derivedReference: {
    monthlyVolumeBrl: string;
    ticketMedianBrl: string;
    outFraction: string;
  };
  confirmations: readonly ProfileValueConfirmation[];
  portfolioScale: string;
  participants: readonly ProfileRecipeParticipant[];
  warmupDays: number;
  measurementDays: number;
  fieldSources: Readonly<Record<string, RecipeFieldSource>>;
  preparationVersion: '1.0.0';
  generatorVersion: 'dimensionamento-v1';
  recipeFingerprint: string;
}>;
```

A Receita é entidade canônica própria, mas na v1 vive embutida integralmente no
snapshot da origem. Não ganha store global. Qualquer mudança cria outro `id` e outro
fingerprint; não existe update de Receita.

`RecipeFieldSource` distingue `PROFILE_DERIVED`, `USER_ESTIMATE` e
`SYNTHETIC_DEFAULT_CONFIRMED`. A origem derivada inclui `profileFingerprint`, caminho
da métrica, regra e entradas. A confirmação inclui caminho, valor canônico, instante e
fingerprint; confirmação divergente bloqueia a compilação.

O `recipeFingerprint` usa a confirmação sem seu instante. `id`, `createdAt` e
`request_id` não entram na projeção semântica. Repetir o
mesmo request pode produzir IDs de transporte diferentes, mas deve produzir os mesmos
fingerprints semânticos, `EffectiveInput`, ordens, composição e parâmetros.

## S06 — Contrato de compilação e materialização

### S06.1 Endpoint próprio

```text
POST /api/v1/receitas-perfil/compilacoes → 200 ProfileRecipeCompilationResponse
```

O endpoint é síncrono, sem persistência no servidor e protegido pela autenticação já
existente. Ele recebe:

```py
class ProfileRecipeCompilationRequest(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    expected_build_sha: BuildSha
    owner_sub: str
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: int
    profile_snapshot: OperationalProfileSnapshot
    draft: ProfileRecipeDraft
    scenario_context: ProfileRecipeScenarioContext

class ProfileRecipeCompilationResponse(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    recipe: OperationalProfileRecipeSnapshot
    recipe_fingerprint: Fingerprint
    effective_input: EffectiveInput
    effective_input_fingerprint: Fingerprint
    preparation: PreparationResponse
    materialization_fingerprint: Fingerprint
```

O servidor:

1. confere `owner_sub`, `ownerSub` do Perfil e `sub` autenticado;
2. valida schema, compatibilidade e `documentFingerprint`;
3. recalcula os três valores deriváveis;
4. confere todas as confirmações e lacunas;
5. produz `OperationalProfileRecipe` e `EffectiveInput` canônicos;
6. reutiliza internamente o serviço de `/api/v1/preparacoes`;
7. devolve Receita, entrada efetiva, ordens, composição, parâmetros e fingerprints.

`/api/v1/preparacoes` mantém seu contrato genérico e não recebe a nova origem de
forma implícita.

`ProfileRecipeScenarioContext` contém período, janela, custos e suas proveniências.
Ele serve para construir o `EffectiveInput` exigido pelo transporte atual, mas não
transforma janela/custos em determinantes da Receita. Ao executar diagnóstico,
`buildEffectiveInputForScenario` recompõe uma cópia: determinantes de geração vêm da
Receita/source snapshot; janela, custos e suas origens vêm do cenário executado. O
gerador continua recebendo o contrato atual e o fingerprint de geração continua
ignorando janela/custos, como em `dimensionamento-v1`.

### S06.2 Proveniência pública

`EffectiveSource` passa a ser união discriminada e ganha
`kind: 'PERFIL_OPERACIONAL'`, com Perfil, métrica, regra e entradas. Os dois tipos
existentes permanecem válidos.

`OrigemValor.tipo` ganha `DERIVADO_PERFIL_OPERACIONAL`. Essa origem acompanha os
campos derivados até `PreviaRequest`. No front-end ela projeta para
`FieldProvenance.kind: 'DERIVED'`; escolhas do usuário continuam
`USER_ESTIMATE`; defaults sintéticos somente quando explicitamente confirmados.

Não basta adicionar o literal. `OrigemValor` torna-se união discriminada: o braço
derivado carrega `profile_id`, `profile_fingerprint`, `recipe_fingerprint`, `rule`,
`metric_paths` e `input_paths`. Na preparação atual, `derived_provenance` define um
conjunto conservador de entradas por grupo `/orders/{participantId}`. O adaptador
aplica esse conjunto a cada campo das ordens daquele participante, compõe a evidência
com `sources` e produz uma origem derivada mesmo quando a ordem também depende de seed
ou escolha do usuário. A lista é um superset auditável, não uma alegação falsa de
dependência mínima por campo.

`buildPreviewRequest` deixa de reduzir `DERIVED` a `PADRAO_SINTETICO`. No diagnóstico
gerado, `servidor/diagnostics/service.py` deixa de usar a origem da seed para todos os
campos da ordem e aplica a mesma projeção de `derived_provenance`. O executor, fila e
semântica do motor não mudam; os adaptadores de proveniência dos fluxos fixo e gerado
mudam e compartilham fixtures.

### S06.3 Evolução futura A → B

`compiler.id`, `compiler.version`, `generatorVersion`, Receita, Perfil, cada snapshot
de entrada efetiva e cada conjunto de ordens permanecem congelados. Um novo binding de
cenário produz outro snapshot de transporte, sem editar o anterior. Um gerador futuro
com sazonalidade usa novo identificador/versão e cria nova Receita, materialização e
execução. Nenhum artefato v1 é promovido, reinterpretado ou recalculado.

Despacho por `compiler.version` e `generatorVersion` mantém a v1 reexecutável após a
entrada de uma versão B. Se uma versão precisar ser retirada por impossibilidade
técnica ou segurança, seus resultados continuam legíveis e a indisponibilidade de
reexecução vira limitação explícita; a retirada exige decisão e migration próprias.

### S06.4 Schemas e geração de tipos

Os modelos Pydantic em `servidor/contracts/` são a fonte canônica dos DTOs de fio.
`servidor/export_openapi.py` atualiza `web/src/api/schemas.json` e
`web/src/api/generated.ts`; `web/src/api/validators.ts` expõe validadores dedicados.
CI falha quando regenerar produz diff ou quando uma fixture dourada não passa nos dois
lados.

Invariantes mínimos dos novos modelos:

```ts
type ProfileValueConfirmation = Readonly<{
  metricPath: 'metrics.volume.totalBrl' | 'metrics.ticketsBrl.p50' |
    'metrics.direction.value.out.fraction';
  canonicalValue: string;
  profileFingerprint: string;
  confirmedAt: string;
}>;

type RecipeFieldSource =
  | Readonly<{ kind: 'PROFILE_DERIVED'; profileFingerprint: string;
      metricPaths: readonly string[]; rule: 'profile-recipe-v1' }>
  | Readonly<{ kind: 'USER_ESTIMATE'; source: string; recordedAt: string }>
  | Readonly<{ kind: 'SYNTHETIC_DEFAULT_CONFIRMED'; source: string;
      rule: string; recordedAt: string }>;

type ProfileRecipeParticipant = Readonly<{
  id: string;
  volumeMultiplier: string;
  generatorProfile: ProfileId;
  seed: SeedText;
  deadline: { mode: 'GENERATOR_PROFILE' } | { mode: 'FIXED'; days: number };
  efx: boolean;
  purposeOut: string;
  purposeIn: string;
}>;

type ProfileRecipeDraft = Readonly<{
  portfolioScale: string;
  participants: readonly ProfileRecipeParticipant[];
  warmupDays: number;
  measurementDays: number;
  confirmations: readonly ProfileValueConfirmation[];
  fieldSources: Readonly<Record<string, RecipeFieldSource>>;
}>;
```

Há exatamente uma confirmação por métrica derivada; paths extras, ausentes ou
repetidos falham. Participantes ficam entre 1 e 100, IDs são UUIDs únicos, seeds usam
o intervalo atual, strings de finalidade têm 1–128 caracteres, escalas são decimais
positivos e o volume efetivo final respeita o teto monetário atual. Contexto de
cenário reutiliza `PeriodDocument`, `PremisesDocument` e proveniência já validados.

## S07 — Nova origem `OPERATIONAL_PROFILE`

`PortfolioSource` ganha:

```ts
type OperationalProfileSource = Readonly<{
  kind: 'OPERATIONAL_PROFILE';
  profileRef: OperationalProfileRecipe['profileRef'];
  recipe: OperationalProfileRecipe;
  effectiveInputFingerprint: string;
  generationFingerprint: string;
  materializationFingerprint: string;
}>;
```

O `PortfolioSourceSnapshot` correspondente contém ainda:

- `profileSnapshot` integral;
- `generationInputSnapshot` integral da compilação, preservado como evidência;
- ordens materializadas em ordem canônica;
- composição e parâmetros realizados;
- proveniência global e por campo;
- versões de compilador, preparação, gerador e build do motor;
- todos os fingerprints da cadeia.

Para `OPERATIONAL_PROFILE`, `generationInputSnapshot` não supera a autoridade do
cenário sobre janela/custos. `buildEffectiveInputForScenario` copia seus determinantes
de geração e substitui apenas contexto/premissas pelos snapshots do cenário atual,
registrando o novo input fingerprint na execução.

A origem só é válida após resposta completa e validada do servidor. Estado parcial
nunca é persistido como cenário executável. Versão mais nova do Perfil não altera o
snapshot existente.

A primeira materialização Perfil→Receita revisa por CAS o cenário-base selecionado:
substitui seu `sourceSnapshot` pela origem `OPERATIONAL_PROFILE` completa, incrementa
a revisão do cenário e recalcula os fingerprints de source/input. Não cria variante
nem cenário paralelo. Execuções anteriores permanecem ligadas a seus snapshots; uma
resposta parcial, tardia, de outro owner/epoch/revision/intention ou em conflito de
CAS nunca é persistida. Só depois dessa revisão salva o cenário pode ser escolhido
como base de uma hipótese imutável.

## S08 — Identidade e fingerprints

Todos usam JSON canônico, normalização decimal e SHA-256:

| Identidade | Inclui | Exclui |
|---|---|---|
| Perfil | contrato atual do Perfil | — |
| Receita | Perfil ref, regras, confirmações, escala, participantes, seeds e horizonte de geração | recipe ID, janela, custos e timestamps |
| Entrada efetiva | `EffectiveInput` integral, inclusive `sources` | request ID |
| Geração | contrato atual da preparação | — |
| Materialização | ordens, composição, parâmetros, versões, Receita e generation fingerprint | `createdAt`, janela e custos |
| Origem | source, Perfil, Receita, entrada, ordens e proveniência | `capturedAt` |
| Cenário | origem, premissas e período | nome visual |
| Delta | base id/revisão/fingerprint e alterações ordenadas | título, razão e instante |
| Hipótese | título, razão e delta fingerprint | instante |
| Variante | base snapshot, hipótese, delta e cenário materializado | instante |
| Comparação | duas execuções, delta, configuração estatística e versões | request ID |

`fingerprintPortfolioSource` passa a incluir `generationInputSnapshot` e os snapshots
da nova origem. A validação reconcilia toda a cadeia; igualdade de ordens não torna
duas Receitas iguais.

A preimagem de cada hash remove primeiro o próprio campo de fingerprint. A DAG é
estritamente acíclica:

```text
profile
  └─> recipe ─> effective-input ─> generation ─> materialization ─> source
                                                            source ─> scenario
scenario-base ─> delta ─> hypothesis ─> variant ─> execution ─> comparison
```

`recipe.id` é UUID determinístico derivado de `(ownerSub, recipeFingerprint)` e não
entra na preimagem. Arrays que representam conjuntos são ordenados pela chave estável
documentada; arrays em que a ordem é semântica preservam a ordem. Strings decimais são
normalizadas como no contrato atual, timestamps para UTC ISO-8601, e JSON usa UTF-8,
chaves lexicográficas, sem `undefined`, NaN ou infinito. Fixtures cruzadas exigem o
mesmo digest em Python e Web Crypto antes de qualquer integração.

## S09 — Estudo V4 e variantes

### S09.1 Documento

```ts
type StudyDocumentV4 = Readonly<
  Omit<StudyDocumentV3, 'schemaVersion'> & {
    schemaVersion: '4.0.0';
    variants: readonly ScenarioVariant[];
    comparisons: readonly ComparisonRecord[];
  }
>;
```

Receitas vivem no `sourceSnapshot` do cenário materializado. `variants` e
`comparisons` são append-only. IDs de cenários são únicos entre `scenarios` e
`variants[].materializedScenario`.

`variants[].materializedScenario` é a autoridade do cenário variante e não é
duplicado em `scenarios`. Um único `resolveExecutableScenario(study, scenarioId)`
substitui acessos diretos a `study.scenarios.find` em validação, execução, resultado e
comparação; ele procura nos dois catálogos e rejeita colisões. Assim a variante é
executável sem criar duas cópias concorrentes do mesmo cenário.

### S09.2 Delta tipado

```ts
type ParticipantFieldChange =
  | { field: 'VOLUME_MULTIPLIER'; before: string; after: string }
  | { field: 'GENERATOR_PROFILE'; before: ProfileId; after: ProfileId }
  | { field: 'DEADLINE'; before: EffectiveDeadline; after: EffectiveDeadline }
  | { field: 'EFX'; before: boolean; after: boolean }
  | { field: 'PURPOSE_OUT' | 'PURPOSE_IN'; before: string; after: string };

type VariantChange =
  | { kind: 'SET_PORTFOLIO_SCALE'; before: string; after: string }
  | { kind: 'ADD_PARTICIPANT'; participant: ProfileRecipeParticipant }
  | { kind: 'REMOVE_PARTICIPANT'; participantId: string; beforeFingerprint: string }
  | ({ kind: 'SET_PARTICIPANT_FIELD'; participantId: string } & ParticipantFieldChange)
  | { kind: 'SET_WINDOW_DAYS'; before: number; after: number }
  | { kind: 'SET_COST_PREMISE'; field: ScalarCostPremiseCode;
      before: string; after: string }
  | { kind: 'SET_IOF_RULE'; purpose: string; direction: 'OUT' | 'IN';
      before: string | null; after: string | null };
```

Não se usa JSON Patch livre. Cada mudança tem validador próprio e caminhos permitidos.
`ScalarCostPremiseCode` enumera `IOF_OUT`, `IOF_IN`, `CARRY_CNR`,
`SPREAD_RAIL_BPS`, `CUSTO_FIXO_REMESSA`, `CUSTO_OPORTUNIDADE_AA` e `PTAX`;
regras de finalidade usam exclusivamente `SET_IOF_RULE`.
Alteração de seed, versão de gerador, build do motor, Perfil de origem ou contrato não
é hipótese comparável na v1; exige outra base.

```ts
type ScenarioVariant = DeepReadonly<{
  schemaVersion: '1.0.0';
  id: string;
  hypothesis: { title: string; reason: string; fingerprint: string };
  baseScenarioSnapshot: ScenarioDocument;
  delta: { changes: readonly VariantChange[]; fingerprint: string };
  materializedScenario: ScenarioDocument;
  variantFingerprint: string;
  createdAt: string;
}>;
```

Base e resultado completos tornam a variante independente de edições futuras. O
resultado precisa ser reproduzível pela aplicação ordenada do delta à base; divergência
é documento inválido. Variante não é editada: nova hipótese cria nova variante.

### S09.3 Propagação obrigatória

Na v1, variantes comparáveis partem de cenário `OPERATIONAL_PROFILE`. Todo change é
aplicado ao draft da Receita e recompilado pelo endpoint canônico; o navegador nunca
edita ordens diretamente.

| Change | Nova Receita | Regenera ordens | Invalida |
|---|---:|---:|---|
| escala agregada | sim | sim | origem, cenário, execução e comparação |
| adicionar/remover participante | sim | sim | origem, cenário, execução e comparação |
| volume, arquétipo, prazo, eFX ou finalidade do participante | sim | sim | origem, cenário, execução e comparação |
| janela | não | não | cenário, execução e comparação |
| premissa escalar ou regra de IOF | não | não | cenário, execução e comparação |

Changes de geração chamam a compilação/materialização e reconciliam todos os
fingerprints; igualdade acidental das ordens não autoriza reutilizar source snapshot.
Changes de janela/custo preservam Receita, origem e ordens, mas
`buildEffectiveInputForScenario` cria o snapshot de transporte da nova execução com
os valores do cenário.
Título e razão só podem mudar antes do append imutável. Depois do append, qualquer
correção cria nova hipótese/variante.

## S10 — Execução e pareamento

A orquestração do executor, fila, cancelamento, retry, terminal único e retenção da
Etapa 3 não mudam. O request ganha V2, os resolvedores de cenário e os adaptadores de
proveniência mudam conforme esta especificação. Comparação não ganha fila própria e
nunca dispara motor por conveniência.

Para comparações geradas, `DiagnosticRequestV2` acrescenta:

```ts
type DiagnosticPairing = Readonly<{
  cohortId: string;
  repetitionIds: readonly string[];
  seedPlanFingerprint: string;
}>;

type DiagnosticRequestV2 = Omit<DiagnosticRequestV1, 'api_version'> & Readonly<{
  api_version: '2.0.0';
  pairing: DiagnosticPairing;
}>;
```

O endpoint de diagnóstico aceita V1 e V2. V1 continua suficiente fora da Etapa 4.
Base e hipótese usam o mesmo `cohortId`, as mesmas quantidades 10/30/100, os mesmos
`repetitionId` e a mesma seed por participante comum. Participantes adicionados têm
seed explícita e determinística por repetição; removidos simplesmente não aparecem.

Retry preserva request, cohort e seeds e cria nova tentativa/job, como hoje. Reload
reconstrói estado dos registros persistidos. Reinício do servidor continua produzindo
`INTERRUPTED`, nunca retry automático.

## S11 — Compatibilidade

A comparação é bloqueada se houver qualquer uma destas diferenças estruturais:

- owner ou estudo incompatível;
- execução ausente, não terminal ou diferente de `SUCCEEDED`;
- build do motor, política P0, schema de saída, versão do gerador ou compilador
  diferentes;
- unidade monetária, definição de métrica ou modo de período diferentes;
- horizonte ou configuração estatística diferentes;
- modo de amostragem diferente;
- repetição ou seed comum não pareada;
- repetições selecionadas diferentes para o contraste de execução individual;
- Perfil/Receita/entrada/fingerprint incoerentes;
- diferença de entrada não explicada pelo delta;
- delta que altera campo proibido.

Valores de premissas de custo podem mudar quando essa for a hipótese declarada; o
contrato, unidade e definição permanecem iguais. Adicionar ou remover participante é
comparável quando for um único change tipado e todos os participantes comuns estiverem
pareados.

`CompatibilityReport` contém `compatible`, blockers e warnings tipados, caminhos e
evidências. A UI explica todos os blockers antes de desabilitar a comparação.

## S12 — Contrato de comparação

```text
POST /api/v1/comparacoes → 200 ComparisonEnvelope
```

O request contém identidade do estudo/owner, hipótese e delta, snapshots dos dois
cenários, requests e envelopes terminais das duas execuções. O servidor não lê
IndexedDB, não persiste e não reexecuta o motor. Ele valida compatibilidade e calcula
somente diferenças canônicas.

```py
class ComparisonRequest(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    owner_sub: str
    study_id: UUIDValue
    variant: ScenarioVariantSnapshot
    base: ComparisonExecutionInput
    hypothesis: ComparisonExecutionInput
```

`ComparisonExecutionInput` contém o `DiagnosticExecutionRecord` terminal necessário,
seu request e envelope, sem aceitar campos livres ou resultados parciais.

```ts
type ComparisonExecutionInput = DeepReadonly<{
  executionId: string;
  scenarioId: string;
  scenarioRevision: number;
  inputFingerprint: string;
  request: DiagnosticRequestV1 | DiagnosticRequestV2;
  envelope: DiagnosticEnvelope;
  sourceSnapshot: PortfolioSourceSnapshot;
  premisesSnapshot: PremisesDocument;
  periodSnapshot: PeriodDocument;
}>;

type ComparisonRecord = DeepReadonly<{
  schemaVersion: '1.0.0';
  id: string;
  requestFingerprint: string;
  requestSnapshot: ComparisonRequest;
  envelope: ComparisonEnvelope;
  createdAt: string;
}>;
```

No fio, DTOs seguem `snake_case` e os schemas Pydantic/OpenAPI. Os exemplos TypeScript
abaixo representam o modelo local; adaptadores explícitos e fixtures douradas impedem
conversão implícita entre os dois formatos.

```ts
type ComparisonEnvelope = DeepReadonly<{
  apiVersion: '1.0.0';
  schemaVersion: '1.0.0';
  comparisonId: string;
  requestFingerprint: string;
  compatibility: CompatibilityReport;
  inputDifference: InputDifference;
  selectedExecutionDifference: Availability<SelectedDifference>;
  statisticalDifference: Availability<PairedStatisticalDifference>;
  axes: readonly AxisDifference[];
  marginal: MarginalAssessment;
  limitations: readonly ComparisonLimitation[];
  provenance: ComparisonProvenance;
}>;
```

Os tipos referenciados acima têm forma mínima normativa:

```ts
type AxisCode = 'STRUCTURAL_POTENTIAL' | 'POLICY_CAPTURE' |
  'TEMPORAL_COMPATIBILITY' | 'CROSS_BORDER_RESIDUAL' |
  'COMPOSITION_DEPENDENCY' | 'ECONOMIC_ROBUSTNESS' | 'OPERATIONAL_PROFILE';

type AvailabilityReason = 'BASE_ZERO' | 'BASE_METRIC_UNAVAILABLE' |
  'HYPOTHESIS_METRIC_UNAVAILABLE' | 'FIXED_INPUT_NO_DISTRIBUTION' |
  'NOT_AVAILABLE_IN_CONTRACT_V1' | 'UNPAIRED' | 'NON_NUMERIC';

type JsonValue = null | boolean | string | number |
  readonly JsonValue[] | Readonly<{ [key: string]: JsonValue }>;

type Availability<T> =
  | Readonly<{ state: 'AVAILABLE'; value: T; evidenceRefs: readonly string[] }>
  | Readonly<{ state: 'UNAVAILABLE'; reason: AvailabilityReason;
      evidenceRefs: readonly string[] }>;

type CompatibilityBlockerCode =
  | 'OWNER_OR_STUDY_MISMATCH' | 'EXECUTION_NOT_SUCCEEDED'
  | 'MOTOR_BUILD_MISMATCH' | 'POLICY_MISMATCH' | 'OUTPUT_SCHEMA_MISMATCH'
  | 'GENERATOR_VERSION_MISMATCH' | 'COMPILER_VERSION_MISMATCH'
  | 'UNIT_MISMATCH' | 'METRIC_DEFINITION_MISMATCH'
  | 'PERIOD_MODE_MISMATCH' | 'HORIZON_MISMATCH'
  | 'STATISTICAL_CONFIG_MISMATCH' | 'SAMPLING_MODE_MISMATCH'
  | 'UNPAIRED_REPETITION' | 'SELECTED_REPETITION_MISMATCH'
  | 'FINGERPRINT_INCONSISTENCY' | 'UNDECLARED_INPUT_DIFFERENCE'
  | 'FORBIDDEN_DELTA';

type CompatibilityIssue<Code extends string> = Readonly<{
  code: Code;
  messageCode: string;
  paths: readonly string[];
  evidenceRefs: readonly string[];
}>;

type CompatibilityReport = Readonly<{
  compatible: boolean;
  blockers: readonly CompatibilityIssue<CompatibilityBlockerCode>[];
  warnings: readonly CompatibilityIssue<
    'PARTIAL_METRIC_AVAILABILITY' | 'FIXED_INPUT_NO_DISTRIBUTION'
  >[];
}>;

type InputDifference = Readonly<{
  deltaFingerprint: string;
  declaredChanges: readonly VariantChange[];
  changedPaths: readonly Readonly<{
    path: string;
    before: JsonValue | null;
    after: JsonValue | null;
    declaredByChangeIndex: number;
    effect: 'DIRECT' | 'MATERIALIZED_CONSEQUENCE';
  }>[];
}>;

type MetricDelta = Readonly<{
  metricCode: string;
  axis: AxisCode;
  definitionVersion: string;
  unit: string;
  base: Availability<string>;
  hypothesis: Availability<string>;
  absoluteDelta: Availability<string>;
  relativeDelta: Availability<string>;
}>;

type SelectedDifference = Readonly<{
  repetitionId: string;
  baseExecutionId: string;
  hypothesisExecutionId: string;
  metrics: readonly MetricDelta[];
}>;

type PairedStatisticalDifference = Readonly<{
  pairCount: 10 | 30 | 100;
  metrics: readonly Readonly<{
    metricCode: 'BASELINE_COST' | 'NETTED_COST' | 'SAVINGS' |
      'NETABILITY' | 'DURATION';
    unit: string;
    pairs: readonly Readonly<{
      repetitionId: string;
      base: string;
      hypothesis: string;
      delta: string;
    }>[];
    summary: { p10: string; p25: string; p50: string; p75: string; p90: string };
  }>[];
}>;

type AxisDifference = Readonly<{
  axis: AxisCode;
  selectedMetrics: readonly MetricDelta[];
  statisticalMetricCodes: readonly string[];
  statisticalUnavailableReason: AvailabilityReason | null;
}>;

type ComparisonLimitation = Readonly<{
  code: string;
  severity: 'INFO' | 'WARNING';
  statementCode: string;
  evidenceRefs: readonly string[];
}>;

type ComparisonProvenance = Readonly<{
  ruleId: 'scenario-comparison-v1';
  ruleVersion: '1.0.0';
  baseExecutionId: string;
  hypothesisExecutionId: string;
  deltaFingerprint: string;
  hypothesisFingerprint: string;
  variantFingerprint: string;
  evidenceRefs: readonly string[];
}>;
```

As mesmas uniões são fechadas nos schemas Pydantic; `JsonValue` rejeita NaN, infinito
e valores não JSON, e indisponibilidade sempre tem código e evidência.
`relativeDelta` é `(hipótese - base) / abs(base)` e fica indisponível para base zero ou
métrica não numérica; nunca retorna infinito.

Resposta incompatível é `422` com relatório completo; erro não se reduz a texto
genérico. Uma resposta compatível é persistida integralmente em `ComparisonRecord`
junto aos dois execution IDs, request snapshot e fingerprints.

`comparisonId` é UUID determinístico derivado do `requestFingerprint`, que exclui
`request_id`. Retry idêntico devolve o mesmo ID/conteúdo; append com o mesmo documento
é idempotente, e o mesmo ID com conteúdo diferente é conflito. `operationId` controla
somente a mutation local: seu replay devolve o mesmo read model e nunca anexa uma
segunda comparação.

## S13 — Semântica das diferenças

### S13.1 Ordem obrigatória

1. **Diferença de entrada:** delta declarado e consequências materializadas na
   Receita, ordens, composição, período e premissas.
2. **Execução selecionada:** hipótese menos base para os dois exemplos selecionados;
   nunca representa a distribuição.
3. **Diferença estatística:** distribuição dos deltas pareados por repetição.
4. **Sete eixos:** métricas compatíveis com unidade, definição e disponibilidade.
5. **Limitações:** o que não pode ser concluído.

Percentis estatísticos são calculados sobre os deltas pareados de cada repetição. Não
se subtrai `p50` da hipótese de `p50` da base e se chama isso de distribuição do delta.
Falha ou ausência de par deixa a estatística indisponível; não reduz amostra em
silêncio.

Na v1, `PairedStatisticalDifference` cobre somente as métricas presentes em cada
`RepetitionSummary`: custo baseline, custo netado, economia, netabilidade e duração.
Os demais eixos não possuem métricas por repetição no envelope atual e, portanto,
comparam apenas o par de execuções selecionadas, com estado estatístico
`NOT_AVAILABLE_IN_CONTRACT_V1`. Ampliar a distribuição para esses eixos exige um
`DiagnosticEnvelope` futuro com resumos adicionais; a UI não os reconstrói.

### S13.2 Sete eixos

Mantém-se a ordem e a definição da Etapa 3:

1. potencial estrutural;
2. captura pela política;
3. compatibilidade temporal;
4. exposição residual transfronteiriça;
5. dependência da composição;
6. robustez econômica;
7. perfil operacional da carteira.

Cada métrica retorna base, hipótese, delta absoluto, delta relativo apenas quando o
denominador existe, unidade, definição, estado e referências. Ausência nunca vira
zero. A UI não recalcula eixos ou regras financeiras.

## S14 — Análise marginal agregada

```ts
type MarginalAssessment =
  | { state: 'AVAILABLE'; change: MarginalEligibleChange;
      aggregateEffects: readonly MetricDelta[];
      qualification: 'SIMULATED_NOT_CAUSAL' }
  | { state: 'UNAVAILABLE'; reason:
      'MULTIPLE_CHANGES' | 'INCOMPATIBLE' | 'UNPAIRED' |
      'PARTICIPANT_SPECIFIC_CHANGE' };
```

`MarginalEligibleChange` admite somente `SET_PORTFOLIO_SCALE`, `SET_WINDOW_DAYS`,
`SET_COST_PREMISE` ou `SET_IOF_RULE`. `AVAILABLE` exige exatamente um desses changes,
comparação compatível e:

- entradas fixas determinísticas dos dois lados; ou
- repetições geradas integralmente pareadas.

Mais de um change produz apenas diferença agregada do pacote. Um
`SET_PARTICIPANT_FIELD` altera um único campo; uma atualização composta deve ser
decomposta e, portanto, não é marginal.

Não há limiar oculto de cobertura. Em entrada gerada, todos os 10/30/100 pares
solicitados precisam terminar e parear; em entrada fixa, os dois lados formam o único
par determinístico. Métrica indisponível fica indisponível individualmente dentro de
`aggregateEffects` e não invalida métricas irmãs. `ADD_PARTICIPANT` e
`REMOVE_PARTICIPANT` e qualquer `SET_PARTICIPANT_FIELD` produzem somente diferença
agregada, com marginal `PARTICIPANT_SPECIFIC_CHANGE`; não se publica efeito atribuível
ao participante. `SET_IOF_RULE` representa uma única regra `(finalidade, direção)`.

O resultado é agregado. A diferença de entrada pode identificar o participante
sintético adicionado/alterado, mas nenhuma métrica de efeito é associada ao seu
`cliente_id`. Não publica ganho próprio, rateio, ranking, recomendação ou linguagem de
benefício individual. Não usa o leave-one-out legado.

## S15 — Persistência e migration

IndexedDB sobe da versão física 2 para 3 e `meta.schema_version` para 3. Nova store:

| Store | Chave | Índices |
|---|---|---|
| `comparisons` | `[study_id, comparison_id]` | `by_owner`, `by_owner_study` |

Receitas e variantes permanecem embutidas no Estudo; envelopes de comparação ficam
na store dedicada e são montados pelo repositório como hoje ocorre com execuções.

A store `comparisons` é a única autoridade física sobre `ComparisonRecord`. O row de
`studies` guarda somente `comparisonIds` ordenados; `StudyDocumentV4.comparisons` é o
read model montado pelo repositório, não uma segunda cópia persistida. Save/replay de
operação validam a sequência de IDs e montam o mesmo documento lógico dentro da única
transação que toca `studies`, `comparisons` e `operations`.

A migration transacional:

1. cria `comparisons` e índices;
2. converte Estudo 2.0.0 por V2→V3→V4 e Estudo 3.0.0 por V3→V4, acrescentando
   `variants: []` e `comparisons: []`;
3. migra de forma coerente `operations.intent`, `result_document`, IDs de execuções e
   IDs de comparações, inclusive replay de operationId criado antes do upgrade;
4. não inventa Receita, variante, delta ou proveniência histórica;
5. atualiza o marcador somente no commit.

Documentos V1 seguem a rota legada separada, não um conversor V1→V2 inexistente. V1
válido com `variants: []` é importado diretamente para o modelo lógico V4 pelo fluxo
existente adaptado. V1 com variantes legadas não vazias continua rejeitado como
incompatível e preservado intacto para recuperação; a Etapa 4 não reativa nem tenta
adivinhar a semântica daquele modelo abandonado.

Falha aborta tudo. Versão futura é rejeitada sem modificação. Fixtures reais V2/V3 e
a fixture de importação V1 provam round-trip, idempotência, rollback, replay de
operações antes/depois do upgrade, execuções append-only e preservação semântica dos
campos legados; fixture V1 com variantes prova preservação e rejeição deliberada.

`ApplicationRepository` ganha operações para anexar variante e comparação por CAS e
`operationId`; não surge uma segunda porta. Purge de estudo remove suas comparações.
Owner divergente, terminal duplicado ou mutação de comparação imutável são rejeitados.

## S16 — Concorrência e respostas tardias

- Toda mutation usa `expectedRevision` e `operationId`.
- Conflito de duas abas não faz last-write-wins; a segunda recebe conflito e recarrega.
- Seleção A→B→A usa token monotônico por intenção; resposta antiga não vence a atual.
- Resposta é aceita somente se owner, session epoch, study, scenario, revision,
  input fingerprint, attempt e comparison fingerprint ainda coincidirem.
- Cancelar navegação descarta a aplicação local da resposta, não inventa cancelamento
  do servidor síncrono.
- Retry de diagnóstico cria tentativa; retry de comparação cria request ID novo e o
  mesmo fingerprint quando o conteúdo for idêntico.
- Reload mostra somente registros persistidos; estado transitório sem terminal volta
  ao fluxo de reconciliação da Etapa 3.

## S17 — Interface

`/estudos/:studyId/comparar` deixa de ser placeholder e contém:

1. seleção da base;
2. seleção de Perfil e construtor de Receita;
3. painel “derivado do Perfil” com fórmula, evidência e confirmação;
4. painel “informado por você” para lacunas obrigatórias;
5. prévia de composição e ordens materializadas;
6. construtor de hipótese com changes tipados;
7. diferenças de entrada antes do botão de executar;
8. estado de execução de base e hipótese reutilizando controles da Etapa 3;
9. relatório de compatibilidade;
10. comparação nos sete eixos;
11. cartões separados para execução selecionada e distribuição pareada;
12. análise marginal ou razão explícita de indisponibilidade;
13. versões, fingerprints, proveniência e limitações.

O estado é produto de máquinas ortogonais, nunca um enum global:

| Eixo | Estados |
|---|---|
| Receita | `EMPTY`, `EDITING`, `BLOCKED`, `COMPILING`, `MATERIALIZED`, `FAILED` |
| Persistência | `CLEAN`, `SAVING`, `REVISION_CONFLICT`, `FAILED` |
| Execução base | `REQUIRED`, `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `INTERRUPTED` |
| Execução hipótese | os mesmos estados independentes da base |
| Comparação | `UNAVAILABLE`, `READY`, `COMPARING`, `INCOMPATIBLE`, `SUCCEEDED`, `FAILED`, `STALE` |

Editar a Receita marca materialização, variante e comparação anteriores como `STALE`,
mas mantém o último resultado válido visível e rotulado até salvar/executar novamente.
Comparação só transita de `READY` quando ambas as execuções estão `SUCCEEDED` e seus
fingerprints ainda correspondem. Falha de um lado não apaga o outro; retry atua apenas
no lado falho. Conflito de revisão preserva o draft local, bloqueia save e oferece
recarregar/reaplicar. Cada transição carrega seu intention token; resposta com token,
epoch ou fingerprint antigo é descartada.

## S18 — Erros públicos

Compilação:

- `PERFIL_INVALIDO`;
- `PERFIL_INCOMPATIVEL`;
- `METRICA_PERFIL_INDISPONIVEL`;
- `CONFIRMACAO_DIVERGENTE`;
- `CAMPO_RECEITA_AUSENTE`;
- `RECEITA_INVALIDA`;
- `FINGERPRINT_PERFIL_DIVERGENTE`;
- `BUILD_DIVERGENTE`;
- `VERSAO_GERADOR_NAO_SUPORTADA`.

Comparação:

- `EXECUCAO_AUSENTE_NO_PAYLOAD`;
- `EXECUCAO_NAO_BEM_SUCEDIDA`;
- `COMPARACAO_INCOMPATIVEL`;
- `DIFERENCA_NAO_DECLARADA`;
- `REPETICOES_NAO_PAREADAS`;
- `ENVELOPE_INCONSISTENTE`;
- `EFEITO_MARGINAL_INDISPONIVEL`.

Erros têm código, mensagem segura, caminhos, detalhes tipados recuperáveis e request
ID. Stack trace, token, ordens e valores financeiros não entram na resposta ou log.

`ComparisonCompatibilityError` estende o erro público com
`details.compatibility: CompatibilityReport`; este é o corpo do `422`. JSON malformado
ou schema inválido retorna `400`, autenticação `401`, conflito semântico/idempotente
`409`, payload acima do limite `413` e incompatibilidade analítica `422`. O endpoint
stateless não usa “não encontrado” para artefato local ausente.

Limites de transporte: compilação aceita até 1 MiB e responde até 8 MiB; comparação
aceita até 16 MiB e responde até 8 MiB. Título tem até 120 caracteres, razão até 2.000,
delta até 200 changes, participantes até 100, ordens até 1.000 e repetições exatamente
1, 10, 30 ou 100. O servidor rejeita antes do processamento pesado e nunca trunca
silenciosamente resposta, relatório de compatibilidade ou evidência.

## S19 — Segurança e isolamento

- ambos os endpoints exigem token validado;
- todos os owners transmitidos precisam coincidir com `sub`;
- respostas usam `Cache-Control: no-store`;
- modelos Pydantic são estritos e rejeitam campos extras, NaN, infinito e versões
  futuras;
- payload de compilação leva Perfil agregado, nunca arquivos ou ordens observadas;
- payload de comparação leva snapshots necessários, sem binários ou credenciais;
- limites existentes de 100 participantes e 1.000 ordens continuam validações duras;
- textos de título/razão são dados não confiáveis, limitados e renderizados como texto;
- logs contêm IDs, versões, fingerprints, estado, contagens e duração, nunca conteúdo
  financeiro ou PII;
- invariantes Python usam `raise` e passam sob `python -O`;
- IndexedDB continua isolado por owner e project ref.

Os endpoints são stateless: verificam autenticação, igualdade de owner declarado,
schemas, fingerprints e consistência interna, mas não atestam que o documento veio do
IndexedDB nem que um SHA-256 foi emitido por parte confiável. A autoridade sobre o
Estudo local permanece no `ApplicationRepository`. Essa fronteira não concede acesso
a dados de outro owner, pois os endpoints não buscam artefatos por ID; não se introduz
assinatura ou persistência remota nesta etapa. Jobs persistidos em memória continuam
usando 404 para ocultar IDs de outro owner, como na Etapa 3.

## S20 — Acessibilidade

- fluxo completo por teclado, ordem de foco coerente e foco visível;
- ao bloquear ou falhar, foco vai ao resumo e há links para os campos;
- modais/drawers restauram foco ao acionador;
- zoom de 200% sem perda de ação ou conteúdo e sem rolagem horizontal da página;
- gráficos sempre têm tabela equivalente e descrição textual;
- base e hipótese usam rótulos, padrões e ícones além de cor;
- deltas usam sinal textual e unidade, não apenas verde/vermelho;
- progresso expõe `aria-live` sem anunciar cada polling;
- blockers e indisponibilidades têm código humano, motivo e próxima ação;
- ECharts permanece decorativo quando a tabela contém a informação canônica.

Aceite visual usa Chromium fixado em 1280×800 a 100% e 640×800 como equivalente a
zoom 200%. O canvas/SVG redundante recebe `aria-hidden="true"`; título e descrição
identificam a tabela canônica por `aria-describedby`. Testes verificam foco inicial em
erro, retorno de foco do drawer, ausência de elemento focável oculto e acesso a todas
as ações sem ponteiro.

## S21 — Limites e medição obrigatória

O contrato preserva:

- 10, 30 ou 100 **repetições** por diagnóstico gerado;
- máximo estrutural atual de 100 participantes por `EffectiveInput`;
- máximo estrutural atual de 1.000 ordens por preparação.

Esses máximos não constituem promessa de desempenho. Antes de liberar a UI, um
artefato de benchmark mede, no mesmo build candidato:

- compilação/materialização em 1, 10, 30 e 100 participantes, até 1.000 ordens;
- comparação pareada em 10, 30 e 100 repetições;
- persistência/reload com 1, 5, 10 e 20 variantes;
- tamanho serializado de Estudo, execuções e comparações;
- tempo e memória, incluindo pior caso aceito.

Protocolo reproduzível:

- build de produção, Python e Chromium Playwright nas versões fixadas pelo lockfile;
- runner limitado a 4 CPUs lógicas e 8 GiB, versão/SO registrados;
- cinco aquecimentos e vinte amostras; decisão pelo p95 e pico de RSS;
- compilação de 100 participantes/até 1.000 ordens: p95 ≤ 5 s, RSS incremental
  ≤ 1 GiB e resposta ≤ 8 MiB;
- comparação de 100 pares: p95 ≤ 2 s, RSS incremental ≤ 512 MiB e resposta ≤ 8 MiB;
- save + reload de 20 variantes: p95 ≤ 2 s, documento lógico ≤ 50 MiB;
- ações síncronas da UI não produzem long task > 200 ms no caminho medido.

O cap de variantes é o maior candidato entre 1, 5, 10 e 20 que satisfaz todos os
budgets em duas execuções completas consecutivas. Se nem cinco variantes passarem, a
entrega fica bloqueada para decisão arquitetural; não se escolhe cap menor em silêncio.
Teste automatizado cobre `cap` e `cap + 1`. O produto não alega suporte acima do maior
caso medido nem reduz os tetos estruturais existentes sem decisão explícita.

## S22 — Estratégia de testes

### S22.1 Contratos e domínio

- fixtures douradas Python ↔ OpenAPI ↔ TypeScript para Receita e Comparação;
- derivação decimal, confirmações, indisponibilidade e ausência de defaults;
- fingerprint independente de ordem de chaves e sensível a toda mudança semântica;
- materialização reproduzível para mesmas seeds;
- compilador futuro não reinterpreta v1;
- delta tipado aplica uma vez e reproduz snapshot; change proibido falha;
- compatibilidade cobre cada blocker isoladamente;
- delta estatístico usa pares, não diferença de percentis;
- marginal disponível com um change agregado elegível, indisponível com dois e
  indisponível para add/remove/alteração de participante;
- nenhum DTO público contém benefício individual.

### S22.2 Persistência

- fixtures V1, V2 e V3 chegam a V4 sem perda;
- versão futura, corrupção e falha intermediária preservam origem;
- migration e replay de `operationId` são idempotentes;
- variantes, execuções e comparações são imutáveis/append-only;
- CAS, duas abas, owner divergente, purge e rollback;
- reload mantém base, variante, Receita, seleção terminal e comparação.

### S22.3 Fluxos e concorrência

- criar Receita completa, bloquear lacuna e corrigir confirmação divergente;
- Perfil novo não altera Receita antiga;
- base → variante → execução → comparação;
- A→B→A, resposta tardia, retry, reload e interrupção de servidor;
- comparação não executa motor;
- múltiplas mudanças removem o rótulo marginal;
- incompatibilidade é explicada antes do bloqueio.

### S22.4 Acessibilidade e regressão

- teclado, foco, nomes acessíveis, `aria-live`, zoom 200% e tabela dos gráficos;
- testes E2E dos caminhos crítico e bloqueado;
- testes integrais Python e web das Etapas 1–3;
- `pytest -q`, `python -O -m pytest -q`, testes web, build e smoke autenticado.

### S22.5 Matriz de regressão herdada

| Herança | Fonte de aceite | Prova mínima no SHA candidato |
|---|---|---|
| Etapa 1 — auth, shell, estudo e prévia | `docs/frontend/etapa-1-operacao.md` e spec/plano da Etapa 1 | unitários, E2E local, build e smoke autenticado das rotas existentes |
| Etapa 2 — importação, Caso Observado, origens e recovery | `docs/frontend/etapa-2-v2-aceitacao.md` | todos os critérios do documento ligados a testes, fixtures de migration e E2E crítico |
| Etapa 3 — Empresas, Perfil e diagnóstico | `docs/frontend/etapa-3-aceitacao.md` | os 18 critérios `PASS`, incluindo fila, terminal único, owner, perfil e sete eixos |
| Contratos cruzados | OpenAPI, fixtures e storage V1/V2/V3 | geração sem diff, validação Python/TS, upgrade/rollback/replay |

Comandos globais obrigatórios:

```text
pytest -q
python -O -m pytest -q
cd web && npm run generate:api
cd web && npm run lint
cd web && npm run typecheck
cd web && npm run test:unit
cd web && npm run build
cd web && npm run test:e2e
```

O relatório final registra SHA, SO/runtime, comandos, exit codes, contagens, matriz
critério→teste e links para evidências visuais. Critério herdado sem teste/evidência é
falha, mesmo que a nova rota da Etapa 4 passe.

## S23 — Critérios de aceite

1. Perfil válido produz os mesmos fingerprints semânticos, `EffectiveInput` e ordens
   para as mesmas entradas/seeds, independentemente de IDs/timestamps de transporte.
2. Métrica indisponível ou campo explícito ausente bloqueia sem fallback.
3. Perfil, Receita, entrada, materialização, origem, cenário, delta, hipótese,
   variante, execução e comparação têm identidades/fingerprints distintos e
   reconciliados.
4. `OPERATIONAL_PROFILE` só existe após materialização completa validada.
5. Variante preserva base, delta e resultado integral e não muda com edição da base.
6. V2/V3 abrem como V4; V1 suportado sem variantes é importado, e V1 com variantes
   legadas é preservado/rejeitado explicitamente, sem Receita ou variante inventada.
7. Comparação rejeita toda divergência estrutural ou não declarada.
8. Distribuição compara deltas pareados e separa execução selecionada.
9. Os sete eixos mantêm definição, unidade, disponibilidade e proveniência.
10. “Efeito marginal” aparece somente com um change elementar compatível.
11. Nenhuma tela/API afirma causalidade, previsão ou benefício individual.
12. Executor da Etapa 3 é reutilizado sem acoplamento da comparação à UI.
13. Duas abas, A→B→A, retry, reload e respostas tardias preservam autoridade.
14. Fluxo satisfaz teclado, foco, zoom 200%, gráfico+tabela e não depende de cor.
15. Relatório de limites fixa e testa o máximo de variantes antes da entrega.
16. Regressão integral das Etapas 1–3 e invariantes sob `python -O` passam.

## S24 — Riscos e respostas

| Risco | Resposta normativa |
|---|---|
| Perfil parecer previsão | linguagem de projeção sintética e proveniência visível |
| lacuna virar default | blocker obrigatório |
| mudança do gerador alterar histórico | versões e snapshots integrais |
| ruído parecer efeito | seeds/repetições pareadas |
| pacote de mudanças parecer marginal | marginal só com um change |
| resultado agregado virar benefício individual | DTO/UI sem campos per-cliente |
| variante derivada de base editada mudar | snapshots completos imutáveis |
| UI duplicar regra | comparação e compilação canônicas no servidor |
| migration perder histórico | upgrade transacional e fixtures V1–V3 |
| conflito de abas sobrescrever | CAS, operationId e conflito explícito |
| fila em memória parecer durável | `INTERRUPTED` e sem retry automático |
| estudo crescer sem limite | benchmark e cap de variantes antes da entrega |
| futura geração B reinterpretar A | novo compilador/gerador e nova Receita |

## S25 — Revisões independentes

Antes deste gate, três revisões somente leitura confrontaram a especificação com o
pedido, a auditoria e `origin/main`:

- arquitetura e semântica: 5 Important e 3 Minor encontrados e corrigidos;
- contratos, segurança e persistência: 10 Important e 2 Minor encontrados e
  corrigidos;
- rastreabilidade, UI, limites e testes: 10 Important e 2 Minor encontrados e
  corrigidos.

Re-reviews restritos confirmaram todos como `RESOLVED`. Não há finding Critical ou
Important aberto. Entre as correções materiais estão: resolvedor único de cenários
variantes, exclusão de mudanças por participante da análise marginal, autoridade do
cenário sobre janela/custos, escopo estatístico compatível com `RepetitionSummary`,
rotas reais de migration, DTOs públicos completos, fingerprints acíclicos, máquinas
de estado ortogonais e benchmark/regressão com gates objetivos.

## S26 — Gate para o plano técnico

O plano técnico definitivo só pode ser escrito após aprovação explícita desta
especificação. A aprovação autoriza planejar, não implementar, criar issues, fazer
push, abrir PR ou mergear.
