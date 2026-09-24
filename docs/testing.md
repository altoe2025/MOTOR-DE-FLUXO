# Testes

## Contexto

Reconferido em 2026-09-20 no candidato local `03e87b8` da branch
`codex/frontend-etapa-3`: a suíte Python tem **772 testes aprovados e 2 ignorados**,
tanto na execução normal quanto sob `python -O`. O front-end tem **388 testes
unitários aprovados em 51 arquivos**; typecheck, lint, build e os **14 testes
Playwright** também passam. Esse estado não foi publicado ou mergeado.

O fechamento local da Etapa 5 em 2026-09-22 é aditivo a esse histórico e está
detalhado na seção **Aceitação integrada da Etapa 5 — MOT-89**. A contagem final
abaixo prevalece para a branch `codex/frontend-etapa-5`; ela também não foi
publicada ou mergeada.

## Provider Responses e política temática — C4 / MOT-94

Candidato local sobre `21541ae`, branch `codex/mot94-c4-responses`, em 2026-09-23.
Somente C4, com 83 testes Python adicionais; C5/C6 não implementadas neste recorte.
Arquitetura, fontes oficiais e limites em
[`etapa-6c-c4-provider.md`](frontend/etapa-6c-c4-provider.md).

O Python é o virtualenv `.venv-t5` existente, somente usado como runtime;
`--basetemp=.pytest_cache/c4-*` isola os temporários dentro deste worktree.
Dependências web vieram do lockfile via cache local (`npm ci --offline --ignore-scripts`).

| Verificação | Resultado |
|---|---|
| Baseline C3 chat + configuração | 59 PASS; 23,56 s |
| TDD política/ferramentas | 34 RED + 4 testes já verdes antes da implementação; 38 PASS depois |
| TDD provider Responses | 26 RED antes do adaptador; 26 PASS depois |
| TDD factory/lifecycle | 1 RED sem criação automática; GREEN após integrar lifespan |
| TDD estado contraditório `IN_SCOPE` + insuficiência | 1 RED; GREEN normalizando resposta server-side |
| Revisão independente + TDD fatos de seções | 1 achado P2 confirmado; 4 RED/GREEN, sem ampliar allowlist |
| `python -m pytest -q --basetemp=.pytest_cache/c4-full-normal` | **1.030 PASS, 2 SKIP**; 191,00 s |
| `python -O -m pytest -q --basetemp=.pytest_cache/c4-full-optimized` | **1.030 PASS, 2 SKIP**; 190,03 s |
| `python -m ruff check servidor tests/web_api` | PASS |
| `python -m mypy servidor` | PASS; 54 arquivos |
| `npm --prefix web run typecheck` | PASS |
| `npm --prefix web run test:unit -- src/api src/chat --maxWorkers=2` | 101 PASS; 9 arquivos, 50,01 s |
| `python -m tests.web_api.scan_credentials` | PASS; 570 textos e 32 binários no momento da verificação, sem bundle novo |
| `git diff --check` | PASS |

Cobertura nova: schemas fechados com campos required; recusa fixa sem `answer`;
MIXED e insuficiência; resolução de evidências/citações/limitações; seis leituras;
valores decimais e fonte sintética preservados; escopo por snapshot; `call_id`,
reasoning, quatro funções/duas rodadas; IDs repetidos; argumentos malformados;
HTTP/refusal/incompleto/timeout e sanitização de logs/resposta; lifecycle e segredo
server-side. Nenhum teste usa transporte HTTP externo. Conexões/DNS externos estão
bloqueados; apenas o loopback usado pelo event loop Windows é permitido.

A matriz adversarial contém clima, política, instruções para ignorar regras,
base64, troca de idioma, pedidos de web/edição e conteúdo malicioso em evidência e
histórico. Classificações fake são oráculos de teste: comprovam barreiras e
protocolo, não acurácia do modelo real nem fidelidade semântica de respostas MIXED.
Fingerprint e resolução de IDs não autenticam fontes recebidas do navegador.
Avisos são os preexistentes Starlette/httpx/anyio e o esperado sob `-O`.
Sem chamada real/paga, chave real, browser C5/C6, push, PR, merge ou deploy.

## Contratos HTTP e configuração do chat — C3 / MOT-94

Entrega local sobre `f22b70a`, na branch `codex/mot94-c3-chat-contracts`, em
2026-09-23. Somente C3: não há provider real, ferramentas ou aceite temático C4.
Contrato e limitações em [`etapa-6c-c3-contratos.md`](frontend/etapa-6c-c3-contratos.md).

