# Diário de mudanças

Onde o Gabriel e o Felipe registram o que cada um está mexendo e o que já mudou no
GitHub. Serve para que os dois analisem o motor a partir do **mesmo estado**, e não
da lembrança que cada um tem de quando olhou pela última vez.

## A regra

**Toda mudança que vai para o GitHub entra aqui.** Push na `main`, merge de PR,
branch nova que começa a andar, spike que muda de status — tudo. Uma mudança que
não está no diário é uma mudança que o outro vai descobrir tarde, provavelmente
no meio de uma tarefa que já assumiu outra coisa.

Isso não é burocracia; é o remédio para um problema que já aconteceu neste repo —
ver a entrada de 2026-09-05.

Escreva a entrada **no mesmo commit** que faz a mudança, não depois.

## Formato de uma entrada

Quatro partes, sempre nesta ordem. Entradas novas vão **no topo** da lista.

1. **Sintoma** — o que se observou, de fora, que estava errado ou faltando.
2. **Causa** — por que acontecia. A explicação, não a linha de código.
3. **O que foi feito** — a mudança, com os arquivos e as branches envolvidas.
4. **O que isso invalida** — medições, números, previsões escritas à mão,
   critérios de aceitação de issue e conclusões anteriores que deixaram de valer.
   **Esta é a parte que mais importa para o outro.** Se ficar vazia, escreva
   "nada" de propósito — vazio por esquecimento e vazio por verificação parecem
   iguais depois.

## Estado atual das branches

Atualize esta tabela em todo push. A data é do último toque.

Atualizada em 2026-09-23, durante o planejamento da Etapa 6.

| Branch | Situação | Dono |
|---|---|---|
| `main` | Autonetting preferencial e integração final incorporados até o PR #37 (`c2ad175`); grade histórica não regenerada | os dois |
| `netting/p1` | spike do P1, **NÃO MERGEAR** — dominado, e agora sabemos que a folga é zero em N ≥ 50. Só local, nunca foi pro GitHub | Felipe |
| `fix/semantica-remessa-p0` | PR #11, mergeada | Felipe |
| `fix/previsao-temporal-e-colunas-csv` | PR #12, mergeada | Gabriel |
| `feat/teto-e-eficiencia-no-csv` | PR #13, mergeada | Gabriel |
| `feat/netting-incremental-no-csv` | PR #14, mergeada | Gabriel |
| `perf/netting-sem-custo-quadratico` | PR #15, mergeada | Gabriel |
| `docs/estado-das-branches` | PR #16, mergeada | Gabriel |
| `geracao/arquetipos`, `modelo/*`, `varredura/grid-mix-janela` | mergeadas em 2026-09-04 | Gabriel |
| `gabriel/metrica-tempo` | PR #21, mergeada na `main` | Gabriel |
| `gabriel/varredura-completa` | PR #22, atualizada sobre `main`, CI verde e mergeada | Gabriel |
| `gabriel/mix-outbound` | PR #23, atualizada sobre `main`, CI verde e mergeada | Gabriel |
| `analise/sensibilidade-custo` | PR #24, sensibilidade, estresse, limites e fluxo hipotético mergeados | Codex |
| `codex/frontend-base-docs` | PR #25, design, ambiente e planejamento da etapa 1 mergeados | Codex |
| `codex/fechamento-funcional-integracao` | PR #26, fechamento funcional mergeado após 504 testes e CI verde | Codex |
| `codex/mot16-contratos` | PR #27 mergeada; contratos HTTP, identidade, apresentação, locks e CI corrigido | Codex |
| `codex/mot17-adaptador` | MOT-17 entregue pelo PR #30; implementação e verificação local concluídas | Codex |
| `codex/mot18-api` | MOT-18 integrada pelo PR #31, CI verde | Codex |
| `feat/mot19-shell-acessivel` | PR #29 atualizado sobre a MOT-18; shell e componentes preservam o proxy da API | Codex |
| `codex/mot20-auth` | PR #32, mergeada na `main`; MOT-20 concluída com convite, rascunho e POST autenticado reais | Codex |
| `codex/mot21-client-integracao` | PR #33 mergeado na `main`; implementação, CI e gate Supabase real verdes | Codex |
| `codex/mot22-aceitacao-ci` | PR #34 mergeada na `main`; aceitação, CI e handoff da etapa 1 entregues | Codex |
| `codex/autonetting-preferencial` | PR #36 mergeado na `main`; grade histórica não regenerada | Codex |
| `codex/mot62-planejamento-etapa2-v2` | documentação da MOT-62; IDs, dependências e auditoria da Etapa 2 v2, sem código de produto | Codex |
| `codex/mot63-observed-contracts` | implementação e documentação da Etapa 2 v2; aceite **CONDITIONAL**, sem push/PR/merge e sem início da Etapa 3 | Codex |
| `codex/frontend-etapa-3` | T0–T12 concluídos localmente; gate global verde em `57be689`; aceite técnico **PASS**; sem push/PR/merge | Codex |
| `codex/etapa-4-mvp` | MVP e Evolução B aceitos localmente até MOT-85; sem push/PR/merge/deploy | Codex |
| `codex/fix-reconciliacao-decimal` | correção da aritmética exata dos mecanismos da análise, pronta para merge na `main` | Codex |
| `codex/frontend-etapa-5` | MOT-86–MOT-89 concluídas e aceitas localmente; Replay Fronteira Viva funcional até o limite efetivo medido; sem push/PR/merge/deploy | Codex |
| `codex/frontend-etapa-6-planejamento` | Etapas 6A/6B e D1/D2 da MOT-96 concluídas localmente; 6C tem aceite local separado; sem push, PR, merge ou deploy | Codex |
| `codex/mot97-validation-worker` | MOT-97: profiling e estabilização local por certificado efêmero + uma cedência; worker revertido; sem push, PR, merge ou deploy | Codex |

Essa pilha e as MOT-16–MOT-22 foram integradas na `main` pelos PRs #21–#34. O PR #17 continua aberto e
separado deste trabalho. Apagada em 2026-09-06 a branch remota
`github.com/altoe2025/MOTOR-DE-FLUXO`
— push acidental (nome de branch = URL do repo), sem código exclusivo, nunca foi PR.

## 2026-09-24 — Célula H2 sem header não vira finalidade (MOT-90, Task 2 fix)

1. **Sintoma.** Um XLSX com os sete headers obrigatórios e H1 ausente podia conter
   texto em H2; o parser absorvia esse texto como `finalidade_codigo` observada.
2. **Causa.** O preflight aceitava corretamente o layout de sete colunas, mas a
   serialização sempre lia a oitava célula, sem verificar se H1 declarava a coluna.
3. **O que foi feito.** Na branch `codex/finalidade-importador`, o parser só lê H2
   como finalidade quando H1 contém `finalidade_codigo`. Sem esse header, a chave
   canônica é `null`; um teste OOXML cobre o caso e preserva o layout de oito colunas.
4. **O que isso invalida.** Texto fora de uma coluna declarada deixa de adquirir
   proveniência de finalidade observada por posição.

## 2026-09-24 — XLSX e Caso Observado aceitam finalidade ausente (MOT-90, Task 2)

1. **Sintoma.** O XLSX sem `finalidade_codigo` falhava no preflight; com a coluna
   vazia, a revisão emitia `PURPOSE_MISSING` e a conversão para Estudo recusava a ordem.
2. **Causa.** O layout exigia oito headers, a validação gerava erro para finalidade
   ausente e o resolvedor de carteira rejeitava `purposeCode: null`.
3. **O que foi feito.** Na branch `codex/finalidade-importador`, os sete headers
   operacionais permanecem obrigatórios e a finalidade é aceita somente como oitava
   coluna opcional. Ausência e célula vazia viram `null`, sem erro ou warning de
   finalidade. A proveniência `NOT_COLLECTED` e o `null` seguem para o snapshot;
   o editor de ordens explícitas mostra vazio e salva `null` ou texto validado.
   Testes do parser, validação, revisão, snapshot e editor cobrem o percurso.
4. **O que isso invalida.** A afirmação de que o layout exige oito colunas e de que
   uma finalidade ausente torna o Caso inelegível ou impede converter a ordem para
   Estudo. O gate de execução por catálogo é tratado pelas tasks seguintes.
## 2026-09-24 — Catálogo informativo sem gate de execução (MOT-90, Task 3)

1. **Sintoma.** Estudos descendentes de XLSX com premissas persistidas eram
   impedidos de executar prévia, diagnóstico/retry ou abrir Replay e Apresentação
   quando o catálogo estava ausente, indisponível ou sem o par finalidade/direção.
2. **Causa.** Um gate de catálogo condicionava o uso de snapshots reproduzíveis
   a uma consulta externa, embora os custos já estivessem no cenário salvo.
3. **O que foi feito.** Na branch `codex/finalidade-execucao`, os quatro
   consumidores deixam de consultar o catálogo para autorizar execução. O módulo
   de gate e seu teste foram removidos, junto com opções e imports dos chamadores.
   A importação passa a informar `hasPurposeRules` pela presença de finalidades
   e exibe aviso de IOF padrão por direção sem impedir confirmar o Caso.
   Testes RED/GREEN cobrem os serviços, retry, Replay, Apresentação e revisão.
4. **O que isso invalida.** Catálogo não configurado ou indisponível deixa de
   significar execução bloqueada. Validação de snapshots, autenticação, identidade
   e persistência continuam vigentes; esta task não altera parser ou contratos.
## 2026-09-24 — Comunicação distingue IOF específico e fallback (MOT-90, Task 4)

1. **Sintoma.** O documento de comunicação listava premissas de IOF, mas não dizia
   se a carteira da execução usou pares específicos, fallback por direção ou ambos;
   no diagnóstico, uma finalidade `null` aparecia como célula vazia.
2. **Causa.** A projeção não classificava as ordens por par exato
   `(finalidade, direção)`, e a tabela de resíduo imprimia a chave nula sem rótulo.
3. **O que foi feito.** Na branch `codex/finalidade-comunicacao`, o fato
   `IOF_APPLICATION_MODE` passou a refletir exclusivamente ordens e regras do
   snapshot da execução selecionada. Duas evidências canônicas compactas
   apontam para a tabela de regras e o fingerprint da entrada. Com o Estudo
   fornecido, o validador recompõe o modo e rejeita adulteração; sem o Estudo,
   valida enum, referências e fingerprint documental. A apresentação traduz os
   três modos e informa que são
   premissas da simulação, sem cotação. O diagnóstico mostra "Finalidade não
   coletada" somente na UI, mantendo `null` nos dados. O contrato Python de
   `CommunicationDocumentV1` reconhece esse único fato derivado mediante enum
   e as duas evidências canônicas esperadas, preservando igualdade literal para
   todos os outros fatos; `ChatRequestV1` aceita o documento completo. Direção
   não textual dentro da tabela de evidência é rejeitada como erro de validação,
   inclusive quando vier como lista ou objeto JSON, sem `TypeError` no chat.
4. **O que isso invalida.** O documento anterior não permitia concluir qual regra
   de IOF foi aplicável à carteira. Nenhuma alíquota, custo ou resultado numérico
   mudou; o fato descreve a regra por ordem, não atribui custo por cliente.

## 2026-09-24 — Núcleo aceita finalidade ausente (MOT-90, Task 1)

1. **Sintoma.** Um cenário com `finalidade: null` era carregado como a string
   `"None"`, e requests HTTP e a quebra de resíduo por finalidade rejeitavam `null`.
2. **Causa.** O loader convertia toda finalidade com `str`, e os contratos de ordem
   e de diagnóstico exigiam texto mesmo quando a regra de IOF por direção já
   oferecia fallback.
3. **O que foi feito.** Na branch `codex/frontend-etapa-6-planejamento`, o domínio,
   o custo, os contratos de entrada e o diagnóstico passaram a preservar a ausência
   explícita. Proveniência `NAO_COLETADO` é aceita em finalidade somente quando o
   valor é `null`. OpenAPI e validators foram regenerados; testes de YAML, request,
   adaptador, identidade, custo e diagnóstico cobrem o caminho.
4. **O que isso invalida.** A exigência de finalidade textual em toda ordem e em
   todo item de `by_purpose` deixa de valer. Regras específicas de IOF continuam
   exigindo finalidade textual, e `by_day` continua com chave textual. A execução
   importada ainda depende das mudanças de fluxo e interface das próximas tasks.

## 2026-09-24 — Finalidade deixa de bloquear importação observada (MOT-90)

1. **Sintoma.** O percurso XLSX chegava até Caso, Perfil e Estudo, mas qualquer
   execução descendente era bloqueada enquanto o catálogo permanecesse
   `NAO_CONFIGURADO` ou não contivesse todos os pares finalidade/direção.
2. **Causa.** A cautela de não inventar conteúdo regulatório foi implementada como
   gate operacional, embora o motor já possua fallback de IOF por direção e o
   cenário persista um snapshot próprio das premissas.
3. **O que foi feito.** Gabriel aprovou o design que torna
   `finalidade_codigo` opcional e não bloqueante. Foi registrada a especificação
   `docs/superpowers/specs/2026-09-24-finalidade-opcional-importacao-design.md` e
   o plano TDD/paralelizável
   `docs/superpowers/plans/2026-09-24-finalidade-opcional-importacao-plano.md`.
   Código e contratos ainda não foram alterados nesses commits.
4. **O que isso invalida.** Após a futura implementação, deixam de valer o gate
   por `status=NAO_CONFIGURADO`, a exigência de par finalidade/direção para toda
   ordem importada e o bloqueio correspondente no aceite local da Etapa 6. Até
   essa implementação, o comportamento corrente continua sendo o documentado nas
   especificações anteriores.

## 2026-09-24 — Revisão do aceite local e da lixeira (MOT-99 / D6)

**Sintoma.** A lista principal ocultava Estudos excluídos, mas não havia
caminho para sua lixeira; `onRestore` ficava inacessível. O smoke opt-in podia
aceitar ausência de provider como resultado verde ou ignorar configuração
inválida. A reconciliação local do chat não verificava o documento enviado.

**Causa.** O filtro `deletedAt === null` era aplicado antes de renderizar todas
as ações. Runner e spec usavam guards diferentes; o smoke aguardava apenas
dois artigos de chat, sem conferir HTTP, estado terminal nem citações.

**O que foi feito.** A lista ganhou vista de lixeira no mesmo fluxo, operável
por teclado, com restauração de Estudo comum e reabertura com ID/fonte
preservados. Um guard puro único valida URL/credenciais para runner e spec;
testes Node locais exercitam 503, timeout, provider ausente, fingerprint e
citações inválidos. O smoke não executado exige resposta POST 200, ASSISTANT
SUCCEEDED identificada por mensagem e conteúdo/fontes renderizados. O E2E
local compara o request do chat com a seleção, métricas, evidências e
fingerprint do Documento de Comunicação esperado. As baselines Windows de
Estudos e chat foram revistas para a nova entrada de lixeira. Sem Render,
push, PR ou deploy.

**O que isso invalida.** Ocultar da lista principal não bastava para declarar
exclusão reversível; dois artigos de chat não demonstravam provider real
concluído. `LOCAL_ACCEPTANCE=FAIL` e `PUBLISHED_ACCEPTANCE=NOT_RUN` permanecem.

## 2026-09-24 — Aceite local separado da publicação (MOT-99 / D6)

**Sintoma.** A Etapa 6 tinha provas separadas de importação, demonstração, chat,
apresentação, PDF e contêiner, mas faltava um percurso transversal que mostrasse
explicitamente o que ainda impede o piloto publicado.

**Causa.** O catálogo de finalidades do XLSX continua `NAO_CONFIGURADO`, então
um Estudo observado importado não pode reservar diagnóstico. As imagens visuais
revisadas são Windows; o runner Linux e a imagem Docker não foram executados
neste host. A URL Render também não existe nesta tarefa.

**O que foi feito.** No worktree `codex/mot99-local-acceptance-implementation`,
`stage6-acceptance.spec.ts` percorre importação real até o bloqueio, cinco mixes
demonstrativos, reconciliação entre Diagnóstico/Replay/chat/Painel A/PDF,
deep links, reload, privacidade, troca de conta e falhas locais. O smoke
`stage6-render-smoke.spec.ts` fica isolado em projeto opt-in; o runner exige
autorização explícita, URL HTTPS e credenciais efêmeras antes de abrir o browser.
Operação, matriz, artifacts e gate foram documentados em `docs/frontend/`,
`docs/testing.md` e `docs/MAPA.md`. Nenhum Render, Supabase ou OpenAI real foi
chamado; não houve push, PR ou deploy. A MOT-99 permanece em progresso.

**O que isso invalida.** Passar nos testes demonstrativos não prova que o
percurso observado chega a um relatório. `LOCAL_ACCEPTANCE=FAIL` enquanto o
catálogo e os gates locais pendentes não forem resolvidos;
`PUBLISHED_ACCEPTANCE=NOT_RUN` até publicação autorizada e smoke HTTPS.

## 2026-09-24 — Estudos excluídos deixam a lista principal (MOT-99)

**Sintoma.** Depois de excluir um estudo, a tela principal de Estudos continuava
mostrando o cartão com os rótulos “Na lixeira” e “Restaurar”.

**Causa.** A lista principal renderizava indiscriminadamente todos os documentos
recebidos do repositório, inclusive os que tinham `deletedAt` preenchido.

**O que foi feito.** `StudyList` passou a renderizar e a calcular o estado vazio
somente com estudos ativos. Um teste RED/GREEN cobre uma lista mista e garante que
o estudo excluído e sua ação de restauração não aparecem na tela principal. A
exclusão continua sendo lógica no armazenamento; nenhum dado foi apagado.

**O que isso invalida.** Apenas a apresentação anterior que misturava lixeira e
estudos ativos. Estudos excluídos permanecem preservados localmente.

## 2026-09-24 — Testes de restore e contexto diagnóstico estáveis (MOT-97, revisão D3)

**Sintoma.** Após integração local, a suíte web falhou em três testes: status
`SAVED` em vez de `DIRTY` após restore explícito, e dois timeouts de UI lazy.

**Causa.** O teste de restore usava autosave real de 10 ms e aguardava a criação
assíncrona de outro estudo após editar. Um atraso controlado de 25 ms reproduziu
`SAVED`: o autosave completou, mas a edição foi preservada e o restore retornou
`null`. Esse teste usa repositório duplo e não passa pelo certificado ou pela
divisão cooperativa. Os outros dois testes tinham limites locais menores que o
trabalho de fixture/renderização sob carga; isolados, ambos passaram.

**O que foi feito.** O teste de restore usa `ManualScheduler` para manter o
autosave pendente enquanto verifica que o restore não substitui a edição. Só os
dois testes de UI afetados receberam limites locais compatíveis com os outros
testes lazy do arquivo; timeout global e budgets de desempenho não mudaram.
Vinte repetições isoladas do caso de restore, os três arquivos juntos (80 testes)
e a suíte web completa (1.013 testes) passaram. Typecheck, lint e build passaram.
Não houve mudança de runtime, push, PR ou deploy.

**O que isso invalida.** O status `SAVED` observado não demonstrava uma regressão
do certificado/yield: era o autosave legítimo avançando enquanto o teste
aguardava. Nenhuma medição de desempenho ou regra de validação muda.
## 2026-09-24 — Endurecimento do certificado efêmero (MOT-97, revisão D3)

**Sintoma.** Uma leitura de `WeakMap.get` confundia ausência de entrada com
owner esperado `undefined`, permitindo pular a validação do builder para raw
sem owner. `Object.freeze` não impede mutadores de `Map`/`Set`; o schema aberto
de `PREVIEW.observedComparison` podia receber esses objetos.

**Causa.** A checagem usava apenas igualdade do retorno de `WeakMap.get`; a
fábrica não restringia a árvore a valores JSON/plain antes de certificar.

**O que foi feito.** Na branch local `codex/mot97-validation-worker`, o
certificado exige entrada real no `WeakMap` e owner esperado string válido. A
fábrica rejeita owner ausente e não certifica `Map`, `Set`, `Date`, classe,
getter ou ciclo, inclusive aninhados. Testes RED/GREEN cobrem raw sem owner e
fingerprint adulterado, factory com owner ausente e PREVIEW exótico. Depois da
correção, três séries consecutivas de 20 amostras passaram: abertura p95
752/754/790 ms, Documento 222/209/223 ms, zero long tasks. Suíte web
1.013/1.013, typecheck, lint, build, orçamento e 7 E2Es PASS. Sem push, PR,
deploy ou alteração de Linear.

**O que isso invalida.** A garantia anterior de que somente identidades
imutáveis podiam ser certificadas dependia de duas condições ausentes; os
resultados de desempenho anteriores ao endurecimento não servem como gate do
estado atual. Aceite permanece local a Chromium Windows e à fixture medida.

## 2026-09-24 — Certificado efêmero e uma divisão na validação persistida (MOT-97, D3)

**Sintoma.** O worker de sessão e o fatiamento cooperativo amplo não sustentaram
o orçamento de abertura; omitir só a segunda validação ainda deixou uma long
task de 202 ms numa das séries.

**Causa.** A leitura persistida continuava fazendo uma sequência longa de
validação estrutural, fingerprints e execuções na mesma abertura; o builder
repetia a validação integral de um estudo recém-validado.

**O que foi feito.** Na branch local `codex/mot97-validation-worker`, a leitura
agora clona antes do primeiro `await`, valida todas as regras com owner explícito,
cede uma macrotask antes das execuções, congela profundamente e certifica apenas
a identidade do snapshot num `WeakMap` privado. O builder omite a segunda
validação integral apenas dessa identidade imutável; os outros inputs e todas
as verificações restantes permanecem. Raw, clones e objetos forjados continuam
validados. Três séries consecutivas finais de 20 amostras passaram: abertura p95
745/792/752 ms, Documento 218/224/234 ms e zero long tasks em todas. Uma
sequência anterior também passou; a medição final foi repetida após preservar
`INVALID_STRUCTURE` para entradas persistidas não clonáveis.
Suíte web 1.011 testes, typecheck, lint, build, sete E2Es e orçamento de bundle
passaram. Detalhes e limites em
`docs/frontend/etapa-6-acessibilidade-desempenho.md`. Sem push, PR, merge,
deploy ou alteração de Linear.

**O que isso invalida.** A conclusão anterior de que não havia estabilização
local possível com escopo estreito foi superada pela combinação das duas medidas.
O aceite ainda não vale para Linux/CI, dispositivos ou estudos maiores; não há
aceite publicado. Nenhuma métrica financeira muda.

## 2026-09-24 — Perfil de validação e worker revertido (MOT-97, D3)

**Sintoma.** O gate de 20 amostras oscilava entre zero e long tasks de abertura
acima de 200 ms, apesar dos pontos de cedência adicionados ao builder.

**Causa.** A leitura persistida e o builder executam o validador completo de
`StudyDocument` no main thread. No perfil local, cada validação levou 70–138 ms;
as fases podem somar-se ao trabalho de abertura.

**O que foi feito.** Na branch local `codex/mot97-validation-worker`, foram
adicionadas marcas de fase e coleta no gate de desempenho. Um worker novo por
pedido eliminou as long tasks, mas elevou a abertura p95 a 1.682 ms. Um worker
pré-aquecido por sessão passou três séries de 20 amostras (p95 1.239, 1.236 e
1.208 ms, zero long tasks), porém falhou em duas séries seguintes (p95 1.968 e
2.629 ms, zero long tasks). Conforme o critério de parada, **todo o worker e a
integração foram revertidos**. Resta apenas profiling, sem alteração da validação
funcional. No estado revertido, novo gate registrou abertura p95 1.139 ms e
20 long tasks >200 ms; typecheck, lint e 43 testes focados passaram. Detalhes em
`docs/frontend/etapa-6-acessibilidade-desempenho.md`.
Sem push, PR, merge, deploy ou alteração de Linear.

**O que isso invalida.** Três séries verdes não demonstram estabilização neste
runner Windows. O aceite de desempenho para o experimento não foi obtido;
baselines Linux/CI e leitor de tela humano continuam pendentes. Nenhuma métrica
financeira muda.

## 2026-09-24 — Escape local no chat não modal (MOT-97, revisão D3)

**Sintoma.** Escape num tooltip externo fechava o chat e roubava foco; após
abrir “Excluir conversa”, Escape fechava o painel mas a confirmação reaparecia
ao reabri-lo. Um evento Escape consumido por um descendente também era ignorado.

**Causa.** Um listener em `document` recebia Escape de qualquer parte da página
e chamava `chat.hide()` diretamente, sem limpar `deleteId` nem considerar
`defaultPrevented` ou propagação.

**O que foi feito.** `ChatPanel` trata Escape somente no `aside`/descendentes,
quando o evento não foi consumido, e reutiliza `close()` para limpar exclusão
pendente e devolver foco. Quatro regressões unitárias cobrem exclusão,
`DefinitionTooltip` externo, `preventDefault` e `stopPropagation`. A auditoria
de acessibilidade afirma explicitamente a região live do histórico aberto,
em vez de apenas contar regiões sem critério.

**O que isso invalida.** A afirmação anterior de que Escape era seguro em
qualquer foco da página não valia para um painel não modal. A documentação D3
agora delimita a asserção de live region ao chat; budgets e baselines Linux
pendentes não mudam. Durante a revisão, o gate de long tasks oscilou entre
6, 48 e 0 entradas >200 ms em três execuções de 20 amostras; a última passou,
mas o gate é instável neste runner e requer repetição controlada antes do
aceite T7. Sem push, PR ou deploy.

## 2026-09-24 — Gates D3 de acessibilidade, visual e desempenho (MOT-97)

**Sintoma.** O JS inicial público excedia 350 KiB gzip (~395,5 KiB); a
geração do Documento de Comunicação produzia long tasks acima de 200 ms.
Faltavam auditoria Axe, baselines de tela/impressão e orçamento executável.

**Causa.** Rotas protegidas e seus validadores eram carregados eager antes do
login. Clone, validação de Estudo, projeção e validação do documento
compartilhavam um turno do main thread. A apresentação não reutilizava seu
documento validado ao abrir o chat, e alvos de retorno eram pequenos.

**O que foi feito.** No worktree local `codex/mot97-stage6-quality` a partir
de `a0d556c`, rotas protegidas foram divididas em chunks, a construção do
documento ganhou pontos de cedência reais sem remover validações, e o chat
reaproveita o documento validado somente com estudo/cenário/execução iguais.
Escape fecha o chat e restaura foco; links de retorno ganharam alvo mínimo.
Entraram testes Axe, teclado, zoom, snapshots Windows de cinco estados e duas
páginas A4, medição de 20 amostras e gate de orçamento no CI. A evidência e as
limitações estão em `docs/frontend/etapa-6-acessibilidade-desempenho.md`. Sem
push, PR, deploy, alteração de Linear ou execução da grade de 27.000.

**O que isso invalida.** O bundle D2 de ~395,5 KiB gzip e a conclusão de que
T7 ainda não tinha teste deixam de descrever esta branch. Não invalida
números financeiros, validação/persistência ou isolamento por owner. As
baselines Linux/CI e a revisão humana com leitor de tela continuam
**NOT_RUN/BLOCKED**; baselines Windows não equivalem a aceite Linux.

## 2026-09-24 — Linha total da receita não é participante (MOT-96)

**Sintoma.** O Painel A exibia 13 participantes para a receita demonstrativa
de 12 clientes.

**Causa.** A receita traz uma linha agregada com `participant_id: null`, e a
projeção textual contava todas as linhas de `composition`.

**O que foi feito.** `web/src/presentation/facts.ts` conta apenas linhas com
`participant_id` de participante. O teste unitário inclui a linha total, e o
Playwright confere “12 participantes” no Painel e no texto do PDF A4.

**O que isso invalida.** A contagem “13 participantes” dos PDFs locais
anteriores não representa clientes; métricas financeiras e valores canônicos
não mudaram. Sem push, PR ou deploy.

## 2026-09-24 — Reconciliação do Painel A e gate PDF (MOT-96, D1/D2)

**Sintoma.** Deep links para a apresentação descartavam comparação e Replay;
premissas e proveniência apareciam como códigos/JSON; o inspetor podia aceitar
texto cortado na borda direita do PDF.

**Causa.** A seleção da rota preenchia ambos os contextos opcionais com `null`;
os fatos eram impressos literalmente; a extração padrão do PyMuPDF cortava
glifos antes de medir suas caixas.

**O que foi feito.** A rota aceita `comparacao` e `dia` explícitos, valida
owner, cenário e execuções atuais, reconstrói a comparação pelo contrato
existente e solicita Replay pelo mesmo pedido validado da página Fronteira
Viva. Comparação e Replay oferecem a entrada “Apresentar”; chat e seleção do
documento seguem o mesmo par/dia. A projeção textual explica receita,
alíquotas, spread, período, origem e limitação de custos sem alterar o
`CommunicationDocumentV1` nem seus IDs de evidência. O helper mede caixas de
texto sem recorte; quatro PDFs sentinela provam rejeição nos lados e limites
verticais. O browser cobre ausência, presença separada e presença conjunta de
comparação/Replay. O PDF tem nove páginas A4, extraídas, renderizadas e
inspecionadas visualmente. Gates e comandos em `docs/testing.md`.

**O que isso invalida.** O aceite D1/D2 anterior só cobria diagnóstico
simples e podia deixar passar texto cortado no PDF; as evidências de oito
páginas e de seleção opcional sempre ausente deixam de valer. A aritmética e
os resultados canônicos da simulação não mudaram. Sem push, PR ou deploy.

## 2026-09-24 — Relatório A4 do Painel A (MOT-96, D2)

**Sintoma.** O Painel A navegável não oferecia impressão fiel, metadados de
proveniência ou evidência de paginação.

**Causa.** A página ainda não tinha ação de impressão, CSS paginado nem um gate
que extraísse e renderizasse todas as páginas geradas pelo navegador.

**O que foi feito.** Na base local de `codex/frontend-etapa-6-planejamento`, a
ação “Salvar PDF” invoca a impressão nativa. O mesmo DOM semântico recebe estilo
A4 retrato, margens de 12 mm e metadados de Estudo, cenário, execução,
`generatedAt`, versão e build SHA, sem owner, sessão ou token. O teste Playwright
confronta métricas, unidades e IDs de fonte com o Documento de Comunicação V1,
confere que chat e controles desaparecem e que o snapshot local não muda. O
helper com PyMuPDF 1.28.2 extrai texto, valida geometria/sobreposição e renderiza
as oito páginas em PNG; todas foram inspecionadas visualmente. A dependência é
somente do extra `web-dev`, não do lock de produção. Sem push, PR, merge ou deploy.

**O que isso invalida.** O registro D1 de impressão pendente deixa de valer nesta
base local. O teste não constitui aceite de acessibilidade/performance D3, build
Docker D4 ou publicação D6; nenhum número da simulação foi recalculado.

## 2026-09-24 — Painel A roteado e seleção explícita (MOT-96, D1)

**Sintoma.** O núcleo da apresentação existia isolado, sem endereço de Estudo,
seleção persistente, retorno ou contexto do chat.

**Causa.** A aplicação e o fallback estático ainda não reconheciam a rota de
apresentação; a página não carregava a execução escolhida do repositório local.

**O que foi feito.** Nesta base local de `codex/frontend-etapa-6-planejamento`,
`PresentationRoute` resolve Estudo, cenário e execução por identidade e owner,
gera o mesmo `CommunicationDocumentV1`, oferece deep links às seis seções e
retorno à seleção do diagnóstico. Shell, chat e servidor estático reconhecem
somente a rota válida. Seleções ausentes, removidas ou incompatíveis mostram
mensagem sem reaproveitar números. A página usa um único marco `main` do shell.
Testes de rota, seleção, arquitetura de métricas e fallback estático passaram.
Sem push, PR, merge ou deploy.

**O que isso invalida.** A nota anterior de que o Painel A não tinha rota deixa
de valer nesta base local. Não altera cálculo financeiro, medições históricas ou
status de publicação; a impressão ainda depende da D2.

## 2026-09-24 — Núcleo isolado do Painel A (MOT-96, D1 parcial)

**Sintoma.** O Documento de Comunicação V1 já era produzido, mas ainda não havia
componentes próprios para uma leitura executiva contínua.

**Causa.** A apresentação da Etapa 6D não tinha um consumidor visual isolado do
contrato de comunicação.

**O que foi feito.** Na branch local `codex/frontend-etapa-6-planejamento`, foram
adicionados domínio, formatter de métricas, página não roteada, cabeçalho, seis
seções e testes sob `web/src/presentation/`. Cada métrica mantém as referências e
IDs de fonte do documento; seleção divergente e referência ausente não exibem
valores reaproveitados. A revisão preservou motivo e fonte dentro da definição
semântica e alinhou dias fracionários ao formato decimal canônico. A integração de
rota, shell, estilos, servidor, impressão e PDF fica para as próximas partes da
MOT-96. Não houve push, PR, merge ou deploy.

**O que isso invalida.** Nada na aplicação roteada ou nas medições existentes. A
MOT-96 continua em andamento; este commit não constitui aceite de deep link,
fidelidade de PDF ou visual A4.
## 2026-09-24 — Histórico inacessível com 20 conversas, C6 (MOT-95)

**Sintoma.** Com a quota de 20 conversas ocupada e uma conversa contendo mensagens,
o histórico e suas fontes ficavam fora do alcance visual; o contêiner media zero
pixels de altura no Chromium a 1280×960.

**Causa.** A lista de conversas crescia no painel flexível e `.chat-messages`,
configurado com `flex: 1` e rolagem própria, encolhia até zero. O teste anterior
usava 20 conversas vazias e não observava o histórico.

