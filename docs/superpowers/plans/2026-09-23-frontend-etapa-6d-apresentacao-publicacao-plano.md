# Etapa 6D — Apresentação e Publicação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o Painel A, um relatório imprimível fiel ao mesmo documento,
acessibilidade e desempenho aceitos, e um contêiner único pronto para o piloto no
Render free.

**Architecture:** `CommunicationDocumentV1` é a única fonte numérica de tela e
impressão. O Painel A compõe seções reutilizáveis e usa CSS de impressão no próprio
navegador, sem gerar PDF no servidor. Vite é compilado numa etapa Node do Docker e
servido pelo FastAPI na mesma origem; o Render injeta variáveis públicas como build
args e segredos apenas no runtime.

**Tech Stack:** React, TypeScript, CSS print media, Vitest, Playwright, FastAPI,
Uvicorn, Docker multi-stage, Python 3.12, Node 24 e Render Web Service free.

**Spec:** `docs/superpowers/specs/2026-09-23-frontend-etapa-6-comunicacao-publicacao-design.md`

## Global Constraints

- Painel e impressão leem o mesmo `CommunicationDocumentV1`; nenhum componente
  recalcula valor financeiro.
- Indisponível aparece como indisponível; nunca como zero, vazio ou número inferido.
- O relatório usa impressão nativa do navegador. O servidor não recebe conteúdo do
  Estudo e não produz nem armazena PDF.
- Chat, navegação interativa e controles de edição não aparecem na impressão.
- O piloto mantém Supabase e APIs na mesma origem lógica já contratada; não cria
  banco, disco persistente ou worker no Render.
- O plano `free` pode dormir. O produto deve explicar o cold start e não usa ping ou
  keep-alive artificial.
- Variáveis `VITE_*` são públicas e entram no build; `OPENAI_API_KEY` e segredos
  Supabase jamais entram em `ARG`, imagem, bundle ou logs.
- Tasks usam MOT-96 (apresentação/PDF), MOT-97 (qualidade), MOT-98 (Render) e
  MOT-99 (aceite/handoff).

## Model routing

| Tasks | Modelo | Esforço | Regra |
|---|---|---|---|
| D1–D2 | `gpt-6-sol` | high | Luna high somente em fixtures repetitivas |
| D3 | `gpt-6-sol` | high | Luna high em matrizes/snapshots |
| D4–D5 | `gpt-6-astra` | high | contêiner, segurança e infraestrutura |
| D6 | `gpt-6-astra` | high | aceite transversal e liberação |

Luna não aprova sozinho fidelidade numérica ou regressão visual. Aplicam-se as
regras de escalonamento do plano mestre; registre desvios no Diário.

Referências operacionais do provedor:

- `https://render.com/docs/docker`
- `https://render.com/docs/blueprint-spec`
- `https://render.com/docs/configure-environment-variables`

---

### Task D1: Montar o Painel A a partir do Documento de Comunicação

**Issue:** MOT-96 — `Etapa 6 / T6 — Painel Apresentação e relatório imprimível`.

**Files:**
- Create: `web/src/presentation/domain.ts`
- Create: `web/src/presentation/PresentationPage.tsx`
- Create: `web/src/presentation/PresentationPage.test.tsx`
- Create: `web/src/presentation/components/PresentationHeader.tsx`
- Create: `web/src/presentation/components/ExecutiveSummary.tsx`
- Create: `web/src/presentation/components/CompositionSection.tsx`
- Create: `web/src/presentation/components/ComparisonSection.tsx`
- Create: `web/src/presentation/components/ReplayHighlightsSection.tsx`
- Create: `web/src/presentation/components/AssumptionsSection.tsx`
- Create: `web/src/presentation/components/LimitationsSection.tsx`
- Create: testes unitários correspondentes
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/router.test.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `servidor/static.py`
- Modify: `tests/web_api/test_static.py`

**Interfaces:**
- Consumes: `CommunicationDocumentV1`, seleção de hipótese e execução do Estudo.
- Produces:

```ts
export type PresentationSelection = Readonly<{
  studyId: string;
  scenarioId: string;
  diagnosticExecutionId: string;
}>;

export type PresentationSectionId =
  | 'resumo'
  | 'composicao'
  | 'comparacao'
  | 'replay'
  | 'premissas'
  | 'limitacoes';
```