O ambiente Windows usa o Python do virtualenv `.venv-t5` existente; `python` nos
comandos abaixo designa esse executável. `--basetemp` foi direcionado para um
subdiretório exclusivo de `.pytest_cache/`, pois o temp global não era acessível
no sandbox. Dependências web instaladas pelo lockfile, sem mudar versões.

| Verificação | Resultado |
|---|---|
| Baseline auth + OpenAPI + comunicação | 97 PASS |
| TDD Settings | 13 RED antes da implementação; 13 PASS depois |
| TDD contratos chat | 26 RED antes da implementação; 26 PASS depois |
| TDD transporte chat | 20 RED antes da rota/injeção; 20 PASS depois |
| TDD validadores TypeScript | 3 RED sem exports; 3 PASS após regenerar |
| `python -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_http.py tests/web_api/test_config.py -q` | 59 PASS, 21,74 s |
| Mesmo recorte com `python -O -m pytest` | 59 PASS, 37,92 s |
| `python -m pytest -q` | 947 PASS, 2 SKIP; 215,07 s |
| `python -O -m pytest -q` | 947 PASS, 2 SKIP; 301,00 s |
| `python -m ruff check servidor tests/web_api` | PASS |
| `python -m mypy servidor` | PASS, 50 arquivos |
| `npm --prefix web run test:unit -- src/api src/chat --maxWorkers=2` | 101 PASS, 9 arquivos |
| `npm --prefix web run test:unit -- --maxWorkers=2` isolado dos outros gates | 922 PASS, 99 arquivos; 186,14 s |
| `npm --prefix web run typecheck` e `npm --prefix web run lint` | PASS |
| `npm --prefix web run build` | PASS; aviso preexistente de chunks >500 kB |
| `python -m tests.web_api.scan_credentials` | PASS; 572 textos, 32 binários |
| OpenAPI + `npm --prefix web run generate:api` repetidos | 4 arquivos gerados idênticos byte a byte; nenhum schema/path anterior alterado semanticamente |
| Revisão independente C3 | Nenhum achado material confirmado; não atesta C4–C6 |

A primeira suíte web completa, concorrendo com gates Python/build, teve 920 PASS
e dois timeouts de 5 s em `router.test.tsx`. A reexecução isolada do arquivo passou
os 48 testes em 28,43 s, sem mudar código, testes ou timeout. A repetição completa
sem os demais gates concorrentes passou os 922 testes em 186,14 s. A hipótese de
contenção local é consistente com essas duas reexecuções; não houve correção de
produto para os timeouts da primeira tentativa.

Os testes HTTP bloqueiam conexões externas e usam somente provider fake injetado.
O socket de loopback necessário ao event loop Windows continua permitido. Não há
rede OpenAI nos testes, gasto ou alteração de recurso externo. Os warnings Python
são deprecações Starlette/httpx/anyio já existentes e o aviso esperado de `-O`.
Não foi executado um novo aceite browser, que pertence à integração C5–C6.
## Aceitação local da Etapa 6B — B6 (MOT-91/MOT-92)

`web/e2e/stage6-demo-communication.spec.ts` percorre quatro caminhos no Chromium
local: instalação única, reload, remoção e restauração explícita; XLSX real no
worker até Caso, Perfil e Estudo, com execução importada bloqueada por
`NAO_CONFIGURADO` e restauração demo sem apagar o Estudo importado; os cinco
cenários sintéticos com diagnóstico, repetição e Replay; composição de hipótese
sem alterar Perfis, comparação incompatível entre mixes independentes, comparação
positiva de base e hipótese de janela executadas no servidor e catálogo de ajuda.
A projeção `CommunicationDocumentV1` é extraída do Estudo persistido e das
fontes de Replay para conferir métricas, rótulos, repetição, fingerprints e
referências de evidência contra as telas. A comparação positiva confere todas as
métricas projetadas contra as células exibidas e a mudança de janela `7 → 8`.

O pacote demo fixa o SHA `5cb78f0b6ddd45b8b63f170153e6be8cd1928497` e a
versão instalada `0.1.0` do motor. O runner E2E lê o SHA do pacote versionado
para configurar o bundle e a API controlada, sem parâmetro manual. Isso não
altera o portão de incompatibilidade de build no produto. Exemplo PowerShell,
com porta e saída exclusivas deste worktree:

```powershell
$env:MOT_E2E_PORT='8046'
$env:MOT_E2E_OUTPUT_DIR='test-results/b6-acceptance'
npm --prefix web run test:e2e -- stage6-demo-communication.spec.ts
```