**O que foi feito.** Na branch local `codex/mot95-c6-chat-acceptance`, o histórico
ganhou altura mínima de `8rem`. O percurso Playwright agora preenche as 20 conversas
com mensagens e fonte de ajuda, verifica altura e rolagem, alcança a fonte por Tab
e cobre zoom de 200% e viewport estreita. A regressão falhou com `clientHeight = 0`
antes da correção e passou depois.

**O que isso invalida.** O aceite anterior da quota de 20 conversas não provava
acesso às mensagens e fontes. Nenhum dado, contrato ou cálculo financeiro mudou.

## 2026-09-24 — Aceite local do chat contextual, C6 (MOT-95)

**Sintoma.** C5 ainda não tinha aceite ponta a ponta de privacidade/browser. O
painel não oferecia recuperação das quotas; citações para a mesma URL podiam
manter seleção local diferente da citada; o composer saía da viewport no zoom.

**Causa.** As quotas estavam restritas ao armazenamento/serviço, a restauração de
seleção dependia só dos valores da URL e a altura fixa do painel escalava com o
zoom. Os gates anteriores de unidade não percorriam essas interações no browser.

**O que foi feito.** Na worktree isolada `9099`, branch local
`codex/mot95-c6-chat-acceptance`, baseada em `ab32cc4`, foram adicionados provider
fake controlável, aceite Playwright, scanner de artefatos canários e matriz de
privacidade nas fronteiras HTTP/provider/log. Quotas ganharam nova conversa e
exclusão explícita por CAS; citações restauram dia/par em novas navegações; painel
respeita as bordas da viewport. As correções têm regressões RED→GREEN e revisão
independente. Teste real opt-in criado, não executado. Resultados, comandos e
limites em `docs/frontend/etapa-6c-aceitacao.md` e `docs/testing.md`. Sem chave real,
chamada a provider externo, gasto, push, PR, merge ou deploy.

**O que isso invalida.** A ausência de aceite browser/privacidade de C5 deixa de
valer para as rotas implementadas nesta base. A MOT-95 continua In Progress:
Apresentação/impressão não existem aqui e a presença/ausência do chat nessas rotas
aguarda a integração D. Não invalida números financeiros, contratos C1–C5, schemas
ou regras do motor; não demonstra comportamento semântico de um modelo real.

## 2026-09-23 — Contrato HTTP e CAS inicial do chat, C5 (MOT-95)

**Sintoma.** Comparação falhava na validação local antes do fetch; um conflito de revisão antes de gravar PENDING deixava a UI com snapshot antigo.

**Causa.** O contexto local carregava `comparisonExecutionId`, proibido no HTTP estrito, e era copiado inteiro. O primeiro save não reconciliava falhas.

**O que foi feito.** `chatService.ts` projeta os seis campos públicos do request e relê a conversa após falha no CAS inicial. Retry exige nova ação do usuário, sem HTTP automático. Regressões RED/GREEN usam `createApiClient` real com fetch fake. Commit local separado, sem push/PR/deploy.

**O que isso invalida.** O gate anterior com transporte fake não demonstrava envio válido da comparação. Nenhuma regra financeira mudou.

## 2026-09-23 — Reconciliação e identidade de contexto do chat, C5 (MOT-95)

**Sintoma.** Conflito de revisão na finalização podia deixar resposta PENDING e
impedir retry; troca de seleção na mesma URL não marcava contexto anterior; CTA de
comparação enviava ajuda genérica; citações podiam abrir outra execução ou par.

**Causa.** O serviço ignorava a segunda falha de CAS; a UI confundia último
fragmento enviado com seleção atual; a intenção e os links não carregavam a
identidade completa das execuções.

**O que foi feito.** Nesta worktree local, releitura e CAS sobre a revisão vigente
preservam alterações concorrentes e deixam a resposta própria retryable; a
seleção atual controla o marcador de contexto, mantendo o fragmento histórico para
citações. Comparação usa intenção própria; links carregam execução diagnóstica ou
par base/hipótese e as páginas validam a seleção antes de exibir resultados.
Regressões RED/GREEN, typecheck e lint acompanham a correção. Sem push, PR ou deploy.

**O que isso invalida.** Links antigos sem identidade de execução não garantiam
reabrir os valores citados. Uma referência cuja seleção não possa ser reconstruída
aparece indisponível; não se escolhe outra execução automaticamente.

## 2026-09-23 — Cliente, evidências e ajuda contextual, C5 (MOT-95)

**Sintoma.** O chat C1–C4 persistia conversas e atendia na API, mas o cliente
ainda não enviava perguntas, não montava evidências por contexto nem permitia
navegar pelas citações da resposta.

**Causa.** O transporte tipado, a seleção do fragmento, o lifecycle de envio e os
acionadores de contexto são a etapa C5, posterior aos contratos e ao provider.

**O que foi feito.** Neste worktree local sobre C4, `web/src/api/client.ts` ganhou
envio/validação e timeout do chat; `web/src/chat/` ganhou serviço com CAS, retry,
cancelamento, fragmentação e citações navegáveis; telas de diagnóstico, comparação,
Replay, composição e importação receberam **Perguntar sobre isto**. Testes de
unidade e documentação foram adicionados. Nenhum push, PR, merge ou deploy foi
feito; a C6 permanece pendente.

**O que isso invalida.** A afirmação de que o cliente só tem shell passivo do chat
deixa de valer neste worktree. O aceite em browser, a privacidade adversarial da C6
e o comportamento de um provider real não foram validados por esta entrega.
## 2026-09-24 — Blueprint Render free preparado sem publicação (MOT-98)

**Sintoma.** O empacotamento local D4 (`1b69b8f`) não possuía declaração do destino
Render nem procedimento revisável de configuração e rollback.

**Causa.** A publicação ainda era somente planejamento; faltavam fronteiras
explícitas entre build público, segredos de runtime e autorização externa.

**O que foi feito.** D5 adiciona `render.yaml`: um Web Service Docker free,
health `/api/v1/health`, auto deploy desligado, valores sensíveis com `sync: false`
e nenhuma database, disco, cron ou worker externo. Testes estruturais passaram em
RED/GREEN. `docs/deploy-render.md`, README e MAPA registram configuração, convite
Supabase, callbacks, primeiro deploy futuro, cold start, logs, rollback e chat
desativável. Referências oficiais do Render foram consultadas; nenhuma CLI Render
estava disponível para validação remota. Revisão independente concluiu sem achados
pendentes após corrigir contexto Python, CSP/Ajv e gate de drift na CI.

**O que isso invalida.** Nada nas regras ou números do motor. Configuração
preparada não é serviço publicado: criação/sincronização do Blueprint e chamadas
pagas permanecem não executadas. Imagem Docker continua BLOCKED/NOT_RUN pelo erro
local do daemon; MOT-98 permanece In Progress. O bundle estático excede o orçamento
T7, registrado em `docs/testing.md` para MOT-97, sem implementar essa etapa.
Nenhum push, PR, deploy ou recurso pago foi criado.

## 2026-09-24 — Contêiner único e CSP estrita do piloto (MOT-98)

**Sintoma.** A base local `0fd484e` ainda não possuía empacotamento Vite/FastAPI,
entrypoint configurável para a porta da hospedagem ou política de segurança do
browser. Headers estritos revelaram compilação dinâmica Ajv antes do login.

**Causa.** O entrypoint fixava loopback/8000; dependências só tinham lock de dev.
Os validadores do frontend chamavam `ajv.compile` no browser, incompatível com
`script-src 'self'`. A primeira allowlist Docker também omitia `motor/analise`.

**O que foi feito.** Na worktree isolada `codex/mot98-container-render`, D4 inclui
entrypoint puro, headers/CSP, locks com hashes, Docker multi-stage sem root,
contexto por allowlist e smoke sintético read-only com limpeza restrita. A revisão
ganhou regressões para importação a partir do contexto e login Chromium sob os
headers reais. Os validadores Ajv passam a ser gerados antes do runtime, com
schemas e APIs preservados; não se libera `unsafe-eval`. Configuração C3/C4 e
autenticação são mantidas, sem chamadas pagas. Detalhes e evidências em
`docs/testing.md`; plano D4/D5 executado sem MOT-96/MOT-97.

**O que isso invalida.** Invalida considerar o frontend compatível com CSP estrita
apenas pelos testes HTTP. Não altera simulação, métricas ou premissas. Docker
Desktop está bloqueado por erro local de `sailor-ingest.sock`: o build real falhou
por pipe `dockerDesktopLinuxEngine` ausente; smoke da imagem é NOT_RUN. Gates
locais independentes não representam aceite da imagem nem publicação. MOT-98
permanece In Progress; sem deploy, push ou PR.

## 2026-09-23 — Reconciliação das expectativas E2E após B5/B6 (MOT-92)

**Sintoma.** A suíte Playwright integrada esperava que uma sessão expirada ainda
visse a Carteira até clicar em executar e que uma segunda conta não tivesse nenhum
Estudo. O produto já redirecionava imediatamente ao login e instalava o Estudo
demonstrativo sintético por conta.

**Causa.** As asserções de `foundation.spec.ts` e `study-concurrency.spec.ts`
continuaram descrevendo estados anteriores ao catálogo autenticado B5 e à
instalação automática do demo B1/B6.

**O que foi feito.** O teste de sessão expirada passou a exigir o redirecionamento
imediato e a mensagem de expiração. O teste de isolamento passou a admitir somente
o demo canônico na conta B, mantendo a exigência de ausência do Estudo privado da
conta A. Ambos foram reproduzidos em RED antes do ajuste e passaram isoladamente.

**O que isso invalida.** Invalida apenas as duas expectativas E2E antigas; não
altera autenticação, isolamento, instalação do demo, regras financeiras ou dados.
O primeiro gate integral revelou a asserção de isolamento; o segundo passou esse
caso e teve um timeout de 30,9 s no fluxo XLSX durante trabalho paralelo, que
passou isolado em 24,0 s. A suíte integral ainda será repetida sem contenção antes
do aceite final. Sem push, PR, merge ou deploy.

## 2026-09-23 — Correção dos três bloqueios da revisão B6 (MOT-91/MOT-92)

**Sintoma.** O pacote demo gravava `desconhecida+SHA` como versão do motor; o
comando Playwright padrão usava o HEAD do front-end e exigia override manual do
SHA; o aceite cobria apenas comparação incompatível entre mixes independentes.

**Causa.** O JSON havia sido gerado sem a distribuição Python instalada; bundle
e servidor E2E inferiam build pelo commit atual, que muda mesmo sem alterar o
motor; o teste não executava uma hipótese compatível até a tela de Comparação.

**O que foi feito.** O gerador recusa distribuição ausente e o pacote foi
regenerado com `.venv-t5`, versão `0.1.0+5cb78f0b…`; seu SHA-256 é
`5072BA19841153850FE8A6E8FA9DBB378601A460AC9851BCD36694875C295E39`.
O runner E2E controlado deriva o build do pacote versionado sem relaxar o
portão de incompatibilidade do produto. O teste cria hipótese de janela 8 com
ordens reaproveitadas, executa dez repetições com seed fixa no teste, compara
com a base e confere métricas, mudança de janela e evidências do
`CommunicationDocumentV1` contra a tela. Também conserva o caso incompatível.

**O que isso invalida.** O procedimento anterior que exigia
`MOT_E2E_BUILD_SHA` manual e a conclusão de que B6 não tinha comparação
positiva. Tentativas com outras seeds que falharam na agregação continuam
registradas como limitação do motor; esta correção não altera simulação.

## 2026-09-23 — Gate B6 de demonstração e comunicação (MOT-92)

**Sintoma.** B1–B5 tinham testes por camada, mas faltava prova de primeiro acesso,
restauração com Estudo importado presente e igualdade da projeção de comunicação
com Diagnóstico/Replay. A tentativa de comparar dois mixes prontos mostrou
incompatibilidade de seeds e entradas; a de executar hipótese nova revelou
dependência do SHA do pacote e dois erros de agregação em sementes testadas.

**Causa.** O pacote demo fixa o SHA de motor usado ao gerá-lo. O servidor E2E
usava sempre o HEAD atual; os cinco mixes são realizações independentes, enquanto
a comparação exige seeds pareadas e proveniência de mudanças. O teste integrado
e as condições de versão ainda não estavam explícitos.

**O que foi feito.** O E2E B6 percorre instalação, reload, remoção/restauração,
XLSX real até Estudo com bloqueio `NAO_CONFIGURADO`, cinco cenários, repetição,
Replay, hipótese guiada, comparação incompatível coerente com a regra e catálogo
de ajuda. Extrai o `CommunicationDocumentV1` persistido e confere métricas,
rótulos, fingerprints e evidências. O runner aceita SHA, porta e saída isolados;
`docs/testing.md` registra comandos, 4/4 E2E, 879/879 web, 888/888 Python
(2 skips), lint, typecheck, build, Ruff e mypy. Nenhum catálogo fictício entrou
na execução importada. Sem push, PR, merge ou deploy.

**O que isso invalida.** A afirmação de que os cinco mixes prontos podem ser
comparados numericamente entre si não procede no contrato vigente; a projeção
omite comparação incompatível e a tela explica a causa. O gate B6 não prova
diagnóstico de hipótese nova: além da exigência de SHA, duas tentativas com
entradas geradas falharam em invariantes do Motor/diagnóstico, registradas em
`docs/testing.md`. Esses limites pedem decisão e trabalho próprios antes de
declarar aceite completo dessa parte. Nenhuma regra financeira foi alterada.

## 2026-09-23 — Perfis demonstrativos reutilizáveis e restauração visível (MOT-91)

**Sintoma.** O aceite B6 reproduziu dois bloqueios: os 12 Perfis do pacote
demonstrativo não podiam ser adicionados de volta pela ação guiada de composição;
após remover o demo, a restauração sumia quando havia outro Estudo salvo.

**Causa.** A receita de três ordens representava a fração OUT como 2/3 com 40
casas decimais, acima do limite público de 12 casas do derivador de Perfil. A
página de Estudos oferecia restauração somente quando a lista inteira estava
vazia, embora o marker do demo estivesse `REMOVED`.

**O que foi feito.** A receita sintética passou a usar duas ordens OUT de 60 mil
e uma IN de 120 mil, com fração 0,5; o pacote foi regenerado byte a byte e
validado pelo mesmo derivador usado na composição. O repositório expõe a leitura
do marker de instalação à página; o botão aparece quando o demo não está
instalado, mesmo com Estudo importado presente. Testes unitários e E2E cobrem
ambas as regressões neste worktree local.

**O que isso invalida.** Fingerprints de Casos, Perfis, Estudo e resultados do
pacote demonstrativo anterior mudaram; ele permanece estritamente sintético e
não calibrado. Nenhuma regra do Motor, taxa real ou métrica histórica da varredura
foi alterada. A execução de hipótese criada a partir do pacote ainda depende de
um servidor com seu SHA fixado; o aceite B6 registra esse limite em
`docs/testing.md`. Sem push, PR, merge ou deploy.
## 2026-09-23 — Restrição temática, ferramentas e Responses API, C4 (MOT-94)

**Sintoma.** Os contratos C3 já existiam, mas o chat não tinha provider real,
política para questões externas/mistas ou leitura fundamentada das fontes.

**Causa.** C3 entregou apenas a fronteira HTTP e as portas; classificação,
allowlist, citações e lifecycle do transporte eram a Task C4 separada.

**O que foi feito.** Na branch local `codex/mot94-c4-responses`, sobre `21541ae`,
`servidor/chat/` ganhou adaptador HTTP Responses stateless (`store: false`), schemas
estritos, classificação em duas fases, recusa fixa server-side e seis ferramentas
de leitura sobre catálogo/snapshot validados. O loop admite quatro funções e duas
rodadas, correlaciona `call_id`, preserva reasoning e rejeita capacidades/argumentos
desconhecidos. Citações precisam existir no contexto e, no provider real, terem
sido lidas por ferramenta nesta pergunta. Erros/refusal/incompletude são
sanitizados; insuficiência tem mensagem explícita; timeout cobre todo o percurso.
A factory cria/fecha seu cliente somente com chat habilitado; startup não faz
requisição. Revisão independente encontrou fatos de seções inacessíveis; a
regressão de quatro seções foi RED/GREEN e `consultar_premissas` passou a expô-los.
Gates: 1.030 PASS e 2 SKIP normal e `-O`; Ruff, mypy (54 arquivos), typecheck,
101 testes web API/chat e scanner de credenciais PASS. Detalhes em
`docs/frontend/etapa-6c-c4-provider.md` e `docs/testing.md`. Testes usam exclusivamente
transporte/provider fake, com rede externa e DNS externo bloqueados.

**O que isso invalida.** Substitui a limitação C3 de provider ausente e classificação
não implementada; não altera contratos HTTP ou números/regras do Motor. C5/C6 não
foram executadas. Testes fake não atestam qualidade semântica real, validade
regulatória ou autenticidade do snapshot do navegador. Sem chave real, chamada
paga, push, PR, merge ou deploy; candidato local preservado para auditoria.

## 2026-09-23 — Contratos HTTP e configuração do chat, C3 (MOT-94)

**Sintoma.** O shell e o histórico C1+C2 existiam, mas não havia contrato HTTP,
configuração opcional ou fronteira de transporte validada para o chat.

**Causa.** A API ainda não publicava a entrada/saída do chat nem uma porta de
provider; ativação, segredos, limites e indisponibilidade não tinham contrato.

**O que foi feito.** Na branch local `codex/mot94-c3-chat-contracts`, foram criados
`servidor/contracts/chat.py`, `servidor/routes/chat.py` e as portas em
`servidor/chat/`. Settings valida ativação, chave/modelo e orçamentos sem imprimir
o segredo. A rota exige bearer, limita o corpo a 1 MiB durante a leitura, revalida
o Documento de Comunicação e aceita 4.000 caracteres por pergunta e 98 mensagens
anteriores, reservando pergunta/resposta na quota de 100. A quota de 20 conversas
permanece no storage C1. Respostas de provider injetado têm limite 12.000; falhas
retornam `CHAT_INDISPONIVEL` sanitizado. OpenAPI, tipos e validadores web foram
regenerados, com testes TDD e revisão independente. Configuração e limites estão
em `docs/frontend/etapa-6c-c3-contratos.md`; evidência dos gates em `docs/testing.md`.

**O que isso invalida.** Nada dos números ou regras do motor. Esta entrega não
encerra a MOT-94: não há provider real, ferramentas, resolução de citações nem
políticas temáticas C4; somente `IN_SCOPE` de implementação injetada pode produzir
resposta, e outras classificações falham fechado até C4. Sem provider injetado o
chat permanece indisponível; health e demais APIs continuam funcionando. Sem
push, PR, merge, deploy ou uso pago.
## 2026-09-23 — Ancestralidade e pares executáveis na revisão A6 (MOT-61)

**Sintoma.** A revisão independente reproduziu duas permissões indevidas: editar
todos os campos da autoria apagava a identificação XLSX; catálogo configurado
liberava finalidades/direções que não constavam de suas entradas.

**Causa.** O gate consultava somente proveniência corrente dos campos e status
global do catálogo, sem ancestralidade persistente nem validação por par.

**O que foi feito.** Astra/high reproduziu quatro REDs unitários e o RED Chromium
de edição integral/reload. A conversão do Caso importado marca sua ancestralidade
em `derivedFromObservedCase.importedFromXlsx`, preservada pela autoria, schema e
fingerprint. O gate consulta esse marcador e exige todos os pares do snapshot
antes de reserva/POST. Testes usam catálogo completo explicitamente fictício;
produção continua não configurada. Casos demo/sintéticos não ganham o bloqueio.
Gates deste loop estão no relatório A6 e em `docs/testing.md`; C1 não foi alterada.

**O que isso invalida.** Proveniência corrente não basta para afirmar origem
imutável; `CONFIGURADO` não significa que toda carteira seja executável. Não houve
migração retroativa de autoria anterior ao fix, alteração financeira ou catálogo
regulatório fabricado. O aceite importado completo permanece condicionado.

## 2026-09-23 — Contexto vivo do chat entre rotas, revisão C2 (MOT-93)

**Sintoma.** Navegar de Diagnóstico para Replay no mesmo Estudo selecionava de novo
a conversa mais recente e podia recuperar como `FAILED` um `PENDING` com request
ainda vivo. Ao sair de um Replay pronto para execução inválida ou outro Estudo,
o contexto do chat ainda recebia cenário e dia do resultado anterior.

**Causa.** O provider vinculava a carga do histórico ao `routeId`, embora a
identidade da conversa fosse owner/Estudo. O Replay mantinha `READY` sem a identidade
da URL que o carregou e publicava seleção a partir desse estado durante a troca.

**O que foi feito.** Na branch local `codex/mot93-c2-chat-shell`, o provider conserva
a conversa e o request enquanto owner e Estudo permanecem; a recuperação de
`PENDING` ocorre na reabertura sem request vivo daquela conversa. A troca real de
escopo aborta o request. `ReplayPage` associa `READY` à identidade carregada,
limpa cenário/dia ao iniciar outra carga e impede que o resultado antigo seja
renderizado sob a nova rota. Testes cobrem conversa antiga ativa e as duas transições
de Replay.

**O que isso invalida.** O aceite C2 anterior não cobria preservação de request e
conversa entre rotas nem limpeza de contexto após sair de um Replay pronto; números
e conclusões do motor não mudam.

## 2026-09-23 — Shell global e contexto tipado do chat, C2 (MOT-93)

**Sintoma.** A persistência C1 existia, mas as rotas autenticadas ainda não ofereciam
um painel de chat nem transportavam a seleção da tela para uma conversa local.

**Causa.** Faltavam a matriz de rotas, um provider ligado ao repositório da sessão e
componentes de histórico, composição e foco no shell.

**O que foi feito.** Na branch local `codex/mot93-c2-chat-shell`, foram adicionados
`web/src/chat/routeContext.ts`, `ChatProvider.tsx` e os componentes `ChatPanel`,
`ChatHistory` e `ChatComposer`; `web/src/app/providers.tsx`, `AppShell.tsx` e o CSS
ligam o diálogo lateral não modal às rotas autenticadas. Conversas gerais e por
Estudo são abertas no repositório da conta; mensagens pendentes reabertas passam
pela recuperação CAS da C1. Requests registrados pelo provider são abortados ao
desmontar, o botão de fechar restaura foco; Diagnóstico e Replay comunicam cenário,
execução e dia aplicáveis, enquanto Comparação comunica a hipótese selecionada.
Os testes de rota, sessão, foco, histórico e seleção acompanham a mudança. O par
completo base/hipótese dependerá do Documento de Comunicação na C5, pois
`RouteChatContext` possui apenas um `diagnosticExecutionId`. O envio
de perguntas permanece indisponível até a integração da API nas C3–C5.

**O que isso invalida.** Nada dos números ou conclusões do motor; o aceite C1 de
storage isolado não cobre por si só a presença e a acessibilidade do shell C2.

## 2026-09-23 — Aceite local da importação e gate de execução (MOT-61)

**Sintoma.** Faltava prova integrada XLSX→Caso→Perfil→Estudo, privacidade e
capacidade de 1.000 linhas. A primeira execução revelou que o Estudo importado
ignorava o catálogo `NAO_CONFIGURADO`; o scanner não inspecionava segredos dentro
do ZIP. O aceite visual também reproduziu overflow de um seletor de Perfil.

**Causa.** As fronteiras tinham testes separados, mas a consulta de catálogo
estava só na revisão. O scanner tratava XLSX como bytes compactados. O select com
IDs longos conservava largura intrínseca, excedendo viewport 640 em zoom 200%.

**O que foi feito.** Astra/high executou A6 com TDD e auditoria das fronteiras.
Seis E2Es reais cobrem persistência manual, falhas, CAS, contas e inspeção de todas
as stores/requests. Gate compartilhado usa a porta autenticada existente antes de
prévia, diagnóstico, retry e Replay importados; sintético/demo segue executável.
Scanner ZIP limitado em memória, CI com 2 workers Vitest e artifact E2E por 7 dias,
selector de texto exato e CSS mínimo `max-width:100%` completam as correções.
Reruns Replay usam output próprio e preservam byte a byte as evidências MOT-89.
Medição local: 1.000 linhas em 351,7 ms no worker/1.370 ms até revisão,
Caso 1.069.281 bytes; long tasks 265/352/98 ms, heap aproximado 50,4 MB.
Comandos e resultados estão em `docs/testing.md`; trace e limites em
`docs/frontend/etapa-6a-aceitacao.md`.

**O que isso invalida.** Não é válido declarar importado→diagnóstico→Replay
aceito com catálogo não configurado. O percurso importado termina em Estudo salvo
com bloqueio explícito; execução completa aguarda catálogo legítimo. Importar
1.000 linhas não amplia Replay: permanece a evidência independente 98×365.
O Ruff literal do plano (`servidor tests`) ainda aponta 298 achados legados;
o escopo CI (`servidor tests/web_api`) passa, sem ignores adicionados. Nenhum
número financeiro, regra do motor ou grade foi alterado. Sem publicação.

## 2026-09-23 — Gates e auditoria independente da C1 (MOT-93)

**Sintoma.** Os contratos e a persistência do chat estavam implementados, mas ainda
faltava registrar a regressão integrada e a revisão independente do recorte C1.

**Causa.** A alteração de schema e da interface compartilhada precisava comprovar
compatibilidade com importação, demonstração e consumidores existentes.

**O que foi feito.** Sobre a base `5419f49`, os commits locais `e873569`, `af8c580`
e `16ed3ef` entregam somente C1. O gate focado de chat/storage/migrations/recovery
passou com **98 testes**. A suíte completa web passou com **854 testes em 92
arquivos**, via `npm --prefix web run test:unit -- --maxWorkers 1` (440,59 s),
incluindo regressão do importador e da demonstração. Typecheck, lint, build,
scanner de credenciais (539 textos/32 binários) e `git diff --check 5419f49..HEAD`
passaram; permanece o aviso preexistente de chunks maiores que 500 kB.

A primeira execução ampla, simultânea ao build e aos testes focados, mostrou
timeouts em testes existentes e duas fixtures que ainda usavam versão física 3
como futura. As fixtures passaram a usar 4; a execução ampla foi interrompida e
repetida com um worker, sem alterar timeouts nem código de produto para esses
timeouts. O resultado sequencial acima é a evidência final.

Auditoria independente Astra/high: **spec PASS, qualidade PASS**, sem achado
material confirmado ou provável. Foram inspecionados CAS/quota transacionais,
isolamento, idempotência, exclusão sem ressurreição ou cópia de texto, snapshot,
close em voo, recovery concorrente e upgrades 1→3/2→3. Limites da evidência:
concorrência e rollback usam `fake-indexeddb`, sem teste de crash ou duas abas
reais; a preservação 2→3 usa registros sentinela em todas as stores anteriores e
marcador demo, além da inspeção de que o upgrade apenas adiciona stores e atualiza
seu marcador. A recuperação explícita e as citações `{kind, id}` aguardam,
respectivamente, consumo por C2/C5 e validação contextual em C5. MOT-93 permanece
In Progress porque inclui C2. Sem push, PR, merge ou deploy.

**O que isso invalida.** A pendência dos gates da C1. Não implica aceite de C2+,
da Etapa 6 completa ou de publicação; nada muda no motor ou nos números existentes.

## 2026-09-23 — Higiene do schema local do chat (MOT-93)

**Sintoma.** O gate `git diff --check` contra a base identificou uma linha vazia extra no fim do JSON Schema do chat.

**Causa.** A gravação do arquivo acrescentou uma quebra de linha além do terminador final.

**O que foi feito.** Removida somente a linha vazia excedente. Sem alteração de comportamento; os 98 testes focados, typecheck e lint permanecem a evidência funcional anterior. Gate amplo ainda em verificação pelo executor principal.

**O que isso invalida.** Nada nos contratos, resultados ou funcionalidades.

## 2026-09-23 — Persistência transacional e recuperação do chat, C1 (MOT-93)

**Sintoma.** Conversas não tinham histórico local, controle de concorrência nem recuperação após interrupção.

**Causa.** Faltavam stores, métodos do repositório e contrato de falha do chat na Etapa 6C.

**O que foi feito.** Na branch local `codex/frontend-etapa-6c-c1`, IndexedDB sobe de versão física 2 para 3 no mesmo nome de banco, preservando stores, documentos e marcadores anteriores; o caminho legado 1→3 mantém a conversão existente. Conversas usam owner/Estudo/revisão, CAS transacional e IDs de operação com digest, limite de 20 por Estudo ou grupo geral e exclusão idempotente com tombstones sem texto. Retry de save retorna documento vigente; delete não permite ressuscitar conversa antiga. Fechar sessão aborta transações do chat. Helper explícito de recuperação converte PENDING em FAILED por CAS, preserva fingerprints e não reenvia pergunta; será consumido por C2/C5. TDD: RED de storage e migration, GREEN inicial 27/27; gate final C1 com 98 testes PASS, typecheck e lint PASS. Casos cobrem corrida entre instâncias, quotas, snapshot antes de await, corrupção, rollback de upgrade interrompido, fechamento em voo e recovery concorrente. Ajustes de doubles são apenas compatibilidade da interface. Commit local, sem push/PR/merge/deploy.

**O que isso invalida.** O schema físico local 2 deixa de ser a versão atual; documentos do produto e números do motor permanecem iguais. C1 não entrega shell, HTTP, integração OpenAI nem acionamento automático da recuperação.

## 2026-09-23 — Contrato local de conversas do chat, C1 (MOT-93)

**Sintoma.** O chat planejado ainda não tinha contrato local validável de conversas e mensagens.

**Causa.** A Etapa 6C ainda não havia iniciado sua persistência.

**O que foi feito.** Tipos e JSON Schema 1.0.0 com owner, Estudo opcional, revisão, timestamps, estados, fingerprint e citações tipadas por ID. Validação limita 100 mensagens, 4.000 caracteres por pergunta e 12.000 por resposta, rejeita IDs duplicados, owner divergente e propriedades extras. Citações usam `{kind, id}` para evidência, métrica, limitação ou ajuda; existência no contexto será validada em C5. TDD: RED comportamental observado e 13 testes GREEN. Commit local, sem push/PR/merge/deploy.

**O que isso invalida.** Nada nos contratos e números do motor. Não entrega shell, HTTP nem integração OpenAI.

## 2026-09-23 — Catálogo versionado de ajuda do produto (MOT-92)

**Sintoma.** A interface e o chat não dispunham de uma fonte única, versionada e
autenticada para explicar páginas, controles e conceitos do produto; por isso, uma
futura ajuda contextual poderia divergir da linguagem publicada ou depender do DOM.

**Causa.** Os contratos HTTP existentes publicavam catálogo técnico de importação,
mas não havia recurso validado para ajuda nem IDs literais que ligassem os
componentes ao catálogo.

**O que foi feito.** Foi publicado `ProductHelpCatalogV1` como recurso JSON
versionado, validado e imutável na inicialização, com rota autenticada
`GET /api/v1/catalogos/ajuda` e `Cache-Control: no-store`. O catálogo cobre
importação, Empresa, Caso, Perfil, participante, arquétipo, composição, mix
demonstrativo, seed, repetição, repetição selecionada, Replay, Diagnóstico,
Comparação, Apresentação, Relatório e chat, sempre com propósito, efeito, limite,
indisponibilidade, recuperação e referências internas fechadas. O OpenAPI e os
artefatos TypeScript gerados foram atualizados; o front valida pelo mesmo schema
Ajv, congela e carrega o catálogo por cliente autenticado. `helpIds.ts`
centraliza a união literal e `HelpCatalogProvider` cria o cache em memória por
identidade, limpa-o em logout/troca de usuário e descarta respostas em voo de uma
sessão anterior; falha de catálogo devolve `null` e não bloqueia o produto. Os
padrões de rota do catálogo foram alinhados ao router atual; o limite explícito
permanece: `/empresas/:companyId/importar` ainda não é um segundo `routePattern`
do catálogo. Testes RED→GREEN
cobrem a rota, autenticação, versão canônica, falha de inicialização, cobertura
dos IDs, dados malformados, schema local, cache, logout, rotas e cliente. Desvio
de roteamento registrado: B5 foi executada com
`gpt-5.6-terra`/`high`, por instrução explícita do Gabriel, substituindo
`gpt-6-luna`/`high` do plano.

**O que isso invalida.** A premissa de que ajuda contextual pode depender de texto
ou estado visual arbitrário da tela. Nenhuma regra financeira, resultado do motor,
conteúdo do vault, dado observado ou decisão regulatória foi incorporado. Sem push,
PR, merge ou deploy.

## 2026-09-23 — Primeira Empresa e decisão informada de conflito (MOT-60)

**Sintoma.** A revisão independente da interface encontrou três lacunas: uma conta sem Empresa não conseguia iniciar importação; a rota de uma Empresa permitia trocar o destino no seletor; e versões em conflito apareciam apenas como IDs, sem diferenças semânticas para embasar a escolha.

**Causa.** A interface original consumia somente Empresas já persistidas, reutilizava o seletor global na rota contextual e não apresentava a projeção canônica de cada versão.

