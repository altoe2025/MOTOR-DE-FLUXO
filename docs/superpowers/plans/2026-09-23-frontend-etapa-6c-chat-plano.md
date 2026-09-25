# Etapa 6C — Chat Contextual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um chat global que explica o produto e o Estudo aberto, cita
evidências reais e recusa qualquer assunto fora do Motor de Fluxo.

**Architecture:** Conversas vivem no IndexedDB por sessão; o front envia pergunta,
contexto tipado e fragmento mínimo do Documento de Comunicação. FastAPI classifica
escopo, executa ferramentas próprias somente leitura sobre o payload e chama a
Responses API sem estado remoto (`store: false`).

**Tech Stack:** React, IndexedDB, FastAPI, Pydantic, httpx, OpenAI Responses API,
Vitest, pytest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-frontend-etapa-6-comunicacao-publicacao-design.md`

## Global Constraints

- Chave OpenAI nunca entra no bundle, logs ou respostas públicas.
- Usar `POST /v1/responses`, `store: false` e Structured Outputs.
- Não usar Conversations API nem `previous_response_id` persistido.
- Ferramentas permitidas são apenas as seis funções de leitura da spec.
- No máximo uma requisição ativa por painel, quatro tool calls e duas rodadas de tool
  output por pergunta.
- Pergunta máxima 4.000 caracteres; request máximo 1 MiB; resposta máxima 12.000.
- Máximo 100 mensagens por conversa e 20 conversas por Estudo.
- `OUT_OF_SCOPE` é substituído server-side pela frase fixa aprovada.
- Chat desabilitado ou indisponível não bloqueia produto.
- Tasks usam MOT-93 (storage/shell), MOT-94 (API/provedor) e MOT-95 (integração/aceite).

## Model routing

| Tasks | Modelo | Esforço | Regra |
|---|---|---|---|
| C1 | `gpt-6-astra` | high | migration, concorrência e isolamento |
| C2 | `gpt-6-sol` | high | shell, rotas e foco |
| C3–C4 | `gpt-6-astra` | high | API, segredo, escopo e ferramentas |
| C5 | `gpt-6-sol` | high | cliente, contexto e citações |
| C6 | `gpt-6-astra` | high | privacidade e testes adversariais |

O modelo do agente não define `OPENAI_CHAT_MODEL`; esse valor do produto é validado
separadamente em C3–C4. Aplicam-se as regras de escalonamento do plano mestre.

Referências oficiais do provedor:

- `https://developers.openai.com/api/docs/guides/migrate-to-responses`
- `https://developers.openai.com/api/docs/guides/function-calling`
- `https://developers.openai.com/api/docs/guides/structured-outputs`

---

### Task C1: Persistir conversas e mensagens localmente

**Issue:** MOT-93 — `Etapa 6 / T3 — Histórico local e shell global do chat`.

**Files:**
- Create: `web/src/chat/domain.ts`
- Create: `web/src/chat/validation.ts`
- Create: `web/src/chat/chat.schema.json`
- Create: `web/src/chat/repository.ts`
- Create: testes correspondentes
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Modify: `web/src/storage/migrations.ts`
- Modify: testes de storage/migration/recovery

**Interfaces:**
- Consumes: `projectRef`, `ownerSub`, `studyId | null` e fingerprints.
- Produces:

```ts
export type ChatMessage = Readonly<{
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  classification: ChatClassification | null;
  citations: readonly ChatCitation[];
  contextFingerprint: string | null;
  createdAt: string;
}>;

export type ChatConversation = Readonly<{
  schemaVersion: '1.0.0';
  id: string;
  ownerSub: string;
  studyId: string | null;
  title: string;
  messages: readonly ChatMessage[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;
```

- [ ] **Step 1: Escrever schema e testes de quota**

Recuse owner divergente, mais de 100 mensagens, texto acima do limite, 21ª conversa
no mesmo Estudo e citação sem ID. Nada é apagado automaticamente.

