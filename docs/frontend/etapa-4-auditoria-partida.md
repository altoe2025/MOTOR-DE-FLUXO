# Etapa 4 — auditoria de partida

**Data:** 2026-09-20

**Estado:** auditoria encerrada; decisões 1–10 aprovadas; não é plano de implementação

**Base auditada:** `origin/main` em
`a9a633ca9acb2228af7b775edf993d9b818ab8d4`, merge do PR #53

**Candidato funcional herdado:**
`57be68990d4f98f8d6cb4ec7c095f121566811a4`

**Fechamento documental herdado:**
`e5ae430ce186bc11c3f5380852fb0b716f1d4ac1`

## 1. Escopo e método

Esta auditoria cobre a base integrada das Etapas 1–3 e as costuras que a Etapa 4
precisa consumir: Perfil Operacional, preparação/generation, Estudo/Cenário,
diagnóstico, fingerprints, persistência, comparação e análise marginal.

Evidências usadas:

- `git fetch --prune origin` executado em 2026-09-20;
- `origin/main` resolvido no SHA acima;
- PR #53 confirmado como `MERGED`, com check `pytest` concluído em `SUCCESS`;
- inspeção direta dos objetos Git de `origin/main`, sem trocar o checkout local;
- busca de refs, commits, arquivos, PRs e issues do GitHub;
- busca somente leitura no Linear do workspace **Felipe Bisca**, time
  **MOTOR DE FLUXO**.

O checkout local observado estava em `analise/sensibilidade-custo`, com arquivos
não rastreados do usuário. Ele não foi usado como fonte de verdade, não teve branch
trocada e seus arquivos não foram alterados.

## 2. Findings prioritários

### F1 — CONFIRMED / bloqueante: Perfil 1.0.0 não é uma receita geradora

`OperationalProfileVersion` contém volume, frequência, tickets, direção, prazos,
finalidades agregadas, janelas e sazonalidade
(`web/src/profiles/domain.ts:70-108`, cálculo em
`web/src/profiles/calculateOperationalProfile.ts:117-191` e `:252-281`). O gerador
público exige, por participante, `profile`, seed, volume mensal, ticket mediano,
fração OUT, regra de prazo, eFX, finalidade OUT e finalidade IN
(`servidor/contracts/preparation.py:127-193`).

São diretamente aproveitáveis quando `AVAILABLE`:

- volume de referência e escala observada;
- ticket p50;
- fração OUT/IN;
- frequência e cobertura como evidência;
- p50/p90 de prazo como evidência para uma regra escolhida;
- observações sazonais como evidência.

Exigem decisão ou parâmetro explícito:

- participantes e identidade estável de cada participante;
- fator de escala e horizonte alvo;
- seed ou base seed congelada;
- arquétipo/sigma do gerador;
- regra de prazo executável;
- eFX;
- finalidade separada por direção;
- regra temporal executável, pois o gerador atual não consome sazonalidade;
- tratamento de todo campo indisponível.

Finalidade é hoje agregada por código sem dimensão de direção
(`calculateOperationalProfile.ts:117`); eFX não é métrica do Perfil. Portanto esses
valores não podem ser reconstruídos do Perfil sem inferência não autorizada.

### F2 — CONFIRMED / bloqueante: proveniência pública não representa derivação de Perfil

O domínio local possui `DERIVED`, mas `EffectiveSource.kind` aceita apenas
`PADRAO_SINTETICO | ESTIMATIVA_USUARIO`
(`servidor/contracts/preparation.py:101-111`) e `OrigemValor.tipo` não possui uma
categoria de derivação de Perfil (`servidor/contracts/primitives.py:62-70`). Marcar
um parâmetro derivado do Perfil como observado seria falso; marcá-lo como estimativa
ou padrão sintético apagaria a linhagem.

A Etapa 4 precisa de um contrato explícito que preserve, no mínimo, o fingerprint da
versão do Perfil, o caminho da métrica usada, a versão da regra de derivação e os
parâmetros confirmados pelo usuário. Ordens materializadas permanecem sintéticas.