O bloqueio importado também passou em `import-observed-case.spec.ts`, sem
catálogo fictício. Os cinco cenários prontos têm seeds e entradas distintas;
a Comparação os classifica como incompatíveis e o documento omite comparação.
Uma hipótese nova que reutiliza as ordens e muda a janela de 7 para 8 dias
foi executada com uma seed fixa no teste; a comparação resultante é positiva
e inclui métricas e evidências no documento. Com outras seeds, tentativas
anteriores de diagnóstico falharam na agregação (`volume casado excede o
potencial estrutural` e `taxas por mecanismo não reconciliam com netabilidade`).
O aceite B6 demonstra o caminho positivo reproduzível e não resolve essas
falhas de agregação do Motor. Nenhuma regra de simulação foi alterada.

Gate local de 2026-09-23 neste worktree:

| Verificação | Resultado |
|---|---|
| `npm --prefix web run test:unit -- --maxWorkers=2` | 879 PASS em 94 arquivos; rerun sequencial após timeout por contenção |
| typecheck / lint / build | PASS; aviso informativo de chunk > 500 kB |
| `npm --prefix web run test:e2e -- stage6-demo-communication.spec.ts` sem SHA manual | 4 PASS em Chromium local; comparação positiva incluída |
| `import-observed-case.spec.ts` com SHA do checkout | 7 PASS, gate A6 preservado |
| `python -m pytest -q` | 888 PASS, 2 SKIP; 118 s |
| `python -O -m pytest tests/web_api/test_demo_package.py -q` | 2 PASS |
| Ruff dos arquivos Python alterados / `mypy servidor` | PASS; 45 arquivos no mypy |
| Regeneração do pacote com `.venv-t5` | SHA-256 `5072BA19841153850FE8A6E8FA9DBB378601A460AC9851BCD36694875C295E39`; versões `0.1.0+SHA` |

Após a correção dos bloqueios da revisão: 4/4 no B6 sem SHA manual; 69 testes
unitários focados, 10 testes Python focados, 5 sob `python -O`, typecheck,
lint, build, Ruff, mypy (45 arquivos) e scanner de credenciais aprovados.
A suíte Playwright completa em porta alternativa 8046 teve 28/33: dois testes
abrem 8021 diretamente; esses dois
passaram isoladamente na porta padrão 8021. A falha de sessão expirada em
`foundation.spec.ts` repetiu mesmo em 8021. Duas falhas de concorrência/quota
na execução completa passaram isoladamente em 8021. A suíte global não foi
declarada verde por esse resultado; B6 4/4 foi confirmado separadamente.

Após integrar B6 sobre C1–C4, o gate B6 repetiu **4/4 PASS em 1,1 min** sem
override de SHA. Duas expectativas antigas do Playwright foram reconciliadas com
o comportamento vigente: sessão expirada redireciona imediatamente ao login
(RED antes, **1/1 PASS** depois) e a segunda conta recebe apenas seu demo canônico,
sem enxergar o Estudo privado da conta A (RED antes, **1/1 PASS** depois). A
primeira execução integral teve 32/33 por essa expectativa de isolamento. A
segunda passou esse caso e teve 32/33 porque o fluxo XLSX excedeu o timeout global
em 0,9 s enquanto C5 executava em paralelo; o mesmo fluxo passou isolado em 24,0 s
(**1/1 PASS**). Por isso, esta evidência fecha B6, mas não declara ainda o gate
Playwright integral verde; ele será repetido sem contenção antes do aceite final.

## Aceitação integrada da Etapa 6A — MOT-61

O percurso `web/e2e/import-observed-case.spec.ts` lê XLSX no worker real,
confirma Caso, recarrega, cria Perfil e Estudo por ações manuais e inspeciona
requests e todas as stores IndexedDB. Linha inválida, conflito, correção,
cancelamento, fórmula proibida, corrida CAS e isolamento de contas têm regressão.
O catálogo real permanece `NAO_CONFIGURADO`: o aceite exige bloqueio de prévia,
diagnóstico e Replay importados antes de publicar execução. Não se declara um
percurso importado até Replay como aprovado. Demo/sintético conserva os percursos
executáveis existentes. Detalhes e medição de 1.000 linhas estão em
[`etapa-6a-aceitacao.md`](frontend/etapa-6a-aceitacao.md).

Execute o gate de navegador sozinho no worktree: dois Playwright concorrentes
compartilham porta, bundle e `test-results`, podendo apagar traces um do outro.
O Vitest usa `--maxWorkers=2` também na CI, sem aumentar timeout. Evidências de
cada rerun do Replay agora ficam em `test.info().outputPath`, sem sobrescrever
os PNG/JSON históricos aceitos de MOT-89. A CI retém `web/test-results/` por 7 dias.