**O que foi feito.** `/importar` permite preparar uma Empresa nova, com ID, owner, nome, revisão e timestamps estáveis até a confirmação; apenas a transação do publisher grava Empresa e Caso juntos. A rota contextual mostra a Empresa fixa e ignora query de destino. O painel de conflito exibe lote, sequência, linha, ID de versão, cliente canônico por ID, direção, datas, valor e finalidade; o seletor referencia esses mesmos IDs. O histórico de correções mostra anterior → próximo em formato canônico, ocultando célula inválida. Testes RED/GREEN cobrem primeira Empresa, rollback/cancelamento, retry idempotente, rota adulterada, escolha entre versões que diferem só em prazo/finalidade e redação da correção. Gate local: 86 testes focados, typecheck, lint, build, 38 testes de fallback (2 ignorados), scanner (508 textos/32 binários) e diff check; aviso de chunk grande preexistente.

**O que isso invalida.** A dependência de pré-cadastro para importar a primeira Empresa e a possibilidade de escolher versão por ID sem contexto. A confirmação do Caso continua sendo a única gravação deste fluxo; política e números do motor não mudam.

## 2026-09-23 — Revisão visual e confirmação do Caso importado (MOT-60)

**Sintoma.** Parser, revisão e publisher estavam disponíveis como contratos, mas o produto não oferecia rota para ler, corrigir e confirmar uma planilha nem continuidade para Caso, Perfil e Estudo.

**Causa.** A interface e o controlador de sessão ainda não ligavam os módulos da importação ao repositório compartilhado e às páginas existentes.

**O que foi feito.** `web/src/importer/controller.ts` orquestra leitura explícita em worker, cancelamento, revisão e confirmação com `operationId` estável em retry. A nova interface oferece upload, filtros, correção, alias, conflito, exclusão/restauração e links após confirmação. `StudyController` expõe uma ponte de publicação restrita ao owner. Rotas, navegação, pré-seleção validada em Perfis e fallback SPA foram conectados. Testes cobrem seleção por teclado sem processamento automático, correção, alias, conflito, publicação, recarga e isolamento entre contas. Gate local: 80 testes focados, typecheck, lint, build, 38 testes de fallback (2 ignorados), scanner (508 arquivos de texto/32 binários) e diff check passaram. O aviso de chunk grande do build já existia antes desta tarefa.

**O que isso invalida.** A afirmação de que a importação só existe como contrato sem percurso React. Confirmar o Caso não cria Perfil, Estudo, prévia ou diagnóstico; esses passos continuam manuais. Nada muda nos números ou na política do motor.
## 2026-09-23 — Instalação, remoção e restauração atômicas da B2 (MOT-91)

**Sintoma.** O pacote reconciliado ainda não era instalado no primeiro acesso;
não havia marcador para impedir duplicação ou ressurgimento após remoção.

**Causa.** O ApplicationRepository tinha transações individuais para importação,
Perfis e Estudos, sem uma mutação atômica para o pacote completo.

**O que foi feito.** `installDemoStudy` valida/materializa o pacote antes da
abertura do banco e grava Empresas, Casos, Perfis, Estudo, execuções, Replays,
operação idempotente e marcador numa transação. O namespace inclui projeto,
owner e instalação; `add` impede sobrescrita de documentos existentes. A
elegibilidade automática é reavaliada sob a mesma transação, contando também
Estudos na lixeira. Remoção permanente apaga Estudo/execuções/Replays e payloads
de operações e marca `REMOVED` atomicamente; retries antigos não ressuscitam
dados. Empresas, Casos e Perfis permanecem na biblioteca, como no purge vigente,
para preservar evidência de Estudos derivados. Restauração explícita de demo
existente preserva edições; após purge cria identidades novas sem tocar nas
evidências retidas ou em Estudos do usuário.

O ciclo de sessão carrega o JSON sob demanda e oferece **Carregar estudo
demonstrativo** na página vazia. Falhas ficam visíveis e permitem retry; logout,
troca de seleção e autosave pendente impedem publicação tardia. Auditoria
independente encontrou dois casos de recovery, reproduzidos RED e corrigidos:
fingerprint corrompido não grava restauração e instalação sem Estudo persistido
não devolve resultado fantasma. O estado é validado antes da escrita e
reconferido sob a transação, com retry limitado para concorrência. Não restaram
achados materiais confirmados. O banco continua no schema físico 2.

TDD cobre rollback síncrono em cada store e assíncrono, concorrência, recarga,
remoção/restauração, isolamento, payload parcial/oculto, snapshot antes de await,
recovery e preservação de evidência compartilhada. A preparação dos testes de
rota carrega a fixture real antes das asserções cronometradas para não confundir
a transformação inicial do JSON pelo Vite com latência de navegação.

Gates finais: **707 testes em 86 arquivos PASS** (`test:unit -- --maxWorkers 2`),
incluindo os 22 testes de storage da B2, storage/recovery e regressão integral do
importador; typecheck, lint, build, scanner (508 textos/32 binários) e
`git diff --check` PASS. O subconjunto de rotas passou também isoladamente
(25/25), depois do ajuste de fixture. Revisão independente Astra/high; nenhum
achado material pendente.

**O que isso invalida.** O primeiro acesso vazio deixa de exigir criação manual.
Nada nos resultados B1/B3, importador, contratos financeiros ou motor. O bundle
passa a incluir um chunk lazy do pacote (~1,93 MB, ~187 kB gzip); permanece o aviso
de chunks maiores que 500 kB. Aceite E2E integrado da 6B é B6 e fica fora desta
Task B2. MOT-91 permanece In Progress aguardando aceite. Sem push, PR, merge ou
deploy.

## 2026-09-23 — Materialização isolada da demonstração B2 (MOT-91)

**Sintoma.** O pacote B1 continha o owner placeholder e identidades canônicas,
sem uma cópia validada para cada instalação local.

**Causa.** Trocar apenas o owner deixaria fingerprints de Casos/Perfis e
referências de evidência incompatíveis, além de reutilizar IDs entre instalações.

**O que foi feito.** Na `codex/frontend-etapa-6b-b2`, sobre `5ef4fe8`,
`materializeDemoPackage` captura JSON fechado antes de qualquer await, valida o
pacote completo e deriva identidades de owner/instalação. Recalcula fingerprints
pelas funções canônicas e reconcilia Casos, Perfis, snapshots e proveniência.
Resultados, seeds e IDs internos do motor permanecem idênticos. TDD RED→GREEN:
16 testes de materialização, mais 13 da validação B1, passaram; auditoria
independente não encontrou achado material no materializador. Arrays com
protótipos alterados, propriedades ocultas, getters, ciclos e payload parcial
são recusados antes da persistência. Typecheck e lint globais PASS.

**O que isso invalida.** Nada nos resultados de B1, contratos financeiros ou
motor. B2 ainda depende da transação e integração de sessão no próximo commit;
MOT-91 foi devolvida a In Progress porque B1/B3 não encerram a issue agregada.
Sem push, PR, merge ou deploy.

## 2026-09-23 — IDs opacos de operação no caminho de auditoria (MOT-56)

**Sintoma.** Uma importação válida com operação `.` ou `..` falhava ao confirmar
depois de excluir/restaurar a operação, apesar de não haver blockers.

**Causa.** `encodeURIComponent` preserva pontos literais, mas o validador de paths
recusava segmentos relativos; os IDs do domínio são opacos e aceitam esses valores.

**O que foi feito.** Um encoder canônico compartilhado representa apenas os IDs
dot-only como `%2E` e `%2E%2E`. Publisher e repositório usam o mesmo round-trip;
slash, espaço e percent conservam a representação anterior. Dois testes públicos
RED reproduziram o problema, acompanhados dos três casos já válidos. Paths com
segmento adicional, inclusive após `%2E%2E`, continuam rejeitados.
Gate: 190 testes importer/storage PASS; typecheck, lint, build, scanner (496
textos/32 binários) e diff check PASS. Warning de chunk preexistente preservado.

**O que isso invalida.** A rejeição excessiva desses dois IDs no primeiro fix A3.
Nada no contrato de operação, motor ou schema persistido. Sem push, PR, merge ou
deploy.

## 2026-09-23 — Fronteira persistível e concorrência da Empresa endurecidas (MOT-56)

**Sintoma.** Revisão adversarial da A3 encontrou propriedades `raw` em arrays
persistidas, paths/auditoria textuais fora do contrato e sobrescrita de uma Empresa
mais nova quando outro Caso usava snapshot antigo.

**Causa.** O schema JSON validava itens de arrays, mas não suas propriedades
nomeadas. Os eventos validavam apenas estrutura e o CAS existente protegia o Caso,
sem comparar o documento da Empresa.

**O que foi feito.** A validação recursiva recusa propriedades extras, arrays
esparsos e accessors antes de abrir o banco. Paths são fechados por kind e auditoria
por campo: direção, data ISO válida, Decimal canônico ou código de finalidade
normalizado conforme contrato vigente. A mesma transação compara owner, revisão e
conteúdo da Empresa, rejeitando snapshots obsoletos ou conflitantes antes de
gravar qualquer store. Os 25 testes adversariais de storage falharam antes e agora
passam. Com a correção de cronologia MOT-55, são 99 testes focados e 183 de
regressão importer/storage PASS; typecheck, lint, build, scanner (496 textos/32
binários) e diff check PASS. O warning preexistente de chunks >500 kB permanece.

**O que isso invalida.** O aceite do primeiro candidato A3 para esses três casos
adversariais. Nada nos cálculos, na grade ou nos schemas físicos. Sem push, PR,
merge ou deploy.

## 2026-09-23 — Cronologia única dos comandos de revisão da importação (MOT-55)

**Sintoma.** O publisher emitia todos os aliases depois das correções, mesmo quando
a associação de identidade havia ocorrido primeiro.

**Causa.** Aliases estavam somente no histórico separado de identidade; o publisher
inventava sua sequência ao final da publicação. Timestamps iguais não resolviam a
ordem real dos comandos.

**O que foi feito.** `ASSOCIATE_ALIAS` também cria um `ImportEvent` sem texto bruto
na sequência monotônica comum no momento do comando. O publisher usa esse fluxo
único ordenado por `eventSequence`. A associação sem mudança permanece um no-op.
Dois testes RED→GREEN comprovam alias antes da correção com instantes distintos e
iguais; regressão importer/storage: 183 testes PASS, typecheck e lint PASS.

**O que isso invalida.** A ordem artificial de auditoria do primeiro candidato A3.
Nada no motor ou em dados já publicados; sem push, PR, merge ou deploy.

## 2026-09-23 — Publicação atômica da importação no repositório compartilhado (MOT-56)

**Sintoma.** A revisão transitória XLSX ainda não podia publicar um Caso Observado
no repositório atual. Os registros de lote/evento eram placeholders e o guard de
binários não recusava ArrayBuffer nem suas views.

**Causa.** A porta transacional da Etapa 2 já tinha CAS e idempotência, mas faltavam
a projeção explícita da revisão e validação fechada dos metadados. O input podia
ser alterado pelo chamador enquanto a abertura assíncrona do banco aguardava.

**O que foi feito.** `confirmImport` projeta Empresa, Caso, lotes e eventos sem
espalhar o agregado transitório. Células, nomes de cliente/arquivo brutos, contexto
do parser e `rawValue` não entram na mutação. A auditoria mantém somente valores
canônicos dos campos editáveis; valores originais inválidos ficam `null`. O Caso
é revalidado e publicado com revisão persistida 1/esperada 0; a revisão semântica
da edição não substitui o CAS. `confirmedAt` usa o instante determinístico da
revisão, permitindo retry idêntico. Metadados ganham whitelist e snapshot antes
do primeiro await; binários são recusados antes de abrir a base. A transação única
existente cobre Empresa, Caso, lote, evento e operation record. Não foi necessária
migração física: stores e chaves continuam no schema 2, sem reescrever históricos.
Testes cobrem rollback síncrono em cada store e assíncrono, retry após reload,
concorrência, isolamento de owner/projeto e sanitização. Modelo Astra/high conforme
o plano. Gates focados: 50 testes; regressão importer/storage: 154 testes antes dos
dois testes adicionais de auditoria/rollback; typecheck, lint, build e scanner
aprovados. O build mantém o aviso preexistente de chunks acima de 500 kB.

**O que isso invalida.** A aceitação anterior de buffers e campos extras em novas
mutações de importação. Nada nos números do motor, schemas de Caso/Estudo ou grade
histórica. Sem push, PR, merge ou deploy.
## 2026-09-23 — Ação de composição coerente com a origem (MOT-91)

**Sintoma.** Uma origem sintética legada com snapshot de geração mostrava “Criar hipótese / alterar carteira”, mas a ação levava ao editor legado, sem controles de composição.

**Causa.** O resumo inferia capacidade de editar a carteira pela presença de `generationInputSnapshot`; o editor escolhe a composição somente para cenário Profile MVP.

**O que foi feito.** Na branch `codex/frontend-etapa-6b-b3`, o rótulo do resumo usa o mesmo critério de origem Profile MVP do editor. Testes cobrem a ação e o foco no editor de composição para Profile MVP, além da ação honesta e do editor legado para origem sintética com snapshot.

**O que isso invalida.** A afirmação da entrada B3 abaixo de que somente origens sem composição gerável exibiam “Criar hipótese” era incompleta: origens sintéticas legadas com snapshot também exibem apenas essa ação. Nenhum resultado do motor ou dado persistido muda.

## 2026-09-23 — Composição descobrível e repetição identificada (MOT-91)

**Sintoma.** A edição da composição ficava no fim da página do Estudo; Diagnóstico
e Replay não mostravam juntos o total, o ID e o critério da repetição selecionada.

**Causa.** A página não resumia os participantes junto dos cenários, e cada tela
tratava isoladamente a identidade da execução. A seleção é registrada no plano do
diagnóstico; ela não representa necessariamente a mediana das métricas.

**O que foi feito.** Na Task B3 da branch `codex/frontend-etapa-6b-b3`, o Estudo
mostra a composição persistida e uma ação que leva o foco ao editor. O editor
explica Perfil, participante e arquétipo, preservando o cenário base e o Perfil
imutável. Diagnóstico e Replay usam o mesmo descritor do ID, total e critério; o
Replay recusa resposta com ID divergente. Para origens sem composição gerável, a
ação é apenas **Criar hipótese**. Testes B3, typecheck, lint, build e scanner
passaram; o aviso de chunks grandes do build já existia.

**O que isso invalida.** Nada nos resultados do motor, nos Perfis, nas execuções
persistidas ou no pacote demonstrativo. A descrição de “repetição mediana” não é
suportada pelo contrato atual e não deve ser usada para esta seleção.
## 2026-09-23 — Compatibilidade e semântica da projeção de comunicação (MOT-92)

**Sintoma.** A revisão da B4 encontrou três lacunas: comparação pré-calculada
aceita após mudança de versão da receita; unidade/rótulo de métrica incompatível
com seu eixo; fingerprint diferente em Python e TypeScript para chaves U+E000 e
U+10000.

**Causa.** O construtor duplicava parcialmente a compatibilidade da comparação,
conferia valores sem consultar suas definições e reutilizava a ordenação UTF-16
do Estudo no contrato espelhado de comunicação.

**O que foi feito.** Extraído gate de compatibilidade sem cálculo de deltas,
compartilhado com `compareMvpDiagnostics`; identidade, rótulo e unidade são
conferidos nas definições canônicas dos eixos. O fingerprint de comunicação usa
ordem por ponto de código Unicode, igual ao Python, com fixture compartilhada.
As sete regressões tiveram RED observado antes da correção; há prova positiva da
preservação literal de delta decimal publicado.

**O que isso invalida.** A aceitação de comparações com receitas incompatíveis ou
semântica adulterada e fingerprints de comunicação com chaves Unicode cuja ordem
UTF-16 difere da ordem por ponto de código. Fingerprints persistidos de Estudo,
fontes, cálculos financeiros e o motor não mudaram.

## 2026-09-23 — Projeção pura de comunicação com identidade das fontes (MOT-92)

**Sintoma.** Os consumidores futuros precisavam obter uma única projeção dos
resultados sem recalcular métricas nem associar valores a outra execução/repetição.

**Causa.** O esboço síncrono da B4 não acomodava WebCrypto/validação assíncrona;
também supunha uma comparação persistida que o Estudo V3 não possui.

**O que foi feito.** `buildCommunicationDocument` agora projeta os snapshots da
execução validada, a comparação pré-calculada recebida explicitamente e o estado
publicado de um dia do Replay. Retorna Promise, clona antes de aguardar e congela a
saída; data explícita ou `study.updatedAt`, sem relógio/I/O/cálculo financeiro.
As decisões de interface e limites de confiança estão em
`docs/frontend/etapa-6-b4-comunicacao.md`. IDs, repetição, contagem, fingerprints,
seeds e totais do Replay são conferidos, preservando as strings decimais originais.
TDD e revisão independente corrigiram a comparação apontando para si mesma e a
divergência entre repetição rotulada e execução publicada. Re-revisão: duas
regressões verdes. Ordem das chaves JSON, reload e retorno ao dia preservam SHA.
Gate final: 95 testes Python normal e `-O`; 678 Vitest (81 arquivos, 93 testes de
comunicação); TS, ESLint, build, Ruff, mypy do contrato, scanner (507 textos/32
binários) e diff check verdes. O primeiro Vitest teve um timeout de rota durante
concorrência alta; a suíte inteira passou com dois workers sem aumentar timeout.
Mypy global conserva 13 erros preexistentes em `servidor/demo/generate_package.py`;
o build conserva o warning de chunks >500 kB. Nenhum desvio da matriz Astra/high.

**O que isso invalida.** Apenas a assinatura síncrona e a suposição de uma entidade
de comparação persistida no esboço da B4. Não invalida números de simulação ou
contratos existentes. Sem B5/B6, C3/chat, endpoint artificial, alteração de storage,
ApplicationRepository ou motor; sem push, PR, merge ou deploy.

## 2026-09-23 — Contratos espelhados do Documento de Comunicação V1 (MOT-92)

**Sintoma.** A B4 ainda não tinha contrato comum para transportar valores publicados
até apresentação, relatório e chat sem perder disponibilidade ou proveniência.

**Causa.** Os envelopes existentes descrevem cada fonte; faltava a projeção de
comunicação com identidade explícita e validação equivalente nas duas linguagens.

**O que foi feito.** Criados modelo Pydantic, tipos TypeScript, JSON Schema gerado
diretamente do modelo (sem endpoint), validador Ajv e fingerprint SHA-256 canônico.
O contrato rejeita referências ausentes/duplicadas/de outro contexto, disponibilidade
incoerente e valores numéricos que não sejam strings decimais. `generatedAt` fica
fora do fingerprint. Fixtures observada/sintética e 64 mutações inválidas são
compartilhadas por Python e Vitest. TDD: fixtures válidas falharam antes da
implementação; 68 testes Python normal e `-O` e 67 Vitest passaram. A revisão
independente conferiu o espelhamento, disponibilidade e identidade das evidências.
MOT-92 permanece In Progress: esta entrega cobre somente B4, sem B5/B6.

**O que isso invalida.** Nada nos resultados do motor. Integridade do documento não
é atestado de autenticidade das fontes: o construtor confere os dados de origem.
Sem alteração de OpenAPI, storage, ApplicationRepository, motor ou implantação.

## 2026-09-23 — Artefato demonstrativo com bytes canônicos após integração (MOT-91)

**Sintoma.** Após integrar localmente A4 e B1, o teste determinístico do pacote
demonstrativo falhou embora o conteúdo JSON fosse igual ao gerado.

**Causa.** O checkout Windows converteu o artefato versionado para CRLF, enquanto o
gerador canônico escreve LF; a prova byte a byte corretamente detectou a diferença.

**O que foi feito.** `.gitattributes` fixa LF somente para
`web/src/demo/generated/demo-study.v1.json`; o arquivo foi regenerado pelo gerador
canônico. O teste isolado voltou a passar, seguido por 131 testes web integrados,
9 testes Python normal e sob `-O`, typecheck, lint, build e scanner verdes.

**O que isso invalida.** Invalida apenas o artefato com finais de linha dependentes
do checkout. Não altera os dados sintéticos, o SHA lógico, `motor/`, resultados,
contratos públicos, nem autoriza push, PR ou deploy.

## 2026-09-23 — Manifesto de lote vazio e confirmação sem operações (MOT-54/MOT-55)

**Sintoma.** Um lote ativo sem linhas não aparecia no manifesto e um rascunho sem
operações ainda podia parecer confirmável quando a posição era marcada.

**Causa.** O manifesto era derivado das ordens projetadas, que naturalmente omitem
lote vazio, e não havia bloqueio explícito para conjunto selecionado vazio.

**O que foi feito.** O manifesto agora deriva de `activeBatchIds`, preservando
SHA/tamanho de lote vazio até sua reversão; `ZERO_SELECTED_OPERATIONS` bloqueia a
confirmação mesmo com posição identificada. Duas regressões RED e 37 testes focados
passaram. Desvio autorizado: Terra/high substitui Luna/high.

**O que isso invalida.** A ideia de que proveniência dependia de haver ordens; A3
continua responsável por não persistir células brutas.

## 2026-09-23 — Invariantes de conflito, revisão e proveniência multi-lote (MOT-54/MOT-55)

**Sintoma.** A segunda revisão da A2 mostrou que duplicatas idênticas do mesmo
arquivo eram coalescidas, a revisão do rascunho podia deixar de avançar após uma
sequência mista e o manifesto não enumerava todas as fontes incorporadas.

**Causa.** O replay distinguia conteúdo idêntico sem levar em conta a origem no
mesmo lote; a revisão derivava de contadores independentes; e o manifesto preservava
apenas o `ParsedImport` inicial.

**O que foi feito.** Reenvios idênticos dentro do mesmo arquivo passam a exigir
`RESOLVE_CONFLICT`; `ImportReview` guarda uma revisão semântica monotônica usada no
rascunho; e `ImportBatch` carrega somente SHA-256/tamanho necessários para projetar
deterministicamente cada fonte ativa no manifesto. `controlTotals` malformado vira o
blocker estável `TOTAL_INVALID`, sem `DecimalError`. Quatro novas regressões e o
gate focado de 35 testes confirmam esses contratos. Desvio autorizado de roteamento:
`gpt-5.6-terra`/high substitui `gpt-6-luna`/high onde indicado originalmente.

**O que isso invalida.** A coalescência automática de duplicata no mesmo arquivo e
qualquer hipótese de que strings numéricas malformadas seriam erro excepcional; a
fronteira transitória de `raw`/`ParsedImport` para A3 permanece inalterada.

## 2026-09-23 — Replay append-only de correções e fronteiras de elegibilidade (MOT-53/MOT-54/MOT-55)

**Sintoma.** A revisão independente da A2 identificou que uma correção alterava o
lote histórico, não havia comando público para segundo lote, duplicatas do mesmo
arquivo não eram resolvíveis e alguns blockers podiam ser comparados ou reaplicados
de forma incorreta.

**Causa.** A primeira porta tratava a revisão como snapshot mutável; por isso não
preservava a identidade de versão como alvo do evento nem reaplicava os efeitos por
sequência sobre a entrada original.

**O que foi feito.** `portfolio.ts` agora revalida uma cópia transitória de cada
linha a partir dos lotes imutáveis e dos eventos `OPERATION_CORRECTED` ordenados.
`CORRECT_FIELD` exige `versionId`, registra original/antes/depois sem mutar o lote;
`INCORPORATE_BATCH` expõe a segunda fonte em comando discriminado; duplicata de um
mesmo arquivo entra no mesmo mecanismo explícito de conflito/resolução. A revisão
também compara totais via Decimal, isola blockers de linha excluída, exige posição
identificada explicitamente, bloqueia empresa de outro `ownerSub` e incrementa a
revisão semântica após alias. Os 31 testes focados cobrem as regressões. Desvio
autorizado de roteamento: `gpt-5.6-terra`/high substitui `gpt-6-luna`/high quando
o papel original o indicaria.

**O que isso invalida.** A interpretação anterior de que correção podia atualizar
o lote ou que `positionIdentified` era verdadeiro por omissão. A A3 continua sendo
a fronteira responsável por nunca persistir `raw`/`ParsedImport`.

## 2026-09-23 — Correções e elegibilidade do Caso Observado na importação (MOT-55)

**Sintoma.** A revisão precisava transformar as linhas canônicas em um rascunho de
Caso Observado rastreável, sem publicar dados ainda, e manter bloqueios separados de
avisos enquanto o usuário corrige uma linha inválida.

**Causa.** A validação por linha A1 não tinha ainda o agregado puro que reconcilia
totais OUT/IN, conflitos, exclusões, correções e proveniência com o contrato atual
de `ObservedCaseDraft`.

**O que foi feito.** Criados `web/src/importer/eligibility.ts` e seus testes.
`createImportReview` produz o rascunho com ISO, Decimal em string, finalidade
nullable, eFX `NOT_COLLECTED`, proveniência por campo e totais derivados;
`applyImportCommand` é uma união discriminada para correção, alias explícito,
resolução, exclusão/restauração e reversão. Empresa ausente, direção/data/valor
inválidos, duplicidade, total divergente e posição não identificada bloqueiam;
finalidade ausente e eFX não coletado avisam. A correção de uma linha inicialmente
inválida usa células brutas apenas enquanto a revisão está em memória e as descarta
na fronteira de publicação da A3. Desvio autorizado de roteamento:
`gpt-5.6-terra`/high substitui `gpt-6-luna`/high onde a matriz o indicaria.

**O que isso invalida.** Nada: os lotes ainda não foram persistidos, nenhuma UI ou
chamada de rede foi criada e o motor, P0, EDF e a grade histórica não mudaram.

## 2026-09-23 — Lotes e conflitos puros na revisão de importação (MOT-54)

**Sintoma.** A importação já validava cada linha, mas ainda não tinha uma projeção
canônica para distinguir uma operação nova de reenvio idêntico ou conflito entre
versões.

**Causa.** Lotes, eventos e suas sequências existiam apenas na pilha XLSX auditada,
que não pode ser incorporada diretamente à arquitetura atual de Caso Observado.

**O que foi feito.** Criados os contratos portáveis de lote, versão, evento e
projeção em `web/src/importer/domain.ts` e o replay puro em
`web/src/importer/portfolio.ts`. Lotes e eventos usam sequências, nunca timestamps,
e um conflito divergente permanece sem vencedor até comando explícito. A reversão
remove deterministicamente o lote da projeção sem apagar sua auditoria. Os quatro
testes de `portfolio.test.ts` cobrem novo, idêntico, divergente/resolvido e reversão.
Desvio autorizado de roteamento: `gpt-5.6-terra`/high substitui
`gpt-6-luna`/high quando esse papel apareceria na matriz.

**O que isso invalida.** Nada: nenhuma persistência, UI, execução ou regra do motor
foi alterada; a projeção continua local e será entregue ao publisher somente em A3.

## 2026-09-23 — Identidade mecânica de clientes para revisão de importação (MOT-53)

**Sintoma.** A revisão de um XLSX canônico ainda não tinha uma identidade local
determinística para os participantes das ordens, nem caminho auditável para unir
variantes de nome confirmadas pelo usuário.

**Causa.** A portabilidade A1 termina nas linhas normalizadas; aliases e identidade
eram contratos da pilha auditada, não tipos ou funções do domínio atual de Caso
Observado.

**O que foi feito.** Criados `web/src/importer/clients.ts` e seus contratos em
`web/src/importer/domain.ts`, com NFKC, diacríticos, espaços e caixa mecânicos,
sem fuzzy merge; aliases exigem associação explícita e a identidade já confirmada
reutiliza o UUID. Testes em `clients.test.ts` cobrem as variantes e a associação.
Desvio autorizado de roteamento: esta tarefa foi executada por
`gpt-5.6-terra`/high em substituição ao `gpt-6-luna`/high indicado originalmente.

**O que isso invalida.** Nada: ainda não há persistência, UI, execução ou mudança
do motor; o contrato será consumido pelos lotes e pela elegibilidade da própria A2.

## 2026-09-23 — Referências esparsas e perfil inválido fechados após revisão (MOT-51/MOT-52)

1. **Sintoma.** Uma célula com referência de linha extrema sem atributo `row r` não era barrada pelo SAX; e um perfil acima de 120 caracteres podia interromper a validação inteira em vez de produzir erro de linha.
2. **Causa.** O preflight verificava somente o atributo da linha; `normalizeProfileClassification` era invocado depois do capturador de erros por campo.
3. **O que foi feito.** O preflight compara o teto de 1.001 contra `row r` e o sufixo numérico de `c r`, sem regex sobre XML; a classificação agora passa por `validate`, preservando erros da mesma linha e linhas posteriores. RED/GREEN cobre `<row><c r="A1000000">` e perfil de 121 caracteres combinado com direção/valor inválidos e uma linha seguinte válida. Por instrução autorizada do Gabriel, esta rodada foi executada por gpt-5.6-terra/high em substituição ao roteamento Luna/high; a revisão independente prevista continua em gpt-6-sol/medium.
4. **O que isso invalida.** Invalida a conclusão anterior de que apenas o atributo `row r` bastaria como preflight e de que todos os limites de normalização já eram reportados por linha. Não muda motor, persistência, HTTP, execução, timeout ou limites publicados; sem push, PR, merge ou deploy.

---

## 2026-09-23 — Preflight e normalização da importação endurecidos após revisão (MOT-51/MOT-52)

1. **Sintoma.** A revisão independente identificou que o leitor removia espaços significativos, os limites textuais do layout não eram aplicados, arquivos inválidos podiam ser lidos antes da rejeição e uma referência de linha esparsa podia alcançar o leitor de células.
2. **Causa.** O port inicial manteve o trim padrão de `read-excel-file`, concentrou limite de tamanho apenas no preflight do buffer e não confrontava o índice de linha OOXML com o limite de 1.000 operações.
3. **O que foi feito.** `xlsxParser.ts` usa `trim: false`; `normalization.ts` impõe 128/200/120/128 caracteres para ID, cliente, perfil e finalidade; `workerClient.ts` recusa extensão e tamanho antes de `arrayBuffer()`/Worker; `xlsxPreflight.ts` recusa células após a linha 1.001 ainda no SAX. Testes RED/GREEN cobrem campos com espaços, os quatro pares máximo/máximo+1, extensão/tamanho sem leitura e referência esparsa extrema. Por instrução autorizada do Gabriel, esta rodada foi executada por gpt-5.6-terra/high em substituição ao roteamento Luna/high; a revisão independente prevista continua em gpt-6-sol/medium.
4. **O que isso invalida.** Invalida a conclusão anterior de que o parser A1 já preservava texto exato e aplicava integralmente seus limites na fronteira mais cedo. Não altera motor, persistência, HTTP, execução, timeout ou limites publicados; sem push, PR, merge ou deploy.

---

## 2026-09-23 — Validação por linha da importação portado (MOT-52)

1. **Sintoma.** Após o parsing estrutural, o destino ainda não distinguia linhas válidas, inválidas e com finalidade ausente de modo revisável.
2. **Causa.** A validação por campo e a regra de IDs duplicados estavam acopladas ao `ImportBatchDraft` da origem antiga, que não pode atravessar a fronteira de Caso Observado atual.
3. **O que foi feito.** `web/src/importer/validation.ts` valida cada célula sem descartar as demais, preserva erros estruturados por linha, mantém `PURPOSE_MISSING` como aviso e torna todas as ocorrências de um ID repetido inválidas. O relatório retornado é serializável e não cria lote, repositório, preview ou execução. Testes cobrem linha válida com aviso, acúmulo de falhas e duplicidade. Por instrução autorizada do Gabriel, esta tarefa foi executada por gpt-5.6-terra/high em substituição ao roteamento Luna/high; a revisão independente prevista continua em gpt-6-sol/medium.
4. **O que isso invalida.** Invalida somente a lacuna de validação local por linha. Não altera contrato HTTP, persistência, Caso/Empresa, motor, resultado financeiro, nem autoriza push, PR, merge ou deploy.
## 2026-09-23 — Contrato obrigatório do catálogo no ApiClient (MOT-58)

1. **Sintoma.** Um consumidor tipado como `ApiClient` não podia ser passado diretamente a `loadImportCatalog`, embora a fábrica sempre publique `getImportCatalog`; os testes estreitavam o tipo para esconder essa divergência.
2. **Causa.** O método do catálogo estava declarado como opcional no contrato público de `ApiClient`, enquanto a fronteira do importador exigia que ele existisse.
3. **O que foi feito.** `getImportCatalog` passou a ser obrigatório em `ApiClient`; o carregador usa o recorte normal desse contrato, os doubles tipados o implementam e o teste de integração cria um `ApiClient` real sem cast. Foram removidos os casts que simulavam artificialmente o método do catálogo nos testes do cliente.
4. **O que isso invalida.** Invalida a hipótese de que consumidores do `ApiClient` possam omitir a rota canônica já publicada. Não altera endpoint, autenticação, validação AJV, estado `NAO_CONFIGURADO`, revisão local, execução, persistência, conteúdo regulatório, `motor/`, push, PR, merge ou deploy.

---

## 2026-09-23 — Estado indisponível do cliente de catálogo (MOT-58)

1. **Sintoma.** Se a leitura autenticada do catálogo falhasse, o cliente propagava apenas a exceção e não oferecia à camada seguinte o estado explícito que mantém a revisão local disponível e bloqueia confirmação executável.
2. **Causa.** `loadImportCatalog` só transformava respostas de sucesso em disponibilidade; não representava a indisponibilidade como parte tipada do seu resultado.
3. **O que foi feito.** A leitura agora retorna a união discriminada `AVAILABLE | UNAVAILABLE`. Falhas uniformes do `ApiClient` (`ApiError`) tornam-se `UNAVAILABLE`, com `localReviewAvailable: true`, `canConfirmExecution: false` e o próprio erro seguro para apresentação. Erros fora da fronteira continuam propagando. Foi acrescentado teste de payload inválido que confirma que `ApiClient` preserva `RESPOSTA_INVALIDA` antes dessa adaptação.
4. **O que isso invalida.** Invalida a leitura de que ausência temporária do catálogo deveria impedir revisão local ou que um payload inválido pudesse entrar no fluxo. Não adiciona cache, TanStack, UI, elegibilidade, execução, persistência, conteúdo regulatório, alteração em `motor/`, push, PR, merge ou deploy.