### F3 — CONFIRMED / importante: identidade atual não basta para receita + materialização

Hoje existem identidades distintas para origem, entrada, geração, execução e
proveniência. Porém `fingerprintPortfolioSource` normaliza `source`, `orders` e a
proveniência agregada, sem incluir `generationInputSnapshot`
(`web/src/study/fingerprints.ts:56-101`). O `inputFingerprint` identifica as ordens
materializadas, premissas e período, mas não estabelece sozinho a identidade
semântica de uma receita baseada em Perfil.

A Etapa 4 precisa separar explicitamente:

- fingerprint do Perfil de origem;
- fingerprint da receita imutável;
- fingerprint da materialização/geração;
- fingerprint das ordens materializadas;
- fingerprint da entrada executada;
- fingerprint da execução e da proveniência.

Dois cenários podem produzir ordens iguais por receitas diferentes, ou receitas
iguais podem produzir ordens diferentes por seed. Essas situações não podem colidir.

### F4 — CONFIRMED / importante: variantes têm contêiner, mas não contrato de linhagem

`StudyDocument` já possui `baseScenarioId` e uma lista de `scenarios`; cada
`ScenarioDocument` possui revisão, snapshot, premissas, período e fingerprint
(`web/src/study/model.ts:135-143`, `:227-233`). Contudo não há operação canônica de
criar variante, relação `derivedFrom`, delta tipado, fingerprint de delta ou razão da
hipótese. O domínio atual cria a base e atualiza um cenário existente; não materializa
uma variante imutável (`web/src/study/domain.ts`).

O legado V1 possuía um array `variants`, mas a migration aceita apenas esse array
vazio (`web/src/storage/migrations.ts`). Isso não é uma implementação parcial da
Etapa 4.

### F5 — CONFIRMED / importante: comparação de cenários ainda não existe

A comparação implementada na Etapa 3 é temporal e restrita a Casos/Perfis da mesma
empresa. A rota `/comparar` continua sendo placeholder
(`web/src/app/router.tsx:79`). Não existem:

- matriz base × hipótese;
- contrato de compatibilidade de execuções;
- comparação dos sete eixos;
- contrato HTTP ou envelope canônico de comparação;
- estados de incompatibilidade e explicações específicas da Etapa 4.

A comparação não deve ser derivada ad hoc por componentes. O desenho global atribui
comparação e marginal ao servidor, enquanto a UI apenas apresenta contratos
validados.

### F6 — CONFIRMED / bloqueante: “marginal” legado tem outra semântica

`motor/analise/marginal.py:57` implementa leave-one-client-out e publica
`ganho_proprio_brl` e `ganho_proprio_bps` (`:43-49`). Ele não é usado pelo servidor
ou pela aplicação web. Reutilizá-lo como resposta da Etapa 4 violaria a proibição de
inferir benefício individual e acoplaria a etapa a uma semântica diferente da
comparação agregada base × hipótese.

O módulo é evidência histórica de uma técnica contrafactual, não contrato de produto
da Etapa 4. A definição suportada de marginal precisa ser fechada antes de escolher
qualquer reutilização.

### F7 — CONFIRMED / importante: documentação integrada está parcialmente histórica

O Git prevalece: `origin/main` é o merge `a9a633c`. Entretanto `docs/MAPA.md`,
`docs/frontend/etapa-3-operacao.md`, `docs/frontend/etapa-3-aceitacao.md` e trechos de
`docs/testing.md` ainda dizem que push/PR/merge não ocorreram ou citam `97601bf` como
base vigente. Isso não invalida código ou aceite, mas essas frases não podem ser
copiadas para a especificação da Etapa 4 como estado atual.

### F8 — CONFIRMED / cobertura: não há artefato próprio de Etapa 4

Não foi encontrado documento, branch, PR, commit, implementação parcial ou issue do
Linear especificamente da Etapa 4. As buscas por “Etapa 4”, “Hipóteses”, “análise
marginal” e “geração por perfil” retornaram apenas escopo global e tarefas anteriores.
Não foi criada nem alterada issue.

## 3. Contratos herdados

