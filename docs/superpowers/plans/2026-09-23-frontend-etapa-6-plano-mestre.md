# Front-end — Etapa 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o piloto publicado do Motor de Fluxo com importação XLSX real,
Estudo demonstrativo, exploração guiada, chat contextual, apresentação, relatório e
deploy gratuito no Render.

**Architecture:** A implementação preserva o `ApplicationRepository` local como
fonte de Estudos e Casos, usa FastAPI apenas para contratos canônicos e chat, projeta
um Documento de Comunicação imutável para todos os canais e publica Vite + FastAPI
no mesmo contêiner. O trabalho é dividido em quatro planos executáveis para que cada
subsistema termine com software testável antes do próximo.

**Tech Stack:** Python 3.12, FastAPI 0.141.1, Pydantic 2.13.5, React 19.3,
TypeScript 5.9, Vite 8.3, IndexedDB, Web Workers, Vitest 5, Playwright 1.63,
OpenAI Responses API, Docker e Render Web Service free.

**Spec:** `docs/superpowers/specs/2026-09-23-frontend-etapa-6-comunicacao-publicacao-design.md`

## Global Constraints

- Não alterar `motor/`, P0, autonetting, EDF, cálculo financeiro ou a grade histórica.
- Não executar novamente as 27.000 simulações.
- O importador termina em `ObservedCase`; não cria Estudo nem executa o motor.
- XLSX, células e nomes brutos não atravessam a rede nem persistem no IndexedDB.
- Estudos, Perfis, conversas e demonstração permanecem isolados por `projectRef` e
  `ownerSub`.
- Valores financeiros continuam strings decimais; indisponível nunca vira zero.
- O chat não possui web, file search, código, MCP ou ferramentas de escrita.
- Resposta fora do escopo é exatamente: `Posso ajudar apenas com o Motor de Fluxo,
  o funcionamento da aplicação e os dados deste projeto.`
- OpenAI usa `store: false`; a chave existe somente no servidor.
- O plano gratuito do Render não recebe keep-alive artificial nem persistência em
  filesystem.
- Todo commit atualiza `docs/DIARIO-DE-MUDANCAS.md` e usa um ID Linear real.
- Push, merge, criação do serviço Render e deploy continuam dependendo de autorização.

---

## Decomposição executável

| Ordem | Plano | Saída independente |
|---|---|---|
| 1 | `2026-09-23-frontend-etapa-6a-importacao-plano.md` | XLSX canônico → Caso → Empresa → Perfil → Estudo |
| 2 | `2026-09-23-frontend-etapa-6b-demonstracao-comunicacao-plano.md` | demonstração, composição guiada e Documento de Comunicação |
| 3 | `2026-09-23-frontend-etapa-6c-chat-plano.md` | chat global contextual e restrito ao projeto |
| 4 | `2026-09-23-frontend-etapa-6d-apresentacao-publicacao-plano.md` | Painel A, PDF, acessibilidade, Docker, Render e aceite |

Dependências:

```text
6A ────────┐
           ├── 6B ── 6C ── 6D
Etapa 5 ───┘              └── publicação autorizada
```

6A e o gerador do pacote demonstrativo de 6B podem ser preparados em paralelo, mas
o aceite de 6B usa o percurso real de 6A. 6C depende do Documento de Comunicação de
6B. 6D depende dos componentes de comunicação e do shell de chat.

## Rastreabilidade do escopo aprovado

| Resultado aprovado | Plano/tasks | Evidência de fechamento |
|---|---|---|
| XLSX local até Caso, Empresa, Perfil e Estudo | 6A / A0–A6 | unitários do parser/publisher + E2E de importação e privacidade |
| Estudo demonstrativo atual, cinco mixes e edição guiada | 6B / B1–B3 e B6 | reconciliação com motor vigente + E2E dos cinco cenários |
| Documento único e catálogo de ajuda | 6B / B4–B6 | fixtures cruzadas, fingerprint e igualdade entre superfícies |
| Chat global, histórico e contexto | 6C / C1–C3 | storage/session tests + matriz de rotas |
| Restrição temática e respostas fundamentadas | 6C / C4–C6 | testes adversariais, ferramentas allowlist e E2E com provider fake |
| Painel A contínuo | 6D / D1 | fidelidade numérica, deep links e teste de componente/rota |
| Relatório salvo como PDF pelo navegador | 6D / D2 | comparação textual e renderização visual de todas as páginas |
| Acessibilidade, visual e desempenho | 6D / D3 | teclado/zoom/reduced motion, snapshots e budgets medidos |
| Contêiner e Render free | 6D / D4–D5 | smoke da imagem, scanner e teste estrutural do Blueprint |
| Piloto utilizável pela Amanda | 6D / D6 | aceite local separado de smoke HTTPS publicado |