---

## 2026-09-23 — Imutabilidade profunda do catálogo de importação (MOT-57)

1. **Sintoma.** Embora o modelo externo do catálogo fosse congelado, uma lista ou modelo aninhado podia ser alterado depois do carregamento e antes de outra resposta reutilizar o estado da aplicação.
2. **Causa.** `frozen=True` do Pydantic não congela recursivamente coleções e os contratos aninhados de custos/origem herdavam modelos mutáveis.
3. **O que foi feito.** As camadas publicadas do catálogo agora usam modelos congelados e tuplas para finalidades, alíquotas e regras de IOF; o loader converte somente as coleções do JSON para a representação imutável depois de calcular seu hash canônico. O JSON HTTP permanece array e o endpoint/OpenAPI preserva o formato público. Os testes tentam alterar valores, tuplas e modelos aninhados de um catálogo configurado fictício e exigem falha.
4. **O que isso invalida.** Invalida a suposição de que `frozen=True` no envelope bastava para proteger o grafo cacheado. Não altera finalidades de produção, valores técnicos, autenticação, revisão local, execução, `motor/`, persistência, push, PR, merge ou deploy.

---

## 2026-09-23 — Cliente do catálogo técnico da importação (MOT-58)

1. **Sintoma.** O front-end não conseguia consultar nem validar pelo caminho comum o estado técnico do catálogo de importação.
2. **Causa.** O `ApiClient` e seus validators gerados ainda não conheciam o endpoint canônico, e não havia modelo local que distinguisse revisão possível de confirmação de execução.
3. **O que foi feito.** `ApiClient.getImportCatalog` consulta somente `GET /api/v1/catalogos/importacao`, preservando Bearer, timeout, erro uniforme e validação AJV. `web/src/importer/catalogClient.ts` usa exclusivamente essa porta e expõe que `NAO_CONFIGURADO` mantém a revisão local disponível, mas torna a confirmação de execução indisponível. `contracts/openapi.json`, `web/src/api/generated.ts`, `schemas.json` e `validators.ts` foram atualizados exclusivamente por `python -m servidor.export_openapi` e `npm --prefix web run generate:api`; o script do gerador recebeu o validator do novo schema. A alteração do contrato invalidou o `tsconfig.tsbuildinfo` e expôs duas fixtures de `dates.test.ts` que passavam `string` onde a API exige `ISODate`; elas agora usam o normalizador público, sem alterar produção ou comportamento. Os testes cobrem a rota do cliente e a indisponibilidade de confirmação sem afetar a revisão. Por instrução autorizada do Gabriel, a implementação foi feita em `gpt-5.6-terra/high` em vez de Luna/high; a revisão Sol/medium continua pendente.
4. **O que isso invalida.** Invalida a ausência de leitura tipada do catálogo no front. Não cria cache TanStack, tela, estado de `ImportStudy`, parâmetros, elegibilidade, execução, persistência, rota adicional, conteúdo regulatório, alteração em `motor/`, push, PR, merge ou deploy.

---

## 2026-09-23 — Catálogo técnico autenticado da importação (MOT-57)

1. **Sintoma.** A importação não tinha um contrato público versionado para declarar que as finalidades regulatórias e os custos reais ainda não estão configurados.
2. **Causa.** O catálogo da pilha anterior não podia ser portado cegamente: seus contratos e integração não eram os da aplicação atual, enquanto o piloto não autoriza inventar finalidades, alíquotas ou calibração.
3. **O que foi feito.** Foram criados o recurso empacotado `servidor/catalogs/importacao.v1.json`, seu loader canônico SHA-256 e os contratos/rota estritos em `servidor/contracts/importation.py` e `servidor/routes/importation.py`. A aplicação valida o recurso ao iniciar e publica `GET /api/v1/catalogos/importacao` somente com Bearer, `no-store`, estado `NAO_CONFIGURADO`, lista vazia e defaults técnicos sintéticos não calibrados. O schema OpenAPI registra a rota; `pyproject.toml` inclui somente esse JSON como package data. Os testes cobrem autenticação, cache, schema, hash, startup inválido e ausência de finalidade em produção. A execução foi autorizada em `gpt-5.6-terra/high` em vez do roteamento planejado Luna/high; a revisão independente Sol/medium permanece pendente. A hierarquia da especificação/plano 6A aprovada limita esta MOT ao catálogo: não foram implementados parâmetros de `ImportStudy`, cache TanStack, elegibilidade, domínio ou rotas históricas conflitantes.
4. **O que isso invalida.** Invalida a ausência de um gate técnico explícito do catálogo. Não configura conteúdo regulatório, não torna importação executável, não altera revisão local, `motor/`, persistência, casos, perfis, estudos, push, PR, merge ou deploy.
## 2026-09-23 — Tipagem do gerador demonstrativo (MOT-91, B1)

1. **Sintoma.** O gate `mypy servidor` da integração apontou 13 erros em `servidor/demo/generate_package.py`.
2. **Causa.** Duas entradas de preparação eram declaradas como `object`, a coleção de custos misturava decimais e lista, a versão era inferida como `str`, e duas factories de ID usavam lambdas com argumento padrão cuja assinatura não era inferida; a lista de execuções também precisava de tipo explícito.
3. **O que foi feito.** Na branch local `codex/frontend-etapa-6b-b1`, o gerador recebeu `PreparationResponse` e `Literal` nas fronteiras correspondentes, separou os campos decimais de custo, fixou os IDs antes de passá-los às factories e tipou a lista de execuções. `mypy` passou de 13 erros para zero em 38 arquivos; Ruff passou. O JSON regenerado permaneceu byte a byte idêntico (SHA-256 `A819CE3B1A4047937BCA7199519DC939C69C609D8D4F65543A19522AF34331CD`). Testes Python normal e `-O`: 2/2 cada; Vitest B1: 13/13.
4. **O que isso invalida.** Invalida somente a pendência de tipagem do gerador B1. Não altera a receita, os números, o pacote versionado, contratos públicos nem o motor. Sem push, PR, merge ou deploy.

---

## 2026-09-23 — Reconciliação completa do Replay demonstrativo (MOT-91, B1)

1. **Sintoma.** Adulterações isoladas de autonetting, netting multilateral, resíduo, ID e revisão do cenário, seeds dos participantes ou versão do motor no Replay ainda eram aceitas pelo validador do pacote.
2. **Causa.** `web/src/demo/validation.ts` comparava com o diagnóstico somente bruto, casado e taxa de netabilidade, além de parte da identidade do Replay. Os outros campos eram validados quanto à forma, mas não ligados aos dados canônicos selecionados.
3. **O que foi feito.** Na branch local `codex/frontend-etapa-6b-b1`, sete testes de adulteração isolada falharam antes da correção e passaram depois. O validador passou a comparar os três volumes restantes com `agregado`, cenário e revisão com o cenário, requisição e execução selecionada, seeds com plano e resumo da repetição selecionada, e versão do motor com o manifesto. O JSON gerado permaneceu byte a byte idêntico (SHA-256 `A819CE3B1A4047937BCA7199519DC939C69C609D8D4F65543A19522AF34331CD`). Vitest focado: 13 testes; Python normal e `-O`: 2 testes cada; ESLint e scanner de credenciais: passaram. `typecheck` e `build` ainda param nos dois erros preexistentes de `ISODate` em `web/src/importer/dates.test.ts:19–20`.
4. **O que isso invalida.** Invalida a afirmação anterior de que a validação TypeScript já rejeitava todas as adulterações independentes de totais e identidade do Replay. Não altera a receita, o pacote gerado, os números demonstrativos nem o motor. Sem push, PR, merge ou deploy.

---

## 2026-09-23 — Estudo demonstrativo gerado e reconciliado (MOT-91, B1)

1. **Sintoma.** A Etapa 6 ainda não tinha um pacote demonstrativo atual para o primeiro acesso; os cinco mixes existentes descreviam somente pesos e os números da grade histórica pertencem à política anterior.
2. **Causa.** Faltavam uma receita versionada e uma geração pelas fronteiras vigentes de preparação, diagnóstico e Replay, com validação de Perfis, Estudo, seeds e fingerprints.
3. **O que foi feito.** Na branch local `codex/frontend-etapa-6b-b1`, `servidor/demo/generate_package.py` gera `DemoStudyPackageV1` com 12 empresas, Casos e Perfis integralmente sintéticos, cinco composições por alocação inteira dos pesos de `motor.mixes.TODOS`, 30 dias de aquecimento, 30 de medição, janela 7, cadência derivada de até quatro ordens mensais por participante e dez repetições explícitas por cenário. O primeiro item do plano de repetição alimenta o Replay. A receita registra deslocamento de uma posição nas seeds do `corporativo_pesado`: o conjunto inicialmente primeiro fazia o diagnóstico vigente rejeitar o teto estrutural na borda entre aquecimento e medição; os mesmos dez conjuntos continuam na distribuição. Para esta amostra, o custo fixo foi definido como `0` e o spread permaneceu `25` bps: com tarifa fixa `40`, o agregado vigente não reconciliou a soma exata das economias por mecanismo; `motor/` não foi alterado. Os cinco Replays selecionados têm 67, 64, 63, 60 e 53 ordens; a medição termina no dia 60 e a liquidação vai no máximo ao dia 87. O pacote fixa `5cb78f0b6ddd45b8b63f170153e6be8cd1928497` como build da base, preserva `$OWNER_SUB` para a materialização da B2 e traz rótulo explícito de hipótese sintética não calibrada. A origem de cada participante guarda a linhagem do Perfil, permitindo abrir uma hipótese de composição sem mudar o Perfil. Os testes Python reconciliam os envelopes e reconstroem cada Replay; o teste TypeScript valida o pacote inteiro, recalcula os Perfis pela API pública e prova rejeição de adulterações. Gates B1: Python normal e `-O`, Vitest, Ruff dos novos arquivos, ESLint e scanner de credenciais passaram; `npm --prefix web run typecheck` segue vermelho por dois erros preexistentes em `src/importer/dates.test.ts:19-20` na base `5cb78f0`.
4. **O que isso invalida.** Invalida apenas a ausência de um artefato demonstrativo reproduzível. Não substitui resultados históricos por resultados atuais, não calibra custos nem comprova validade regulatória; instalação local, recuperação, UI guiada e aceite E2E permanecem para B2, B3 e B6. Não houve execução da grade, acesso ao vault, alteração em `motor/`, push, PR, merge ou deploy.

---

## 2026-09-23 — Parser XLSX seguro portado (MOT-51)

1. **Sintoma.** O destino não inspecionava nem convertia o XLSX canônico sem expor binário, XML ou metadados pessoais a camadas posteriores.
2. **Causa.** O parser seguro estava somente na origem auditada `3999ae660fd9b6fd163d53edf264a178e8146a13`, com dependências e fixtures que não pertenciam ao worktree atual.
3. **O que foi feito.** Foram fixadas `fflate@0.8.3`, `read-excel-file@9.3.10` e `saxen@11.1.1`; portados preflight ZIP/OOXML, parser de células, worker e fronteira `parseCanonicalXlsx`. O preflight aplica limites de 5 MiB, 25 MiB e 128 entradas, e rejeita OLE/criptografia, macros, links, fórmulas, merges, abas e cabeçalhos inválidos. O resultado é `ParsedImport` serializável, contendo somente layout, hash, tamanho e linhas; o worker é terminado no sucesso, erro ou cancelamento e ignora resposta tardia. Fixtures são sintéticas da origem auditada. Por instrução autorizada do Gabriel, esta tarefa foi executada por gpt-5.6-terra/high em substituição ao roteamento Luna/high; a revisão independente prevista continua em gpt-6-sol/medium.
4. **O que isso invalida.** Invalida a ausência de parsing seguro no destino. Não autoriza persistência, preview, HTTP, execução, `ImportStudy`, repositório próprio ou alteração em `motor/`; não houve push, PR, merge ou deploy.

---

## 2026-09-23 — Domínio canônico da importação portado (MOT-50)

1. **Sintoma.** A base da Etapa 6 não possuía tipos, datas civis, decimais BRL ou normalização local para ler linhas do XLSX canônico.
2. **Causa.** A implementação auditada vivia numa pilha anterior, cujo `domain.ts` também carregava `ImportStudy`, repositório e contrato HTTP incompatíveis com o Caso Observado atual.
3. **O que foi feito.** Na branch `codex/frontend-etapa-6-planejamento`, foram portados somente `web/src/importer/domain.ts`, `errors.ts`, `dates.ts`, `decimals.ts` e `normalization.ts`, com testes reais de formato, calendário civil, precisão decimal e normalização. O domínio é serializável e não inclui `File`, armazenamento, HTTP, execução ou `ImportStudy`. Por instrução autorizada do Gabriel, esta tarefa foi executada por gpt-5.6-terra/high em substituição ao roteamento Luna/high; a revisão independente prevista continua em gpt-6-sol/medium.
4. **O que isso invalida.** Nada de produto ou de regras do motor; invalida somente a ausência desses utilitários no destino. Não houve mudança em `motor/`, persistência, API, execução, push, PR, merge ou deploy.

---

## 2026-09-23 — Matriz de portabilidade e baseline da importação 6A (MOT-90)

1. **Sintoma.** A pilha de importação remota não era ancestral da base da Etapa 5
   e incluía persistência e execução próprias incompatíveis com o fluxo vigente.
2. **Causa.** A origem `3999ae6` partiu de `c2ad175`; no HEAD inicial `7d72a2d`,
   havia 101 commits exclusivos do destino e 16 da origem. Um merge integral
   reaplicaria contratos já integrados e recriaria ImportStudy/ImportRepository.
3. **O que foi feito.** `docs/frontend/etapa-6-importacao-portabilidade.md` registra
   SHA por arquivo, decisões PORTAR/REESCREVER/DESCARTAR, fronteiras reais de Caso,
   Empresa, mutação transacional, Perfil e Estudo, e a ausência de publisher na
   origem. Baseline local: 173 testes focados, TS/ESLint, Ruff/mypy, pytest 794/2
   normal e `-O`, build/scanner e 22 E2E PASS. Vitest completo passou 481 testes
   com `--maxWorkers=2`; duas tentativas com concorrência padrão tiveram um timeout
   de rota de 5 s, enquanto a rota isolada passou 25/25. Nenhum timeout, teste ou
   config foi relaxado. As cinco evidências MOT-89 regravadas pelo E2E foram
   restauradas ao HEAD; não fazem parte da auditoria. A correção estática está
   separada no commit `02e5c0c`. A issue MOT-90 foi consultada somente para leitura.
4. **O que isso invalida.** Invalida portar a pilha inteira ou tratar seu domínio
   antigo como contrato do importador. Não modifica produto da Etapa 6, motor,
   resultados financeiros, contratos públicos ou decisões regulatórias. Mantém
   explícitos o timeout dependente de concorrência e os 308 achados históricos
   Ruff não reproduzidos. Nenhum push, PR, merge ou deploy foi executado.

---

## 2026-09-23 — Gates estáticos do Replay reconciliados em A0 (MOT-90)

1. **Sintoma.** O baseline anterior à Etapa 6 registrava Ruff e mypy vermelhos.
   Na árvore inicial `7d72a2d`, mypy reproduziu 30 erros em `servidor/replay.py`;
   Ruff 0.16.7 reproduziu 10 achados, não os 308 registrados no planejamento.
2. **Causa.** A fila do waterfall misturava DTO e Decimal em listas inferidas como
   object; gatilhos tinham tipo amplo e construtores tipados recebiam o formato de
   entrada textual exigido por DecimalSaida. Os demais achados eram imports,
   Decimal inteiro em testes e iteração de dicionário. A diferença histórica de
   contagem Ruff não foi explicada: a execução atual usa defaults e Py311 inferido
   do pyproject, sem evidência de versão/configuração para atribuir a divergência.
3. **O que foi feito.** Na branch `codex/frontend-etapa-6-planejamento`, tuplas
   tipadas e ReplayTrigger explicitam os tipos; seis modelos passam a validar os
   mesmos payloads com `model_validate`, preservando texto decimal e validadores.
   Ajustes mecânicos em `servidor/app.py`, `tests/web_api/measure_replay.py`,
   `test_replay.py` e `test_replay_contracts.py` resolvem o lint. RED observado nos
   gates antes da edição; GREEN: Ruff sem achados e mypy sem erros em 36 arquivos.
   Replay passou 18 testes; pytest completo passou 794/2 normal e 794/2 sob `-O`.
   O baseline web focado passou 173 testes, typecheck e lint. Nenhuma regra,
   ignore, exclude, baseline, dependência ou contrato público foi alterado.
4. **O que isso invalida.** Invalida o estado de gates estáticos vermelhos na base
   local da Etapa 6. Não invalida resultados financeiros, contrato de Replay ou
   aceite da Etapa 5. Nenhum arquivo de `motor/` foi alterado; sem push/PR/deploy.

---

## 2026-09-23 — Especificação, plano técnico e issues da Etapa 6 (MOT-90)

1. **Sintoma.** O plano geral reservava chat, relatório, apresentação, acabamento e
   publicação para a Etapa 6, mas não definia o recorte do piloto, a fronteira de
   dados do chat, o formato visual nem o destino de hospedagem.
2. **Causa.** Esses subsistemas dependiam do diagnóstico, comparação e Replay reais
   das Etapas 3–5 e precisavam ser reconciliados com a persistência local antes de
   receber um plano executável.
3. **O que foi feito.** A branch `codex/frontend-etapa-6-planejamento` recebeu a
   especificação aprovada e um plano mestre dividido em quatro planos executáveis:
   integração da importação, demonstração/comunicação, chat e apresentação/publicação.
   Eles detalham arquivos, contratos, TDD, gates, commits e dependências para o
   Documento de Comunicação V1, chat lateral somente leitura
   e restrito ao projeto, histórico local, Painel A contínuo, relatório pelo navegador,
   OpenAI Responses API com `store: false`, contêiner único e Render gratuito. A
   proposta também torna visível o editor de composição existente, distingue Perfil,
   participante, arquétipo, repetição e Replay e define um Estudo demonstrativo local
   com cinco composições sintéticas regeneradas pelo motor vigente. Resultados da
   varredura histórica não são reaproveitados. A revisão constatou que a importação
   XLSX MOT-49–MOT-61 existe apenas numa pilha remota anterior às Etapas 2–5; a
   especificação agora exige uma 6A que porte seus módulos válidos, publique no
   `ApplicationRepository` atual e conecte Caso → Empresa → Perfil → Estudo antes do
   piloto. Os documentos registram contratos, limites, testes, riscos, publicação
   separada do aceite local e a incorporação parcial da Evolução 5C. Uma busca
   read-only no Linear confirmou inicialmente que não existiam issues novas da
   Etapa 6. Após autorização explícita do Gabriel, foram criadas MOT-90–MOT-99 no
   projeto `Motor de fluxo de CNR`, em Backlog, com dependências, prioridades,
   critérios de evidência e roteamento de modelos. O plano usa Astra apenas nas
   fronteiras de maior risco, Sol como padrão e Luna em portabilidade, catálogos e
   trabalho repetitivo com revisão superior. O baseline registrou a divergência
   `100 16` contra a pilha de importação; pytest normal e `-O` passaram com 794/2,
   Vitest passou 481 testes, Playwright passou 22, e typecheck, ESLint, build e
   scanner ficaram verdes. Ruff revelou 308 achados preexistentes e mypy 30 erros
   preexistentes em `servidor/replay.py`; ambos permanecem dívida explícita de T0/A0,
   sem correção ou máscara neste commit. Nenhum código de produto foi alterado.
4. **O que isso invalida.** Invalida a leitura de que a Etapa 6 terminaria apenas com
   preparo local sem URL para a Amanda. Não invalida o aceite da Etapa 5, números do
   Motor, regras financeiras ou o escopo futuro de 5A/5B. A entrada ainda não possui
   implementação ainda não começou. As issues e o plano autorizam a execução local
   futura, mas não autorizam push, merge, criação do serviço Render ou deploy.

---

## 2026-09-23 — Ritmo, diário acumulado e linguagem visual do Replay (MOT-89)

1. **Sintoma.** O diário mostrava somente o dia selecionado, a reprodução padrão e
   as setas desapareciam rápido demais, e a cena não distinguia visualmente
   autonetting intracliente de netting multilateral. Com um `.env.local` real, o E2E
   também semeava e lia namespaces IndexedDB diferentes.
2. **Causa.** A apresentação consumia apenas `presentReplayDay`; os temporizadores
   eram 1,6 s por dia e 1,3 s por evento; as duas origens usavam a mesma linguagem
   gráfica. O modo E2E derivava `projectRef` da URL Supabase local enquanto sua ponte
   semeava explicitamente `local`.
3. **O que foi feito.** Na branch `codex/frontend-etapa-5`, o diário passou a agrupar
   todas as operações até o dia selecionado, omitindo dias vazios e futuro; 1× passou
   a 3,2 s por dia e as conexões permanecem 2,6 s. Autonetting e multilateral ganharam
   cores, legenda e rótulos distintos ligados às setas. O namespace E2E ficou
   hermético, e as capturas/hashes, runbook, matriz e regressões foram atualizados.
4. **O que isso invalida.** Invalida as capturas e hashes anteriores da MOT-89 e os
   tempos visuais de 1,6 s/1,3 s. Não altera `motor/`, alocações, prioridade EDF,
   autonetting preferencial, números financeiros, capacidade medida ou evoluções
   5A/5B/5C.

---

## 2026-09-22 — Integração e aceite local do Replay temporal (MOT-89)

1. **Sintoma.** A fatia vertical do Replay ainda não provava os percursos observado
   e sintético no browser, reload pela origem estática, responsividade real, limites
   de volume nem regressão conjunta das Etapas 1–4. O teto nominal de 1.000 ordens
   também não havia sido confrontado com o contrato que efetivamente alimenta a
   projeção.
2. **Causa.** O fallback SPA aceitava diagnóstico, mas não a rota profunda do Replay;
   em 200% a grade de três colunas comprimia os cartões; e o contrato do diagnóstico
   limita proveniência a 500 itens, embora o schema isolado do Replay aceite 1.000
   ordens. Faltavam fixtures E2E orientadas aos eventos de aceite e medição pelo
   pipeline real.
3. **O que foi feito.** A branch `codex/frontend-etapa-5` ganhou E2E observado e de
   hipótese sintética por Perfil, medição 98 × 365, fallback estrito da rota,
   empilhamento responsivo com curvas verticais ancoradas, capturas com SHA-256 e
   guias de operação/aceite. O Chromium cobre chegada, parcial, gatilhos simultâneos,
   dias vazios, controles, reload, remessas OUT/IN, resize, 200% e tela estreita. O
   gate final passou com 794 testes Python + 2 ignorados normal e `-O`, 477 unitários
   web, lint/typecheck/build, E2E novo 3/3 duas vezes e Playwright integral 22/22. A
   execução Vitest paralela reproduziu o timeout conhecido de um teste antigo; ele
   passou 25/25 isolado e a suíte passou integralmente com um worker.
4. **O que isso invalida.** Invalida a suposição de capacidade ponta a ponta
   1.000 × 365: com nove entradas fixas e cinco por ordem, o teto real vigente é 98
   ordens e 499 entradas de proveniência. Não invalida números do Motor, custos,
   cenário Amanda ou a grade histórica; `motor/` não mudou e as 27.000 simulações não
   foram reexecutadas. 5A (seleção/inspeção), 5B (baseline sincronizado) e 5C
   (apresentação/escala/exportação) continuam posteriores.

```text
test: fecha integração e aceite do replay temporal (MOT-89)
```

---

## 2026-09-22 — Cena Fronteira Viva orientada a eventos (MOT-88)

1. **Sintoma.** O Replay já reconstruía qualquer dia de forma determinística, mas
   ainda não oferecia a leitura operacional aprovada: cartões por lado, fronteira
   central, conexões ancoradas, métricas reconciliadas e diário factual.
2. **Causa.** A MOT-87 entregou deliberadamente o estado e os controles antes da
   camada visual. Faltavam apresentação própria, geometria responsiva e um ciclo de
   transição que animasse somente eventos reais sem contaminar saltos ou recargas.
3. **O que foi feito.** A branch `codex/frontend-etapa-5` ganhou a cena Brasil/CNR/
   Exterior, cartões OUT/IN com saldo parcial, controles e linha do tempo, métricas
   separando posição e contribuição dos dois lados, diário operacional e conexões
   SVG derivadas da decomposição ilustrativa publicada pelo servidor. Chegadas,
   fechamentos, casamentos, saldos e remessas usam transições finitas; voltar,
   saltar, recarregar e dias vazios aplicam o estado final sem movimento decorativo.
   `ResizeObserver`, preferência de movimento reduzido e saída sincronizada de
   cartões/conexões completam a implementação. Os testes focados somam 21 casos e
   passaram junto de typecheck e lint; a inspeção real no navegador cobriu saldo
   parcial, liquidação, casamento e remessas OUT/IN.
4. **O que isso invalida.** O placeholder visual e qualquer leitura do protótipo
   externo como fonte de cálculos ou lógica temporal. A autoridade continua sendo
   o documento Python reconciliado; conexões continuam ilustrativas, sem afirmar
   contraparte persistida. Não altera números do motor nem a grade histórica.

---

## 2026-09-22 — Estado determinístico e rota local do Replay (MOT-87)

1. **Sintoma.** O contrato temporal já existia, mas o front ainda não conseguia
   reabrir uma execução persistida, reconstruir um dia por seleção direta nem
   controlar a reprodução sem depender do estado anterior da animação.
2. **Causa.** A rota antiga `/replay` era apenas um placeholder e o cliente HTTP
   não consumia `POST /api/v1/replays`. Também não havia um redutor puro que
   reconciliasse saldos publicados, nem ciclo de playback com cancelamento de
   respostas tardias.
3. **O que foi feito.** A branch `codex/frontend-etapa-5` ganhou cliente AJV tipado,
   estado puro com `Decimal`, reconciliação diária, transições descritivas e
   controles determinísticos de play/pause, 1×/2×/4×, navegação, fechamento,
   repetição e recomeço. A rota
   `/estudos/:studyId/replay?executionId=...` resolve o `StudyDocument` do owner,
   usa o `DiagnosticEnvelope` persistido mesmo após a expiração do job, cancela e
   ignora respostas tardias e oferece retorno ao diagnóstico. O gate focado teve
   34 testes passando, o typecheck e o lint passaram; o teste de roteador que
   atingiu o timeout conhecido sob carga passou isoladamente.
4. **O que isso invalida.** Invalida qualquer navegação baseada em mutação
   incremental da cena, qualquer leitura do job efêmero para recarregar a página e
   qualquer cálculo financeiro novo em JavaScript; o front apenas reduz os eventos
   explícitos e confere os saldos do documento Python.

```text
feat: adiciona estado determinístico e rota do replay (MOT-87)
```

---

## 2026-09-22 — Contrato temporal reconciliado do Replay (MOT-86)

1. **Sintoma.** A especificação visual do Replay ainda deixava tipos indefinidos,
   tratava gatilho de fechamento como valor único, não separava posição casada da
   contribuição das duas pontas e pressupunha acesso a um resultado por um job que
   expira no servidor.
2. **Causa.** O diagnóstico completo é persistido no Estudo local em IndexedDB, mas
   o executor do backend mantém jobs apenas em memória. A projeção temporal também
   precisava respeitar aquecimento, coorte medida, liquidação natural e as fases
   hierárquicas do autonetting preferencial.
3. **O que foi feito.** A especificação aprovada foi reconciliada e ganhou o plano
   executável `docs/superpowers/plans/2026-09-22-frontend-etapa-5-replay.md`. Foram
   criados `servidor/contracts/replay.py`, `servidor/replay.py` e
   `servidor/routes/replay.py`: `POST /api/v1/replays` recebe o envelope diagnóstico
   persistido, autentica a sessão, reconcilia conservação/coorte/totais, publica dias
   vazios, gatilhos simultâneos, posição versus contribuição, remessas por direção e
   segmentos ilustrativos em fases intracliente e intercliente. OpenAPI, tipos e
   validators web foram regenerados. O gate focado teve 23 testes passando; a linha
   de base anterior teve 774 testes Python passando e 2 ignorados.
4. **O que isso invalida.** Invalida o tipo preliminar com `seed` único,
   `trigger` singular e `matchedBrl` ambíguo; invalida também qualquer implementação
   que consulte o job expirado ou faça waterfall global antes do autonetting.

---

## 2026-09-22 — Especificação do Replay temporal da Etapa 5

1. **Sintoma.** A Etapa 5 possuía somente requisitos gerais e uma referência visual
   aprovada. O protótipo visual demonstrava a direção desejada, mas continha erros de
   cálculo, estado, ancoragem de linhas e sequência de animações que não podiam virar
   comportamento de produto.
2. **Causa.** Ainda não existia um contrato temporal próprio nem uma fronteira clara
   entre resultado canônico, reconstrução de estado e animação. A especificação global
   também proibia linhas entre cartões, enquanto a referência aprovada passou a usá-las
   como explicação visual do agregado.
3. **O que foi feito.** Foi criada
   `docs/superpowers/specs/2026-09-22-frontend-etapa-5-replay-design.md`, com o MVP,
   contrato V1, invariantes, máquina temporal, direção `Fronteira Viva`, critérios de
   aceite e evoluções 5A–5C. A especificação global foi alinhada para permitir somente
   uma decomposição ilustrativa, determinística e não persistida do casado. `MAPA.md`
   passou a indexar a nova especificação. Nenhum código de produto foi alterado.
4. **O que isso invalida.** Invalida a proibição absoluta de conexões visuais entre
   cartões no Replay e qualquer expectativa de aproveitar os cálculos do protótipo.
   Permanecem válidas a posição agregada de tesouraria e a proibição de apresentar
   essas conexões como contraparte, custódia, pareamento físico ou benefício individual.

---

## 2026-09-22 — Corrida eliminada no E2E da Evolução B (MOT-85)

1. **Sintoma.** O check `pytest` do PR #55 falhou no primeiro E2E da Evolução B:
   havia uma repetição pendente, mas o teste esperava que o contador de submissões
   já tivesse avançado mais uma vez. Os dois E2E seguintes falharam em cascata.
2. **Causa.** O helper lia o contador `submitted` depois do clique que iniciava o
   diagnóstico. Em CI, a primeira repetição podia ser submetida antes dessa leitura,
   tornando a expectativa deslocada em uma unidade e deixando trabalho pendente.
3. **O que foi feito.** `stage4-evolution-b.spec.ts` agora captura o contador antes
   do clique, como o E2E do MVP já fazia, e usa essa base imutável ao liberar as dez
   repetições controladas.
4. **O que isso invalida.** Invalida somente a evidência do primeiro check remoto do
   PR #55. Não altera produto, motor, contratos nem o aceite funcional da Etapa 4.

---

## 2026-09-21 — Aceite da Evolução B da Etapa 4 (MOT-85)

1. **Sintoma.** MOT-82–MOT-84 entregavam o fluxo funcional, mas ainda faltavam
   evidências de reload, concorrência, integração vertical e regressão do MVP.
2. **Causa.** O recorte não possuía fixture com terceiro Perfil nem percurso E2E
   que atravessasse composição, diagnóstico, comparação e persistência.
3. **O que foi feito.** A branch `codex/etapa-4-mvp` ganhou fixture C, E2E vertical
   e concorrente, regressão atualizada, diagnóstico com código público de entrada
   incompatível e documentação de aceite. Suíte web, E2E repetido, preparação
   Python e cenário Amanda passaram.
4. **O que isso invalida.** Invalida o estado “B funcional, mas sem aceite”. B está
   concluída para testes internos. A e C permanecem futuras; nada autoriza push,
   PR, merge, deploy ou uso em produção.

---

## 2026-09-21 — Comparação estrutural da Evolução B (MOT-84)

1. **Sintoma.** A comparação do MVP rejeitava qualquer adição ou remoção de
   participante, mesmo quando as duas execuções eram diagnósticos válidos do mesmo
   Estudo e usavam versões compatíveis.
2. **Causa.** A compatibilidade exigia igualdade integral da composição e não havia
   relatório tipado para separar mudanças válidas de conflitos de identidade,
   fingerprint, seed ou proveniência.
3. **O que foi feito.** A branch `codex/etapa-4-mvp` passou a classificar
   participantes mantidos, adicionados, removidos e alterados, bloquear conflitos e
   sources não atualizadas, distinguir regras de IOF e renderizar o diff estrutural
   antes dos sete eixos agregados. Indisponibilidade continua sem virar zero.
4. **O que isso invalida.** Invalida a conclusão de que composições diferentes são
   sempre incomparáveis. A comparação continua não pareada e não atribui resultado
   individual; integração E2E e aceite final permanecem na MOT-85.

---

## 2026-09-21 — Construtor de composição da Evolução B (MOT-83)

1. **Sintoma.** O domínio já aceitava composição variável, mas a interface ainda
   oferecia apenas multiplicadores globais e não permitia adicionar, remover ou
   editar participantes individualmente.