O scanner inspeciona o conteúdo ZIP das fixtures XLSX em memória, com limite de
4.096 entradas/64 MiB descompactados, além da inspeção binária existente. Não
extrai arquivos e não abre exceção para segredos nos marcadores não-ZIP de teste.

Gate local em 2026-09-23, candidato A6 sobre `9a60729`:

| Verificação | Resultado |
|---|---|
| OpenAPI + TypeScript gerados | PASS, sem drift |
| `python -m pytest -q` | 880 PASS, 2 SKIP; 178,65 s |
| `python -O -m pytest -q` | 880 PASS, 2 SKIP; 405,25 s |
| `python -m ruff check servidor tests/web_api` (CI) | PASS |
| `python -m ruff check servidor tests` (literal do plano) | RED: 298 achados legados fora do escopo CI |
| `python -m mypy servidor` | PASS, 43 arquivos; inclui correção B1 `9a60729` |
| `npm --prefix web run test:unit -- --maxWorkers=2` | 832 PASS, 90 arquivos; 209,85 s |
| typecheck / lint / build produção | PASS; warning de chunk grande preexistente |
| `npm --prefix web run test:e2e` | 28 PASS; 5,4 min, Chromium local, um worker |
| E2E principal + 1.000 linhas após materializar reports | 2 PASS; 37,0 s; JSONs presentes e sem sentinelas brutas/segredos |
| scanner produção | PASS, 536 textos / 32 binários |
| `git diff --check`, diff contratos e evidências MOT-89 | PASS, sem drift |

O gate literal do plano mestre não é todo verde: o Ruff amplo exige reconciliação
explícita pelo coordenador, não uma alegação de que os 298 achados desapareceram.
Os dois skips Python são de symlink no Windows. Docker/Render/auth real ficam fora
deste aceite local; não houve push, deploy ou regeneração da grade financeira.

## Decisão

### Revisão A6 — ancestralidade e catálogo por par

Sobre `15f5eca` (C1 integrada), quatro testes RED comprovaram perda de origem após
autoria integral e ausência de validação de finalidade/direção. O Chromium também
reproduziu o primeiro defeito após edição dos oito campos e reload. Após correção:

- 166 testes seletivos / 12 arquivos PASS, 40,76 s, 2 workers; inclui schema,
  fingerprint, IndexedDB, execução/Replay e as três suítes C1 existentes.
- Typecheck, lint, build produção e diff-check PASS; scanner 545 textos/32 binários.
- E2E autoria integral/reload PASS 20,8 s; Replay sintético PASS 14,9 s.
- Principal importado excedeu 30 s em uma rodada com compilação concorrente;
  isolado passou 23,6 s (28,4 s de execução total), sem alteração de timeout.

Catálogo dos testes é explicitamente fictício. Finalidade ausente, direção ausente
e segundo par ausente bloqueiam antes de reserva/POST; pares presentes passam.
O marcador de ancestralidade é persistido independentemente da proveniência
corrente. Não houve migração retroativa de autorias salvas antes dessa correção.
Python e a suíte global web não foram repetidos neste loop de front-end focado.

### Módulos testados

Um arquivo de teste por módulo (ou por aspecto do módulo), espelhando
`docs/architecture.md`:

- `test_dominio.py` — entidades e `carregar_cenario`.
- `test_netting.py` — `executar_p0`.
- `test_custo.py`, `test_custo_finalidade.py`, `test_finalidade_por_direcao.py` —
  `custo_baseline`/`custo_netado` e a tabela de alíquotas por finalidade/direção.
- `test_geracao.py`, `test_geracao_todos_arquetipos.py`, `test_arquetipos.py` —
  geração sintética de ordens.
- `test_mixes.py` — composição de carteira.
- `test_varredura.py`, `test_netabilidade.py`, `test_resumo.py` — a grade de
  varredura, incluindo `test_celula_do_grid_reproduz_o_numero_de_aceitacao_da_amanda`
  (o número de aceitação, ver `AGENTS.md`).
- `test_cli.py` — a CLI em `motor/__main__.py`.
- `test_integracao.py` — ponta a ponta, netting + custo juntos.
- `test_oraculo_p0.py` — oráculo diferencial (ver abaixo).
- `test_analise_*.py`, `test_resultado_canonico.py` e
  `test_serializacao_canonica.py` — ledger, agregados, mecanismos e JSON canônico.
- `tests/web_api/` — contrato HTTP estrito, adaptador, publicação, identidade,
  autenticação e servidor estático.