Requisitos transversais de isolamento por owner, ausência de regra financeira em
JavaScript, ausência de XLSX na rede, segredo OpenAI apenas no servidor, logs sem
payload e indisponível distinto de zero aparecem nos gates dos quatro planos e no
gate global.

## Roteamento de modelos dos agentes

A matriz usa a família GPT-6 conforme o perfil oficial: Astra para trabalho
end-to-end de maior risco, Sol como equilíbrio de inteligência/custo em coding e
Luna para trabalho focado e repetitivo em volume. Ela orienta os agentes que
implementam o plano; não escolhe o `OPENAI_CHAT_MODEL` usado pelo chat do produto.

| Task | Modelo primário | Esforço | Revisão/auxiliar | Motivo |
|---|---|---|---|---|
| M0, A0 | `gpt-6-astra` | high | — | reconciliação de branches, contratos e baseline |
| A1 | `gpt-6-luna` | high | `gpt-6-sol` medium | portabilidade mecânica coberta por regressões existentes |
| A2 | `gpt-6-sol` | high | — | domínio, validação e correções do importador |
| A3 | `gpt-6-astra` | high | — | transação, CAS, owner e persistência canônica |
| A4 | `gpt-6-luna` | high | `gpt-6-sol` medium | reconciliação focada de catálogo e contratos |
| A5 | `gpt-6-sol` | high | — | fluxo React completo e integração entre entidades |
| A6 | `gpt-6-astra` | high | — | privacidade e aceite ponta a ponta da importação |
| B1 | `gpt-6-sol` | high | — | geração determinística e reconciliação dos cinco mixes |
| B2 | `gpt-6-astra` | high | — | instalação/remoção atômica e recovery |
| B3 | `gpt-6-sol` | medium | — | descoberta e edição guiada da composição |
| B4 | `gpt-6-astra` | high | — | contrato numérico compartilhado por três superfícies |
| B5 | `gpt-6-luna` | high | `gpt-6-sol` medium | catálogo versionado e endpoint focado |
| B6 | `gpt-6-sol` | high | — | aceite integrado de demonstração e comunicação |
| C1 | `gpt-6-astra` | high | — | migration, concorrência, quotas e isolamento |
| C2 | `gpt-6-sol` | high | — | shell global, rotas e foco |
| C3–C4 | `gpt-6-astra` | high | — | API externa, segredo, escopo e ferramentas strict |
| C5 | `gpt-6-sol` | high | — | cliente, contexto mínimo e citações |
| C6 | `gpt-6-astra` | high | — | testes adversariais, privacidade e aceite do chat |
| D1–D2 | `gpt-6-sol` | high | `gpt-6-luna` high para fixtures | qualidade visual, impressão e fidelidade numérica |
| D3 | `gpt-6-sol` | high | `gpt-6-luna` high para matrizes/snapshots | medição repetitiva com diagnóstico no modelo equilibrado |
| D4–D5 | `gpt-6-astra` | high | — | contêiner, CSP, segredos e infraestrutura externa |
| D6 | `gpt-6-astra` | high | — | aceite transversal e decisão de liberação |

Regras de escalonamento:

- Luna nunca fecha sozinho persistência, contrato numérico, autenticação, segurança,
  API externa ou infraestrutura.
- Uma task sobe Luna → Sol → Astra quando surgir mudança de contrato, risco sistêmico
  ou duas tentativas verificadas falharem pela mesma causa.
- O modelo não é rebaixado no meio de uma task. A task seguinte volta à matriz.
- Revisão obrigatória não repete toda a implementação: inspeciona o risco indicado e
  exige os mesmos gates objetivos.
- O executor registra no Diário qualquer desvio da matriz e a evidência que o
  justificou.

## Gate Linear

Issues criadas no Linear em 2026-09-23 após autorização explícita do Gabriel:

| ID | Título | Bloqueada por | Plano |
|---|---|---|---|
| MOT-90 | Etapa 6 / T0 — Gate, base e reconciliação da importação | — | mestre, 6A |
| MOT-91 | Etapa 6 / T1 — Estudo demonstrativo e exploração guiada | MOT-90 | 6B |
| MOT-92 | Etapa 6 / T2 — Documento de Comunicação e catálogo de ajuda | MOT-91 | 6B |
| MOT-93 | Etapa 6 / T3 — Histórico local e shell global do chat | MOT-92 | 6C |
| MOT-94 | Etapa 6 / T4 — API de chat, provedor OpenAI e restrição temática | MOT-93 | 6C |
| MOT-95 | Etapa 6 / T5 — Chat contextual, evidências e acessibilidade | MOT-94 | 6C |
| MOT-96 | Etapa 6 / T6 — Painel Apresentação e relatório imprimível | MOT-92, MOT-93 | 6D |
| MOT-97 | Etapa 6 / T7 — Acessibilidade, desempenho e regressão visual | MOT-95, MOT-96 | 6D |
| MOT-98 | Etapa 6 / T8 — Contêiner e configuração Render free | MOT-95, MOT-96 | 6D |
| MOT-99 | Etapa 6 / T9 — Aceitação publicada e handoff | MOT-97, MOT-98 | 6D |