- Route: `/estudos/:studyId/apresentacao?cenario=:scenarioId&execucao=:executionId`.
- Deep link de seção: fragmento `#resumo`, `#composicao`, `#comparacao`, `#replay`,
  `#premissas` ou `#limitacoes`.

- [ ] **Step 1: Escrever testes de rota e seleção**

Cubra URL completa, parâmetros ausentes, Estudo de outro owner, cenário removido,
execução incompatível e fragmento de seção. Estado inválido volta ao seletor do
Estudo com mensagem acionável; não escolhe silenciosamente outro cenário.

- [ ] **Step 2: Escrever testes de fidelidade numérica**

Monte fixture com decimal grande, negativo, indisponível e unidades BRL/USD/bps/%.
Cada texto numérico renderizado deve vir do formatter canônico e possuir o mesmo
`sourceId`/`evidenceId` do documento. Proíba `Number(...)`, divisão e agregação nos
componentes de apresentação com teste de arquitetura.

- [ ] **Step 3: Implementar o esqueleto contínuo**

Renderize cabeçalho, resumo executivo, composição, comparação, destaques do Replay,
premissas e limitações numa única página vertical. Preserve a direção visual
Fronteira Viva, mas reduza movimento: a apresentação é leitura, não simulação.

- [ ] **Step 4: Implementar estados honestos**

Loading usa estrutura estável; documento ausente oferece regeneração; evidência
ausente mostra o motivo; erro não conserva números de um documento anterior.

- [ ] **Step 5: Integrar navegação e chat**

Adicione “Apresentar” ao contexto do Estudo. O chat global recebe `routeId` e
`helpId` de cada seção. Voltar conserva a seleção do Estudo sem duplicar execução.

- [ ] **Step 6: Permitir a rota no servidor estático**

Amplie `_STUDY_PATH` somente para o segmento `apresentacao` e teste deep link,
fragmento no cliente e rejeição de paths parecidos.