- [ ] **Step 2: Adicionar stores e migration**

Suba `DATABASE_VERSION` e crie `chat_conversations` e `chat_operations`, com índices
por owner/study/updated. Upgrade preserva Estudos, Casos, Perfis e markers de demo.

- [ ] **Step 3: Implementar CAS/idempotência**

Adicione métodos `listChatConversations`, `getChatConversation`,
`saveChatConversation` e `deleteChatConversation` ao repositório. Repetir operation
ID retorna documento existente; duas abas não perdem mensagens.

- [ ] **Step 4: Testar troca de sessão e recovery**

Logout fecha DB; conta B não lê A; migration interrompida preserva banco anterior;
mensagem `PENDING` reaberta vira `FAILED` com ação de tentar novamente.

- [ ] **Step 5: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/chat src/storage/indexedDbApplicationRepository.test.ts src/storage/migrations.test.ts src/storage/recovery.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 6: Commitar**

Commit `feat: persiste histórico local do chat (MOT-93)`.

### Task C2: Criar shell global e contexto tipado

**Issue:** MOT-93.

**Files:**
- Create: `web/src/chat/ChatProvider.tsx`
- Create: `web/src/chat/routeContext.ts`
- Create: `web/src/chat/components/ChatPanel.tsx`
- Create: `web/src/chat/components/ChatHistory.tsx`
- Create: `web/src/chat/components/ChatComposer.tsx`
- Create: testes correspondentes
- Modify: `web/src/app/providers.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/src/app/router.test.tsx`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: rota, help ID e seleção atual.
- Produces:

```ts
export type RouteChatContext = Readonly<{
  routeId: string;
  helpId: string | null;
  studyId: string | null;
  scenarioId: string | null;
  diagnosticExecutionId: string | null;
  replayDay: number | null;
}>;
```

- [ ] **Step 1: Escrever matriz de rotas**

Empresas, Perfis, Importação, Estudos, Carteira, Diagnóstico, Comparação, Replay e
Apresentação retornam contexto. Login/callback/senha e impressão não montam painel.

- [ ] **Step 2: Implementar provider por sessão**

Provider observa controller e rota, abre conversa por Estudo ou conversa geral e
aborta request em logout/troca de conta.

- [ ] **Step 3: Implementar painel não modal**

Botão **Perguntar** abre aside à direita sem trocar rota. Fechar restaura foco.
Histórico é navegável; nova mensagem usa `aria-live=polite`; loading não relê tudo.

- [ ] **Step 4: Implementar mudança de contexto**

Ao mudar cenário/execução/dia, insira separador visual no histórico. Mensagens
anteriores preservam seu fingerprint; não são reinterpretadas.

- [ ] **Step 5: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/chat src/app/providers.test.tsx src/app/router.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 6: Commitar**

Commit `feat: adiciona shell global do chat (MOT-93)`.

### Task C3: Publicar contratos HTTP e configuração do chat

**Issue:** MOT-94 — `Etapa 6 / T4 — API de chat, provedor OpenAI e restrição temática`.

**Files:**
- Create: `servidor/contracts/chat.py`
- Create: `servidor/routes/chat.py`
- Create: `servidor/chat/__init__.py`
- Create: `servidor/chat/service.py`
- Create: `servidor/chat/scope.py`
- Create: testes correspondentes
- Modify: `servidor/config.py`
- Modify: `servidor/app.py`
- Modify: `.env.example`
- Modify/Regenerate: OpenAPI e cliente web

**Interfaces:**
- Consumes: `ChatRequestV1` com `CommunicationDocumentV1 | null`.
- Produces: `POST /api/v1/chat`, `ChatResponseV1` e porta:

```python
class ChatProvider(Protocol):
    async def classify(self, request: ScopeRequest) -> ScopeDecision: ...
    async def answer(self, request: AnswerRequest) -> ProviderAnswer: ...
```

- [ ] **Step 1: Escrever testes de Settings**