As MOT-49 a MOT-61 já existem e permanecem `In Review`. Elas continuam responsáveis
pelos módulos de importação correspondentes. O T0 novo registra a reconciliação
entre essa pilha e as Etapas 2–5; não reabre nem reescreve a descrição das issues
antigas.

### Task M0: Fechar o gate documental e de issues

**Files:**
- Modify: `docs/superpowers/plans/2026-09-23-frontend-etapa-6-plano-mestre.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: dez issues criadas no projeto `Motor de fluxo de CNR`, time
  `MOTOR DE FLUXO`.
- Produces: tabela título → ID real, dependências verificadas e autorização de
  execução dos quatro planos.

- [x] **Step 1: Consultar os dez títulos exatos no Linear**

Use busca read-only. Registre identificador, status e relações. Se qualquer título
não existir, pare; não crie nem renomeie autonomamente.

- [x] **Step 2: Substituir esta seção por uma tabela de IDs reais**

A tabela final contém `ID`, `título`, `bloqueada por` e `plano`. Não conservar
identificadores desejados ou intervalos hipotéticos.

- [x] **Step 3: Registrar baseline Git**

```powershell
git status --short --branch
git rev-parse HEAD
git merge-base HEAD origin/test/importacao-xlsx-aceitacao
git rev-list --left-right --count HEAD...origin/test/importacao-xlsx-aceitacao
```

Resultado de 2026-09-23: branch `codex/frontend-etapa-6-planejamento`, HEAD
`d9640243a288be0d42dd382d2775dde3e3ebd184`, merge-base
`c2ad1755899ddeafdf30f70350b5025ca55ddbaa` e divergência `100 16`, sem merge.

- [x] **Step 4: Rodar o baseline completo**

```powershell
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
git diff --check
```

Resultado de 2026-09-23:

- pytest: 794 passed, 2 skipped, tanto normal quanto sob `python -O`;
- TypeScript e ESLint: PASS;
- Vitest: 67 arquivos e 481 testes PASS;
- Vite build: PASS, com warning preexistente de chunks acima de 500 kB;
- Playwright local: 22 testes PASS;
- scanner: PASS, 450 textos e 17 binários;
- Ruff: baseline RED com 308 achados preexistentes;
- mypy: baseline RED com 30 erros preexistentes, todos em `servidor/replay.py`.

Os dois últimos gates ficam como dívida explícita de T0/A0 e devem ser corrigidos ou
ter seu contrato de lint deliberadamente configurado antes do primeiro commit de
código de produto. Não foram mascarados nem corrigidos fora de escopo.

- [x] **Step 5: Commitar especificação e planos com MOT-90**

Inclua especificação, quatro planos, MAPA e Diário no mesmo commit. Mensagem:
`docs: planeja execução da etapa 6 (MOT-90)`.

## Estratégia de integração e commits

- Cada task dos planos filhos termina em um commit focado com a issue indicada.
- Código portado da pilha de importação conserva autoria Git quando cherry-pick for
  limpo; quando houver reescrita material, o diff cita o commit-fonte no Diário.
- Nenhum task novo usa MOT-49–MOT-61 para trabalho de chat, apresentação ou deploy.
- Um task só muda para `Done` após suas evidências reais estarem no Linear.
- O último task não faz push, merge ou deploy sem autorização, mesmo com gates verdes.

## Gate global de conclusão

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

Depois do deploy autorizado, o Playwright opt-in contra a URL Render comprova login,
XLSX local, demonstração, chat, apresentação, PDF e deep links. Resultado local não
substitui smoke test publicado; cold start documentado não é falha.

## Condição de conclusão

A Etapa 6 só termina quando a Amanda consegue, numa URL HTTPS normal, entrar com sua
conta, importar um XLSX sem enviá-lo ao servidor, formar Perfil e Estudo, executar o
diagnóstico, entender a repetição aberta no Replay, consultar o chat restrito ao
projeto, abrir o Painel A e salvar um PDF numericamente idêntico. O Estudo
demonstrativo oferece um caminho imediato, mas não substitui esse percurso real.