- [ ] **Step 7: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/presentation src/app/router.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
python -m pytest tests/web_api/test_static.py -q
```

Expected: PASS.

- [ ] **Step 8: Commitar**

Commit `feat: adiciona painel continuo de apresentacao (MOT-96)`.

### Task D2: Produzir impressão/PDF fiel e verificável

**Issue:** MOT-96.

**Files:**
- Create: `web/src/presentation/PrintActions.tsx`
- Create: `web/src/presentation/PrintMetadata.tsx`
- Create: `web/src/styles/print.css`
- Create: testes unitários correspondentes
- Create: `web/e2e/stage6-presentation.spec.ts`
- Create: `tests/web_api/render_stage6_pdf.py`
- Modify: `web/src/presentation/PresentationPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/playwright.config.ts`
- Modify: `pyproject.toml`
- Modify: `requirements/web-dev.lock`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: o mesmo DOM semântico do Painel A.
- Produces: `window.print()` e PDF local do navegador, sem upload.
- Metadata impressa: nome do Estudo, cenário, execução, `generatedAt`, versão do
  documento e build SHA; nunca inclui token, ownerSub ou identificador de sessão.

- [ ] **Step 1: Escrever teste de modo impressão**

Verifique que chat, navegação, botões, tooltips e controles desaparecem; títulos,
fontes, unidades, premissas, limitações e metadata permanecem. `beforeprint` não
altera documento nem IndexedDB.

- [ ] **Step 2: Implementar CSS paginado**

Defina `@page` A4 retrato, margens de 12 mm, cores imprimíveis, quebras antes de
seções extensas e regras para não separar título, métrica e fonte. Tabelas repetem
cabeçalho e gráficos possuem alternativa textual impressa.

- [ ] **Step 3: Implementar ação “Salvar PDF”**

O botão chama `window.print()` e explica que o usuário deve escolher “Salvar como
PDF”. Não prometa download automático nem retenha o arquivo.

- [ ] **Step 4: Gerar PDF de aceite em browser controlado**

O teste Playwright abre a fixture canônica, emula `print`, salva um PDF temporário e
compara textos extraídos com o `CommunicationDocumentV1`. O helper Python usa
`PyMuPDF==1.28.2`, adicionado ao extra `web-dev` e ao lock de desenvolvimento, para
renderizar cada página em PNG; ele não entra na imagem de produção.

- [ ] **Step 5: Verificar páginas renderizadas**

Falhe para página em branco, conteúdo cortado, texto fora do media box, seção
ausente, sobreposição detectável ou quantidade inesperada de páginas. Salve PDF e
PNGs de evidência somente no diretório temporário no teste comum; copie para
`docs/frontend/evidencias/etapa-6/` apenas no fechamento T9.

- [ ] **Step 6: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/presentation
npm --prefix web run test:e2e -- stage6-presentation.spec.ts
python tests/web_api/render_stage6_pdf.py --check-only
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PDF e imagens válidos; PASS.

- [ ] **Step 7: Commitar**

Commit `feat: adiciona relatorio imprimivel fiel (MOT-96)`.

### Task D3: Fechar acessibilidade, regressão visual e orçamento de desempenho

**Issue:** MOT-97 — `Etapa 6 / T7 — Acessibilidade, desempenho e regressão visual`.

**Files:**
- Create: `web/e2e/stage6-accessibility.spec.ts`
- Create: `web/e2e/stage6-visual.spec.ts`
- Create: `web/e2e/stage6-performance.spec.ts`
- Create: `web/e2e/helpers/accessibilityAudit.ts`
- Create: `tests/web_api/measure_stage6.py`
- Create: `docs/frontend/etapa-6-acessibilidade-desempenho.md`
- Create: baseline screenshots em `web/e2e/stage6-visual.spec.ts-snapshots/`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: componentes/CSS somente para defeitos encontrados
- Modify: `.github/workflows/test.yml`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: fluxo completo 6A–6D e datasets observado, demonstrativo e sintético.
- Produces: gate automatizado e checklist manual reproduzível.

**Orçamentos:**

| Medida | Limite de aceite |
|---|---:|
| JS inicial comprimido por rota pública | ≤ 350 KiB gzip |
| Chunk lazy de apresentação | ≤ 300 KiB gzip |
| Long task em interação principal | nenhuma > 200 ms |
| Abertura do Painel A após documento local pronto, fixture de aceite | p95 ≤ 1.500 ms |
| Troca de seção/foco | p95 ≤ 100 ms |
| Geração do Documento de Comunicação, fixture de aceite | p95 ≤ 2.000 ms |
| Layout shift acumulado no carregamento | ≤ 0,10 |

Os limites valem na máquina/runner documentado, após uma rodada de aquecimento e
20 amostras. O dataset máximo aceito é o maior efetivamente medido e registrado;
não se anuncia “milhares” ou 1.000×365 sem evidência nova.

- [ ] **Step 1: Instalar e encapsular a auditoria de acessibilidade**

Adicione `@axe-core/playwright@4.13.0` como dev dependency exata.
`accessibilityAudit.ts` executa Axe nas páginas estáveis e complementa o resultado
com ordem de heading, foco oculto, regiões live e target mínimo. Os testes
específicos continuam validando comportamento; a auditoria não é declarada
certificação WCAG.

- [ ] **Step 2: Cobrir teclado, zoom e leitura**

Percorra importação, demonstração, chat, apresentação e impressão sem mouse.
Verifique foco visível, escape, retorno de foco, ordem do DOM, 200% zoom em
1280×720, 400% em 1280×720 para conteúdo linear e prefers-reduced-motion.

- [ ] **Step 3: Fixar regressão visual deliberada**

Capture login, importação, Estudo demonstrativo, chat aberto, Painel A e duas
páginas impressas no Chromium Linux da CI. Mascare apenas timestamp/build SHA;
valores e conteúdo não podem ser mascarados. Atualização de snapshot exige inspeção
humana e motivo no Diário.

- [ ] **Step 4: Medir carga real**

Use as fixtures atuais da Etapa 4/5, um XLSX observado anonimizado e o pacote
demonstrativo. Meça tamanho de bundle, long tasks, latência local e memória. Não
rode a grade de 27.000 simulações.

- [ ] **Step 5: Aplicar code splitting**

Carregue importador, Replay, chat e apresentação por rota/painel. Não carregue
OpenAI, XLSX, ECharts ou Replay na tela de login. Registre chunks e budgets no
artefato da medição.

- [ ] **Step 6: Fazer verificação manual visual**

Inspecione 1280×720, 1440×900 e viewport móvel de 390×844; modo claro vigente,
impressão A4 e reduced motion. Registre defeitos corrigidos e limitações aceitas.

- [ ] **Step 7: Rodar gate T7**

```powershell
npm --prefix web run build
npm --prefix web run test:e2e -- stage6-accessibility.spec.ts stage6-visual.spec.ts stage6-performance.spec.ts
python tests/web_api/measure_stage6.py --assert-budget
npm --prefix web run typecheck
npm --prefix web run lint
git diff --check
```

Expected: todos os budgets e snapshots passam.

- [ ] **Step 8: Commitar**

Commit `test: fecha acessibilidade visual e desempenho (MOT-97)`.

### Task D4: Empacotar Vite + FastAPI em contêiner único

**Issue:** MOT-98 — `Etapa 6 / T8 — Contêiner e configuração Render free`.

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `requirements/web.lock`
- Create: `tests/web_api/test_container_contract.py`
- Create: `servidor/security_headers.py`
- Create: `tests/web_api/test_security_headers.py`
- Create: `scripts/smoke_container.py`
- Modify: `servidor/__main__.py`
- Modify: `servidor/config.py`
- Modify: `servidor/app.py`
- Modify: `tests/web_api/test_server_entrypoint.py`
- Modify: `.env.example`
- Modify: `web/.env.example`
- Modify: `README.md`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes build args públicos:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MOTOR_BUILD_SHA`.
- Consumes runtime:
  `PORT`, `HOST`, `APP_ENV`, `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`,
  `SUPABASE_JWT_AUDIENCE`, `SUPABASE_ALLOWED_USER_IDS`, `MOTOR_BUILD_SHA`,
  `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `CHAT_ENABLED`,
  `OPENAI_CHAT_TIMEOUT_SECONDS`,
  `OPENAI_CHAT_MAX_OUTPUT_TOKENS`.
- Produces uma imagem não-root, porta `$PORT`, health em `/api/v1/health` e SPA/API
  na mesma origem.

- [ ] **Step 1: Escrever contrato do entrypoint**

Teste defaults locais `127.0.0.1:8000`, produção `0.0.0.0:$PORT`, porta inválida,
workers=1 e access log sem payload. Faça parsing em função pura antes de iniciar
Uvicorn.

- [ ] **Step 2: Fixar dependências de produção**

Gere `requirements/web.lock` do extra web com hashes/versões resolvidas e teste que
não contém pytest, Playwright, PyMuPDF ou ferramentas de desenvolvimento.

- [ ] **Step 3: Aplicar headers de segurança proporcionais**

Adicione CSP sem origem OpenAI no browser: `default-src 'self'`, scripts somente da
origem, imagens `self data:`, frames proibidos e `connect-src` limitado à mesma
origem e ao host Supabase público configurado. Inclua `frame-ancestors 'none'`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy` e `Permissions-Policy`. Teste
login, assets e API; valores secretos nunca compõem headers.