### O oráculo diferencial do P0

`test_oraculo_p0.py` compara `executar_p0` com uma **reimplementação independente da
mesma política**, escrita dentro do próprio arquivo, sobre carteiras geradas ao acaso
com seed fixa. Os dois têm que produzir a **mesma linha do tempo de alocações** —
quem foi coberto, com quanto, em que dia — e não só o mesmo volume total.

A distinção importa: o volume casado de um ciclo é `min(soma_out, soma_in)`, que não
depende de quem foi coberto nem de quando. Um oráculo que comparasse só o total seria
cego exatamente às duas garantias que este motor dá — prioridade EDF e o dia em que o
resíduo sai.

Dois regimes de carteira, por motivos diferentes:

- **densa** — muitas ordens, prazos curtos. Alguma ordem vence quase todo dia, então é
  o vencimento que dispara o fechamento.
- **esparsa** — poucas ordens, buffers longos. Aqui é a **janela** que dispara, e sem
  este regime uma troca de `>=` por `>` no gatilho passava despercebida (é o mesmo
  motivo pelo qual o eixo W da varredura sai degenerado).

O segundo teste do arquivo roda a sombra com a semântica **anterior** ao MOT-11 e exige
que o motor divirja dela de forma gritante. É o que impede o oráculo de virar
decoração: um teste diferencial que concorda com tudo não testa nada.

Verificado por mutação em 2026-09-06 — o oráculo pega as cinco: gatilho de janela
alterado, EDF sem desempate por `id`, FIFO no lugar de EDF, ordem quitada mantida no
lote, e o bug histórico de remessa do lote inteiro.

### Como rodar

```bash
make test              # suíte completa (pytest -q)
pytest tests/test_netting.py -q   # um arquivo
pytest -k nome_do_teste -q        # um teste isolado
python -O -m pytest -q            # sem asserts: ver a regra abaixo
npm --prefix web run test:unit
npm --prefix web run build
npm --prefix web run lint
npm --prefix web run test:e2e
```

### Gate do autonetting preferencial — 2026-09-16

Executado sobre a base `a655d9d9fc166507e084b71bce98f2b601fb5d79`, com schema
de resultado `2.0.0`:

| Verificação | Resultado |
|---|---|
| `python -m pytest -q` | 670 aprovados, 2 ignorados |
| `python -O -m pytest -q` | 670 aprovados, 2 ignorados |
| `npm --prefix web run test:unit` | 89 aprovados em 14 arquivos |
| `npm --prefix web run build` | aprovado |
| `npm --prefix web run lint` | aprovado |
| `npm --prefix web run test:e2e` | 3 aprovados |

Os quatro geradores oficiais (`export_openapi`, fixtures de entrada e saída e
`generate:api`) foram executados duas vezes; a árvore permaneceu sem diferenças.
`git diff --check` não encontrou erro de whitespace.

A aceitação confrontou as alocações do motor com os três mecanismos do JSON. Os
volumes abaixo estão na ordem **intracliente / intercliente / remetido**:

- Amanda: `0 / 54.000.000 / 37.800.000` BRL;
- A OUT 100, A IN 70, B IN 50: `140 / 60 / 20` BRL;
- preferência intracliente sobre deadline externo: `200 / 0 / 100` BRL.

O Playwright percorreu Amanda pelo servidor real local. Para os dois cenários
sintéticos, o adaptador real publicou os mesmos volumes e origens do ledger; os
testes unitários do front usam valores canônicos não deriváveis e comprovam que a
tela os apresenta diretamente, sem recomputar mecanismos no navegador.

### Invariante de correção não pode ser `assert`

`python -O` remove todo `assert` do bytecode. Um invariante que garante que o
*resultado* está certo — conservação de valor, validação de entrada de cenário — não
pode depender disso: sob `-O` ele sumiria e o motor devolveria número errado em
silêncio. Esses invariantes usam `raise ValueError`, e a suíte roda também com `-O`
justamente para provar que continuam valendo. `assert` segue válido em teste.

### Quando um teste quebra

1. Não ajustar o teste para o comportamento novo sem entender por que o
   comportamento mudou — o "Número de aceitação" e os testes de conservação
   (`Alocacao`) existem para pegar exatamente esse tipo de regressão silenciosa.
2. Ler a entrada do topo de `docs/DIARIO-DE-MUDANCAS.md` — pode já haver contexto
   sobre uma mudança recente que explica a quebra.
3. Se a mudança de comportamento for intencional, atualizar o teste **e** registrar
   o motivo na entrada do diário do mesmo commit.