Cubra chat desligado sem chave, chat ligado exigindo `OPENAI_API_KEY` e
`OPENAI_CHAT_MODEL`, timeout positivo e output tokens dentro do limite. Mensagens de
erro não imprimem valor secreto.

- [ ] **Step 2: Escrever contratos e limites**

Pydantic rejeita corpo acima de 1 MiB no middleware/rota, mensagem acima de 4.000,
histórico acima das quotas e documento de comunicação inválido.

- [ ] **Step 3: Implementar rota autenticada**

Use a dependência de bearer existente. Chat desligado retorna erro público
`CHAT_INDISPONIVEL` sem afetar health ou outras APIs.

- [ ] **Step 4: Injetar provider**

`create_app(..., chat_provider: ChatProvider | None = None)` usa fake em testes e
provider HTTP real somente quando habilitado. Nenhum teste comum chama internet.

- [ ] **Step 5: Regenerar contratos**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
```

- [ ] **Step 6: Rodar gates**

```powershell
python -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_http.py tests/web_api/test_config.py -q
python -O -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_http.py -q
python -m ruff check servidor tests/web_api
python -m mypy servidor
npm --prefix web run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commitar**

Commit `feat: publica contratos autenticados do chat (MOT-94)`.

### Task C4: Implementar escopo, ferramentas e Responses API

**Issue:** MOT-94.

**Files:**
- Create: `servidor/chat/openai_provider.py`
- Create: `servidor/chat/tools.py`
- Create: `servidor/chat/prompts.py`
- Create: `servidor/chat/structured_output.py`
- Create: testes correspondentes

**Interfaces:**
- Consumes: provider HTTP injetável, catálogo e documento incluídos no request.
- Produces: classificação validada, ferramentas de leitura e resposta estruturada.

- [ ] **Step 1: Escrever teste da classificação em duas fases**

`OUT_OF_SCOPE` não chama `answer`; `IN_SCOPE` e `MIXED` chamam; falha/refusal vira
erro controlado. O texto livre do classificador nunca chega ao usuário.

- [ ] **Step 2: Implementar chamada stateless**

Use `httpx.AsyncClient` para `POST https://api.openai.com/v1/responses` com bearer,
`store: false`, timeout configurado e `text.format` JSON Schema estrito. Não use
conversation nem previous response ID.

- [ ] **Step 3: Implementar seis ferramentas allowlist**

`consultar_interface`, `consultar_metrica`, `consultar_comparacao`,
`consultar_replay`, `consultar_premissas` e `consultar_limitacoes` recebem schemas
com `strict: true`, todos os campos obrigatórios e `additionalProperties: false`.
Elas consultam somente payload já validado.

- [ ] **Step 4: Implementar loop limitado**

Aceite zero ou várias `function_call`; correlacione output por `call_id`; preserve
itens de reasoning devolvidos quando exigido; pare após quatro chamadas ou duas
rodadas. Tool desconhecida, argumento inválido ou citação inexistente falha fechado.

- [ ] **Step 5: Aplicar resposta fixa server-side**

Para `OUT_OF_SCOPE`, devolva exatamente a frase aprovada. Para `MIXED`, mantenha
somente resposta in-scope e acrescente a mesma restrição. Para evidência insuficiente,
exija `INSUFFICIENT_EVIDENCE` e limitação explícita.

- [ ] **Step 6: Testar adversarialmente**

Cubra clima, política, prompt injection, base64, troca de idioma, pedido de web,
pedido para editar dados, questão mista e pergunta legítima sobre botão/métrica.

- [ ] **Step 7: Rodar gates**

```powershell
python -m pytest tests/web_api/test_chat_scope.py tests/web_api/test_chat_tools.py tests/web_api/test_openai_provider.py -q
python -O -m pytest tests/web_api/test_chat_scope.py tests/web_api/test_chat_tools.py -q
python -m ruff check servidor/chat tests/web_api
python -m mypy servidor
```

Expected: PASS sem rede.