- [ ] **Step 4: Escrever Docker multi-stage**

Stage Node 24 instala com `npm ci` e compila Vite usando somente os três `ARG`
públicos. Stage Python 3.12 instala o lock, copia código e `web/dist`, define
`WEB_DIST_DIR=/app/web/dist`, cria usuário sem root e inicia `python -m servidor`.
Use `PYTHONDONTWRITEBYTECODE=1` e `PYTHONUNBUFFERED=1`.

- [ ] **Step 5: Reduzir contexto e segredos**

`.dockerignore` exclui `.git`, worktrees, `.env*` exceto examples, `node_modules`,
resultados grandes, evidências temporárias, caches, coverage e chaves. Um teste
estático falha se `OPENAI_API_KEY`, service role ou JWT secret aparecerem como
`ARG`/`ENV` no Dockerfile.

- [ ] **Step 6: Testar imagem localmente**

```powershell
docker build --build-arg VITE_SUPABASE_URL=https://example.supabase.co --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test --build-arg VITE_MOTOR_BUILD_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -t motor-de-fluxo:etapa-6 .
python scripts/smoke_container.py --image motor-de-fluxo:etapa-6
```

O smoke sobe porta efêmera com variáveis sintéticas, espera health, consulta login,
asset versionado, deep link e 404 seguro, depois remove somente o contêiner nomeado
pelo script.