2. **Causa.** O formulário do MVP não carregava os Perfis do owner nem orquestrava
   materialização, preparação e persistência atômica da MOT-82.
3. **O que foi feito.** A branch `codex/etapa-4-mvp` ganhou um construtor em três
   áreas, resumo antes/depois, identidade e seed congeladas, edição de custos e IOF,
   uma única preparação quando a geração muda e reutilização das ordens quando só
   janela/custos mudam. Falhas preservam o rascunho e oferecem retry após o CAS.
4. **O que isso invalida.** Invalida a limitação visual do editor global para
   cenários por Perfil. A comparação estrutural ainda depende da MOT-84; nada aqui
   constitui causalidade, efeito marginal, V4, push, PR, merge ou deploy.

---

## 2026-09-21 — Domínio de composição da Evolução B (MOT-82)

1. **Sintoma.** O MVP só aplicava volume, mix, ticket e prazo globalmente e rejeitava
   qualquer comparação que alterasse a composição de participantes.
2. **Causa.** Não existia um delta tipado por participante nem uma transição única
   capaz de anexar evidência de Perfil e cenário sob a mesma revisão do Estudo.
3. **O que foi feito.** A branch `codex/etapa-4-mvp` integrou a correção decimal da
   `origin/main` e passou a materializar adição, remoção e atualização individual,
   com sources exatas, IOF canônico, preservação de identidade e persistência
   atômica de evidência mais cenário. A origem permanece V3 e por Perfil.
4. **O que isso invalida.** Invalida a limitação técnica de composição imutável no
   domínio. A interface e a comparação estrutural ainda dependem de MOT-83 e MOT-84;
   nada aqui constitui forecast, causalidade, V4, push, PR, merge ou deploy.

---

## 2026-09-21 — MVP de hipóteses e comparação da Etapa 4 (MOT-78–MOT-81)

1. **Sintoma.** A Etapa 3 diagnosticava uma carteira, mas ainda não permitia criar
   cenários explícitos, simular a partir de Perfis nem comparar base e hipótese sem
   interpretação manual.
2. **Causa.** Faltavam contratos versionados para derivação por Perfil, transformação
   controlada de premissas, proveniência por cenário e compatibilidade entre
   execuções diagnósticas.
3. **O que foi feito.** Na branch local `codex/etapa-4-mvp`, sobre `a9a633c`, foram
   implementadas MOT-78–MOT-81: snapshot por Perfil, cenários imutáveis, hipóteses
   restritas pela autoridade da fonte, novo Estudo sintético para Perfis, diagnóstico
   por cenário, comparação dos sete eixos e dois percursos E2E. A operação e a
   evolução A/B/C ficaram documentadas. Dois E2E legados passaram a conferir a rota
   canônica `/carteira/:studyId` em vez da rota transitória já redirecionada.
4. **O que isso invalida.** Invalida a afirmação de que o front-end só diagnostica
   uma carteira estática. Não transforma simulação em forecast, diferença em
   causalidade ou aceite local em prontidão para produção. Não autoriza push, PR,
   merge nem deploy.

---

## 2026-09-21 — Reconciliação decimal exata por mecanismo (MOT-81)

**Sintoma.** Algumas carteiras válidas da análise falhavam ao construir o agregado
canônico, embora baseline, custo netado e economia representassem o mesmo valor
matemático. A diferença observada era residual, na ordem de `1E-25`.

**Causa.** A economia de cada mecanismo e as somas do contrato canônico usavam o
contexto global de `Decimal`, cuja precisão finita arredondava resultados
intermediários antes da comparação estrita.

**O que foi feito.** A branch `codex/fix-reconciliacao-decimal` centralizou soma e
subtração exatas em `motor/analise/aritmetica.py` e passou a usá-las no cálculo,
nos invariantes dos mecanismos e no DTO do JSON público. Foram incluídos testes
de regressão que reproduzem o arredondamento sem alterar regras de negócio,
rateios ou tolerâncias. Dois E2E ainda presos à rota legada `/estudos/{id}` foram
alinhados à rota canônica `/carteira/{id}` já usada pela aplicação.

**O que isso invalida.** Apenas a conclusão de que a falha indicava inconsistência
na alocação ou no netting. Números de simulação, critérios econômicos e resultados
históricos permanecem válidos.

---

## 2026-09-20 — Aceite integral de acessibilidade da Etapa 3 (MOT-77)

1. **Sintoma.** S15.14 permanecia PARTIAL: a página robusta não tinha percurso
   browser próprio por teclado e a 200% de zoom.
2. **Causa.** As tabelas largas possuíam rolagem horizontal visual, mas seus
   containers não entravam na ordem de foco, impedindo operação por setas sem mouse.
3. **O que foi feito.** O E2E `diagnostic-jobs.spec.ts` cobre Chromium local em
   1280 × 800, zoom 200%, `Tab`/`Enter`, foco visível, distribuição, execução
   selecionada, sete eixos e rolagem horizontal. Os containers viraram regiões
   nomeadas e focáveis. O gate de `57be689` aprovou 772 Python normal e `-O`, 388
   testes web, 15 E2E, Ruff, mypy, typecheck, lint, build, contratos e scanner.
4. **O que isso invalida.** Invalida a decisão `CONDITIONAL` baseada exclusivamente
   na ausência de prova S15.14. O aceite técnico local da Etapa 3 passa a **PASS**.
   Não autoriza push, PR, merge nem início da Etapa 4.

---

## 2026-09-20 — Auditoria final e aceite condicional da Etapa 3 (MOT-77)

1. **Sintoma.** T0–T11 tinham implementação, revisões e um gate global verde no
   mesmo SHA, mas faltavam a documentação operacional efetiva, a matriz individual
   dos 18 critérios S15 e o rastreamento final dos dois fluxos de autoridade. A
   evidência de acessibilidade também não distinguia o diagnóstico legado da nova
   página robusta.
2. **Causa.** Operação, arquitetura e mapa ainda descreviam a Etapa 2/estado de
   partida, enquanto a prova de zoom a 200% existente no Playwright exercitava
   `/diagnostico`, não `/estudos/:studyId/diagnostico`. Testes unitários comprovavam
   série/tabela, foco e controles semânticos, mas não havia percurso browser do novo
   diagnóstico por teclado e a 200%.
3. **O que foi feito.** Na branch `codex/frontend-etapa-3`, foram auditados
   `casos → perfil → profile_versions → estudo` e
   `cenário → request → job → eixos → terminal → IndexedDB → UI`. Foram registrados
   DB 2, schemas, endpoints, limites, estados e métodos estatísticos efetivos; criados
   os guias de operação e aceite; atualizados mapa, arquitetura, testes, plano e a
   especificação histórica. A matriz S15 marcou 17 critérios PASS e S15.14 PARTIAL,
   emitindo decisão técnica local **CONDITIONAL**. Nenhum código de produto mudou e
   o gate T11 não foi repetido.
4. **O que isso invalida.** Invalida o mapa/arquitetura que tratavam a Etapa 3 como
   não iniciada e qualquer leitura de que o gate global, sozinho, provava zoom e
   teclado da página robusta. Não invalida os 772 testes Python, 388 unitários web,
   14 E2E, contratos sem drift, medições 10/30/100 ou gates do SHA `03e87b8`. Não
   autoriza push, PR, CI publicado, merge ou início da Etapa 4.

## 2026-09-20 — Fix Round 1 do fechamento integrado da Etapa 3 (MOT-76)

1. **Sintoma.** A primeira rodada global da T11 terminou condicional: Ruff encontrou
   dois I001 mecânicos; dois testes Playwright ainda esperavam a navegação/erro do
   storage anteriores; o scanner não via logs Python multiline nem segredos UTF-16;
   e a prova de shutdown usava apenas o pool controlado em processo.
2. **Causa.** As expectativas E2E ainda dependiam do link removido `Carteira`, de
   uma rota transitória `/estudos/:uuid` e do código `DOCUMENT_CORRUPT` anterior ao
   schema V3. O scanner era regex por linha/Latin-1, e o double do executor não
   exercitava o lifecycle real de processos `spawn`.
3. **O que foi feito.** Os dois imports receberam somente a formatação I001. Os
   testes browser passaram a validar `Empresas`/`Estudos`, acessar diretamente a
   rota pública `/carteira`, esperar a rota estável `/carteira/:uuid` e reconhecer
   `SCHEMA_UNSUPPORTED` para documento V2 no storage V3. Logs Python são analisados
   por AST e binários UTF-16LE/BE são normalizados explicitamente. Um teste
   event-driven bloqueia um `ProcessPoolExecutor` real sob `spawn`, cancela o job e
   prova que close não deixa future, worker ou dispatcher pendente.
4. **O que isso invalida.** Invalida o gate condicional registrado para o SHA
   `404533e`: seus dois I001 e dois failures Playwright deixam de representar o
   candidato corrigido. Não altera regras do motor, contratos financeiros,
   semântica de storage ou produto; apenas alinha evidência, scanner e lifecycle ao
   estado já vigente. Medições 10/30/100 continuam técnicas, não comerciais.

## 2026-09-20 — Aceitação integrada e regressão da Etapa 3 (MOT-76)

1. **Sintoma.** Os fluxos Empresa→Perfil→Estudo e diagnóstico robusto tinham testes
   focados, mas ainda faltava uma aceitação conjunta com fila controlável,
   isolamento entre contas, regressão das Etapas 1–2, scanner ampliado e medição
   10/30/100. Reloads nas rotas públicas novas de Empresa, diagnóstico e carteira
   também retornavam JSON 404 embora a navegação pelo router funcionasse.
2. **Causa.** O projeto Playwright local ainda selecionava apenas os specs anteriores
   e o fallback SPA do servidor mantinha a allowlist da etapa anterior. Segurança e
   performance possuíam evidências parciais, sem varrer binários/logs sensíveis nem
   registrar as três cardinalidades diagnósticas no mesmo gate de CI.
3. **O que foi feito.** Na branch `codex/frontend-etapa-3`, foram adicionadas
   aceitações Python/Playwright para perfil versionado, CAS em duas abas, fila,
   progresso, cancelamento, idempotência, isolamento 404, reload, entrada fixa,
   distribuição gerada, falha sem parcial e regressão da Etapa 2. O worker E2E é
   liberado por condição, prova teto de concorrência e encerra sem pendências. O
   scanner passou a cobrir binários, URLs completas/query e payloads sensíveis em
   logs. A CI mede 10/30/100 e preserva `-O`, frontend, E2E e scanner. A allowlist
   SPA ganhou apenas os paths públicos exatos já declarados no router, inclusive
   `/carteira/:uuid`, sem wildcard genérico.
4. **O que isso invalida.** Invalida evidência de aceite da Etapa 3 baseada apenas
   nos gates focados T0–T10 e a suposição de que um deep link funcional no router
   necessariamente recarregava pelo servidor. Não altera motor, regras financeiras,
   contratos diagnósticos, snapshots persistidos ou números de negócio. Os tempos
   10/30/100 são medição sintética local, não SLA nem projeção comercial. Auth real
   continua condicionado a credenciais externas e a pendência Ruff legada permanece
   fora do escopo.

## 2026-09-20 — Lacunas e evidência por métrica na comparação temporal (MOT-75)

1. **Sintoma.** A comparação temporal mostrava dias cobertos, mas ocultava lacunas
   de um perfil formado por casos descontínuos. Além disso, cada métrica projetada
   recebia apenas a proveniência agregada do documento, perdendo as referências de
   `EvidenceValue.evidence` que sustentavam especificamente aquele valor.
2. **Causa.** A projeção temporal não carregava `gapDays` e reutilizava um único
   array de proveniência para todas as métricas do perfil.
3. **O que foi feito.** `TimelineObservation` e cada valor alinhado passaram a
   preservar `gapDays`; casos individuais registram zero pela janela contínua do
   próprio contrato e perfis usam `coverage.gapDays`. A linha temporal e a tabela
   exibem lacunas antes dos valores e diferenças. Cada métrica também conserva suas
   referências próprias, separadas da proveniência de documento/fonte, inclusive
   mantendo lista vazia quando a indisponibilidade não registra referência.
4. **O que isso invalida.** Invalida leituras da primeira entrega da MOT-75 que
   inferiam continuidade apenas pelos dias cobertos ou tratavam proveniência
   agregada como evidência de cada métrica. Compatibilidade, deltas, motor, servidor,
   diagnóstico, persistência e limites da etapa seguinte permanecem inalterados.

## 2026-09-20 — Comparação temporal restrita de casos e perfis (MOT-75)

1. **Sintoma.** Casos observados e versões imutáveis de Perfil Operacional estavam
   disponíveis por empresa, mas não havia uma leitura temporal conjunta que
   preservasse cobertura, ausência, definição e proveniência antes de calcular
   diferenças.
2. **Causa.** As páginas apresentavam cada fonte separadamente e ainda não existia
   uma projeção comum, pura e semanticamente fechada para evidências versionadas.
3. **O que foi feito.** Na branch `codex/frontend-etapa-3`, casos e perfis passaram a
   ser projetados nas mesmas quatro famílias compatíveis — volume, direção, ticket e
   prazo — com período, dias cobertos, estado de cobertura, definição, unidade,
   método e proveniência. A comparação bloqueia empresa ou semântica divergente,
   ordena de forma determinística e só calcula diferenças entre valores disponíveis.
   A Empresa recebeu seleção acessível de 2–6 observações, linha temporal e tabela;
   Casos e Perfis apontam para essa leitura.
4. **O que isso invalida.** Invalida a suposição de que diferenças temporais exigem
   tratar ausência como zero ou antecipar comparação de cenários. Não altera motor,
   servidor, diagnóstico, schema de persistência, `PortfolioSource` nem resultados
   financeiros; não introduz variante, causalidade ou análise individual.

## 2026-09-20 — Ordem semântica no snapshot diagnóstico fixo (MOT-73)

1. **Sintoma.** Uma reserva diagnóstica fixa válida era rejeitada com
   `INCOMPATIBLE_EXECUTION_SNAPSHOT` quando o snapshot preservava as ordens em
   sequência física `b,a`, mas o request de prévia as enviava na sequência
   canônica `a,b`.
2. **Causa.** A validação de snapshots `PREVIEW` já comparava ordens normalizadas
   por `id`, enquanto o ramo `FIXED_INPUT` de `DIAGNOSTIC` comparava diretamente os
   arrays e tratava posição como parte do conteúdo.
3. **O que foi feito.** A validação de ambos os tipos de execução passou a usar a
   mesma projeção ordenada por `id` antes da comparação canônica. Regressões no
   domínio e no IndexedDB cobrem snapshot físico não ordenado com request canônico;
   um controle negativo confirma que alteração real em `valor_brl` continua sendo
   rejeitada.
4. **O que isso invalida.** Invalida a interpretação de que a posição no array de
   ordens faz parte da identidade analítica. IDs e todos os valores das ordens
   continuam comparados integralmente; não muda contratos, persistência, motor,
   números ou UI T9.

## 2026-09-20 — Cancelamento acionável e decimais lossless na UI (MOT-74)

1. **Sintoma.** Durante polling, o botão de cancelamento era exibido, mas a mesma
   flag que bloqueava nova execução também fazia o handler retornar sem chamar o
   serviço. Além disso, o adapter do gráfico convertia strings decimais em `Number`,
   arredondando valores canônicos acima da precisão segura do JavaScript.
2. **Causa.** Execução em andamento e ação de cancelamento compartilhavam um único
   estado `busy`; gráfico e tabela partiam da mesma série, mas apenas o gráfico
   aplicava coerção numérica com perda.
3. **O que foi feito.** Na branch `codex/frontend-etapa-3`, execução e cancelamento
   passaram a ter estados separados, com trava síncrona contra cancelamento
   duplicado. Um teste integrado cobre submit, polling, confirmação pelo job exato,
   serviço de cancelamento, terminal `CANCELLED` e histórico. O adapter ECharts
   mantém os decimais canônicos como strings tanto no option quanto na tabela, com
   regressão para `9007199254740993.01`.
4. **O que isso invalida.** Invalida a suposição de que botão visível implicava
   cancelamento acionável durante polling e qualquer leitura do gráfico baseada em
   coerção IEEE-754. Contratos, storage, servidor, motor e valores recebidos não
   mudam; a UI continua sem recalcular métricas financeiras.

## 2026-09-20 — Apresentação acessível do diagnóstico robusto (MOT-74)

1. **Sintoma.** O diagnóstico robusto possuía contratos, executor e histórico
   imutável, mas não havia página para configurar a amostragem, acompanhar o job e
   ler distribuição, execução selecionada, sete eixos e proveniência sem confundir
   ausência com zero.
2. **Causa.** A Etapa 3 tinha encerrado T8 na fronteira de serviço; faltavam a
   adaptação exclusivamente apresentacional dos envelopes validados, a rota do
   estudo e uma visualização acessível reconciliada com tabelas.
3. **O que foi feito.** Na branch `codex/frontend-etapa-3`, a rota
   `/estudos/:studyId/diagnostico` passou a consumir o serviço T8, restaurar
   reservas/terminais e expor 10/30/100 apenas para origem gerável. ECharts 6.1.0
   foi integrado por módulos, sem wrapper, com SVG, descrição, `ResizeObserver`,
   movimento reduzido e descarte. Distribuição e execução selecionada usam props
   distintas; os sete eixos exibem métricas canônicas, gráfico/tabela da mesma
   série, consequências, limitações e referências. O fluxo legado `/diagnostico`
   continua disponível e a navegação volta a expor “Diagnóstico”.
4. **O que isso invalida.** Invalida a suposição de que os envelopes do T8 só eram
   inspecionáveis por testes ou payload bruto. Não altera contratos HTTP, motor,
   storage/CAS, números, regras de simulação nem a comparação temporal T10; a UI
   não recalcula métricas e estados indisponíveis continuam sem fabricar zeros.

## 2026-09-20 — Forma persistida fechada e expiração tardia de resultado (MOT-73)

1. **Sintoma.** A segunda rodada de auditoria do T8 encontrou duas brechas: um
   documento V3 artesanal ainda podia persistir estados diagnósticos transitórios
   ou reservas `QUEUED` duplicadas; e um job observado como `SUCCEEDED` podia ter o
   resultado removido antes do GET final, deixando a tentativa sem terminal local.
2. **Causa.** A validação integral correlacionava apenas terminais com reservas, sem
   validar a cardinalidade e os estados de todos os registros agrupados por
   `attemptId`. O tratamento de 404 cobria o polling do job, mas não o GET do
   resultado.
3. **O que foi feito.** Parser, validação integral, append de domínio e fronteira
   IndexedDB agora aceitam por tentativa exatamente uma reserva `QUEUED`, sozinha
   ou acompanhada de um único terminal imutavelmente correlato; `RUNNING` e outros
   estados transitórios, órfãos, duplicatas e grupos maiores são rejeitados antes
   do CAS. Um 404 do resultado após `SUCCEEDED` anexa
   `INTERRUPTED / SERVER_RESTART_OR_JOB_EXPIRED` pela mesma trilha protegida por
   owner, epoch, `AbortSignal` e CAS; demais erros continuam sem fabricar terminal.
4. **O que isso invalida.** Invalida documentos V3 diagnósticos que persistam
   progresso transitório ou mais de uma reserva para o mesmo `attemptId`, e a
   suposição de que observar `SUCCEEDED` garante que o resultado ainda exista. Não
   muda contratos HTTP, motor, números ou UI T9.

## 2026-09-20 — Hardening de polling, sessão e correlação diagnóstica (MOT-73)

1. **Sintoma.** A auditoria independente do T8 encontrou três brechas: polling
   parava em `AGGREGATING`; uma troca de sessão durante um `flush` terminal podia
   permitir escrita tardia; e um terminal artesanal podia reutilizar `attemptId`
   sem preservar integralmente a identidade da reserva.
2. **Causa.** A lista de estados ativos omitia uma fase do contrato T7, a guarda de
   owner/epoch/signal era feita antes — mas não depois — de awaits que cediam
   controle, e validação/append correlacionavam terminais apenas pela presença do
   `attemptId`, sem comparar todos os campos imutáveis.
3. **O que foi feito.** `AGGREGATING` agora mantém polling. O fluxo revalida
   owner, epoch e `AbortSignal` após cada await relevante e imediatamente antes de
   `edit`/`saveDetachedStudy`. Cada terminal exige exatamente uma reserva `QUEUED`
   do mesmo attempt e identidade canônica idêntica (job/request/sampling, cenário,
   fingerprint, snapshots e demais campos invariantes), no domínio, na validação
   integral e, por consequência, na fronteira IndexedDB. Regressões cobrem races de
   owner, mesmo owner com novo epoch, abort, documento artesanal e retry válido.
4. **O que isso invalida.** Invalida a suposição de que checar sessão somente antes
   de `flush` bastava e qualquer documento diagnóstico que correlacionasse terminal
   apenas por `attemptId`. Não muda contratos HTTP, motor, números ou UI T9.

## 2026-09-20 — Orquestração e histórico imutável de diagnósticos (MOT-73)

1. **Sintoma.** O cliente web conhecia os contratos gerados do diagnóstico, mas não
   conseguia montar planos determinísticos, reservar uma tentativa antes do POST,
   retomar jobs após reload nem preservar um resultado terminal sem transformar
   progresso transitório em autoridade local.
2. **Causa.** Faltavam o cliente dos cinco endpoints, o builder canônico, as queries
   owner-scoped e um modelo V3 que distinguisse execuções `PREVIEW` de reservas e
   terminais `DIAGNOSTIC`. O storage conhecia apenas o histórico da Etapa 2.
3. **O que foi feito.** Na branch `codex/frontend-etapa-3`, o web client passou a
   construir requests fixos ou gerados com IDs/seeds determinísticos, reservar
   `jobId = idempotency_key` por CAS antes do POST, retomar polling sem novo POST e
   anexar no máximo um terminal por `attemptId`. Cancelamento, retry, 404 após
   restart, troca de conta, troca de estudo e respostas tardias preservam a
   autoridade owner/epoch. Schema, validação e IndexedDB aceitam o histórico misto
   de forma append-only e rejeitam mutação, duplicidade e envelopes divergentes.
4. **O que isso invalida.** Invalida consumidores que tratavam `executions` de V3
   como uma lista exclusivamente `PREVIEW` e a hipótese de que retries diagnósticos
   teriam `request_id` novo. Progresso de job continua deliberadamente transitório;
   não há mudança no motor, no servidor MOT-72 nem na UI de diagnóstico MOT-74.

## 2026-09-20 — ID público previsível e registry por owner (MOT-72)

1. **Sintoma.** O cliente conhecia a chave idempotente antes do POST, mas o
   servidor criava outro UUID para o job. Além disso, o registry indexava apenas
   esse UUID global, impedindo que dois owners reutilizassem legalmente a mesma
   chave sem colisão ou risco de sobrescrita.
2. **Causa.** A chave idempotente identificava somente o binding do comando; uma
   fábrica aleatória separada criava o identificador público, e jobs/fila/callbacks
   não carregavam o owner na coordenada interna.
3. **O que foi feito.** `job_id` agora é exatamente `idempotency_key` tanto no
   submit quanto no retry. Registry, fila, callbacks, cancelamento e retenção usam
   internamente `(owner_sub, job_id)`. A identidade canônica completa do comando,
   o tipo submit/retry e o alvo original continuam definindo conflitos dentro de
   cada owner. Testes cobrem ID conhecido antes do POST/retry, dois owners com o
   mesmo UUID e isolamento de lookup, resultado, cancelamento e retry.
4. **O que isso invalida.** Invalida consumidores que aguardavam o POST para
   descobrir um UUID aleatório e qualquer hipótese de unicidade global de
   `job_id`; a identidade pública é owner-scoped. DTOs/OpenAPI, motor, UI,
   persistência e prévia síncrona não mudam.

## 2026-09-20 — Correção de estado, identidade e retenção da fila (MOT-72)

1. **Sintoma.** Um job gerado cedido entre repetições podia produzir snapshot
   `QUEUED` incompatível com progresso já iniciado; a idempotência confiava apenas
   no fingerprint declarado; retry podia colidir com comando alheio; entrada fixa
   sobrescrevia o fingerprint calculado pela T6; e terminais só expiravam quando
   outro endpoint tocava o registry.
2. **Causa.** A fila interna e o estado público compartilhavam o mesmo marcador, o
   binding idempotente não armazenava a identidade do comando completo, a agregação
   aplicava o handoff de metadados gerados a ambos os tipos de entrada e a limpeza
   de retenção vivia apenas nos métodos públicos.
3. **O que foi feito.** Jobs cedidos permanecem logicamente `RUNNING/EXECUTING` e
   podem ser cancelados imediatamente entre repetições. O binding agora combina
   owner/chave com hash canônico de todo o request exceto a própria chave, tipo do
   comando e alvo de retry. `FIXED_INPUT` preserva o resumo T6; somente
   `GENERATED_INPUT` recebe fingerprint e seeds autoritativos do plano. O próprio
   dispatcher acorda no próximo deadline e remove terminais sem tráfego posterior.
4. **O que isso invalida.** Invalida snapshots intermediários `QUEUED` de jobs já
   iniciados, reaproveitamento de chave com payload/comando diferente, fingerprint
   declarado no resumo de entrada fixa e a expectativa de limpeza somente lazy.
   DTOs públicos, motor, UI, persistência e prévia síncrona não mudam.

## 2026-09-20 — Diagnósticos em fila limitada e isolada (MOT-72)

1. **Sintoma.** Os cinco contratos diagnósticos já estavam publicados, mas a API
   não executava repetições, não expunha progresso e não possuía cancelamento,
   retry, retenção ou limites operacionais.
2. **Causa.** A MOT-70 fechou os DTOs e a MOT-71 entregou a análise pura; faltava o
   coordenador que separa fila/registry do trabalho de CPU e registra o owner
   autenticado em cada tentativa.
3. **O que foi feito.** A branch `codex/frontend-etapa-3` ganhou fila FIFO em
   memória, registry e idempotência sob lock, worker top-level em
   `ProcessPoolExecutor` com `spawn`, uma repetição por job por vez, cancelamento
   cooperativo, retry, expiração terminal e limites configuráveis. O lifespan cria
   e fecha o executor; as cinco rotas autenticadas aplicam isolamento por `sub`,
   limite de 1 MiB, respostas `no-store` e erros sanitizados. Repetições geradas
   preservam as seeds do plano e o `input_fingerprint` autoritativo da request.
4. **O que isso invalida.** Invalida apenas a ausência de execução operacional dos
   contratos T5. A fila continua não durável; cancelamento não interrompe a
   repetição corrente; prévia síncrona, regras do motor, persistência e UI não mudam.

## 2026-09-20 — Análise diagnóstica sem import privado e sem prazo zero inventado (MOT-71)

1. **Sintoma.** O agregador T6 importava o percentil por um caminho interno de
   `motor` e publicava prazo disponível igual a zero quando a coorte medida não
   continha volume.
2. **Causa.** A primeira implementação reutilizou diretamente a função estatística
   interna e tratou o caso vazio com o mesmo valor neutro usado antes da construção
   do `EvidenceMetric`.
3. **O que foi feito.** O diagnóstico agora implementa localmente o nearest-rank
   empírico com `Decimal`, sem importar `motor`. Coorte vazia torna prazo, D+0,
   espera, HHI e maior participação `INCOMPATIBLE`, com razão e referências
   estáveis. Regressões cobrem a fronteira de imports e o estado vazio.
4. **O que isso invalida.** Invalida somente a disponibilidade artificial de
   `deadline_days=0` para carteira medida vazia e a dependência interna do motor.
   Carteiras com volume, resultados do motor e contratos públicos não mudam.

## 2026-09-20 — Sete eixos puros do diagnóstico robusto (MOT-71)

1. **Sintoma.** O contrato do diagnóstico já publicava os sete eixos, mas ainda não
   existia cálculo auditável para preenchê-los. Além disso, a participação por
   cliente exigia UUID embora entradas fixas válidas usem identificadores como
   `astropay`, `nomad` e `wise`.
2. **Causa.** A MOT-70 fechou a forma pública antes dos agregadores. Nesse corte,
   `ParticipantShare` herdou por engano a identidade UUID da receita geradora, mesmo
   representando o `cliente_id` textual das operações explícitas.
3. **O que foi feito.** A branch `codex/frontend-etapa-3` adiciona análise pura com
   `Decimal` para potencial, captura, tempo, resíduo, composição, robustez econômica
   e perfil operacional; separa execução selecionada da distribuição; deriva
   consequências versionadas e limitações com referências verificadas. O contrato
   de participação passa a usar o `Identificador` estrito de `OrdemEntrada`, com
   OpenAPI e tipos gerados novamente pelos comandos oficiais.
4. **O que isso invalida.** Invalida somente o formato UUID antes publicado para
   `ParticipantShare.participant_id`. Requests, receitas geradoras, resultados do
   motor e contratos UUID das seeds permanecem iguais; a análise não cria HTTP,
   fila, persistência ou interface.

## 2026-09-20 — UUID URN na validação diagnóstica do cliente (MOT-70)

1. **Sintoma.** `ajv-formats` e Pydantic aceitavam `urn:uuid:<UUID>`, mas a
   normalização semântica gerada só reconhecia a forma bare e rejeitava requests que
   o servidor aceitava.
2. **Causa.** `normalizeUuidIdentity` aplicava a regex canônica diretamente ao texto
   inteiro, sem retirar o prefixo URN aceito pelos dois lados.
3. **O que foi feito.** A interseção foi caracterizada: bare e `urn:uuid:` minúsculo
   aceitam payload em qualquer caixa; compacto/braces falham no AJV e `URN:UUID:`
   falha no Pydantic. O gerador agora remove somente o prefixo URN comum antes de
   canonicalizar identidades, mantendo chaves de seed textuais.
4. **O que isso invalida.** A cobertura de paridade UUID declarada na correção
   anterior para a variante URN. Requests bare, regras do motor e resultados não
   mudam.

## 2026-09-20 — Identidade UUID canônica no plano diagnóstico (MOT-70)

1. **Sintoma.** O cliente tratava UUIDs textuais com caixas diferentes como IDs
   distintos e comparava o ID bruto do participante com chaves de seed. Isso
   divergia do Pydantic, que canonicaliza valores UUID, mas preserva as chaves do
   mapa como texto.
2. **Causa.** A checagem semântica gerada usava igualdade direta de strings para
   participante, repetição e seleção.
3. **O que foi feito.** O gerador oficial passou a normalizar valores-identidade
   UUID antes de comparar participantes, detectar repetição duplicada e resolver a
   seleção. Chaves de `participant_seeds` permanecem textuais e precisam coincidir
   com o ID canônico, reproduzindo a aceitação/rejeição do servidor.
4. **O que isso invalida.** A paridade declarada na correção anterior para payloads
   com UUID em caixa alta ou mista. Requests canônicos e resultados do motor não
   mudam.

## 2026-09-20 — Paridade integral do plano gerado no cliente (MOT-70)

1. **Sintoma.** O boundary AJV ainda aceitava mapas de seed que não correspondiam
   aos participantes da preparação, IDs de repetição duplicados, a mesma seed para
   um participante em repetições diferentes e seleção fora do plano explícito.
2. **Causa.** A primeira checagem semântica validava contagem e entradas isoladas,
   mas não reconstruía as relações globais que o `GeneratedInputPlan` do servidor
   já impunha.
3. **O que foi feito.** O gerador oficial passou a comparar exatamente o conjunto
   de participantes em cada repetição, rastrear IDs e seeds já usados e exigir que
   `selected_repetition_id` pertença ao plano. Entradas estruturalmente inválidas
   continuam retornando `false` sem lançar exceção.
4. **O que isso invalida.** A afirmação de paridade semântica completa feita após a
   primeira correção do boundary cliente. Requests válidos e resultados do motor
   permanecem inalterados.

## 2026-09-20 — Validação semântica do plano diagnóstico no cliente (MOT-70)

1. **Sintoma.** O validador AJV aceitava plano `GENERATED_INPUT` com `count`
   diferente do número de repetições, chave de participante que não era UUID e seed
   acima do limite canônico, embora a fronteira Pydantic rejeitasse esses payloads.
2. **Causa.** Essas relações vivem em `model_validator` e não são representáveis
   integralmente pelo JSON Schema gerado apenas com as palavras-chave usadas.
3. **O que foi feito.** O gerador oficial agora compõe a validação estrutural AJV
   com uma checagem semântica determinística para contagem, chaves UUID e teto de
   seed; testes de regressão cobrem os três desvios sem editar artefatos gerados.
4. **O que isso invalida.** A conclusão anterior de que a validação estrutural AJV
   bastava para esses invariantes específicos. Requests válidos e resultados do
   motor não mudam.

## 2026-09-20 — Contratos públicos do diagnóstico robusto (MOT-70)

1. **Sintoma.** A API não possuía contratos versionados para solicitar, acompanhar
   e ler um diagnóstico robusto; fila, progresso, amostragem e os sete eixos não
   apareciam no OpenAPI nem nos validadores do cliente.
2. **Causa.** A Etapa 2 publicava somente preparação e prévia individual. A
   fronteira contratual do diagnóstico precisava ser fechada antes do executor.
3. **O que foi feito.** A branch `codex/frontend-etapa-3` ganhou DTOs estritos para
   entrada fixa ou gerada, seeds e fingerprints explícitos, snapshot de job,
   evidências, sete eixos e envelope limitado. Cinco operações foram registradas
   apenas em `create_schema_app`; OpenAPI, tipos e validadores foram regenerados
   pelos comandos oficiais, sem handlers operacionais.
