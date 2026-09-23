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
| `codex/frontend-etapa-6-planejamento` | especificação aprovada, plano técnico 6A–6D e MOT-90–MOT-99 criadas; ainda sem código de produto | Codex |

Essa pilha e as MOT-16–MOT-22 foram integradas na `main` pelos PRs #21–#34. O PR #17 continua aberto e
separado deste trabalho. Apagada em 2026-09-06 a branch remota
`github.com/altoe2025/MOTOR-DE-FLUXO`
— push acidental (nome de branch = URL do repo), sem código exclusivo, nunca foi PR.

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