- [ ] **Step 7: Escanear imagem e bundle**

Procure padrões de credencial, `.env`, fixtures observadas, nomes reais e logs de
chat. Confirme usuário não-root e filesystem sem dependência de escrita persistente.

- [ ] **Step 8: Rodar gates**

```powershell
python -m pytest tests/web_api/test_server_entrypoint.py tests/web_api/test_container_contract.py tests/web_api/test_security_headers.py -q
python -m tests.web_api.scan_credentials
docker build --build-arg VITE_SUPABASE_URL=https://example.supabase.co --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test --build-arg VITE_MOTOR_BUILD_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -t motor-de-fluxo:etapa-6 .
python scripts/smoke_container.py --image motor-de-fluxo:etapa-6
```

Expected: PASS.

- [ ] **Step 9: Commitar**

Commit `build: empacota piloto em conteiner unico (MOT-98)`.

### Task D5: Declarar o serviço Render free sem publicar

**Issue:** MOT-98.

**Files:**
- Create: `render.yaml`
- Create: `docs/deploy-render.md`
- Create: `tests/web_api/test_render_blueprint.py`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Produces um Blueprint com um serviço `web`, `runtime: docker`, `plan: free`,
  `dockerfilePath: ./Dockerfile`, `dockerContext: .`, `healthCheckPath:
  /api/v1/health` e `autoDeployTrigger: off`.
- Variáveis públicas podem ser `sync: false`, embora virem build args no Docker do
  Render. Segredos são `sync: false` e jamais recebem valor no YAML.

- [ ] **Step 1: Escrever teste estrutural do Blueprint**

Carregue YAML e exija exatamente um web service, plano free, health, Docker root,
auto deploy desligado, nenhuma database/disk/cron e nenhum valor parecido com chave.

- [ ] **Step 2: Declarar variáveis**