| Contrato | Versão/estado | Autoridade herdada |
|---|---|---|
| `OperationalProfileVersion` | `1.0.0`, imutável | evidência observada; não executável |
| `StudyDocument` | `3.0.0`, append-only | snapshot integral e histórico de execuções |
| IndexedDB | físico/lógico `2` | nove stores; `ApplicationRepository` é a porta única |
| `PortfolioSource` | três origens | `OBSERVED_CASE`, `AUTHORED`, `SYNTHETIC` |
| `EffectiveInput` / preparação | `1.0.0` | receita efetiva genérica do gerador atual |
| gerador | `dimensionamento-v1` | materializa ordens explícitas e reproduzíveis |
| diagnóstico | request/envelope `1.0.0` | entrada fixa ou 10/30/100 repetições |
| resultado do motor | `2.0.0` | fonte canônica de resultados e alocações |
| persistência | CAS + `operationId` | autoridade entre abas; BroadcastChannel só notifica |
| jobs | memória do processo | não duráveis, sem coordenação multi-instância |

Invariantes herdados:

- owner e epoch de sessão isolam conta e respostas tardias;
- execuções e versões confirmadas são imutáveis/append-only;
- terminal por tentativa é único;
- reload consulta reserva conhecida, sem novo POST automático;
- A→B→A fecha banco/canal e descarta respostas incompatíveis;
- ausência não vira zero;
- UI não recalcula motor, eixos ou regras financeiras;
- motor, P0, custos, IOF e prioridade operacional permanecem fora do escopo.

## 4. Provider → consumer dos fluxos relevantes

### 4.1 Casos → Perfil → evidência do Estudo

```text
ApplicationRepository.listObservedCases
→ checkProfileCompatibility
→ calculateOperationalProfile
→ validateOperationalProfile + fingerprints
→ ApplicationRepository.appendOperationalProfileVersion
→ IndexedDB.profile_versions
→ attachOperationalProfileEvidence por CAS
→ StudyDocument 3.0.0/evidenceSnapshots
```

Consumer atual: páginas de Empresa, estudo e comparação temporal. Não há consumer
executável do Perfil.

### 4.2 Receita genérica atual → ordens materializadas

```text
EffectiveInput
→ PreparationRequest 1.0.0
→ POST /api/v1/preparacoes
→ servidor.preparation.preparar_carteira
→ motor.geracao.gerar_ordens
→ PreparationResponse + generation_fingerprint + input_snapshot
→ resolvePortfolioSource
→ PortfolioSourceSnapshot + generationInputSnapshot + ordens
```

Esse fluxo já oferece determinismo, limites, materialização e snapshot. Ele pode ser
reutilizado internamente, mas não valida hoje se os parâmetros realmente derivam de
um Perfil.

### 4.3 Cenário → execução → persistência → UI

```text
ScenarioDocument + inputFingerprint
→ buildPreviewRequest ou buildDiagnosticRequest
→ FastAPI / executor
→ adaptador → motor → envelope canônico
→ executionService / diagnosticExecutionService
→ reserva + terminal append-only por CAS
→ ApplicationRepository.saveStudy
→ IndexedDB
→ UI validada
```

Para diagnóstico gerado, `buildDiagnosticRequest` falha com
`GENERATION_RECIPE_UNAVAILABLE` quando falta `generationInputSnapshot`
(`web/src/diagnostics/buildDiagnosticRequest.ts:28-59`). Seeds são registradas por
participante e repetição (`:65-78`). Isso permite pareamento futuro de repetições,
desde que a Etapa 4 preserve IDs dos participantes compartilhados e congele o plano
estatístico.

### 4.4 Persistência e concorrência

```text
controller/domain
→ ApplicationRepository
→ validação runtime
→ transação IndexedDB
→ expectedRevision + operationId
→ studies/executions/operations/meta
→ BroadcastChannel como invalidação de leitura
```

`ApplicationRepository` continua sendo a fronteira correta
(`web/src/storage/applicationRepository.ts:39`). O banco está na versão 2; o upgrade
1→2 é transacional (`indexedDbApplicationRepository.ts:365`) e `saveStudy` protege
CAS, idempotência e imutabilidade das execuções (`:818`).