4. **O que isso invalida.** Nada nos resultados do motor, nas prévias existentes ou
   na persistência. O contrato gerado anterior deixa de representar toda a
   superfície planejada da Etapa 3.

## 2026-09-20 — Vínculo único de perfil enquanto CAS está pendente (MOT-69)

1. **Sintoma.** Duas ativações rápidas de “Usar como evidência em estudo” podiam
   iniciar vínculos simultâneos e produzir conflito ou mensagem enganosa de estudo
   não encontrado.
2. **Causa.** A lista não mantinha estado compartilhado de anexação; cada botão podia
   disparar uma nova sequência `loadStudy` + CAS enquanto a anterior estava pendente.
3. **O que foi feito.** `ProfileVersionList` agora aplica lock síncrono e desabilita
   todas as ações de vínculo até a promessa terminar. Um teste com promessa deferida
   cobre dupla ativação e ausência de alerta falso.
4. **O que isso invalida.** Somente a possibilidade de vínculos concorrentes
   iniciados pela própria lista. Perfil, estudo, carteira e resultados não mudam.

## 2026-09-20 — Confirmação e vínculo do Perfil Operacional (MOT-69)

1. **Sintoma.** A área de Perfis apenas listava versões já persistidas; não havia
   seleção explícita de Casos Observados, prévia de compatibilidade/cobertura,
   confirmação append-only nem vínculo do perfil como evidência de um estudo.
2. **Causa.** O cálculo determinístico e o repositório da Etapa 3 já existiam, mas
   faltava a orquestração session-bound no controller e a interface que conectasse
   seleção, confirmação e CAS do estudo sem criar uma nova origem de carteira.
3. **O que foi feito.** A branch `codex/frontend-etapa-3` adiciona o construtor e a
   leitura somente de perfis, renderiza todos os estados de `EvidenceValue`, confirma
   versões imutáveis pelo `ApplicationRepository` e copia o snapshot completo para o
   estudo atual por CAS. Testes cobrem bloqueios, avisos, cobertura, conflito,
   persistência/reload, troca A→B→A e preservação da origem da carteira.
4. **O que isso invalida.** Invalida somente a ausência do fluxo de confirmação e
   vínculo de perfis. `PortfolioSource` continua com três origens, execução continua
   somente `PREVIEW`, e API, motor, regras de negócio e números publicados não mudam.

## 2026-09-20 — Ausência de qualidade sem zero inventado (MOT-68)

1. **Sintoma.** A visão geral de uma empresa sem casos exibia `0 bloqueios · 0
   avisos · 0 não coletados` no campo Qualidade.
2. **Causa.** O componente formatava sempre os contadores agregados, mesmo quando
   não existia caso que sustentasse uma avaliação de qualidade.
3. **O que foi feito.** A branch `codex/frontend-etapa-3` agora exibe “não coletado”
   quando a empresa não tem casos e preserva as contagens quando existe evidência.
   Uma regressão de rota/componente cobre explicitamente o estado vazio.
4. **O que isso invalida.** Somente a apresentação de zeros como avaliação de
   qualidade para empresas sem casos. Casos existentes, filtros, vínculos,
   persistência, motor e números publicados não mudam.

## 2026-09-20 — Navegação de empresas, casos e vínculos históricos (MOT-68)

1. **Sintoma.** A aplicação ainda expunha destinos internos da Etapa 2 como
   navegação global e não oferecia catálogo por empresa, cobertura observada,
   histórico filtrável de casos, perfis versionados ou estudos relacionados.
2. **Causa.** O shell e o roteador precediam os read models da Etapa 3; apesar dos
   métodos de leitura já existirem no repositório, faltavam controllers e páginas
   que os consumissem preservando isolamento por conta e relações históricas.
3. **O que foi feito.** A branch `codex/frontend-etapa-3` limita a navegação global
   a Empresas e Estudos, adiciona as quatro áreas por empresa, cobertura e volumes
   sem zeros inventados, filtros persistidos na URL e tabelas semânticas. Vínculos
   Caso→Estudo e Perfil→Estudo derivam apenas de snapshots imutáveis, e o deep link
   legado `/estudos/:studyId` abre o mesmo estudo sob `/carteira/:studyId`.
4. **O que isso invalida.** Deixa de valer que Carteira, Diagnóstico, Comparar,
   Replay e Premissas sejam destinos globais, embora suas rotas compatíveis
   continuem acessíveis. Nada muda em persistência, APIs, motor, perfil como
   evidência ou números publicados.

## 2026-09-20 — Perfis versionados e estudos V3 persistidos (MOT-67)

1. **Sintoma.** O banco local ainda tinha oito stores no schema físico/lógico 1,
   não persistia versões imutáveis do Perfil Operacional e mantinha estudos e
   resultados idempotentes no contrato 2.0.0 sem evidência de perfil.
2. **Causa.** A Etapa 3 havia fechado apenas o contrato preparatório de Study V3;
   a migração transacional, o store append-only e a integração da evidência
   dependiam do Perfil Operacional concreto da MOT-66.
3. **O que foi feito.** A branch `codex/frontend-etapa-3` sobe IndexedDB e marcador
   lógico para 2, cria `profile_versions`, migra atomicamente estudos, execuções e
   payloads de operações para Study V3/PREVIEW, adiciona o port único de perfis e
   permite anexar cópia validada e imutável do perfil ao estudo. A fixture física
   real da Etapa 2 cobre replay, reabertura idempotente e rollback integral.
4. **O que isso invalida.** Deixa de valer que o banco `motor-fluxo:app:v2:*` tenha
   oito stores/schema 1, que `StudyDocument` corrente seja 2.0.0 e que
   `evidenceSnapshots` aceite somente a coleção vazia. DIAGNOSTIC, uma quarta origem
   de portfólio, contratos HTTP, motor e números publicados continuam inalterados.

## 2026-09-20 — Prazo assinado no schema do Perfil Operacional (MOT-66)

1. **Sintoma.** Um Caso Observado válido com `deadlineDate` anterior a `knownDate`
   gerava corretamente prazo `-1`, mas o próprio perfil calculado era rejeitado ao
   atravessar a validação runtime.
2. **Causa.** O schema reutilizava o decimal não negativo de valores monetários e
   frações nos quatro percentis de prazo, embora o contrato integrado de caso não
   imponha ordem entre as duas datas.
3. **O que foi feito.** Foi criado um decimal assinado exclusivo para evidências de
   `deadlineDays`, aplicado aos percentis por contagem e por volume. Uma regressão
   calcula e valida um perfil real com prazo `-1`.
4. **O que isso invalida.** Nada em casos, cálculo, dinheiro, frações, contagens,
   persistência, estudos, APIs, motor ou números publicados. Somente a rejeição
   indevida de prazos negativos deixa de valer.

## 2026-09-20 — Validação fechada do Perfil Operacional (MOT-66)

1. **Sintoma.** Um perfil com fingerprint recalculado ainda podia omitir uma métrica
   obrigatória ou substituir `provenance.fields` por objetos arbitrários e atravessar
   a validação de leitura.
2. **Causa.** O schema `1.0.0` usava um mapa genérico de evidências para quatro
   famílias métricas e tipava a proveniência apenas como `object`.
3. **O que foi feito.** O schema agora enumera e exige todas as chaves e formas de
   valor de volume, frequência, tickets, direção, prazo, finalidade, janelas e
   sazonalidade. A validação registra e referencia a união discriminada oficial de
   `FieldProvenance` do contrato de Caso Observado. Duas regressões recalculam o
   fingerprint após adulterar o documento e provam a rejeição estrutural.
4. **O que isso invalida.** Nada em perfis gerados corretamente, IndexedDB, estudos,
   APIs, motor ou números publicados. Fica inválida a suposição de que um fingerprint
   íntegro sozinho compensaria lacunas estruturais no documento lido.

## 2026-09-20 — Perfil Operacional puro e versionado (MOT-66)

1. **Sintoma.** Casos Observados confirmados ainda não podiam ser combinados em um
   Perfil Operacional determinístico, com cobertura, métricas e ausência de evidência
   representadas por contrato explícito.
2. **Causa.** A fundação da Etapa 3 congelou os contratos existentes sem antecipar o
   domínio de perfil; faltavam compatibilidade da seleção, cálculo civil UTC,
   percentis, fingerprints e validação runtime próprios.
3. **O que foi feito.** Na branch `codex/frontend-etapa-3`, foi criado
   `web/src/profiles/` com domínio `1.0.0`, matriz de blockers e warnings, métricas
   determinísticas em Decimal.js, cobertura sem duplicar dias sobrepostos,
   sazonalidade civil, proveniência, JSON canônico, SHA-256 e schema/validação dos
   fingerprints. Testes dourados derivados à mão cobrem o contrato S06.
4. **O que isso invalida.** Nada em IndexedDB, estudos, APIs, motor ou números já
   publicados. O perfil continua puro e não persistido; alocação append-only de
   versões e vínculo como evidência pertencem às tarefas seguintes.

## 2026-09-20 — Freeze compatível dos contratos da Etapa 3 (MOT-65)

1. **Sintoma.** A Etapa 3 ainda não tinha uma fixture byte-estável do IndexedDB
   físico 1 nem um contrato executável que demonstrasse como estudos 2.0.0 seriam
   lidos após a introdução da discriminação de execuções e de evidências.
2. **Causa.** A Etapa 2 persistia execuções de prévia sem `kind` e não possuía
   `evidenceSnapshots`; ao mesmo tempo, os contratos de Perfil Operacional e de
   diagnóstico pertencem a tarefas posteriores e não podiam ser antecipados por
   tipos parciais.
3. **O que foi feito.** Na branch `codex/mot-65-etapa-3-t0`, foi capturada uma
   representação anonimizada real das stores `studies`, `executions` e `meta` do
   schema físico 1, com as três origens e uma tentativa com reserva mais terminal.
   O modelo e o schema agora expõem a migração pura 2.0.0 → 3.0.0, acrescentando
   somente `kind: 'PREVIEW'` e `evidenceSnapshots: []`; a validação rejeita kinds
   ainda não suportados, evidência não vazia, envelope incompatível e terminal
   duplicado por tentativa.
4. **O que isso invalida.** Nada nos números, regras do motor, IndexedDB existente
   ou comportamento da Etapa 2. Fica inválida apenas a suposição de que T0 já
   aceitaria Perfil Operacional ou `DIAGNOSTIC`: T1/T4 e T5/T8 continuam donas da
   abertura desses contratos.

## 2026-09-20 — Instante único na proveniência de preparação (MOT-33)

1. **Sintoma.** O E2E sintético podia bloquear a execução com “Proveniência agregada
   ambígua para as ordens do snapshot” após preparar um exemplo válido.
2. **Causa.** O editor capturava `new Date()` separadamente para cada path do mesmo
   request de preparação; quando o `map` atravessava um milissegundo, uma única
   origem ganhava dois instantes e parecia heterogênea ao builder da execução.
3. **O que foi feito.** `PortfolioSourceSelector.tsx` agora captura um único instante
   por request, e `studyEditor.test.tsx` cobre a atomicidade desse registro mesmo
   quando o relógio avança entre chamadas.
4. **O que isso invalida.** Nada em números, regras do motor ou contratos HTTP. Fica
   invalidada apenas a leitura de que esse bloqueio representava proveniência
   materialmente heterogênea.

## 2026-09-19 — Aceite condicional e handoff da Etapa 2 v2 (MOT-33)

1. **Sintoma.** A MOT-32 havia fechado o percurso integrado em `53e74f1` e o fix de
   quota em `b46017b`, mas a auditoria T12 encontrou seis falhas importantes no
   snapshot histórico, conversão observada, proveniência, troca de estudo durante o
   POST, reidratação da autoria e bootstrap de fontes legadas. Depois da primeira
   remediação, restaram três falhas importantes em correções por campo, fallback de
   origem histórica e terminal único por tentativa. Também faltavam operação,
   contratos efetivos, matriz S15 e handoff documentados.

2. **Causa.** Os testes integrados anteriores provavam o percurso nominal, mas alguns
   consumidores ainda reconstruíam contexto a partir do cenário atual, achatavam
   proveniência ou não correlacionavam reserva e terminal. As evidências ficaram
   distribuídas por SHAs: gates globais em `53e74f1`, quota em `b46017b` e gates
   focados da remediação até `b5a2d9a`.

3. **O que foi feito.** A remediação preservou snapshots exatos de origem, premissas
   e período; converteu observado em operações explícitas sem reamostragem; manteve
   proveniência por campo; concluiu respostas tardias por CAS sem trocar a seleção;
   reidratou autoria tipada; ligou as fontes legadas ao provider; restringiu o
   fallback histórico; e impôs um terminal semântico por tentativa. O check final em
   `b5a2d9a` não encontrou novo Critical/Important. Este commit acrescenta os guias
   `docs/frontend/etapa-2-v2-operacao.md` e `etapa-2-v2-aceitacao.md`, atualiza mapa,
   arquitetura e plano com a evidência final e registra o handoff sem iniciar a
   Etapa 3.

4. **O que isso invalida.** Fica invalidada qualquer leitura de que a aprovação dos
   gates de `53e74f1` equivale a aceite integral do SHA final. O estado é
   **CONDITIONAL**: o Ruff literal `servidor tests` segue vermelho com 296 violações
   legadas, auth real ficou skipped sem credenciais e a regressão global não foi
   repetida em `b5a2d9a`. Antes de merge ainda são obrigatórios CI da revisão
   publicada e aprovação do Gabriel. Não muda números, regras do motor ou contexto de
   negócio; não autoriza push, PR, merge, Linear ou Etapa 3.

## 2026-09-19 — Percurso completo e regressão da Etapa 2 (MOT-32)

1. **Sintoma.** Os serviços de estudos, execução, comparação e persistência
   existiam isoladamente, mas não havia um percurso real de navegador que os ligasse
   nem regressão para reload, concorrência, migração e falhas de IndexedDB.
2. **Causa.** As Tasks 1–10 fecharam contratos e componentes em unidades menores; a
   integração final, o SHA real do bundle E2E e as fronteiras de rede/segredo foram
   reservados para a aceitação global.
3. **O que foi feito.** A MOT-32 ligou o editor ao serviço de execução e ao resultado,
   normalizou instantes equivalentes devolvidos pelo contrato HTTP e adicionou três
   percursos Playwright. Chromium agora prova observado, sintético/manual, duas
   abas/contas, fixtures legadas, interrupção, quota injetada, `blocked`, corrupção
   e zoom 200%. O scanner passou a detectar token em query string e o servidor
   estático aceita as rotas profundas de estudos.
4. **O que isso invalida.** A conclusão de que os componentes isolados bastavam como
   evidência da Etapa 2. Não muda números do motor, contratos públicos ou premissas
   de negócio. A falha física de disco e autenticação externa real continuam
   condicionadas ao ambiente; a quota local é uma injeção explícita.

## 2026-09-19 — Gate documental e rastreabilidade da Etapa 2 v2 (MOT-62)

1. **Sintoma.** O planejamento v2 já descrevia as novas fronteiras, mas ainda não
   tinha IDs executáveis, o escopo legado de MOT-23–MOT-33 divergia das Tasks 0–12 e
   os commits `50fc384` e `1270458` não possuíam uma decisão explícita de
   reaproveitamento. Iniciar a implementação nesse estado permitiria misturar código
   antigo, contratos gerados e responsabilidades diferentes na mesma issue.

2. **Causa.** A Etapa 2 anterior foi planejada antes de Caso Observado,
   `ApplicationRepository`, três origens e conciliação Observado × Motor entrarem na
   arquitetura. A documentação v2 preservou a complexidade, mas deixou a atualização
   do Linear e a auditoria como gate sujeito à aprovação do Gabriel.

3. **O que foi feito.** Após aprovação explícita, foram criadas MOT-62 (gate), MOT-63
   (Caso Observado/proveniência) e MOT-64 (resolução de origens/request). MOT-23–MOT-33
   receberam títulos, escopos e critérios v2; MOT-29 ficou restrita à execução e ao
   histórico, e MOT-64 recebeu a responsabilidade que antes estava misturada nela.
   As dependências críticas foram registradas no Linear. O plano técnico ganhou o
   mapa T0–T12 → issues e a matriz dos dois commits: validações, canonicalização,
   fingerprints, testes e referências de CAS podem ser reutilizados ou adaptados;
   OpenAPI, TypeScript, schemas, validators e lockfile devem ser regenerados; endpoints
   501, fronteiras antigas e documentação superada devem ser descartados ou
   substituídos. O plano também fixa o executor por task: Sol é o padrão para trabalho
   complexo, Terra implementa sobre contratos fechados, Astra fica concentrado na
   aceitação integrada T12 e Luna só pode assumir subtarefas mecânicas delimitadas.
   A branch `codex/mot62-planejamento-etapa2-v2` contém somente docs.

4. **O que isso invalida.** Os títulos, descrições e relações anteriores de
   MOT-23–MOT-33 não representam mais a execução da Etapa 2. Os commits `50fc384` e
   `1270458` não são bases de cherry-pick integral. A evidência histórica de 680
   testes Python, 135 testes web, typecheck, build e lint verdes não foi reexecutada
   neste gate e não substitui o baseline obrigatório da futura worktree de
   implementação. Nada em `motor/`, na API ou no front-end foi alterado; merge e
   início da implementação continuam dependentes da base integrada ou de aprovação
   explícita alternativa.

## 2026-09-19 — Planejamento v2 do front-end com dados observados

1. **Sintoma.** A especificação geral tratava dados observados como evolução futura,
   enquanto o importador em preparação mantinha domínio e armazenamento próprios e
   seguia diretamente até a execução. Os arquivos reais mostraram a necessidade de
   casos por janela, perfis de empresa, proveniência e conciliação Observado × Motor,
   sem retirar diagnóstico, comparação, Replay, chat ou relatório do plano original.

2. **Causa.** A arquitetura do front-end e a Etapa 2 foram definidas antes de os
   formatos e o fluxo das operações reais serem compreendidos. O plano canônico de
   XLSX resolveu parsing e segurança, mas não possuía a fronteira posterior entre
   importação, Caso Observado, Estudo e Execução.

3. **O que foi feito.** Foram criadas especificações e planos v2 para o produto
   completo, a Etapa 2 e a importação de dados reais em
   `docs/superpowers/{specs,plans}/2026-09-19-*`. A hierarquia vigente passa a ser
   Empresa → Caso Observado → Perfil → Estudo → Cenário → Execução. Importador e
   estudo compartilham `ApplicationRepository`; o importador termina em Caso
   Observado confirmado; snapshots preservam entradas; Observado × Motor permanece
   separado da comparação de cenários; Replay continua uma entrega central da Etapa
   5. Os documentos anteriores receberam avisos históricos, e os documentos de XLSX
   de 2026-09-17 foram mantidos como anexos técnicos para parsing, auditoria,
   segurança e desempenho. `docs/MAPA.md` passou a apontar para as fontes vigentes.

4. **O que isso invalida.** As especificações gerais de 2026-09-11, o desenho e o
   plano da Etapa 2 de 2026-09-13 e a sequência executável do importador de 2026-09-17
   não devem mais orientar implementação isoladamente. Os dois commits existentes da
   Etapa 2 precisam da auditoria prevista no plano v2 antes de integração. Nada no
   motor, nos resultados canônicos, nas medições ou na grade histórica foi alterado;
   nenhuma funcionalidade foi implementada e a grade não foi regenerada.

## 2026-09-16 — Gate final do autonetting preferencial (MOT-46)

1. **Sintoma.** Código, contrato, front-end e amostra já estavam implementados, mas
   faltava um gate único que comprovasse a árvore completa, os artefatos gerados e
   a concordância entre motor, JSON e apresentação.

2. **Causa.** As verificações anteriores eram focadas por tarefa. A regeneração da
   grade também não poderia ser usada como atalho, pois continua condicionada à
   aprovação explícita do Gabriel.

3. **O que foi feito.** Sobre a base
   `a655d9d9fc166507e084b71bce98f2b601fb5d79`, as execuções normal e `python -O`
   aprovaram 670 testes e ignoraram 2; o front aprovou 89 testes unitários, build,
   lint e 3 testes e2e. Os geradores oficiais foram rodados duas vezes sem diff. No
   schema 2.0.0, ledger e JSON reconciliaram os mecanismos intracliente /
   intercliente / remetido em Amanda (`0 / 54.000.000 / 37.800.000`), no caso A
   OUT 100/A IN 70/B IN 50 (`140 / 60 / 20`) e no caso que força preferência sobre
   deadline externo (`200 / 0 / 100`). A UI real percorreu Amanda; regressões de
   apresentação garantem consumo direto dos campos canônicos nos demais valores.
   Ao abrir o PR #36, a CI aprovou 672 testes nos dois modos e Ruff, mas revelou
   que o Mypy não estreitava o tipo da origem validada por pertinência a conjunto;
   a validação passou a explicitar `str`, sem mudar o comportamento publicado. A
   correção passou no Mypy, no Ruff e no novo gate protegido; o PR #36 foi mergeado
   na `main` no commit `78d4a59cc6ec61790f723e4781ef29a0703c06db`.

4. **O que isso invalida.** Nada além da anotação de que a verificação estava
   pendente. A branch foi publicada no PR #36 após o push direto à `main` ser
   corretamente recusado pela proteção. Não houve regeneração das 27.000 rodadas;
   a MOT-47 continua bloqueada até nova aprovação explícita.

## 2026-09-16 — Amostra pareada do autonetting (MOT-45)

1. **Sintoma.** O comportamento estava testado, mas ainda não havia uma medição
   pareada do impacto econômico nem estimativa atual do custo de regeneração.

2. **Causa.** A grade histórica usa EDF global e não separa os mecanismos novos;
   sobrescrevê-la antes de uma fumaça contrariaria o gate aprovado.

3. **O que foi feito.** Duas seeds do mix equilibrado em W=1/7 foram executadas com
   as mesmas ordens nas duas políticas. Todas as identidades fecharam; autonetting
   ficou entre 10,74% e 13,20%. A preferência reduziu a netabilidade total entre
   0,094 e 0,999 p.p., enquanto a economia caiu em duas células e subiu em duas por
   causa do mix de IOF remetido. Uma fumaça de 180 rodadas projetou ~28 minutos de
   motor para a grade neste ambiente. Scripts derivados deixaram de declarar o
   contrato antigo de posição líquida. O cenário Amanda permaneceu em 58,82%.

4. **O que isso invalida.** A suposição de que dar prioridade ao autonetting sempre
   preservaria a netabilidade ou moveria a economia no mesmo sentido. A amostra não
   substitui a grade e não autoriza a MOT-47.

## 2026-09-16 — Fonte de verdade do autonetting preferencial (MOT-44)

1. **Sintoma.** Documentos normativos ainda diziam que cada ordem era posição
   líquida e que EDF global governava a seleção, embora o motor já priorizasse a
   contraparte do próprio cliente.

2. **Causa.** A decisão nova tinha sido propagada pelo código em etapas, mas AGENTS,
   MAPA, ADRs, planos de front-end e relatórios históricos ainda misturavam as duas
   semânticas.

3. **O que foi feito.** O ADR de autonetting registra as duas fases, alternativas
   rejeitadas e consequências. AGENTS, arquitetura, MAPA, ADR de EDF, Model B e
   planos dependentes foram alinhados ao schema 2.0.0. A especificação e o plano
   aprovados entraram na branch. Relatórios e CSVs antigos foram preservados, mas
   marcados como legado da política EDF global.

4. **O que isso invalida.** O contrato de “posição líquida já enviada à pool”, a
   prioridade EDF global pura, os diagnósticos incrementais como conclusão vigente e
   as 27.000 simulações antigas como representação da política nova. A regeneração
   integral continua proibida até amostra e aprovação explícita do Gabriel.

## 2026-09-16 — Entrada sem pré-netting silencioso (MOT-43)

1. **Sintoma.** O adaptador já preservava operações, mas o contrato público e a
   arquitetura não proibiam explicitamente que um importador futuro eliminasse as
   pontas opostas do mesmo cliente antes da P0.

2. **Causa.** A semântica da lista `ordens` não estava descrita no schema, e não
   havia regressão que atravessasse DTO e adaptador com OUT e IN do mesmo cliente.

3. **O que foi feito.** O schema agora define `ordens` como operações explícitas
   que não devem ser pré-netadas. Um teste comprova que as duas pontas permanecem
   duas `Ordem` distintas. Os documentos de arquitetura fixam a fronteira do
   importador e a chave mínima de agregação compatível. OpenAPI e tipos gerados
   foram atualizados; os 42 testes de contratos/adaptador e o typecheck passaram.

4. **O que isso invalida.** Importadores que entreguem apenas o saldo OUT–IN de um
   cliente ou consolidem linhas com prazo, finalidade ou classificação diferentes.
   O importador documental completo continua fora desta entrega.

## 2026-09-16 — Composição do netting na prévia (MOT-42)

1. **Sintoma.** A API já publicava autonetting, netting multilateral e remessa,
   mas a prévia mostrava somente o volume casado e a taxa total.

2. **Causa.** `ComparisonSummary` ainda consumia apenas os três indicadores do
   contrato anterior e não apresentava a lista de mecanismos do schema 2.0.0.

3. **O que foi feito.** A prévia agora mostra os três destinos com volume recebido
   da API, as taxas intracliente e multilateral e a atribuição contábil de custo e
   economia. Testes usam valores não deriváveis para impedir reconstrução por
   subtração no navegador. Os 89 testes unitários, o build, o lint e os três fluxos
   e2e passaram. A tela foi inspecionada em 1280×800, 1440×900 e 200%; uma quebra
   de valores longos encontrada no zoom foi corrigida.

4. **O que isso invalida.** Capturas e expectativas do front-end que tratem o
   volume compensado como uma parcela indivisível. Nenhum valor é recalculado no
   navegador e os avisos de dados sintéticos e custos não calibrados permanecem.

## 2026-09-16 — Contrato público do autonetting (MOT-41)

1. **Sintoma.** O motor e o CSV já distinguiam autonetting de netting
   multilateral, mas a API continuava expondo o schema 1.0.0 sem origem nas
   alocações nem métricas e custos por mecanismo.

2. **Causa.** DTOs, portão de publicação, identidade, OpenAPI, fixture de
   referência e tipos TypeScript ainda refletiam o resultado anterior à nova
   política.

3. **O que foi feito.** O resultado público passou ao schema 2.0.0. Alocações
   casadas carregam origem obrigatória; execução e agregado expõem volumes e taxas
   intracliente/multilaterais; e o agregado publica os três destinos contábeis com
   custos reconciliados. O portão valida essas identidades no objeto e no JSON.
   OpenAPI, fixture e clientes gerados foram atualizados por seus geradores
   oficiais, com hashes idênticos numa segunda geração. Os 48 testes da fronteira
   HTTP passaram.

4. **O que isso invalida.** Consumidores do resultado 1.0.0 precisam migrar para o
   schema 2.0.0; a versão do envelope HTTP permanece 1.0.0. A fixture pública foi
   recalculada, mas a grade histórica completa não foi regenerada.

## 2026-09-16 — CSV e CLI com mecanismos observados (MOT-40)

1. **Sintoma.** A varredura e a CLI ainda publicavam o limite anual intracliente e
   a métrica incremental da interpretação antiga, embora o motor já medisse a
   origem de cada casamento em seu fechamento real.

2. **Causa.** `montar_ponto` recalculava uma aproximação por cliente, ignorando a
   sobreposição temporal, em vez de consumir as métricas de `simular`.

3. **O que foi feito.** Pontos, resumos, CSV completo, script oficial e CLI agora
   expõem autonetting e netting multilateral observados. Um caso em que OUT e IN do
   mesmo cliente não coexistem comprova autonetting zero. As taxas preservam tanto
   a razão total quanto a soma exata das parcelas sob precisão Decimal finita. Os
   76 testes focados passaram; na suíte integral, 652 passaram e as 15 falhas
   restantes estão restritas ao DTO/API ainda em schema 1.0.0.

4. **O que isso invalida.** Leitores dependentes das três colunas incrementais
   antigas precisam tratar esses CSVs como schema legado. A grade histórica não foi
   sobrescrita nem regenerada.

## 2026-09-16 — Ledger e custos por mecanismo (MOT-39)

1. **Sintoma.** Os volumes agregados já distinguiam autonetting e multilateral,
   mas eventos, resumos por cliente e custos ainda perdiam essa origem.

2. **Causa.** O ledger copiava apenas `CASADO`/`REMETIDO`, e o resultado agregado
   não possuía uma classificação contábil dos custos rateados existentes.

3. **O que foi feito.** Eventos casados agora exigem `OrigemCasamento`; resumos
   diários e por cliente separam os dois mecanismos. O agregado publica, em ordem
   canônica, `INTRA_CLIENTE`, `INTER_CLIENTE` e `REMETIDO`, com volume, baseline
   atribuído, custo netado e economia reconciliados. O modo agregado constrói apenas
   o ledger necessário, sem materializar resumos por cliente. Nenhuma fórmula de
   IOF, carry, spread, espera ou custo fixo mudou. Os 174 testes relacionados
   passaram.

4. **O que isso invalida.** Consumidores do resultado canônico precisam aceitar a
   lista obrigatória de mecanismos e os novos campos do ledger/cliente. Tratar a
   decomposição como contrafactual causal continua incorreto: ela é atribuição
   contábil do rateio técnico existente.

## 2026-09-16 — Métricas observadas por mecanismo (MOT-38)

1. **Sintoma.** A execução sabia quais alocações eram intracliente ou multilaterais,
   mas o resultado publicava apenas a netabilidade total e mantinha diagnósticos da
   interpretação antiga como se fossem aproximações úteis.

2. **Causa.** A origem ainda não era agregada em `Resultado` nem no recorte temporal
   do resultado canônico.

3. **O que foi feito.** `Resultado` e `AgregadoCanonico` agora publicam volumes e
   taxas observados de autonetting e netting multilateral. O recorte temporal soma
   somente alocações das ordens medidas, e o domínio analítico rejeita decomposições
   que não reconciliem exatamente. Os três diagnósticos incrementais antigos foram
   removidos do modelo novo. Os 70 testes focados passaram.

4. **O que isso invalida.** `limite_intra_cliente_brl`,
   `volume_casado_incremental_brl` e `taxa_netabilidade_incremental` não pertencem
   ao resultado canônico vigente. DTOs, CSVs e fixtures antigas ainda precisam da
   migração versionada prevista nas próximas tarefas antes da suíte integral voltar
   a ficar verde.

## 2026-09-16 — Aceitação comportamental do autonetting (MOT-37)

1. **Sintoma.** A política em duas fases possuía regressões discriminantes, mas os
   três exemplos centrais ainda não fixavam o resultado completo nem sua passagem
   pelo orquestrador de simulação.

2. **Causa.** A MOT-36 concentrou-se na implementação mínima da seleção e nos
   invariantes já existentes.

3. **O que foi feito.** Os cenários de preferência sobre EDF global, autonetting
   parcial e ausência de sobreposição temporal agora conferem IDs, valores, dias,
   origens, remessas e conservação por ordem. Um teste de integração confirma que
   `simular` preserva a decomposição executada. O oráculo diferencial independente
   também passou a reproduzir explicitamente as duas fases e concorda nas carteiras
   densas e esparsas. Os testes relacionados passaram.

4. **O que isso invalida.** Nada além de expectativas que tratem a preferência
   intracliente como opcional; não altera novamente o algoritmo nem os custos.

## 2026-09-16 — Autonetting preferencial na P0 (MOT-36)

1. **Sintoma.** O EDF global podia usar a entrada de um cliente para cobrir outro
   participante mesmo quando o primeiro cliente possuía OUT e IN simultaneamente
   abertos no mesmo fechamento.

2. **Causa.** `cliente_id` não participava do algoritmo: toda ordem aberta entrava
   diretamente numa única fila por direção.

3. **O que foi feito.** Cada fechamento P0 agora executa duas fases determinísticas:
   primeiro autonetting por cliente e depois netting multilateral apenas dos saldos.
   EDF com desempate por ID continua valendo dentro de cada cliente e na fase
   residual. Gatilhos, ausência de look-ahead, vencimentos e conservação foram
   preservados. A regressão cobre preferência sobre EDF global, parcialidade,
   sobreposição temporal e ordem de entrada; 33 testes relacionados passaram.

4. **O que isso invalida.** Resultados de simulações, digests e CSVs produzidos pela
   política anterior deixam de representar o comportamento vigente quando um mesmo
   cliente tem as duas pontas abertas. A grade histórica permanece como legado e
   não será regenerada sem aprovação explícita após a amostra planejada.

## 2026-09-16 — Origem auditável dos casamentos (MOT-35)

1. **Sintoma.** Uma alocação `CASADO` informava que o volume não atravessou a
   fronteira, mas não distinguia autonetting do mesmo cliente e netting multilateral.

2. **Causa.** O domínio só registrava `CASADO` ou `REMETIDO`, porque `cliente_id`
   ainda não participava da política de casamento.

3. **O que foi feito.** A branch `codex/autonetting-preferencial`, baseada em
   `origin/main` no commit `a655d9d`, adicionou `OrigemCasamento` e tornou a origem
   obrigatória para alocações casadas e proibida para remessas. Enquanto a política
   em duas fases não entra na MOT-36, o algoritmo vigente rotula seus casamentos
   como `INTER_CLIENTE`. A regressão direta passou junto com 151 testes consumidores.