Marque `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`,
`VITE_MOTOR_BUILD_SHA`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`,
`SUPABASE_ALLOWED_USER_IDS`, `MOTOR_BUILD_SHA`, `OPENAI_API_KEY` e
`OPENAI_CHAT_MODEL` com `sync: false`. Fixe `APP_ENV=production`,
`CHAT_ENABLED=true`, `HOST=0.0.0.0` e `WEB_DIST_DIR=/app/web/dist`. Use `PORT`
fornecida pelo Render, sem sobrescrevê-la.

- [ ] **Step 3: Documentar criação e rollback**

Explique Blueprint, preenchimento de variáveis, convite Supabase da Amanda, URLs de
callback, primeiro deploy, cold start, logs sem payload, rollback por commit e
desativação do chat sem derrubar o produto.

- [ ] **Step 4: Validar sem criar serviço**

Rode teste local e, se a CLI Render autenticada estiver disponível, apenas
validação read-only do Blueprint. Não conecte repositório, não crie serviço e não
dispare deploy nesta task.

- [ ] **Step 5: Rodar gates**

```powershell
python -m pytest tests/web_api/test_render_blueprint.py tests/web_api/test_container_contract.py -q
python -m tests.web_api.scan_credentials
git diff --check
```

Expected: PASS; Blueprint pronto, sem publicação.

- [ ] **Step 6: Commitar**

Commit `build: declara piloto render free (MOT-98)`.

### Task D6: Executar aceite final local e preparar o handoff publicado

**Issue:** MOT-99 — `Etapa 6 / T9 — Aceitação publicada e handoff`.

**Files:**
- Create: `web/e2e/stage6-acceptance.spec.ts`
- Create: `web/e2e/stage6-render-smoke.spec.ts`
- Create: `docs/frontend/etapa-6-operacao.md`
- Create: `docs/frontend/etapa-6-aceitacao.md`
- Create: `docs/frontend/evidencias/etapa-6/README.md`
- Modify: `web/playwright.config.ts`
- Modify: `web/scripts/run-real-e2e.mjs`
- Modify: `.github/workflows/test.yml`
- Modify: `docs/MAPA.md`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: 6A–6D completas.
- Produces dois gates separados:
  `LOCAL_ACCEPTANCE=PASS|FAIL` e `PUBLISHED_ACCEPTANCE=PASS|FAIL|NOT_RUN`.

- [ ] **Step 1: Escrever jornada local integral**

Com auth fake, importe XLSX observado anonimizado, forme Empresa/Perfil/Estudo,
execute diagnóstico, explore composição e repetição, use Replay, faça perguntas
in-scope e fora de escopo com provider fake, abra Painel A e gere PDF. Recarregue e
teste deep links; números precisam reconciliar em todas as superfícies.

- [ ] **Step 2: Escrever jornada demonstrativa**

Instale o Estudo demonstrativo, percorra os cinco mixes, altere composição permitida,
identifique que são novas execuções, consulte chat e apresentação, remova e restaure
o pacote. Dados demonstrativos nunca aparecem como observados.

- [ ] **Step 3: Matriz de falhas**

Cubra XLSX inválido, IndexedDB indisponível, job expirado com resultado local,
offline depois de carregar, chat desabilitado/timeout, OpenAI recusando resposta,
refresh em rota profunda, logout/troca de conta e cold start simulado.

- [ ] **Step 4: Fechar documentação local**

Registre hash, browser, fixtures, resultados, limites efetivamente medidos,
limitações e passo a passo para Gabriel e Amanda. Marque publicação como NOT_RUN
até haver URL e autorização; nunca promova aceite local a publicado.

- [ ] **Step 5: Rodar gate global local**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --exit-code -- contracts web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts
python -m pytest -q
python -O -m pytest -q
python -m ruff check servidor tests
python -m mypy servidor
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run test:unit
npm --prefix web run build
npm --prefix web run test:e2e
python -m tests.web_api.scan_credentials
docker build --build-arg VITE_SUPABASE_URL=https://example.supabase.co --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test --build-arg VITE_MOTOR_BUILD_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -t motor-de-fluxo:etapa-6 .
python scripts/smoke_container.py --image motor-de-fluxo:etapa-6
git diff --check
```

Expected: `LOCAL_ACCEPTANCE=PASS`.

- [ ] **Step 6: Commitar fechamento local**

Commit `test: fecha aceite local da etapa 6 (MOT-99)`. Não marque a issue
Done enquanto `PUBLISHED_ACCEPTANCE` for NOT_RUN.

- [ ] **Step 7: Aguardar autorização de publicação**

Push, PR, merge, criação/sincronização do Blueprint, configuração de segredos,
callbacks Supabase e primeiro deploy são mudanças externas e continuam fora da
autorização deste plano.

- [ ] **Step 8: Após autorização, executar smoke na URL Render**

O teste opt-in exige `MOT_STAGE6_RENDER_BASE_URL`, usuário piloto e senha efêmera.
Comprova HTTPS, login real, convite, importação local, demonstração, chat real com
pergunta sintética, apresentação, impressão, reload e deep links. Não envia planilha
real nem dados financeiros ao chat.

- [ ] **Step 9: Capturar evidências e fechar o aceite publicado**

Registre URL, deploy ID, commit SHA, horário/cold start, screenshots, PDF anonimizado
e resultado do smoke. Atualize `PUBLISHED_ACCEPTANCE=PASS`, Diário e Linear somente
depois da verificação. Commit `docs: registra aceite publicado da etapa 6 (MOT-99)`.

## Condição de conclusão de 6D

6D termina somente quando o Painel A e o PDF mostram o mesmo documento reconciliado,
os gates visuais/acessíveis/de desempenho estão verdes, a imagem única passa no
smoke local e o Blueprint free está validado. A Etapa 6 inteira só termina após um
deploy autorizado e o smoke HTTPS publicado; antes disso, o estado correto é
“aceite local PASS, publicação NOT_RUN”.