## 5. O que já existe e pode ser reutilizado

- Perfil versionado, validado e integralmente snapshottado;
- função pura de cálculo e fingerprints do Perfil;
- `EffectiveInput`, preparação determinística e `generation_fingerprint`;
- `/api/v1/preparacoes` para materialização genérica;
- `generationInputSnapshot` para repetir geração;
- plano explícito de seeds do diagnóstico;
- sete eixos e envelopes canônicos;
- múltiplos cenários no contêiner do Estudo;
- fingerprints de origem, entrada, geração, execução e proveniência;
- `ApplicationRepository`, CAS, operation log, isolamento por owner e migration 1→2;
- componentes de gráfico + tabela e prova de teclado/zoom da Etapa 3;
- regressões integradas das Etapas 1–3;
- módulo legado de leave-one-client-out somente como referência técnica isolada.

## 6. O que ainda não existe

- `ProfileGenerationRecipe` ou equivalente;
- versão, fingerprint e validador runtime da receita;
- regra canônica Perfil → parâmetros executáveis;
- proveniência pública de parâmetro derivado de Perfil;
- quarta origem `OPERATIONAL_PROFILE`;
- snapshot que reconcilie Perfil, receita, materialização e ordens;
- operação de criar variante preservando a base;
- delta tipado, linhagem e materialização canônica de variante;
- matriz de compatibilidade base × hipótese;
- contrato HTTP e envelope de comparação;
- análise agregada dos sete eixos;
- definição de marginal agregada e seus limites de linguagem;
- migration da Etapa 4;
- UI funcional de comparação;
- limites medidos de variantes, volume e comparação;
- testes de A→B→A, duas abas, reload, retry e resposta tardia específicos da Etapa 4.

## 7. Opções arquiteturais preliminares

Estas opções ainda não constituem decisão aprovada.

### 7.1 Receita

**Recomendação preliminar:** entidade imutável e versionada própria, embutida como
snapshot integral no cenário, referenciando uma versão imutável de Perfil. O Perfil
permanece evidência; a receita contém apenas projeção, escolhas e lacunas confirmadas;
o snapshot contém também as ordens materializadas.

Alternativas:

1. receita dentro do Perfil — rejeitada preliminarmente porque mistura observação e
   hipótese e exigiria mudar a semântica da versão 1.0.0;
2. somente snapshot sem entidade/fingerprint próprios — simples, mas perde linguagem,
   versionamento e comparação de receitas;
3. entidade própria + snapshot integral — preserva autoridade e reprodutibilidade sem
   exigir uma store global antes de haver necessidade comprovada.

### 7.2 Endpoint

**Recomendação preliminar:** contrato próprio para compilar/validar receita de Perfil,
delegando a materialização ao serviço já usado por `/api/v1/preparacoes`. Enviar
diretamente um `EffectiveInput` montado pelo navegador seria conveniente, mas o
servidor não conseguiria provar correspondência com o Perfil nem a proveniência.
Alterar silenciosamente a união do endpoint existente ampliaria seu contrato e risco
de regressão.

### 7.3 Variantes

**Recomendação preliminar:** delta imutável tipado + materialização canônica completa.
O delta explica a hipótese; o cenário materializado é a autoridade executável. Apenas
snapshot completo perde a explicação; apenas delta obriga reconstrução histórica e
fragiliza migrations.

### 7.4 Comparação

**Recomendação preliminar:** comparação pura no servidor, fora da UI e fora do
executor da Etapa 3. Ela consome snapshots e envelopes canônicos, valida
compatibilidade, produz diferenças de entrada antes das diferenças de resultado e
não reexecuta por conveniência. Geração/diagnóstico continuam usando o executor atual.

## 8. Decisões bloqueantes, em ordem