4. **O que isso invalida.** Ainda não altera números nem prioridade de execução.
   Consumidores que construíam manualmente uma alocação `CASADO` precisam informar
   sua origem; a serialização pública só será versionada na etapa própria.

## 2026-09-13 — Aceitação e CI da etapa 1 (MOT-22)

1. **Sintoma.** A integração navegador–motor já estava na `main`, mas a CI ainda
   executava apenas a suíte Python e não demonstrava todos os gates de aceitação,
   empacotamento, geração, navegador e autenticação previstos para encerrar a etapa 1.

2. **Causa.** A MOT-21 entregou deliberadamente o cliente e o percurso funcional.
   A matriz consolidada, o endurecimento da CI, as evidências visuais e o handoff
   pertencem à T7/MOT-22.

3. **O que foi feito.** A branch `codex/mot22-aceitacao-ci` foi criada em worktree
   isolado a partir da `origin/main` `2953a2b`, que contém o merge do PR #33. A CI
   passou a cobrir Python 3.11/Node 24, geração sem diff, suíte normal/otimizada,
   Ruff, mypy, wheel instalada, todos os gates web, scanner de credenciais,
   Chromium same-origin e medição da referência. O Playwright separa autenticação
   controlada de autenticação real opt-in e registra capturas de login, Carteira,
   Diagnóstico, sessão expirada, dois desktops e zoom de 200%. A matriz ganhou
   casos explícitos de identidade temporal, JWT sem assinatura e conservação do
   documento público. O handoff documenta contratos, rotas, limites e pendências da
   etapa 2. A sessão Supabase real existente repetiu o percurso até o motor sem
   inserir ou registrar credenciais. O commit `a7ca867` foi publicado no PR #34 e
   seu primeiro workflow `acceptance` passou em 1m52s; o merge continua dependendo
   de autorização final. Quando a autorização foi concedida, o merge normal revelou
   que a proteção da `main` ainda exigia o nome histórico de check `pytest`, enquanto
   o workflow novo publicava `acceptance`. Um teste de regressão passou a fixar esse
   contrato e o identificador do job foi restaurado sem remover nenhum gate.

4. **O que isso invalida.** Invalida registros que apresentavam o PR #33 como
   aberto, a MOT-21 em execução, a MOT-22 bloqueada ou a CI como apenas Python. Não
   altera contratos financeiros, regras do motor, calibração ou resultados
   numéricos. A medição de 11,2 ms/7.152 bytes vale somente para cinco execuções do
   exemplo no ambiente anotado e não substitui benchmark de carteiras futuras.

## 2026-09-13 — Cliente tipado e percurso navegador–motor (MOT-21)

1. **Sintoma.** A sessão e a API estavam integradas, mas o botão do exemplo ainda
   não chamava o servidor e o Diagnóstico não recebia um envelope validado do motor.

2. **Causa.** A T5 encerrou deliberadamente no login e no rascunho por conta. O
   cliente HTTP, a política de repetição, a identidade da execução e o estado da
   prévia pertencem à T6.

3. **O que foi feito.** A branch `codex/mot21-client-integracao`, baseada em
   `835c7ca`, adiciona cliente tipado com Bearer obtido por chamada, timeout e
   `ApiError` sanitizado; valida GET, entrada e envelope em runtime; cria um
   `QueryClient` por usuário e nunca repete mutações. O fluxo bloqueia duplicatas,
   rejeita respostas de outra conta, estudo, cenário, revisão ou request e preserva
   o envelope aceito como snapshot imutável. Carteira executa o GET e o POST reais;
   Diagnóstico apresenta apenas os números canônicos, a origem sintética e o aviso
   de não calibração. Um build E2E controlado percorre navegador → FastAPI →
   adaptador → motor sem mock de resposta nem credencial pessoal. No gate manual, o
   build de produção autenticou pelo Supabase real e reproduziu R$ 1.026.000,00,
   58,82%, `PREVIA`, fingerprint e aviso de não calibração; o nome do estudo foi
   preservado após uma falha inicial de conectividade do JWKS.

4. **O que isso invalida.** Invalida o botão sem ação e os estados vazios de
   Carteira/Diagnóstico como representação da T6. Não altera `motor/`, regras de
   cálculo, contratos financeiros, calibração ou persistência da etapa 2. A
   evidência real de login/POST da MOT-20 continua válida e agora foi complementada
   pelo gate manual da nova tela com uma sessão Supabase real.

## 2026-09-13 — Sessão Supabase e rascunho isolado (MOT-20)

1. **Sintoma.** O shell integrado ainda exibia um formulário desabilitado, não
   resolvia sessão e não preservava sequer o nome do estudo durante expiração ou
   troca de conta.

2. **Causa.** A MOT-19 entregou deliberadamente apenas a estrutura visual; cliente
   Supabase, callback controlado, senha inicial e recuperação local pertencem à T5.

3. **O que foi feito.** A branch `codex/mot20-auth`, baseada em `64bf303`, adiciona
   cliente Supabase singleton, provider com cinco estados, login/logout/refresh,
   callback `token_hash` idempotente sob StrictMode, definição de senha com mínimo de
   12 caracteres e rascunho mínimo por `owner_sub`. Falhas de storage preservam a
   edição em memória; JSON inválido não é apagado. A configuração pública real fica
   em arquivo local ignorado. O JWKS ES256 e os erros de login/callback foram
   confirmados contra o serviço real. Após configurar SMTP próprio exigido pelo plano
   Free atual, o convite real abriu o callback contratado, definiu a primeira senha e
   autenticou. O nome persistiu após recarga, logout e novo login. Com o UUID somente
   na allowlist local, a sessão, o exemplo privado e o POST `/api/v1/previas` reais
   passaram; a resposta reproduziu `1026000.000000` e o SHA empacotado `a55df777`.

4. **O que isso invalida.** Invalida os placeholders públicos da T4 e a indicação de
   que o Supabase ainda não havia sido provisionado. Não altera `motor/`, contratos
   financeiros, números de aceitação ou a API da MOT-18.

## 2026-09-13 — Shell acessível atualizado sobre a API da etapa 1 (MOT-19)

1. **Sintoma.** O PR #29 continha o shell e os componentes acessíveis, mas havia sido
   aberto antes das MOT-17 e MOT-18 e passou a conflitar com a `main`, inclusive na
   configuração do Vite.

2. **Causa.** T3 e T4 avançaram em paralelo a partir da fundação comum. Ambas
   precisavam acrescentar `web/vite.config.ts`: T3 para o proxy da API e T4 para
   React e a preparação do Vitest.

3. **O que foi feito.** A branch `feat/mot19-shell-acessivel` incorporou a `main` no
   commit `d6d488e`. A resolução preserva `plugins: [react()]`, o setup do Vitest e
   o proxy relativo `/api` para `127.0.0.1:8000`. O smoke do build real detectou que
   o cache da T3 não reconhecia nomes Vite como `index-B6xOV8Ew.js`; a configuração
   agora gera o manifesto Vite, e o FastAPI concede cache imutável somente aos assets
   declarados nele, sem confundir nomes descritivos. A documentação da T4 foi
   combinada com os registros de T2/T3. Passaram 632 testes Python normais e
   sob `-O`, 31 testes Vitest, typecheck, ESLint, build e o smoke das cinco rotas pelo
   FastAPI. Nenhum arquivo em `motor/` foi alterado pela T4.

4. **O que isso invalida.** Invalida o estado anterior do PR #29 como conflitante e
   a configuração Vite que continha apenas React/Vitest e a heurística de cache que
   não distinguia com segurança bundles Vite de nomes descritivos. Não altera contratos,
   autenticação, resultados ou números do motor.

## 2026-09-12 — Shell acessível da etapa 1 do front-end (MOT-19)

1. **Sintoma.** A MOT-16 entregava tipos gerados, validação, formatadores e
   repositório local, mas o diretório `web/` ainda não tinha uma aplicação React
   inicializável, rotas, navegação, estados vazios ou componentes acessíveis para
   consumir esses contratos.

2. **Causa.** O plano separou deliberadamente a fundação de contratos (T1) da
   composição visual e da navegação (T4), para que o browser não reinventasse DTOs,
   validações ou cálculos antes de existir o adaptador do motor.

3. **O que foi feito.** Na branch `feat/mot19-shell-acessivel`, baseada em
   `main` no commit `e2eef65`, foi completado o bootstrap Vite/React/TypeScript em
   `web/`, com `AppShell`, tokens, CSS desktop, rotas públicas e os cinco destinos
   analíticos vazios. Foram criados Button, TextField, InlineNotice, EmptyState,
   DefinitionTooltip, ComparisonSummary e CostTable. Os componentes de comparação e
   custo aceitam somente `PreviewEnvelope` e usam os formatadores da MOT-16, sem
   cálculo de economia. Testes Vitest cobrem navegação, rota ativa, labels, erro,
   foco, teclado no tooltip e mensagens de execução. A inspeção visual e de zoom,
   incluindo contrastes dos tokens, está documentada em
   `docs/frontend/etapa-1-operacao.md` com quatro capturas locais. Não houve alteração
   em `motor/`, autenticação real, chamadas HTTP, adaptador, IndexedDB, gráficos ou
   replay funcional.

4. **O que isso invalida.** Invalida a afirmação de que a etapa 1 não possui shell
   navegável ou base visual acessível. Não invalida qualquer número, cenário,
   varredura, contrato canônico ou resultado do motor; autenticação e execução real
   continuam fora desta entrega.

## 2026-09-12 — API autenticada e mesma origem da etapa 1 (MOT-18)

1. **Sintoma.** O adaptador real já produzia um resultado publicável, mas não havia
   fronteira HTTP autenticada, limite de capacidade ou distribuição segura do build
   React na mesma origem.

2. **Causa.** Faltavam configuração validada, verificação local dos access tokens
   Supabase, política de cache/rotação JWKS, rotas FastAPI, envelope uniforme de
   erros, limites de transporte e fallback explícito das rotas da SPA.

3. **O que foi feito.** Na branch `codex/mot18-api`, `servidor.app:create_app`
   expõe health público e protege sessão, exemplo e prévia. O verificador aceita
   somente ES256, issuer e audience exatos, claims temporais válidos, role
   `authenticated`, UUID autorizado e usuário não anônimo; JWKS usa cache de cinco
   minutos, timeout de cinco segundos e trava na rotação. A API limita corpo a
   1 MiB, resposta a 8 MiB e execução a uma prévia, fora do event loop. Estáticos só
   servem assets e rotas conhecidas contidas em `WEB_DIST_DIR`; o Vite encaminha
   `/api` para o servidor local. Passaram 627 testes normais e sob `-O`, Ruff, mypy do servidor,
   15 testes Vitest, typecheck, wheel instalada e regeneração determinística dos
   contratos. Nenhum arquivo em `motor/` mudou.

4. **O que isso invalida.** Invalida execução da prévia por uma rota sem sessão,
   fallback genérico de SPA, CORS curinga e operação com múltiplos workers nesta
   etapa. Não altera regras, resultados, varreduras ou números do motor. O projeto
   Supabase real continua pendente e será validado nos gates T5/T7.

## 2026-09-12 — Adaptador e portão de publicação da etapa 1 (MOT-17)

1. **Sintoma.** Os contratos HTTP existiam, mas nenhuma fronteira executava a prévia
   pelo motor nem impedia a publicação de um resultado corrompido, parcial ou com
   identidade divergente.

2. **Causa.** Faltavam a tradução única de DTOs para o domínio, o uso controlado da
   API pública `motor.analise`, a validação independente das alocações e uma fixture
   de resposta produzida pela execução real.

3. **O que foi feito.** Na branch `codex/mot17-adaptador`, entregue pelo PR #30,
   `motor_adapter.py`
   constrói `ParametrosCusto`, `Ordem` e `Cenario`, executa uma análise `AGREGADO`,
   preserva os modos `LEGADO`/`NATURAL` e monta o envelope apenas depois do portão.
   `publication.py` valida decimais, referências, dias, conservação exata no objeto
   e no JSON, coorte medida, taxa e identidade reconstruída do manifesto. A fixture
   `contracts/fixtures/reference-result.json` é reproduzível por
   `python -m servidor.generate_reference_result`. Passaram 575 testes normais, 575
   sob `-O`, Ruff e mypy isolado de `servidor`; nenhum arquivo em `motor/` mudou. O
   gerador lê a versão do `pyproject.toml`, mantendo a fixture idêntica mesmo quando
   o checkout do CI ainda não está instalado como distribuição.

4. **O que isso invalida.** Invalida fixtures de resposta inventadas manualmente e
   qualquer integração que publique diretamente o retorno analítico sem o portão.
   Não altera resultados, regras, varreduras ou números de aceitação do motor.

---

## 2026-09-12 — Contratos, identidade e apresentação da etapa 1 (MOT-16)

1. **Sintoma.** A base integrada expunha o resultado canônico do motor, mas ainda não
   havia contrato HTTP estrito, identidade completa da execução, schema consumível
   pelo navegador, formatação decimal acordada ou isolamento do estudo local. Sem
   essa fronteira, as tarefas de adaptador, API e interface poderiam divergir sobre
   precisão, campos e autoria.

2. **Causa.** O repositório era apenas o pacote Python do motor. FastAPI/Pydantic,
   ferramentas de contrato, projeto TypeScript e seus locks ainda não existiam, e o
   hash público do manifesto não tinha o significado mais amplo exigido para uma
   requisição de prévia.

3. **O que foi feito.** Na branch `codex/mot16-contratos`, integrada na `main` pelo
   PR #27 (`d2a261b`), foram criados
   DTOs Pydantic estritos de entrada, saída e envelope, fingerprints separados de
   execução/proveniência, fixture derivada do YAML, factory de schema fechada,
   OpenAPI e tipos/Ajv gerados, formatadores `decimal.js` HALF_UP/pt-BR e repositório
   em memória validado por `owner_sub`. `requirements/web-dev.lock` foi gerado e
   instalado com Python 3.11.16; `web/package-lock.json` foi instalado com Node
   24.19.0/npm 11.17.0. A wheel inclui `servidor*` e os YAMLs e foi testada fora do
   checkout. O workflow Python passou a instalar esse lock, substituindo a lista
   antiga que não continha Pydantic nem HTTPX. Passaram 558 testes Python normais,
   558 sob `-O`, Ruff, mypy, 14 testes Vitest e o typecheck; a segunda geração dos
   cinco artefatos manteve os mesmos hashes. Nenhum arquivo de implementação em
   `motor/` foi alterado.

4. **O que isso invalida.** Invalida qualquer DTO ou tipo de front-end anterior que
   represente dinheiro como JSON number, aceite seed em ordens explícitas, use o hash
   do manifesto como fingerprint completo ou compartilhe estudos sem `owner_sub`.
   Não invalida resultados, varreduras ou números de aceitação do motor; adaptador,
   autenticação e interface continuam fora deste commit.

## 2026-09-12 — Base integrada para a etapa 1 do front-end (MOT-15)

1. **Sintoma.** A documentação do front-end estava em
   `analise/sensibilidade-custo`, enquanto os contratos canônicos necessários estavam
   nos 15 commits de `implementacao/fechamento-funcional-motor`; nenhuma das duas
   linhas isoladas era uma base suficiente para iniciar a etapa 1.

2. **Causa.** As branches divergiram no commit comum `2fc62a2`: a primeira recebeu
   especificação, ambiente e planejamento, e a segunda recebeu o fechamento
   funcional do motor.

3. **O que foi feito.** A pilha de varredura foi integrada pelos PRs #21–#23, a
   sensibilidade pelo PR #24, a documentação e o planejamento pelo PR #25 e o
   fechamento funcional pelo PR #26. A base publicada resultante é `1aecc57` em
   `main`. O trabalho não commitado da worktree original de fechamento não foi
   incorporado. Foram confirmados os exports públicos
   `analisar`, `criar_manifesto`, `ConfiguracaoAnalise`, `ConfiguracaoTemporal` e
   `resultado_para_json`. A base passou 504 testes em Python 3.11 e no CI; na
   validação inicial também passaram 504 testes sob `-O` e o cenário Amanda, com baseline aproximado de
   US$ 439 mil, custo netado aproximado de US$ 249 mil, economia aproximada de
   US$ 190 mil e netabilidade de 58,82%.

4. **O que isso invalida.** Invalida o bloqueio por ausência de uma base Git que
   reúna planejamento e contratos públicos, permitindo iniciar T1. Não invalida
   resultados, premissas ou regras do motor. O projeto Supabase ainda não existe e
   continua sendo gate externo de T5/T7.

---

## 2026-09-12 — Planejamento técnico da etapa 1 e rastreabilidade no Linear (MOT-15)

1. **Sintoma.** A etapa 1 do front-end tinha design, plano geral e workflow
   aprovados, mas ainda não possuía um plano técnico executável, registro operacional
   nem tarefas rastreáveis com dependências no Linear.

2. **Causa.** O início dependia de decompor a fundação em entregas verificáveis e de
   escolher conscientemente uma base que reunisse a pilha analítica com os contratos
   públicos do fechamento funcional.

3. **O que foi feito.** Foram criados
   `docs/superpowers/plans/2026-09-11-frontend-etapa-1-plano-tecnico.md` e
   `docs/frontend/etapa-1-operacao.md`. O plano divide a etapa em T0–T7, fixa
   contratos, testes, falhas, gates e fronteiras. No Linear, as tarefas foram
   cadastradas como MOT-15–MOT-22 no time MOTOR DE FLUXO e ligadas pelo grafo
   aprovado. Gabriel escolheu aguardar a base integrada; MOT-15 ficou Em andamento
   enquanto essa base é preparada.

4. **O que isso invalida.** Invalida o registro anterior de que não havia issues da
   etapa 1 e a possibilidade de iniciar o front-end diretamente em
   `analise/sensibilidade-custo` ou no commit isolado `3bc2839`. Nada no motor, nos
   resultados ou nas premissas de negócio foi alterado.

---

## 2026-09-11 — Preparação do ambiente e workflow do front-end (MOT-20)

1. **Sintoma.** A especificação do front-end estava versionada, mas o plano geral
   permanecia com nome provisório e referência a uma cópia em `Downloads`. Também não
   havia um documento operacional que fixasse base Git, worktrees, ferramentas,
   modelos, segredos e critérios de passagem entre as seis etapas.

2. **Causa.** O desenho do produto e a distribuição de modelos foram aprovados antes
   da preparação organizacional do repositório. O checkout contém branches empilhadas
   e um fechamento funcional ainda sem PR, portanto iniciar a interface sem uma regra
   explícita de integração criaria risco de desenvolver contra contratos transitórios.

3. **O que foi feito.** Na branch `analise/sensibilidade-custo`, o plano geral foi
   renomeado para
   `docs/superpowers/plans/2026-09-11-frontend-plano-geral-execucao-modelos.md` e sua
   referência passou a apontar para a especificação versionada. Foi criado
   `docs/superpowers/plans/2026-09-11-frontend-ambiente-e-workflow.md`, com auditoria
   do ambiente, recomendação de base integrada, estratégia de worktrees, distribuição
   de modelos, configuração do Codex, política de segredos e checklists. O ambiente
   local `motor-de-fluxo` foi criado na interface do Codex e sua configuração gerada
   foi incluída em `.codex/environments/environment.toml`: ele prepara a `.venv` e
   expõe as ações **Testar motor** e **Executar exemplo amanda** em worktrees Windows.
   O `.gitignore` passou a proteger `.env` e variantes, preservando `.env.example`.
   Ficou decidido que npm será usado na Etapa 1 e que dependências novas só serão
   instaladas depois da aprovação do plano técnico dessa etapa. A ambientação não
   aguarda nem interfere no worktree de fechamento; cada sessão técnica futura deve
   confirmar sua própria branch e SHA antes de criar o worktree. Nenhum código de
   front-end, servidor ou motor foi alterado.

4. **O que isso invalida.** Nada no motor, nos resultados, nos testes ou na
   especificação aprovada. Invalida apenas o caminho provisório e a possibilidade de
   começar uma etapa silenciosamente sobre uma base não identificada: cada sessão
   técnica registra sua branch e seu SHA, sem transformar as integrações pendentes em
   bloqueio da ambientação.

---

## 2026-09-07 — Resumo executivo da sensibilidade para a Amanda

1. **Sintoma.** O relatório técnico já continha método, 14 CSVs e todos os
   resultados, mas não havia uma versão curta que separasse conclusão, condição de
   decisão, hipótese e dado ainda pendente.

2. **Causa.** As etapas anteriores privilegiaram rastreabilidade e reprodução. Uma
   leitura direta dos CSVs podia levar os valores sintéticos em BRL a serem tratados
   como previsão ou esconder a fragilidade específica da carteira outbound.

3. **O que foi feito.** Na branch `analise/sensibilidade-custo`, foi criado
   `docs/RESUMO-EXECUTIVO-AMANDA.md`. O documento apresenta a carteira de referência,
   três cenários, os dez resultados de mix/N, decisões sugeridas, premissas usadas,
   dados a substituir e afirmações que ainda não podem ser feitas. README, mapa,
   relatório técnico e AGENTS apontam para essa versão.

4. **O que isso invalida.** Nada nos cálculos anteriores. O novo resumo substitui
   apenas a necessidade de montar manualmente uma narrativa a partir dos CSVs. Os
   valores em reais continuam sendo hipóteses, não previsão comercial.

---

## 2026-09-07 — Projeção em BRL com fluxos hipotéticos

1. **Sintoma.** A sensibilidade terminava em bps porque não existe volume real da
   carteira candidata. Ainda assim, era necessário estimar a ordem de grandeza em
   reais sem apresentar números inventados como dados da Amanda ou das empresas.

2. **Causa.** Wise, Nomad, AstroPay e os rankings bancários divulgam métricas de
   escalas, períodos e geografias diferentes. Nenhuma dessas referências informa
   quanto fluxo líquido seria enviado ao orquestrador. Multiplicar o bps por um
   volume qualquer também distorceria a tarifa fixa quando a escala mudasse.

3. **O que foi feito.** Na branch `analise/sensibilidade-custo`, sem alteração em
   `motor/`, `scripts/projecao_fluxo_hipotetico.py` usa o volume sintético existente
   como faixa central e aplica 0,5× e 2,0×. A tarifa fixa em bps é corrigida em cada
   escala. Quatro CSVs registram fontes públicas, premissas por arquétipo, 144.000
   projeções detalhadas e 480 células agregadas. O relatório e o dicionário marcam
   cada fluxo como suposição substituível. Quatro testes novos elevam a suíte a 270.

4. **O que isso invalida.** Invalida somente a orientação anterior de não calcular
   nenhum valor em BRL antes do volume real. BRL agora pode ser apresentado como
   cenário exploratório, desde que o fluxo usado e sua natureza hipotética apareçam
   junto do número. Não transforma nenhuma faixa em previsão comercial ou dado da
   Amanda; a calibração por carteira continua pendente.

---

## 2026-09-07 — Cenários de estresse e limites da sensibilidade

1. **Sintoma.** A sensibilidade fornecia inclinações isoladas, mas ainda não dizia
   quanto da economia sobreviveria à retirada simultânea das premissas incertas nem
   em que ponto o carry faria o resultado chegar a zero.

2. **Causa.** Os parâmetros podiam ser reprecificados sem nova simulação, mas as
   combinações e os limites matemáticos ainda não haviam sido materializados por
   carteira e por célula.

3. **O que foi feito.** Na branch `analise/sensibilidade-custo`, sem alteração em
   `motor/`, `scripts/estresse_sensibilidade.py` reaproveita as 6.000 linhas já
   publicadas. Oito cenários geram 48.000 linhas e 160 células agregadas. Outros
   dois CSVs calculam o break-even de carry e o spread mínimo em cada carteira.
   Quatro testes novos cobrem a identidade da base, os efeitos combinados, o ponto
   zero e a fração de resultados positivos.

4. **O que isso invalida.** Nada nos CSVs ou relatórios anteriores. Acrescenta a
   ressalva de que a robustez é desigual: todos os resultados permanecem positivos
   no teste combinado severo, mas `outbound_extremo` chega a apenas 3,5 bps no p10
   de N=12/W=7. Os testes não substituem a calibração futura.

---

## 2026-09-07 — Sensibilidade de custo e contrato de entrada líquida

1. **Sintoma.** A decomposição de custo publicada cobria uma única carteira e a
   economia da varredura passou a ser descontada como "autonetting". Essa leitura
   contradizia o funcionamento informado pelo Gabriel: o orquestrador recebe somente
   a posição líquida que o cliente decidiu colocar na pool.

2. **Causa.** A semântica da entrada não estava escrita no repositório. Na ausência
   dela, `limite_intra_cliente_brl` foi interpretado como valor que o cliente faria
   sozinho, embora isso aplique uma segunda dedução de netting sobre uma entrada que
   já chega líquida. Ao mesmo tempo, spread, custo fixo e IOF estavam agregados de
   forma que não permitia reprecificar todas as células sem nova análise.

3. **O que foi feito.** Branch `analise/sensibilidade-custo`, sem alteração em
   `motor/`.
   - `scripts/sensibilidade_custo.py` reaproveita as 27.000 linhas para decompor
     IOF/spread/fixo/carry/espera e calcular inclinações de preço em todas as 90
     células.
   - Em N=8/12, 3.000 carteiras-base foram geradas uma vez e reutilizadas em W=1/7,
     produzindo 6.000 linhas e abrindo a exposição de IOF por finalidade/direção.
   - A reprecificação por bases é conferida exatamente contra `custo_netado`; as
     6.000 economias reproduzem o CSV original com diferença máxima inferior a
     0,005 bps (0,00 bps a duas casas), explicada pelo arredondamento monetário.
   - `tests/test_sensibilidade_custo.py` cobre reprecificação, ausência de valor sem
     contraparte, duas posições opostas, identidade da decomposição e percentuais.
   - `docs/RELATORIO-SENSIBILIDADE-CUSTO.md` registra método, resultados e fórmulas.

4. **O que isso invalida.**
   - Invalida a conclusão comercial de que a economia em bps precisa ser descontada
     novamente por `taxa_netabilidade_incremental`. Sob a entrada líquida, isso faria
     netting interno duas vezes. Em particular, o `outbound_extremo` volta a ser lido
     como cerca de 24 bps no modelo atual — baixo, mas não zero.
   - Não invalida nenhuma das 27.000 simulações: o CSV estava correto e foi
     reaproveitado. Invalida a interpretação de autonetting dos relatórios antigos.
   - A decomposição de um cenário só (85,75% IOF, 15,85% spread, 0,94% fixo,
     −2,54% carry) não pode ser generalizada. Em N=12/W=7, a grade mede IOF 72–89%,
     spread 11–21%, fixo 0,2–11,6% e carry −1,8% a −3,3% conforme o mix.
   - Os níveis ainda não são cotação: faltam spread/tarifa reais e confirmação das
     duas regras incertas de IOF.

---

## 2026-09-07 — Varredura completa, o mix que faltava, e uma revisão externa que corrigiu quatro afirmações (MOT-?)

> **ID do Linear pendente** nesta entrada e nos commits das branches citadas.

1. **Sintoma.** O motor media custo e tempo, mas nunca tinha sido rodado em grade sobre
   uma faixa de composições de carteira. Não havia resposta para "que mistura de
   clientes faz o netting valer a pena", que é a pergunta do projeto.

2. **Causa.** A varredura existia como código (`motor/varredura.py`) mas só tinha sido
   exercitada em grades pequenas de teste. E faltava um mix na ponta OUT-pesada: o mais
   extremo disponível, `retail_pesado`, realiza 28% de volume IN, enquanto o mercado
   brasileiro é estruturalmente mais OUT que isso.