### Pendência conhecida — cenários manuais presos no PR #17

Os **7 cenários de verificação manual** (previsão feita à mão, ciclo a ciclo, antes
de rodar o motor) e o runner `scripts/rodar_casos_manuais.py` existem apenas na
branch `docs/auditoria-2026-09-06` (commit `cbc900d`), aberta como **PR #17 e
deliberadamente não mergeada** — **não estão na `main`**. O mesmo vale para
`scripts/exportar_timeline.py`. `docs/DIARIO-DE-MUDANCAS.md` narra esses 7 cenários
como já escritos e rodados — o que é verdade naquela branch, não na `main`.

Enquanto o PR #17 não for mergeado, **não trate os 7 cenários manuais como regressão
disponível** — não há arquivo para rodar na `main`. Decidir o destino do PR #17 é do
Gabriel; até lá, a regressão efetiva do repo são os testes do `pytest` — com o
oráculo diferencial cobrindo boa parte do que os 7 cenários manuais cobririam, já que
ele confere a política contra uma segunda implementação em vez de contra uma previsão
escrita à mão.

Para contexto de negócio e proveniência, consultar o vault Obsidian.

## Aceitação integrada da Etapa 5 — MOT-89

O spec `stage5-replay.spec.ts` percorre, no Chromium e pela API real local, um Estudo
observado e uma hipótese sintética baseada em Perfil. Ele verifica todos os dias do
horizonte, dia vazio, chegada, cobertura parcial, gatilhos simultâneos, remessas OUT
e IN, estado final, play/pause, navegação, próximo fechamento, repetição, reload,
resize, zoom de 200%, viewport estreito e ausência de erro no console.

A página recarrega pela rota `/estudos/<uuid>/replay`; o fallback estático possui
regressão Python para aceitar exatamente essa rota e continuar recusando segmentos
extras. O E2E usa o `DiagnosticEnvelope` persistido no IndexedDB e não o job efêmero.

A prova de capacidade tentou o limite nominal de 1.000 ordens, mas o contrato de
proveniência do diagnóstico limita o caminho real a 500 entradas, ou 98 ordens com
a representação atual. Em 98 × 365 foram medidos 200.513 bytes de request, 156.112
bytes de response, builder p50 de 19,153 ms e máximo de 53,291 ms, e reconstrução
direta no browser p50 de 9,6 ms e máximo de 11,1 ms. O relatório reproduzível está
em `docs/frontend/evidencias/mot89-orcamento-1000x365.json`. Os números são regressão
técnica local, não SLA.

Gate final da branch `codex/frontend-etapa-5`:

| Verificação | Resultado |
|---|---|
| `python -m pytest -q` | 794 aprovados, 2 ignorados |
| `python -O -m pytest -q` | 794 aprovados, 2 ignorados |
| `npx vitest run --maxWorkers=1` | 477 aprovados em 67 arquivos |
| `npm run lint`, `typecheck`, `build` | aprovados |
| E2E específico, duas execuções consecutivas | 3/3 em 20,9 s; 3/3 em 22,9 s |
| Playwright local integral | 22/22 em 1,9 min |
| `git diff --check` | aprovado |

Na execução unitária padrão, 476/477 testes passaram e um caso antigo de roteamento
atingiu exatamente o timeout de 5 s sob 67 workers. O arquivo isolado passou 25/25;
a suíte integral com um worker passou 477/477. Isso reproduz a contenção de partida
já documentada na Etapa 4, sem esconder uma falha funcional ou aumentar o timeout.

A grade de 27.000 simulações não foi regenerada porque o Replay não modifica
`motor/`.

## Aceitação local da Etapa 2 — MOT-32

O comando `npm --prefix web run test:e2e` gera o bundle E2E com o SHA real do
checkout e executa, no Chromium, a fundação e os percursos `study-*`. A aceitação
cobre o caso observado confirmado até o resultado e a conciliação, as origens
sintética e manual, reload, histórico, CAS entre duas abas, isolamento de duas
contas locais controladas, migrações versionadas e recuperação de execução
interrompida.

O teste de quota usa `Storage.overrideQuotaForOrigin` em um banco-probe isolado no
Chromium. Uma transação `versionchange` idêntica completa sem override; sob o limite,
o `put` de chave única emite `success` e a própria transação aborta. No Chromium 153
observado, o override não atingiu writes em banco já inicializado, então o probe é
criado depois de ativá-lo. Essa é uma prova controlada de quota/transação, não de
esgotamento físico do disco nem do schema de produção. `blocked` usa duas conexões
reais ao IndexedDB; corrupção insere uma linha inválida e exige o erro tipado do
repositório.