1. **APROVADA em 2026-09-20 — fidelidade da geração v1:** começar com uma projeção
   conservadora sobre o gerador atual, sem alegar reprodução de sazonalidade ou das
   distribuições empíricas do Perfil. A arquitetura deve permitir uma evolução futura
   para um gerador de maior fidelidade sem reescrever resultados históricos: versão do
   gerador, Perfil de origem, premissas, proveniência, receita imutável, ordens
   materializadas e fingerprints ficam preservados. Uma futura versão de maior
   fidelidade cria nova receita/materialização e nova execução; não recalcula nem
   promove silenciosamente cenários produzidos pela v1.
2. **APROVADA em 2026-09-20 — campos derivados versus explícitos:** volume de
   referência, ticket mediano e proporção OUT/IN podem ser pré-preenchidos a partir
   do Perfil, com origem, valor e fórmula visíveis e confirmação do usuário antes da
   geração. Campos ausentes ou semanticamente ambíguos — incluindo eFX, finalidades,
   regra de prazo e arquétipo do gerador — exigem entrada ou escolha explícita. A
   ausência de qualquer campo obrigatório bloqueia a geração; médias, defaults e
   heurísticas silenciosas são proibidos.
3. **APROVADA em 2026-09-20 — identidade e proveniência da receita:** Perfil,
   Receita e Ordens Materializadas são artefatos distintos. O Perfil permanece a
   evidência imutável; a Receita é uma entidade imutável e versionada com as escolhas
   e premissas confirmadas; as Ordens são a materialização executável dessa receita.
   Cada camada possui identidade/fingerprint próprio. Alterar qualquer premissa cria
   uma nova receita, sem sobrescrever a anterior. Cada campo da receita registra se
   foi derivado do Perfil ou informado/confirmado pelo usuário.
4. **APROVADA em 2026-09-20 — ativação de `OPERATIONAL_PROFILE`:** a geração só
   pode ser habilitada quando houver uma versão imutável, válida e compatível do
   Perfil e cada métrica necessária estiver em `AVAILABLE` — o estado pertence às
   métricas, não ao Perfil inteiro. Todos os campos obrigatórios da Receita devem
   estar preenchidos, os valores derivados devem ter sido confirmados pelo usuário,
   e a Receita deve ter sido validada e materializada com sucesso, produzindo Ordens
   e fingerprints. Perfil incompatível, métrica necessária indisponível ou erro
   bloqueia a geração. Uma versão posterior do Perfil não atualiza automaticamente
   receitas existentes, que permanecem vinculadas à versão original.
5. **APROVADA em 2026-09-20 — contrato HTTP próprio:** criar um contrato específico
   para compilar e validar a geração baseada em Perfil, recebendo a versão/snapshot
   do Perfil e as escolhas confirmadas, construindo a Receita e delegando a
   materialização ao serviço já usado por `/api/v1/preparacoes`. O endpoint atual
   permanece com seu contrato genérico, sem incorporação silenciosa da nova origem.
6. **APROVADA em 2026-09-20 — modelo de variante:** cada variante registra o
   cenário-base do qual deriva, a justificativa da hipótese e um delta imutável e
   tipado dos campos alterados, além da materialização canônica completa e imutável
   do cenário resultante. O delta explica a mudança; o snapshot integral permanece a
   autoridade executável. Mudanças posteriores no cenário-base não alteram variantes
   existentes. O Estudo ganha nova revisão de contrato para representar essa linhagem
   sem reativar o modelo legado de variantes V1.
7. **APROVADA em 2026-09-20 — compatibilidade e pareamento:** uma comparação exige
   a mesma versão do motor, política, horizonte, unidade monetária e contrato de
   custos. Somente campos declarados no delta da hipótese podem divergir. Os
   participantes comuns reutilizam as mesmas sementes determinísticas nos dois lados
   para que ruído aleatório não seja atribuído à hipótese. Diferença estrutural não
   declarada bloqueia a comparação com motivo explícito e tipado.
8. **APROVADA em 2026-09-20 — diferença agregada e efeito marginal:** toda
   comparação compatível pode apresentar a diferença agregada simulada entre
   hipótese e base nos sete eixos. O termo “efeito marginal” só pode ser usado quando
   há uma única alteração elementar declarada e as execuções são compatíveis e
   pareadas. Com múltiplos campos alterados, o produto mostra apenas o efeito agregado
   do cenário completo, sem atribuição por variável. Nenhum resultado representa
   causalidade ou benefício real garantido, e nenhum efeito ou benefício individual
   por cliente pode ser inferido ou publicado.