- [ ] **Step 8: Commitar**

Commit `feat: restringe e fundamenta respostas do chat (MOT-94)`.

### Task C5: Integrar cliente, evidências e ajuda contextual

**Issue:** MOT-95 — `Etapa 6 / T5 — Chat contextual, evidências e acessibilidade`.

**Files:**
- Modify: `web/src/api/client.ts`
- Create: `web/src/chat/chatService.ts`
- Create: `web/src/chat/contextFragment.ts`
- Create: `web/src/chat/components/ChatCitation.tsx`
- Create: `web/src/help/AskAboutThis.tsx`
- Create: testes correspondentes
- Modify: componentes de métricas/controles relevantes

**Interfaces:**
- Consumes: `ChatRequestV1`, catálogo e `CommunicationDocumentV1`.
- Produces: `sendChatMessage`, fragmentação mínima e links de citação.

- [ ] **Step 1: Implementar método tipado no ApiClient**

Valide request antes do fetch e response depois. Timeout usa configuração específica
do chat; abort do usuário retorna estado retryable sem duplicar mensagem.

- [ ] **Step 2: Implementar fragmentação por intenção**

Pergunta sobre UI envia item de catálogo; métrica envia métrica/evidências;
comparação ou Replay envia seção correspondente. Pergunta ampla in-scope pode enviar
documento inteiro somente se ficar abaixo de 1 MiB.

- [ ] **Step 3: Persistir estados corretamente**

Grave USER + ASSISTANT/PENDING antes do HTTP. Sucesso substitui a pendente por CAS;
falha marca FAILED. Retry reutiliza mensagem do usuário, cria message ID novo e não
duplica resposta antiga.

- [ ] **Step 4: Implementar citações navegáveis**

Citação abre a seção/controle na rota válida. ID inexistente não vira link e a
resposta é tratada como inválida antes de persistir.

- [ ] **Step 5: Adicionar “Perguntar sobre isto”**

Inclua em métricas principais, repetição selecionada, controles de Replay,
composição, importação e limitações. O acionador define `helpId` e move foco para o
composer com contexto visível.

- [ ] **Step 6: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/chat src/help src/api/client.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 7: Commitar**

Commit `feat: integra chat contextual e evidências (MOT-95)`.

### Task C6: Aceitar chat no browser

**Issue:** MOT-95.

**Files:**
- Create: `web/e2e/stage6-chat.spec.ts`
- Modify: `web/playwright.config.ts`
- Modify: `tests/web_api/scan_credentials.py`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: C1–C5.
- Produces: aceite sem rede externa usando provider fake e teste real opt-in.

- [ ] **Step 1: Testar presença global**

Percorra todas as rotas autenticadas e confirme painel; percorra auth e impressão e
confirme ausência.

- [ ] **Step 2: Testar quatro classes**

Use perguntas sobre botão, métrica do Estudo, evidência ausente, clima e pergunta
mista. Verifique texto fixo, citações, fingerprints e histórico após reload.

- [ ] **Step 3: Testar acessibilidade e falhas**

Teclado, foco, `aria-live`, cancelamento, timeout, chat desligado, quota e retry.
Produto continua navegável em todos os casos.

- [ ] **Step 4: Testar segredos e logs**

Scanner falha se bundle, source map, logs ou resposta contiver chave, pergunta,
resposta, nome do Estudo ou valores financeiros.

- [ ] **Step 5: Criar teste real opt-in**

O teste exige variável explícita e credencial própria, nunca roda na CI comum e usa
pergunta sintética sem dados reais.

- [ ] **Step 6: Rodar gate C**

```powershell
python -m pytest tests/web_api/test_chat_*.py -q
npm --prefix web run test:unit -- src/chat src/help
npm --prefix web run test:e2e -- stage6-chat.spec.ts
python -m tests.web_api.scan_credentials
```

Expected: PASS.

- [ ] **Step 7: Commitar**

Commit `test: fecha aceite do chat contextual (MOT-95)`.