O zoom de 200% é aplicado e capturado pelo Chromium no percurso observado. Não é
um teste jsdom. As requisições dos percursos são inspecionadas para impedir nome de
arquivo bruto, nome local de grupo e token em URL. O scanner adicional detecta
segredos em query strings de URLs nos arquivos rastreados e no bundle de produção.

O projeto `real-auth` continua condicionado a `MOT_REAL_AUTH_BASE_URL`,
`MOT_REAL_AUTH_EMAIL` e `MOT_REAL_AUTH_PASSWORD` fornecidos pelo ambiente. A
aceitação local não fabrica credenciais reais nem publica artefatos.

## Aceitação integrada da Etapa 3 — MOT-76

Os specs `company-profiles`, `diagnostic-jobs` e `stage2-regression` entram no
projeto Playwright local sem substituir a regressão existente. Eles percorrem a
mesma origem do servidor e cobrem Empresa→Perfil→Estudo, imutabilidade do snapshot
v1 após a criação de v2, CAS de versões em duas abas, fila diagnóstica controlada,
progresso, cancelamento, idempotência, isolamento 404 entre contas, reload de
terminal, entrada fixa sem distribuição, 10 repetições geradas, falha sem resultado
parcial e leitura dos artefatos/migrações da Etapa 2. Em 2026-09-20, os cinco testes
novos passaram juntos no Chromium local em 1,0 minuto.

O pool controlado usa `Condition`/`Future`, sem sleeps. Com dois workers e três jobs,
somente dois trabalhos são submetidos até a liberação de um slot; `max_active`
permanece 2. Cancelamento de enfileirado não cria trabalho e o fechamento espera o
pool, cancela pendências e termina com zero ativos. O runner E2E usa um worker para
manter fila e cancelamento determinísticos; o teste Python separado prova o teto 2.
Uma segunda prova usa o `DiagnosticExecutor` real com `ProcessPoolExecutor` e
contexto Windows `spawn`: eventos compartilhados bloqueiam/liberam o worker sem
sleep, o cancelamento ocorre enquanto a repetição está ativa e, após `close`, ambos
os jobs estão `CANCELLED`, o future terminou, o processo não está vivo e o dispatcher
foi encerrado.

O scanner de credenciais agora lê também arquivos binários e rejeita chamadas de
log que serializem URL completa/query, corpo, payload, cenário ou ordens. Tokens e
IDs financeiros usados na aceitação são sintéticos e não são impressos.
Chamadas Python são analisadas por AST, inclusive quando ocupam várias linhas, sem
confundir `request.url.path` com URL completa. Binários ASCII/Latin-1 e UTF-16 com
BOM ou distribuição de NUL compatível com UTF-16LE/BE são normalizados antes da
busca por formatos de segredo.

### Medição sintética 10/30/100

`python -m tests.web_api.measure_diagnostics --max-100-ms 180000` executa cada
repetição pelo `execute_repetition` real e agrega com `aggregate_diagnostic`. A
medição é serial, em processo, uma rodada por cardinalidade, com `perf_counter`; ela
inclui geração, motor, envelope de prévia, análise e agregação, mas não inclui fila,
HTTP, spawn nem latência de rede. Por isso é uma regressão técnica reproduzível, não
um benchmark de capacidade nem promessa comercial.

Ambiente local observado: Windows 11 AMD64, Python 3.12.14, 8 CPUs lógicas, um
worker da metodologia. Resultados:

| Repetições | Tempo total | Envelope JSON |
|---:|---:|---:|
| 10 | 133,3 ms | 28.281 bytes |
| 30 | 384,6 ms | 39.681 bytes |
| 100 | 959,1 ms | 64.173 bytes |

A CI registra ambiente e os três resultados e aplica somente um teto técnico amplo
de 180 s para 100 repetições. Variações entre máquinas são esperadas; os contratos
continuam limitados exatamente a 10/30/100.

O fallback do servidor estático também possui regressão para reload/deep link das
rotas públicas declaradas: `/carteira/:uuid`, `/estudos/:uuid`, o diagnóstico do
estudo e as páginas exatas de Empresa. Segmentos desconhecidos continuam 404; não há
fallback wildcard.

### Gate global final da Etapa 3

O gate foi executado uma vez no SHA
`57be68990d4f98f8d6cb4ec7c095f121566811a4`, sem mudança rastreada de produto
posterior. Os commits que o sucedem alteram somente documentação:

| Verificação | Resultado |
|---|---|
| OpenAPI + geração TypeScript + diff dos quatro artefatos | aprovado, sem drift |
| `python -m pytest -q` | 772 aprovados, 2 ignorados |
| `python -O -m pytest -q` | 772 aprovados, 2 ignorados |
| `python -m ruff check servidor tests/web_api` | aprovado |
| `python -m mypy servidor` | aprovado, 33 arquivos |
| `npm --prefix web run test:unit` | 388 aprovados em 51 arquivos |
| typecheck / lint / build | aprovados; aviso informativo de chunk > 500 kB |
| `npm --prefix web run test:e2e` | 15 aprovados em 50,2 s |
| scanner | aprovado, 378 textos e 10 binários |
| `git diff --check` | aprovado; avisos CRLF informativos |

Os dois skips são testes de symlink não permitido pelo Windows observado. Auth real
continua condicionado às variáveis `MOT_REAL_AUTH_*`.

S15.14 é provado por `diagnostic-jobs.spec.ts` no projeto `local`, Chromium Desktop,
viewport 1280 × 800 e zoom 200%. O percurso aciona o diagnóstico por `Tab`/`Enter`,
confirma foco visível, distribuição, execução selecionada, os sete eixos e rolagem
horizontal por teclado nas tabelas nomeadas. A matriz em
[`docs/frontend/etapa-3-aceitacao.md`](frontend/etapa-3-aceitacao.md) registra o
aceite técnico local `PASS`.

## Aceitação local do MVP da Etapa 4 — MOT-81

O MVP acrescenta testes unitários dos contratos de Perfil, hipótese, fingerprint,
persistência, diagnóstico por cenário e comparação. Os percursos Chromium em
`web/e2e/stage4-mvp.spec.ts` cobrem separadamente uma origem observada e uma
simulação construída com dois Perfis. Eles verificam que ordens/proveniência reais
não são regeneradas, que a simulação nasce em outro Estudo e que a linhagem dos dois
Perfis permanece congelada.

Contagens do candidato local:

| Verificação | Resultado |
|---|---|
| `npm --prefix web run test:unit` | 430 aprovados em 59 arquivos |
| typecheck / lint / build | aprovados; aviso informativo de chunk > 500 kB |
| `python -m pytest -q` | 772 aprovados, 2 ignorados |
| `python -O -m pytest -q` | 772 aprovados, 2 ignorados |
| `npm --prefix web run test:e2e` | 17 aprovados em Chromium local, 1,2 min |

A matriz e os limites de interpretação estão em
[`docs/frontend/etapa-4-mvp-aceitacao.md`](frontend/etapa-4-mvp-aceitacao.md) e o
procedimento está em
[`docs/frontend/etapa-4-mvp-operacao.md`](frontend/etapa-4-mvp-operacao.md).

Os dois percursos novos passaram duas vezes seguidas após sincronizar a navegação
pela persistência das reservas e terminais, sem sleeps. A fixture por Perfil usa dez
repetições e custos economicamente neutros porque o backend vigente pode falhar em
algumas sementes com custos não nulos na reconciliação decimal por mecanismo; essa
limitação, fora do escopo do front-end, está explicitada no runbook.

## Aceitação local da Evolução B da Etapa 4 — MOT-85

O E2E `web/e2e/stage4-evolution-b.spec.ts` cobre composição variável, duas
hipóteses nomeadas, execução, comparação estrutural, reload e conflito CAS entre
abas com preservação do rascunho perdedor. O arquivo passou 2/2 duas vezes; em uma
das rodadas foi executado junto com `stage4-mvp.spec.ts`, totalizando 4/4.

A suíte unitária passou 454/454 em 61 arquivos. Lint, typecheck e build passaram.
Os 35 testes Python diretamente ligados à preparação passaram, e o cenário Amanda
permaneceu em aproximadamente US$439k de baseline, US$249k netado, US$190k de
economia e 58,82% de netabilidade. A matriz completa está em
[`docs/frontend/etapa-4-evolucao-b-aceitacao.md`](frontend/etapa-4-evolucao-b-aceitacao.md).

## Refinamento de leitura do Replay — MOT-89

O feedback de teste interno ganhou regressões para diário acumulado limitado ao dia
selecionado, intervalo padrão de 3,2 s, persistência visual do evento por 2,6 s e
identificação explícita de autonetting intracliente versus netting multilateral. O
E2E `stage5-replay.spec.ts` também prova que um dia vazio preserva somente o histórico
anterior e que o namespace controlado funciona mesmo na presença de `.env.local`
real. As evidências atualizadas estão na matriz da Etapa 5; nenhuma regra do Motor
foi modificada e a grade de 27.000 simulações não foi repetida.