9. **APROVADA em 2026-09-20 — contratos e migrations:** a Etapa 4 introduz uma nova
   versão do formato interno do Estudo (V4), sem implicar outro aplicativo ou versão
   paralela do produto. Documentos V2 e V3 continuam reconhecidos e são migrados de
   forma transacional, preservando o conteúdo existente e acrescentando apenas a
   estrutura nova vazia quando não houver evidência histórica. V1 segue a rota legada
   já existente: documento suportado com `variants: []` é importado; V1 com variantes
   não vazias continua preservado e rejeitado explicitamente, sem reativar semântica
   abandonada. A migration não inventa receitas, variantes ou proveniência
   retroativamente e, se falhar, não destrói a versão anterior. Contratos Python e
   TypeScript compartilham fixtures de conformidade para impedir interpretações
   divergentes.
10. **APROVADA em 2026-09-20, após correção — limites, UI e regressão:** a explicação
    inicial confundiu participantes com repetições. O contrato atual usa 10, 30 e 100
    **repetições** de diagnóstico; `EffectiveInput` aceita no máximo 100 participantes
    e a preparação, no máximo 1.000 ordens, mas esses tetos de validação ainda não são
    evidência de desempenho. A proposta corrigida é preservar 10/30/100 repetições e
    medir tempo, memória e payload variando participantes, ordens e variantes antes
    de definir limites de produto. Qualquer limite deve ser justificado por evidência
    e documentado. A UI deve ter progresso, bloqueios e erros acessíveis; preservar
    estado em troca A→B→A, duas abas, reload, retry e respostas tardias; e a entrega
    exige regressão completa das Etapas 1–3.

## 9. Riscos

| Risco | Impacto | Resposta exigida |
|---|---|---|
| Perfil apresentado como fluxo observado futuro | conclusão falsa | linguagem e tipos separam evidência, receita e ordens sintéticas |
| campo ausente preenchido por média/default | cenário não auditável | blocker ou confirmação explícita com proveniência |
| receita e ordens compartilharem um único fingerprint | colisão semântica | identidades separadas e reconciliação |
| comparação de distribuições não pareadas | ruído atribuído à hipótese | mesma configuração e seeds pareadas para participantes comuns |
| múltiplas mudanças chamadas de efeito marginal | causalidade indevida | distinguir delta agregado de contrafactual marginal |
| leave-one-out legado exposto como benefício individual | violação de escopo | não publicar campos per-cliente; contrato agregado novo |
| variante reconstruída só por delta | histórico pode mudar após migration | materialização canônica integral |
| UI calcular comparação | duas fontes de verdade | contrato canônico de comparação fora de componentes |
| migration perder V1/V2/V3 | perda de estudos | fixtures reais, upgrade transacional, rollback e versão futura |
| fila em memória tratada como durável | recuperação incorreta | manter semântica `INTERRUPTED`, sem retry automático |
| custo cresce por variantes × repetições | travamento ou payload excessivo | medir 10/30/100 e limites antes de fixar números |

## 10. Não objetivos

- alterar `motor/`, P0, netting, custo, IOF ou regra regulatória;
- usar alíquota como critério operacional;
- criar rateio ou benefício individual;
- promover Perfil a fluxo observado;
- iniciar Replay, Etapa 5, chat, PDF, fila distribuída ou publicação;
- tornar a fila da Etapa 3 durável;
- migrar contexto do vault para o repositório;
- criar ou reescrever issues no Linear;
- implementar código de produto nesta sessão.

## 11. Gate desta auditoria

A base integrada está identificada e as costuras atuais foram rastreadas. A
especificação definitiva não deve ser escrita antes de o usuário aprovar, uma a uma,
as decisões estruturais da seção 8. As decisões 1 a 10 estão aprovadas. A auditoria
está encerrada como gate de partida e autoriza a redação da especificação técnica;
não autoriza implementação de produto.