3. **O que foi feito.** Três branches empilhadas, **nenhuma mergeada**:
   `gabriel/metrica-tempo` (PR #21) -> `gabriel/varredura-completa` (PR #22) ->
   `gabriel/mix-outbound` (PR #23).
   - Mix `outbound_extremo` em `motor/mixes.py`, realizando ~9,5% de volume IN.
   - Grade de 27.000 rodadas (5 mixes x 9 N x 2 W x 300 sementes pareadas, horizonte
     365), em `resultados/varredura_bruta.csv` e `varredura_agregada.csv`. Os CSVs
     entram com `git add -f` contra a regra `*.csv` do `.gitignore`, deliberadamente:
     são o dado que sustenta o relatório.
   - `docs/RELATORIO-VARREDURA.md` e `docs/RELATORIO-DECOMPOSICAO-CUSTO.md`, ambos
     autocontidos.
   - Correção em `pct_volume_espera_truncada`: contava a ordem inteira mesmo quando
     parte dela casou antes do horizonte; superestimava de 1,06x a 3,45x.
   - `netting.py`, `custo.py`, `arquetipos.py` e a tabela de alíquotas **intocados**.

4. **O que isso invalida.**
   - **A economia bruta não é o valor do produto.** Ela inclui autonetting. No
     `outbound_extremo` o netting incremental é **zero em 300 de 300 sementes** — o
     produto não rende 24 bps ali, rende zero. Em `retail_pesado`, 0,037 contra 0,535 de
     netabilidade bruta. Qualquer citação anterior de economia em bps como valor
     comercial está errada.
   - **Quatro afirmações do relatório foram corrigidas** depois de revisão externa
     (Codex): "9 em cada 10 meses" (cada semente é uma carteira-ANO); "o split
     direcional explica 82%" (81,9% é do fator `mix` inteiro; o split sozinho dá R2 de
     50,7%); "a janela é irrelevante" (vale no agregado — W=1 vence em 8 das 9 células
     do `corporativo_pesado`); "N=12 é o menor ponto previsível" (não vale para
     `outbound_extremo`, que ainda tem faixa de 32,3% ali).
   - **A curva de N não mede escala pura.** O eixo carrega composição junto, porque
     cliente é coisa inteira e a repartição por maiores médias não realiza a proporção
     pedida na maioria dos N. Em N=2 o `equilibrado` é uma carteira de cripto +
     exportador. Nos N que dividem exato (6, 12, 24) a curva É monótona. Qualquer
     leitura de "quantos clientes bastam" a partir desta grade lê os dois efeitos juntos.
   - **Um achado da revisão NÃO foi acatado**: a alegação de que `carry_cnr` contraria
     uma decisão de zerá-lo. O "ZERO por decisão de produto" em `motor/varredura.py` é
     sobre `custo_oportunidade_aa`, outro parâmetro.
   - **Uma decisão de modelagem foi nomeada e adiada**: o peso de um mix é contagem de
     CLIENTES, mas o que move a economia é VOLUME, e o volume por cliente varia 7x entre
     perfis. Mudar isso exigiria recalibrar os cinco mixes e refazer todos os números;
     adiado até a composição real da carteira chegar.
   - A varredura anterior de 4 mixes (21.600 rodadas) está superada. A decomposição de
     variância dela dava `mix` 58,6%; com a ponta OUT na amostra, dá 81,9%.

---

## 2026-09-07 — Tempo até resolução entra no CSV, e o eixo W se revela quase inerte (MOT-?)

> **ID do Linear pendente.** Não foi criada issue para esta mudança; o `MOT-?` acima
> precisa ser trocado pelo número real antes do push, junto com o do commit.

1. **Sintoma.** O motor media o custo do netting e não media o tempo. Como esperar
   mais sempre neta mais, a varredura com custo como métrica única aponta "espere o
   máximo possível" como configuração ótima — um ótimo que nenhum cliente aceita. A
   restrição que impede esse resultado degenerado é o prazo, e ela não saía no CSV.

2. **Causa.** O dado sempre existiu: `Alocacao.dia - Ordem.dia_conhecida` é o tempo
   que aquela parcela esperou. Ele só era consumido dentro do termo de custo de
   espera, que está zerado por decisão de produto (`custo_oportunidade_aa = 0`), e
   nunca era agregado nem emitido.

3. **O que foi feito.** Branch `gabriel/metrica-tempo`, dois commits, **não** mergeada
   e **não** pushada.
   - `motor/varredura.py`: `MetricasTempo`, `metricas_de_tempo()` e
     `_percentil_ponderado()`; quatro colunas novas em `PontoVarredura` —
     `dias_espera_p90_volume_casado`, `dias_espera_p90_volume_remetido`,
     `dias_espera_media_por_real`, `pct_volume_espera_truncada`.
   - `tests/test_tempo.py`: novo. Caso pequeno com a conta feita à mão antes de rodar,
     percentil ponderado por volume (e não por contagem), identidade contra o termo de
     espera de `custo.py` com `custo_oportunidade_aa=0.01` só dentro do teste, e a
     invariante de conservação.
   - `docs/dicionario-csv.md`: novo, cobrindo as duas saídas da CLI.
   - `scripts/varredura_janela.py` e `scripts/diagnostico_custo.py`: descartáveis.
   - `netting.py`, `custo.py` e a tabela de alíquotas **intocados**.

   A unidade de medida é a **alocação ponderada por volume**, não a ordem: uma ordem
   coberta em tranches esperou prazos diferentes, e cada real conta o tempo que ele
   ficou parado. É a mesma base do custo, e é isso que torna a identidade possível.

   Uma decisão foi revertida no caminho. A quarta coluna nasceu como
   `volume_censurado_pct` (volume sem alocação no fim do horizonte) e virou
   `pct_volume_espera_truncada`, porque a primeira é **estruturalmente zero em toda
   linha**: `executar_p0` drena o que sobrou no último dia e levanta exceção se alguma
   ordem ficar aberta. O viés que ela deveria denunciar entra por outra porta — ordens
   com `dia_limite` além do horizonte são drenadas artificialmente, e a espera delas
   sai truncada e é contada como observada. A invariante virou asserção de teste.

4. **O que isso invalida.**
   - **O eixo W da grade padrão, de seis níveis, é desperdício.** Medição pareada (mix
     `equilibrado`, N=12, horizonte 365, as MESMAS 30 sementes em todos os W):
     W=7, W=14 e W=30 dão resultado **decimalmente idêntico nas 30 sementes**;
     W=3 vs W=7 tem mediana de -0,049 bps com 4/30 sementes invertendo o sinal e 5/30
     empatando — indistinguível de ruído. Só W=1 se separa (mediana -0,921 bps,
     0/30 inversões). Conclusão: `VALORES_W_PADRAO` pode cair de `(1, 3, 7, 14, 30)`
     para três níveis. **Não alterado ainda** — decisão do Gabriel.
   - Qualquer leitura anterior que tenha atribuído diferença de economia à janela
     acima de W=7 estava lendo ruído de semente. Isso vale para a `varredura.csv` e a
     `grade.csv` já geradas.
   - `AGENTS.md` dizia "251 testes"; agora são 257.
   - Nada muda nos números de custo, netabilidade ou no número de aceitação da Amanda:
     nenhuma coluna existente foi renomeada ou recalculada.

---

## 2026-09-06 — `diagnostico_semantica.py` vira oráculo diferencial (e acha uma sutileza do P0)

**Sintoma.** O `diagnostico_semantica.py` estava solto na raiz, não versionado, e existia
para responder uma pergunta que já foi respondida: o ganho do "P1" vinha da política ou
da semântica de remessa? Rodado hoje, ele diz P0 real 75,3% vs. as duas sombras 75,2% —
*"hipótese não se sustenta neste código"*. A missão diagnóstica dele acabou quando o
MOT-11 foi corrigido.

**Causa.** O que sobrou no script tem valor maior que a pergunta original: ele contém uma
**reimplementação independente do P0**. Isso é um oráculo — o tipo de teste que pega
regressão que os testes de valor-previsto-à-mão não pegam, porque estes só cobrem os
casos que alguém pensou em escrever.

**O que foi feito.** Branch `test/oraculo-diferencial-p0`. O script virou
`tests/test_oraculo_p0.py` e foi apagado da raiz. Também apagados `scripts/timeline.json`
e `scripts/timeline_caso7.json`: são saída gerada pelo `exportar_timeline.py`, que está
preservado no PR #17 — dado gerado não entra no repo.

Escrever a sombra expôs **uma sutileza de política que não estava escrita em lugar
nenhum**: uma ordem totalmente coberta sai do lote na hora, e portanto o vencimento dela
NÃO dispara fechamento. Sem essa regra a sombra fechava lotes a mais e netava até 1,7 pp
menos que o motor. O motor sempre esteve certo — era a sombra que descrevia outra
política. Com a regra correta, a concordância é **exata**.

Duas decisões de desenho que valem registro, porque a primeira versão do teste era fraca
e passou por cima das duas:

1. **Compara a linha do tempo de alocações, não o volume total.** O volume casado de um
   ciclo é `min(soma_out, soma_in)`, que não depende de quem foi coberto nem de quando —
   um oráculo de volume é cego a EDF e a timing. Com volume, mutação de EDF e de gatilho
   de janela passavam batidas.
2. **Dois regimes de carteira.** Na densa, alguma ordem vence quase todo dia e é o
   vencimento que dispara; a janela nunca é exercitada (é o mesmo motivo pelo qual o eixo
   W sai degenerado). Foi preciso um regime **esparso** para a janela virar o gatilho e a
   troca de `>=` por `>` ser detectada.

Verificado por mutação: o oráculo pega as cinco — gatilho de janela alterado, EDF sem
desempate por `id`, FIFO no lugar de EDF, ordem quitada mantida no lote, e o bug
histórico de remessa do lote inteiro. Suíte: 249 → **251 testes**, verdes também sob
`python -O`. Número de aceitação inalterado.

**O que isso invalida.** Nada de resultado. Invalida a instrução de "rodar o
`diagnostico_semantica.py`" que aparece na memória exportada do Claude.ai: o script não
existe mais, e o que ele fazia agora roda no `pytest`. Registra também, pela primeira vez
por escrito, a regra de que ordem quitada sai do lote — quem for mexer no `executar_p0`
precisa saber que isso é comportamento, não detalhe de implementação.

---

## 2026-09-06 — Robustez: validação de carga, invariantes que sobrevivem ao `-O`, e dois bugs de CLI

**Sintoma.** Uma auditoria externa do repositório apontou onze lacunas. Sete se
confirmaram como defeito de verdade ao serem reproduzidas no código:

1. `carregar_cenario` não valida id duplicado — dois ids iguais colapsam no dict de
   pendentes do netting e uma das ordens some da conta.
2. `carregar_cenario` não valida ordem conhecida depois do horizonte — ela nunca entra
   no laço diário e nunca é alocada.
3. Os invariantes de conservação do `netting.py` eram `assert`. Sob `python -O` eles
   somem, e os dois casos acima passariam em silêncio com resultado errado.
4. `Alocacao` e `Arquetipo` validavam com `assert` pelo mesmo motivo.
5. `carregar_cenario` nunca lia `iof_por_finalidade` do YAML — o campo existe em
   `ParametrosCusto` desde o PR #9, mas um cenário que declarasse a tabela era
   carregado com ela vazia, caindo no `iof_out`/`iof_in` padrão sem avisar.
6. `_percentil` documentava "posto mais próximo" e implementava piso (`int(...)`).
7. `resumir()` agrupava por `(mix, N, W)` sem o horizonte: dois horizontes diferentes
   viravam uma célula só, reportando o horizonte do primeiro ponto.

Mais dois na CLI: `python -m motor --help` tentava abrir um arquivo chamado `--help` e
morria com `FileNotFoundError`; `python -m motor varredura --help` imprimia a ajuda mas
saía com código 1, porque o `except SystemExit` convertia o help em erro.

**Causa.** As validações nunca existiram (o loader assumia YAML bem-formado, escrito à
mão) e os invariantes foram escritos como `assert` na fase em que eram checagem de
desenvolvimento — antes de virarem a garantia de correção que são hoje. Os dois bugs de
CLI são caminhos que nenhum teste exercitava.

**O que foi feito.** Branch `fix/robustez-carga-invariantes-cli`, com teste antes da
correção em todos os casos (9 testes novos; a suíte vai de 240 para 249):

- `motor/dominio.py`: `_validar_ordens` recusa id duplicado, `dia_conhecida` negativo e
  `dia_conhecida` além do horizonte; `Alocacao`/`Arquetipo` levantam `ValueError` em vez
  de `assert`; o loader passa a ler `iof_por_finalidade` (lista de
  `{finalidade, direcao, aliquota}` no YAML, porque a chave é um par e YAML não tem
  chave composta). A tabela continua opt-in.
- `motor/netting.py`: os quatro `assert` viram `ValueError` com mensagem que diz qual
  ordem quebrou a conservação.
- `motor/varredura.py`: `_percentil` arredonda para o posto mais próximo, como sempre
  prometeu; `resumir()` inclui `horizonte_dias` na chave de agrupamento.
- `motor/__main__.py`: `--help`/`-h` tratados nos dois modos, com código de saída 0.

Verificado: `pytest -q` → 249 passed; `python -O -m pytest -q` → 249 passed (é isso que
prova que os invariantes não dependem mais do `assert`); a varredura roda ponta a ponta.

**O que isso invalida.**

- **`_percentil` muda as colunas `economia_pct_p25` e `economia_pct_p75`** de qualquer
  CSV de resumo gerado antes desta mudança, quando o número de seeds faz o posto cair no
  meio (com 4 seeds e q=0,25, antes vinha a pior seed; agora vem a vizinha). Os CSVs
  soltos na máquina (`grade*.csv`, `varredura*.csv`) foram gerados com o piso — rode de
  novo antes de comparar com saída nova. Nenhuma coluna de mediana (`p50`) muda.
- **Nada do número de aceitação muda**: reconferido ao vivo, baseline ≈ US$ 439 k,
  netado ≈ US$ 249 k, economia ≈ US$ 190 k, netabilidade 58,82%.
- Cenários YAML escritos à mão que tenham id duplicado ou ordem conhecida além do
  horizonte **agora falham na carga** em vez de rodar. Isso é intencional: antes eles
  rodavam e davam número errado. Nenhum cenário versionado no repo tem esse problema.
- **Não invalida** as conclusões da varredura: o eixo que mudou (p25/p75) não é o que
  sustenta nenhuma conclusão registrada até aqui — as leituras foram feitas na mediana e
  na faixa min–max, que não mudaram.

---

## 2026-09-06 — Auditoria de fechamento: o que está na `main` bate com o que validamos

**Sintoma.** Pedido direto: confirmar que tudo rodando no GitHub hoje é
literalmente o produto que testamos e validamos — sem branch presa, sem PR
pendente, sem lacuna escondida entre código e documentação — e, se estiver
tudo certo, deixar registrado aqui como o motor está hoje.

**Causa.** N/A — auditoria de rotina, não um bug relatado.

**O que foi feito.**
- Conferido no GitHub: 16 PRs, todas `MERGED`; nenhuma PR aberta; nenhuma
  branch remota à frente da `main`. Apagada a branch órfã `github.com/altoe2025/MOTOR-DE-FLUXO`
  (ver nota na tabela acima).
- Suíte completa: **240 testes, tudo verde**. Cenário da Amanda conferido ao
  vivo: baseline US$ 439 k, netado US$ 249 k, economia US$ 190 k — bate com o
  número de aceitação do `CLAUDE.md`.
- Escrevi e rodei **7 cenários de verificação manual** (previsão feita à mão,
  ciclo a ciclo, antes de rodar o motor — mesmo método do `cenario_temporal.yaml`),
  em `motor/cenarios/manuais/`, com o runner `scripts/rodar_casos_manuais.py`:
  netting total no mesmo dia; ordem sem contraparte (sai 100% remetida);
  cascata em cadeia (A+B num fechamento, resto de B com C num fechamento
  seguinte); a mesma ordem coberta em tranches ao longo de 3 dias diferentes;
  fechamento disparado só pela janela, incluindo os ciclos "vazios" que isso
  produz quando não há nada para casar nem ninguém vencendo; e um cenário de
  15 ordens com concorrência real — vários OUT ou vários IN abertos ao mesmo
  tempo, com um empate proposital de `dia_limite` — para conferir a prioridade
  EDF e o desempate por `id`. Todas as execuções bateram exatamente com a
  previsão escrita antes de rodar.
- `scripts/exportar_timeline.py`: exporta a saída de `executar_p0` em JSON
  (ordens, ciclos, alocações) — é o que alimenta um dashboard visual que fiz à
  parte (anima a timeline em tempo comprimido, mostra as filas por ordem de
  chegada vs. prioridade e os casamentos/remessas acontecendo). O dashboard em
  si é um Artifact publicado fora do repo, não entrou neste commit — avisem se
  quiserem que eu traga o HTML pra cá.
- Revisão código↔documentação: os 4 itens que a entrada de 2026-09-05 já
  listava como "menores, não consertadas" **continuam abertos hoje**,
  reconferidos linha a linha no código atual:
  1. `motor/geracao.py`: `if dia_conhecida >= horizonte_dias: continue` é
     código morto — `rng.integers(0, horizonte_dias)` já exclui o limite
     superior, a condição nunca é verdadeira.
  2. `motor/varredura.py:_percentil`: o docstring promete "posto mais
     próximo", mas a implementação trunca (`int(...)`, sem arredondar) — é
     piso, não o mais próximo.
  3. `motor/dominio.py:carregar_cenario` ainda não valida id duplicado nem
     `dia_limite` além do horizonte — cenário mal escrito quebra dentro do
     netting, não na carga.
  4. As invariantes de conservação em `netting.py` (linhas 102, 134, 149, 158)
     continuam como `assert` puro — somem em silêncio com `python -O`.
- Também confirmado: a pendência (a) de 2026-09-05 — cliente casando o
  próprio fluxo por causa de `p_out` sorteado ordem a ordem — segue **medida,
  não eliminada**. O CSV separa a taxa incremental desde a PR #14, mas o
  gerador continua sorteando direção por ordem, não por cliente; é decisão de
  produto em aberto, não bug pendente de conserto.
- E um gap novo, achado ao ler `geracao.py` com atenção: `visibilidade_dias_min/max`
  do `Arquetipo` é validado no construtor e testado em `test_dominio.py`, mas
  **não é usado** em `gerar_ordens` — já tem um TODO explícito no código
  (`motor/geracao.py:47`) dizendo isso. A antecedência de forecast declarada
  no arquétipo ainda não afeta o `dia_conhecida` gerado.

**O que isso invalida.** Nada dos números publicados — é o oposto: esta
entrada confirma que o que está na `main` hoje **é** o produto validado até
aqui, sem divergência entre código rodando e o que os testes/cenários
garantem. Todos os itens em aberto listados acima já eram conhecidos (a
maioria desde 2026-09-05) e continuam sem dono; nenhum é surpresa nova, e
nenhum bloqueia usar o motor como está.

---

## 2026-09-05 — Netting deixa de ser superlinear; a grade padrão volta a ser usável

**Sintoma.** A grade padrão não terminava. Deixei rodando 45 minutos e matei sem
resultado, apesar de o README prometer "~20 s" e o `__main__.py` "~2 min". O custo
por ordem crescia com o tamanho da pool: 9 µs em N=10, 30 µs em N=200, 101 µs em
N=1000.

**Causa.** Três fontes de custo quadrático em `executar_p0`, todas de estrutura de
dados e nenhuma de política:
1. `abertas.remove(ordem)` dentro de um laço sobre `abertas` — `list.remove` é
   O(n), o que dá O(n²) por ciclo fechado;
2. `sorted(abertas)` três vezes por dia de fechamento, sobre a lista inteira;
3. `any(o.dia_limite == dia for o in abertas)` todo dia, só para perguntar se
   alguma ordem vence hoje — O(n) por dia mesmo em dia sem fechamento.

**O que foi feito.**
- `abertas` passa a ser mantida sempre ordenada por `_prioridade`, com
  `bisect.insort` na entrada. Filtrar por direção preserva a ordem, então `out` e
  `entrada` já saem canônicas sem nenhum `sorted`.
- As ordens que sobram são acumuladas numa lista nova em vez de removidas uma a
  uma. Como a varredura já é na ordem canônica, a lista nova sai ordenada.
- Um dicionário `vencem_no_dia` conta quantas ordens abertas vencem em cada dia,
  substituindo a varredura diária.
- Antes de tocar no código, entrou
  `test_saida_do_p0_e_bit_a_bit_a_mesma_de_sempre`: um digest SHA-256 sobre a
  saída completa de 108 células da grade — dia, brutos, casado, resíduo, direção e
  cada `Alocacao` na ordem exata da tupla. Verificado verde ANTES da mudança, e
  segue verde depois. Suíte: 240 passando.
- README e `__main__.py` corrigidos: os dois anunciavam tempos que nunca foram
  verdade.

**O que isso invalida.**
- As duas afirmações de tempo na documentação estavam erradas por uma a duas
  ordens de grandeza. Agora o número está medido: **a grade padrão completa,
  400 células com até 1000 clientes em 365 dias, leva 7 min 42 s.**
- Custo por ordem passa de 9→101 µs para **8→13 µs** — praticamente plano, ou
  seja, o netting virou linear no tamanho da pool.
- Nada mais. O resultado é bit a bit idêntico, e é isso que o digest garante.
  **Se aquele teste falhar um dia, ou o refactor mudou o comportamento ou a
  política mudou de propósito — no segundo caso, recalcule o digest DE PROPÓSITO e
  explique no commit. Nunca atualize o valor só para ficar verde.**

---

## 2026-09-05 — Netting incremental: separar o que o cliente faria sozinho

**Sintoma.** Medindo a pendência (a), apareceu um número que muda a proposta do
produto: **entre 47% e 77% do netting que o motor reivindica seria feito pelo
próprio cliente**, só com o fluxo dele, sem contraparte externa nenhuma.

**Causa.** `geracao.py` sorteia a direção ordem a ordem, então todo cliente tem
fluxo nos dois sentidos — um cliente de remessa manda 90% e recebe 10%. Quando o
motor casa a entrada de um cliente com a saída **do mesmo cliente**, isso entra
como netting. Mas a tesouraria dele já faria esse encontro sozinha: usa o dólar
que entrou para bancar o dólar que sai. O valor do produto é casar clientes
**diferentes**, que não se conhecem — e era exatamente essa parte que o CSV não
isolava.

**O que foi feito.** `PontoVarredura` ganha `limite_intra_cliente_brl`
(`Σ 2 × min(manda, recebe)` por cliente — o teto do que fariam sozinhos),
`volume_casado_incremental_brl` e `taxa_netabilidade_incremental`; `ResumoCelula`
ganha a mediana da taxa. O incremental é um **piso**, não valor exato: o
casamento é agregado e não diz quem casou com quem, então subtrair o limite intra
dá o mínimo que só pode ter vindo de clientes diferentes. Chão em zero — quando o
tempo impede um cliente de casar o próprio fluxo, o motor casa menos que o limite
intra, e um negativo ali não significaria nada. A CLI passa a imprimir a linha.
Quatro testes novos, todos vistos falhar antes. Suíte: 239 passando.

**O que isso invalida.**
- **A ordenação das carteiras muda, e a inversão se sustenta nos três tamanhos.**

| carteira | net bruta (N=200) | incremental | perde para o intra |
|---|---|---|---|
| corporativo_pesado | 97,4% | **51%** | 46,4 pp |
| psp_dominante | **99,5%** | 45% | 54,5 pp |
| equilibrado | 87,3% | 40% | 47,3 pp |
| retail_pesado | 62,5% | 16% | 46,5 pp |

  Pela netabilidade bruta, `psp_dominante` é a melhor carteira. Pelo netting que o
  produto de fato cria, **`corporativo_pesado` é a melhor**, e o PSP é justamente
  quem mais perde para o intra-cliente (54 a 60 pontos), porque no modelo ele
  recebe arrecadação e paga merchant no mesmo volume.
- **Toda economia citada até hoje está inflada por esse efeito.** Os 80% do mix
  equilibrado viram 41% de netting incremental. Não usar a bruta em conversa
  comercial.
- Pergunta em aberto para a Amanda, agora com número: **na vida real, quanto do
  próprio fluxo um cliente desses já casa antes de procurar um serviço como o
  nosso?** Se casar tudo, o mercado endereçável é o incremental. Se não casar nada
  (porque as pontas caem em dias, moedas ou entidades diferentes), a bruta volta a
  valer. A verdade está no meio e só ela sabe onde.
- O gerador **não foi alterado**: a decisão entre direção por ordem e por cliente
  segue aberta, agora medida dos dois lados.

---

## 2026-09-05 — Teto da carteira e eficiência da política entram no CSV

**Sintoma.** Lendo a grade, não havia como responder à pergunta mais básica sobre
uma célula: uma netabilidade de 90% significa que a política é boa ou que a
carteira já era equilibrada? São conclusões opostas para o produto e o CSV não
distinguia as duas.

**Causa.** Faltava a referência. O melhor que qualquer política pode fazer numa
pool é `1 − |OUT−IN| / (OUT+IN)` — a soma dos resíduos nunca fica abaixo do
desbalanço total, então nem um ciclo único que enxergasse a pool inteira netaria
mais que isso. Sem esse teto no CSV, a netabilidade era um número sem denominador.

**O que foi feito.**
- `PontoVarredura` ganha `teto_netabilidade` e `eficiencia_vs_teto`; `ResumoCelula`
  ganha as medianas das duas. Calculados em `montar_ponto`, a partir da pool —
  nenhuma camada abaixo foi tocada.
- O resumo da CLI passa a imprimir uma segunda linha por mix dizendo quanto do
  possível a política extraiu.
- Cinco testes novos, todos escritos antes da implementação: o teto é a fórmula
  sobre a pool, a netabilidade nunca o ultrapassa, a eficiência é a razão entre os
  dois, uma pool perfeitamente equilibrada tem teto 1, e o resumo carrega as
  medianas. Suíte: 234 passando.
- Bug de portabilidade corrigido no mesmo commit: a seta `→` que eu tinha posto na
  linha nova da CLI derruba o processo inteiro com `UnicodeEncodeError` no console
  do Windows (cp1252). **A saída da CLI só pode usar caracteres do cp1252.** O
  código anterior escapava por usar travessão, que está na tabela.

**O que isso invalida.**
- A pendência (d) de 2026-09-05 está **fechada**: dá para separar carteira de
  política lendo o CSV.
- E a resposta que ela dá é forte, agora medida célula a célula: com 50 clientes
  ou mais a eficiência é **98% a 100%**, e com 200 é **100,0% em todas as quatro
  carteiras**. A política P0 não deixa nada na mesa em escala realista. Só com 10
  clientes sobra folga (92% a 97%), que é onde o timing ainda aperta.
- Consequência direta: **qualquer trabalho de política (P1, lookahead, teto de
  folga) tem ganho máximo de zero em N ≥ 50.** O que move o resultado é a carteira.
  O teto do `retail_pesado` é 62,5% mesmo com 200 clientes — nenhuma política vai
  consertar fluxo unidirecional.
- Todo CSV gerado antes deste commit não tem as duas colunas novas.

---

## 2026-09-05 — Colunas de volume do CSV fechando, e três medições que mudam a leitura da varredura

**Sintoma.** Auditoria antes de subir a `main`. Numa linha qualquer do CSV da
varredura, `volume_casado_brl / volume_bruto_brl` dava 45,30% enquanto a coluna
`taxa_netabilidade` da **mesma linha** dizia 90,60%. Além disso, três medições
novas mostraram que o número de netabilidade que a varredura reporta depende
muito mais de escolhas do gerador do que se supunha.

**Causa.** `montar_ponto` somava `ciclo.casado`, que é grandeza de **uma perna**
(o mínimo entre os dois lados), enquanto `volume_bruto_brl` conta as **duas**. O
que deixou de atravessar são as duas pernas — os reais que ficaram no Brasil e a
moeda que ficou lá fora. Faltava o fator 2. Nenhum teste cobria a relação entre
as colunas: os testes de conservação olham as alocações, não o CSV.

**O que foi feito.**
- `motor/varredura.py`: `volume_casado_brl` passa a contar as duas pernas. Agora
  `casado + residuo == bruto` exatamente, e `casado / bruto == taxa_netabilidade`.
- `tests/test_varredura.py`: teste novo travando as duas igualdades em toda célula
  da grade. Falhava antes do conserto.
- Suíte: 229 passando.

**O que isso invalida.**
- **Todo CSV de varredura gerado antes de hoje** tem a coluna `volume_casado_brl`
  pela metade. Os `.csv` na raiz do repo (`varredura_local.csv`, `varredura_nova.csv`,
  `grade.csv`, `grade_resumo.csv`) estão nessa condição — regerar antes de usar.
  As colunas de custo e economia **não** foram afetadas.
- **Felipe: isto atinge a MOT-14 diretamente.** A Sensibilidade (Etapa 4) roda em
  cima desse CSV. Regere a grade antes de tirar qualquer conclusão, e leia (c)
  abaixo antes de gastar uma rodada no eixo W.
- Três pendências **medidas, não consertadas** (ver a seção abaixo).

### Pendências medidas em 2026-09-05 — decidir antes de tratar a varredura como resultado

**(a) O gerador sorteia direção ordem a ordem, não por cliente.** Cada cliente
simulado é bidirecional: 22% a 40% do volume dele fica na direção contrária ao
próprio arquétipo, então o cliente neta contra si mesmo. Trocando para uma direção
por cliente, a netabilidade cai de **70–91% para 47–76%** (5 seeds, mix
equilibrado, 12 clientes, horizonte 90). Não é bug contra a especificação —
`Arquetipo.p_out` está documentado como probabilidade por *ordem*. Mas é a
diferença entre "o netting neta 90%" e "neta 60%", e a escolha nunca foi decidida
de propósito. Já havia um comentário em `varredura.py` prevendo corrigir isso,
tratando como detalhe de finalidade; ninguém tinha medido o efeito no número
principal.

**(b) Até 26% do resíduo é artefato do fim do horizonte.** `geracao.py` cria
ordens com `dia_limite` além do horizonte (com horizonte 90, vi prazo até o dia
114 — 10% do volume), e o netting liquida tudo à força no último dia. A fatia do
resíduo que vem só disso varia por seed: 10,2% / 26,1% / 0,6% nas seeds 1/2/3.
Contamina o número principal de forma imprevisível. Opções: limitar `dia_limite`
ao horizonte, descartar os últimos dias, ou excluir o ciclo final da estatística.

**(c) O eixo W da varredura está degenerado.** Em N=50, horizonte 365, 5 seeds, a
netabilidade mediana é **idêntica até a 6ª casa decimal** para W ∈ {1, 3, 7, 14,
30}; a economia difere na 6ª casa, que é ruído de arredondamento. É consequência
esperada da correção do MOT-11 — o fechamento passou a ser dirigido por
vencimento, não pela janela. Dois efeitos: a grade padrão gasta 5× o tempo num
eixo sem sinal, e o resumo da CLI faz `max()` sobre esses empates, escolhendo W=1
por uma diferença de 0,000001 e imprimindo como se a janela importasse.
**Reportar, não deletar ainda** — o eixo pode voltar a ter sinal se a política
mudar.

**(d) A política já extrai quase tudo que a pool permite — o que a varredura mede
é composição, não política.** Definindo `teto = 1 − |OUT−IN| / (OUT+IN)` (o melhor
que um ciclo único poderia fazer, já que a soma dos resíduos nunca fica abaixo do
desbalanço total), a eficiência `netabilidade / teto` medida na grade é:

| mix | N=10 | N=50 |
|---|---|---|
| equilibrado | 93,1% | 98,8% |
| retail_pesado | 92,1% | 100,0% |
| corporativo_pesado | 96,1% | 99,1% |
| psp_dominante | 93,5% | 98,2% |

Média 96,4%. Ou seja: **a netabilidade que o CSV reporta é essencialmente uma
propriedade do desbalanço OUT/IN da pool gerada, não do algoritmo.** Isso explica
de uma vez o eixo W degenerado e o P1 dominado — não sobra folga para política
nenhuma capturar. O que move o resultado é o mix (teto de 63% no `retail_pesado`
contra 97% no `psp_dominante`), que é exatamente a pergunta do projeto. **O CSV
não tem coluna de teto nem de eficiência**, então hoje não dá para separar as duas
coisas ao ler a grade. Acrescentar essas duas colunas é o próximo passo óbvio, e é
insumo direto da MOT-14.

**(e) O netting é superlinear, e a grade padrão leva ~25 min, não os "~20 s" do
README nem os "~2 min" do `__main__.py`.** Custo por ordem medido: 9 µs em N=10,
30 µs em N=200, 101 µs em N=1000 (132.771 ordens, 13,4 s por chamada). Três fontes,
todas em `netting.py`: `abertas.remove(ordem)` dentro de um laço sobre `abertas`
(O(n²)); `sorted(abertas)` três vezes por dia de fechamento; e
`any(o.dia_limite == dia for o in abertas)` todo dia. Prototipei a correção
(manter `abertas` ordenada com `bisect.insort`, reconstruir a lista em vez de
remover item a item, e contar vencimentos por dia num dicionário): **11× mais
rápido em N=1000, com saída bit a bit idêntica em 72 cenários conferidos.** A
grade padrão cairia de ~25 min para ~3 min. Não apliquei — `netting.py` é coluna
do Felipe.

**Menores, não consertadas:** as invariantes de conservação são `assert` e somem
com `python -O` (testado: uma ordem some em silêncio em vez de estourar);
`carregar_cenario` não valida id duplicado nem dia fora do horizonte, então o erro
sai apontando para as tripas do netting; há um `if` morto em `geracao.py:52`;
`_percentil` é piso e não "posto mais próximo" como o docstring diz; `resumir`
ignora o horizonte ao agrupar.

---

## 2026-09-05 — Previsão do `cenario_temporal.yaml` refeita à mão

**Sintoma.** O teste `test_cenario_temporal_bate_com_a_previsao_escrita_no_yaml`
estava `xfail(strict=True)` desde a correção do MOT-11. Além disso, chegou uma
tarefa pedindo para "corrigir a falta de carry-over no P0" descrevendo um
`netting.py` que não existe mais no repo desde 2026-09-04.

**Causa.** Duas coisas, com a mesma raiz. A previsão no topo do YAML foi escrita
à mão sob a semântica antiga (o vencimento de uma ordem fechava o lote inteiro),
e ninguém a refez depois que a semântica mudou. E a tarefa foi escrita a partir
do estado da **`main`** em `ade537c`: os commits do MOT-11 existem no GitHub, mas
na branch `fix/semantica-remessa-p0`, dentro do PR #11, que segue **aberto e não
mergeado**. Quem leu a `main` leu o código antigo sem ter como saber disso.

**O que foi feito.**
- Previsão do topo de `motor/cenarios/cenario_temporal.yaml` recalculada à mão,
  ciclo a ciclo, antes de rodar o motor. Só os dias 4 e 5 mudaram: a1 não é mais
  remetida no dia 4, fica aberta e casa integralmente com f1 no dia 5. Os outros
  dez ciclos já batiam.
- `tests/test_netting.py`: `xfail` removido, previsão atualizada, e a tupla
  esperada passou a incluir `bruto_out`/`bruto_in` — é onde a semântica nova
  aparece (o bruto é saldo pendente, não valor original: no dia 5 o lado OUT vale
  40, não os 100 com que a1 foi criada).
- Suíte: 228 passando, nenhum `xfail`.
- A tarefa do "carry-over" **não foi implementada**: o defeito que ela descreve já
  estava corrigido, e o algoritmo que ela propõe seria uma regressão (ver abaixo).

**O que isso invalida.**
- A pendência "`cenario_temporal.yaml` está `xfail`, previsão precisa ser refeita"
  está **fechada**.
- Os números de aceitação daquela tarefa estão **errados** em duas das três
  linhas. Medido na `main` de hoje: contraexemplo P/Q/R/S dá **100,0% de
  netabilidade e IOF 0** (a tarefa dizia que a `main` dava 50% e que 100% era a
  meta — já é a meta); `cenario_temporal` dá **60,27% e IOF 5,1580** (a tarefa
  previa 32,88% e IOF 9,0380 como resultado desejado, o que seria pior que hoje).
  Só `exemplo_amanda` bate: economia de US$ 190 k.
- O algoritmo proposto por aquela tarefa exigiria devolver `Ciclo.ordens` no lugar
  de `Ciclo.alocacoes` (edita `dominio.py`) e desfazer a cobertura parcial, que a
  `main` adota deliberadamente e argumenta não ser fracionamento do art. 22 — ver
  o docstring de `motor/netting.py`. Continua sendo uma pergunta aberta para a
  Amanda **qual leitura do art. 22 vale**, mas o código já escolheu uma, e trocar
  não é refatoração.

---

## 2026-09-04 — Resíduo sai no vencimento da ordem, não no fechamento do lote (MOT-11)

**Sintoma.** O P0 netava 42,1% num diagnóstico com pools sintéticas. Duas políticas
alternativas mediam 75,2% — uma delas idêntica ao P0 exceto pelo momento da
remessa. O ganho todo vinha da semântica, nenhum vinha da política.

**Causa.** `executar_p0` fechava o lote inteiro quando **qualquer** ordem aberta
vencia, e mandava para o exterior todo o excedente — inclusive ordens que ainda
tinham dias de folga e teriam encontrado contraparte depois. Contraparte com folga
é o ativo mais escasso do motor, e o fechamento queimava toda ela.

**O que foi feito.** Branch `fix/semantica-remessa-p0`, dois commits, hoje na
`main` (ainda não em `origin/main`).
- O vencimento de uma ordem força a saída **apenas daquela ordem**. O saldo de quem
  tem folga permanece aberto para os ciclos seguintes.
- Entrou `Alocacao` em `dominio.py`: como uma ordem passa a ser coberta em tranches,
  não existe mais um `dia_executada` único. `Ciclo.ordens` virou `Ciclo.alocacoes`,
  e a conservação passou a viver nas alocações (a soma das alocações de um
  `ordem_id` é o `valor_brl` da ordem).
- Cobertura em ordem EDF (`dia_limite`, `id`). P0 subiu para 75,3%.
- Bug de reprodutibilidade junto: as alocações `REMETIDO` saíam na ordem de entrada
  da tupla, não na canônica — embaralhar a entrada mudava o resultado em 15 de 20
  cenários.
- `custo.py` passou a cobrar IOF pela alíquota da ordem que de fato atravessou. O
  pro-rata `_aliquota_media_do_lado` existia só porque o motor não sabia quem
  cruzava; agora sabe, e ele saiu.

**O que isso invalida.**
- Qualquer número de netabilidade medido antes desta data. A base mudou de 42%
  para 75%.
- A previsão à mão de `cenario_temporal.yaml` (resolvido em 2026-09-05).
- O critério de aceitação da MOT-11 ("teste mostrando P1 com netabilidade ≥ P0")
  **não é satisfazível** e precisa ser reescrito: contra o P0 corrigido, o P1 com
  casamento *eager* neta **menos** (−0,45 pp em média, −2,6 pp no pior caso).
  Casamento guloso é míope — gasta contraparte com ordens folgadas sem saber que
  ordens urgentes vão chegar. Decisão do Gabriel: não entregar o P1; o spike fica
  na branch `netting/p1`, fora da `main`. Se voltar, o desenho a considerar tem
  lookahead, não casamento guloso.
