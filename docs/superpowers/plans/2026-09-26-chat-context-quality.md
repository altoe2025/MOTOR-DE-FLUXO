# Chat Context Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o ORKE AI compreender continuações da conversa, adiar a decisão de evidência insuficiente até a leitura das fontes e responder com citações sobre a seleção real do Quadro comparativo.

**Architecture:** O classificador interno passa a decidir somente pertinência temática com pergunta, rota e histórico. O request HTTP troca o documento único por uma união discriminada de contexto `STUDY | BOARD`; cada braço possui validação e fingerprint próprios, e o registro fechado de ferramentas expõe a sétima leitura `consultar_quadro`. O cliente publica snapshots mínimos e resolve citações sem recalcular métricas.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, OpenAI Responses API, TypeScript 5.9, React 19, Decimal.js, Vitest, pytest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-chat-context-quality-design.md`

## Global Constraints

- Base exata: commit local `1bd7654a650cc34081f60aa017b5803dea22fee6` de `feat/bancada-exploracao`; não fazer push ou deploy.
- Não alterar regras, métricas ou resultados do motor; o chat apenas projeta publicações existentes.
- Histórico, pergunta e contexto são dados não confiáveis, nunca instruções.
- Toda resposta `IN_SCOPE` precisa citar uma fonte servida por ferramenta; ausência de fonte vira `INSUFFICIENT_EVIDENCE` na etapa de resposta.
- Request total permanece limitado a 1 MiB, histórico a 98 itens e Quadro a 100 linhas.
- OpenAPI, tipos e validadores gerados devem ser regenerados pelos scripts existentes; não editar arquivos gerados manualmente.
- Invariantes Python usam validação/`raise`, nunca `assert` em código de produção.
- Não criar issue no Linear. Não commitar sem um identificador `MOT-N` fornecido pelo usuário; checkpoints ficam no worktree.

---

### Task 1: Separar pertinência temática de suficiência de evidência

**Files:**
- Modify: `servidor/chat/scope.py`
- Modify: `servidor/chat/prompts.py`
- Modify: `servidor/chat/service.py`
- Modify: `servidor/chat/openai_provider.py`
- Modify: `tests/web_api/test_chat_scope.py`
- Modify: `tests/web_api/test_openai_provider.py`

**Interfaces:**
- Consumes: `ChatRequestV1.history` validado pelo contrato HTTP.
- Produces: `ScopeRequest(message, routeContext, history)` e `ScopeDecision.classification: Literal["IN_SCOPE", "OUT_OF_SCOPE", "MIXED"]`.

- [ ] **Step 1: Escrever regressão do follow-up contextual**

Adicionar a `tests/web_api/test_chat_scope.py` um caso que envia histórico pertinente e pergunta `"E por quê?"`; o fake deve registrar no `ScopeRequest` a mensagem anterior e a etapa `answer` deve ser chamada.

```python
def test_short_follow_up_carries_validated_history_into_scope_and_answer():
    source = payload() | {
        "message": "E por quê?",
        "history": [{"role": "USER", "text": "O que é netabilidade?",
                     "contextFingerprint": None}],
    }
    fake = FakeProvider(answer={
        "answer": "A netabilidade depende do volume casado.",
        "citations": [{"kind": "HELP", "id": "page.chat"}],
        "limitationCodes": [],
    })
    result = run(fake, source)
    assert result.classification == "IN_SCOPE"
    assert fake.calls[0][1].history[0].text == "O que é netabilidade?"
    assert [name for name, _ in fake.calls] == ["classify", "answer"]
```

- [ ] **Step 2: Escrever regressão que remove insuficiência do classificador**

Em `tests/web_api/test_openai_provider.py`, verificar que o JSON Schema do classificador enumera somente as três classes temáticas e que o payload enviado inclui `history` como dado dentro da mensagem de usuário.

```python
schema = json.loads(request.content)["text"]["format"]["schema"]
assert schema["properties"]["classification"]["enum"] == [
    "IN_SCOPE", "OUT_OF_SCOPE", "MIXED",
]
assert json.loads(json.loads(request.content)["input"][0]["content"])["history"] == source["history"]
```

- [ ] **Step 3: Rodar RED do servidor**

Run:

```powershell
python -m pytest tests/web_api/test_chat_scope.py tests/web_api/test_openai_provider.py -q
```

Expected: FAIL porque `ScopeRequest` não possui `history` e o schema ainda aceita `INSUFFICIENT_EVIDENCE`.

- [ ] **Step 4: Implementar o contrato temático mínimo**

Em `scope.py`, importar `ChatHistoryItem` e declarar:

```python
ScopeClassification = Literal["IN_SCOPE", "OUT_OF_SCOPE", "MIXED"]

class ScopeRequest(StrictModel):
    message: Question
    routeContext: RouteChatContext
    history: Annotated[list[ChatHistoryItem], Field(max_length=98)]

class ScopeDecision(StrictModel):
    classification: ScopeClassification
```

Em `service.py`, construir `ScopeRequest(..., history=source.history)` e remover o ramo que publica insuficiência diretamente do classificador. Em `openai_provider.py`, serializar `message`, `routeContext` e `history` na entrada do classificador. Em `prompts.py`, remover `INSUFFICIENT_EVIDENCE` da instrução de escopo e declarar que follow-up de tópico anterior pertinente é `IN_SCOPE`.

- [ ] **Step 5: Rodar GREEN do servidor e regressões adversariais**

Run:

```powershell
python -m pytest tests/web_api/test_chat_scope.py tests/web_api/test_openai_provider.py tests/web_api/test_chat_privacy.py -q
python -O -m pytest tests/web_api/test_chat_scope.py tests/web_api/test_openai_provider.py -q
```

Expected: PASS; perguntas externas continuam sem chamar `answer`, e o histórico malicioso continua fora das instruções privilegiadas.

- [ ] **Step 6: Checkpoint sem commit**

Registrar `git diff --check` e manter as mudanças não commitadas até existir um `MOT-N` autorizado.

---

### Task 2: Publicar contrato estrito do contexto de Quadro

**Files:**
- Create: `servidor/contracts/chat_context.py`
- Modify: `servidor/contracts/chat.py`
- Modify: `tests/web_api/test_chat_contracts.py`
- Modify: `tests/web_api/test_chat_http.py`
- Modify: `tests/web_api/test_openapi.py`

**Interfaces:**
- Consumes: valores textuais já publicados e exibidos por `ComparisonBoardPage`.
- Produces: `StudyChatContextV1`, `BoardChatContextV1`, `BoardChatDocumentV1`, `BoardChatRowV1`, `BoardEvidenceV1` e `ChatContextV1` discriminado por `kind`.

- [ ] **Step 1: Escrever fixtures literais e testes RED do BOARD**

Criar helper literal em `test_chat_contracts.py` com duas linhas, evidências por campo e fingerprint calculado no teste por JSON canônico independente. Cobrir:

```python
def test_accepts_board_context_only_on_board_route(): ...
def test_rejects_board_context_with_duplicate_rows(): ...
def test_rejects_board_context_with_invalid_decimal_or_fingerprint(): ...
def test_rejects_more_than_one_hundred_board_rows(): ...
def test_study_context_preserves_existing_route_identity_checks(): ...
```

O request desejado terá a forma:

```json
{
  "context": {
    "kind": "BOARD",
    "document": {
      "apiVersion": "1.0.0",
      "generatedAt": "2026-09-26T00:00:00Z",
      "rows": [],
      "evidenceIndex": {},
      "contextFingerprint": "..."
    }
  }
}
```

- [ ] **Step 2: Rodar RED do contrato**

Run:

```powershell
python -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_http.py::test_openapi_exposes_bearer_and_chat_request_response -q
```

Expected: FAIL porque `ChatRequestV1` ainda exige `communication`.

- [ ] **Step 3: Implementar modelos e invariantes**

Em `chat_context.py`, validar:

- IDs não vazios e `rowKey` único;
- no máximo 100 linhas e evidências somente das linhas presentes;
- `windowDays >= 1`, `orderCount >= 0`;
- campos BRL e fração como decimal ASCII finito, sem expoente;
- cada valor publicado igual ao valor da evidência correspondente;
- SHA-256 canônico excluindo apenas `generatedAt` e `contextFingerprint`.

Em `chat.py`, substituir `communication` por:

```python
class StudyChatContextV1(StrictModel):
    kind: Literal["STUDY"]
    document: CommunicationDocumentV1

ChatContextV1 = Annotated[
    StudyChatContextV1 | BoardChatContextV1,
    Field(discriminator="kind"),
]

class ChatRequestV1(StrictModel):
    ...
    context: ChatContextV1 | None
```

No model validator, `STUDY` preserva as comparações atuais; `BOARD` exige `routeId == "board"` e IDs financeiros da rota nulos.

- [ ] **Step 4: Adaptar resposta ao fingerprint discriminado**

Em `service.py`, obter o fingerprint por helper único:

```python
def context_fingerprint(source: ChatRequestV1) -> str | None:
    return source.context.document.contextFingerprint if source.context is not None else None
```

Usar o helper na resposta HTTP e nos testes de correlação.

- [ ] **Step 5: Rodar GREEN dos contratos**

Run:

```powershell
python -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_http.py tests/web_api/test_openapi.py -q
python -O -m pytest tests/web_api/test_chat_contracts.py -q
```

Expected: PASS.

- [ ] **Step 6: Checkpoint sem commit**

Rodar `git diff --check`; não commitar sem `MOT-N`.

---

### Task 3: Expor o Quadro pela ferramenta fechada de leitura

**Files:**
- Modify: `servidor/chat/tools.py`
- Modify: `servidor/chat/openai_provider.py`
- Modify: `servidor/chat/prompts.py`
- Modify: `tests/web_api/test_chat_tools.py`
- Modify: `tests/web_api/test_openai_provider.py`
- Modify: `tests/web_api/test_chat_privacy.py`

**Interfaces:**
- Consumes: `ChatRequestV1.context` validado.
- Produces: ferramenta estrita `consultar_quadro({})`, inventário `boardRows` e validação de citações `EVIDENCE` servidas.

- [ ] **Step 1: Escrever RED da ferramenta e da resposta fundamentada**

Adicionar testes que comprovem:

```python
assert "consultar_quadro" in {item["name"] for item in registry.definitions()}
result = registry.execute("consultar_quadro", "{}")
assert [row["rowKey"] for row in result["data"]] == ["study-a:scenario-a", "study-b:scenario-b"]
registry.validate_references(
    [ChatCitation(kind="EVIDENCE", id="board:study-a:scenario-a:savingsBrl")],
    [], served_only=True,
)
```

Cobrir também contexto `STUDY`, contexto nulo, tentativa de argumento extra e garantia de que linhas não selecionadas nunca entram no output do provider.

- [ ] **Step 2: Rodar RED das ferramentas**

Run:

```powershell
python -m pytest tests/web_api/test_chat_tools.py tests/web_api/test_openai_provider.py tests/web_api/test_chat_privacy.py -q
```

Expected: FAIL porque existem apenas seis ferramentas e o registro conhece apenas `communication`.

- [ ] **Step 3: Generalizar o registro sem abrir capacidades externas**

Adicionar `consultar_quadro` a `_TOOLS` com `EmptyArguments`. `inventory()` deve expor somente `rowKey`, `studyName` e `scenarioName`; valores completos saem apenas da ferramenta. `execute()` deve publicar as linhas e evidências do documento `BOARD`. Métodos de métricas/fatos continuam retornando apenas o braço `STUDY`.

Atualizar `validate_references()` para unir evidências do braço corrente sem aceitar IDs de outro contexto. Atualizar `ANSWER_INSTRUCTIONS` para orientar perguntas de ranking a citar os valores servidos e proibir novos cálculos; comparações textuais diretas sobre valores publicados são permitidas, mas nenhuma métrica financeira nova é criada.

- [ ] **Step 4: Rodar GREEN e mutações de segurança**

Run:

```powershell
python -m pytest tests/web_api/test_chat_tools.py tests/web_api/test_openai_provider.py tests/web_api/test_chat_privacy.py tests/web_api/test_chat_scanner.py -q
python -O -m pytest tests/web_api/test_chat_tools.py tests/web_api/test_openai_provider.py -q
```

Expected: PASS; remover `served.update(...)` ou incluir linha não selecionada deve quebrar ao menos um teste.

- [ ] **Step 5: Checkpoint sem commit**

Rodar `git diff --check`; não commitar sem `MOT-N`.

---

### Task 4: Construir e transportar o contexto BOARD no cliente

**Files:**
- Create: `web/src/chat/boardContext.ts`
- Create: `web/src/chat/boardContext.test.ts`
- Modify: `web/src/chat/ChatProvider.tsx`
- Modify: `web/src/chat/chatService.ts`
- Modify: `web/src/chat/contextFragment.ts`
- Modify: `web/src/chat/components/ChatHistory.tsx`
- Modify: `web/src/chat/components/ChatCitation.tsx`
- Modify: `web/src/chat/components/ChatCitation.test.ts`
- Modify: `web/src/pages/ComparisonBoardPage.tsx`
- Modify: `web/src/pages/ComparisonBoardPage.test.ts`
- Modify: `web/src/chat/ChatProvider.test.tsx`
- Modify: `web/src/chat/chatService.test.ts`

**Interfaces:**
- Consumes: `BoardRow[]` já derivado da execução selecionada e o conjunto de chaves marcado no Quadro.
- Produces: `buildBoardChatDocument(rows, generatedAt)`, `ChatContext = STUDY | BOARD`, `publishBoardContext(document | null)` e citations BOARD navegáveis para `/quadro`.

- [ ] **Step 1: Escrever RED do builder puro**

Em `boardContext.test.ts`, usar duas linhas literais em ordem inversa e esperar:

- ordenação estável por `rowKey` no documento;
- nove evidências por linha apontando exatamente para os textos publicados;
- fingerprint de 64 hexadecimais que muda ao mudar seleção ou valor;
- nenhuma propriedade `breakdown`, lista de ordens ou dado não exibido;
- rejeição acima de 100 linhas e de decimal inválido.

```typescript
const document = await buildBoardChatDocument([rowB, rowA], '2026-09-26T00:00:00Z');
expect(document.rows.map((row) => row.rowKey)).toEqual(['a:s1', 'b:s2']);
expect(JSON.stringify(document)).not.toContain('breakdown');
expect(document.evidenceIndex['board:a:s1:savingsBrl']?.value).toBe('125.50');
```

- [ ] **Step 2: Escrever RED da integração do Quadro**

Em `ComparisonBoardPage.test.ts`, renderizar com repositório real/controlado, marcar duas linhas e verificar que `publishBoardContext` recebe somente essas linhas; desmarcar uma deve publicar novo fingerprint. Em `ChatProvider.test.tsx`, confirmar que `/quadro` envia `kind: "BOARD"` e que outra rota limpa esse snapshot.

- [ ] **Step 3: Rodar RED web**

Run:

```powershell
npm --prefix web run test:unit -- src/chat/boardContext.test.ts src/chat/ChatProvider.test.tsx src/chat/chatService.test.ts src/pages/ComparisonBoardPage.test.ts --maxWorkers=1 --testTimeout=15000
```

Expected: FAIL porque builder, contexto discriminado e publisher não existem.

- [ ] **Step 4: Implementar builder e estado discriminado**

`boardContext.ts` deve projetar somente:

```typescript
type BoardChatRow = Readonly<{
  rowKey: string; studyId: string; scenarioId: string; executionId: string;
  studyName: string; scenarioName: string; sourceLabel: string;
  windowDays: number; orderCount: number; inBrl: string; outBrl: string;
  netability: string; baselineTotalBrl: string; nettedTotalBrl: string;
  savingsBrl: string;
}>;
```

Usar a mesma serialização canônica Unicode do fingerprint existente, extraída para helper compartilhado sem duplicar regras. `ChatProvider` mantém `publishedContext` discriminado; `publishCommunication` embrulha `STUDY`, e `publishBoardContext` aceita `BOARD`. `sendChatMessage` envia `context`, e validação de resposta resolve IDs conhecidos do braço corrente.

- [ ] **Step 5: Publicar seleção no Quadro e resolver citações**

`ComparisonBoardPage` chama `buildBoardChatDocument(board, now)` em efeito com token de geração para descartar respostas tardias; vazio publica documento BOARD com zero linhas, não dados de candidatos não selecionados. `routeContext.ts` usa `routeId: "board"` e `helpId: "page.quadro"` para `/quadro`; fallback desconhecido usa `routeId: "general"`.

`ChatCitation` recebe `ChatContext | null`. Evidência BOARD com fingerprint corrente aponta para `/quadro`; fingerprint antigo permanece texto indisponível, como já ocorre com contexto de Estudo anterior.

- [ ] **Step 6: Rodar GREEN web e regressões existentes**

Run:

```powershell
npm --prefix web run test:unit -- src/chat src/pages/ComparisonBoardPage.test.ts src/pages/StudyComparisonChatContext.test.tsx src/pages/StudyDiagnosticChatContext.test.tsx src/replay/ReplayChatContext.test.tsx --maxWorkers=1 --testTimeout=15000
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 7: Checkpoint sem commit**

Rodar `git diff --check`; não commitar sem `MOT-N`.

---

### Task 5: Atualizar catálogo, contrato gerado e aceite ponta a ponta

**Files:**
- Modify: `servidor/catalogs/product_help.v1.json`
- Modify: `tests/web_api/test_product_help.py`
- Modify: `tests/web_api/chat_e2e_provider.py`
- Modify: `tests/web_api/test_chat_real_opt_in.py`
- Modify: `web/e2e/stage6-chat.spec.ts`
- Regenerate: `contracts/openapi.json`
- Regenerate: `web/src/api/generated.ts`
- Regenerate: `web/src/api/schemas.json`
- Regenerate: `web/src/generated/validators/api.js`
- Regenerate: `web/src/generated/validators/api.d.ts`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: contratos e builders concluídos nas Tasks 1–4.
- Produces: catálogo `page.quadro`, OpenAPI canônico, cliente/validadores alinhados e E2E real do request BOARD.

- [ ] **Step 1: Escrever RED do catálogo e E2E controlado**

Adicionar `page.quadro` à expectativa literal do catálogo. No E2E, selecionar duas linhas no Quadro, perguntar `"Qual cenário tem maior economia entre os selecionados?"` e verificar request com `kind: "BOARD"`, dois `rowKey`, resposta `IN_SCOPE`, citação `EVIDENCE` e link de retorno `/quadro`. Depois perguntar `"E por quê?"` e verificar que o histórico chega ao provider controlado.

- [ ] **Step 2: Rodar RED dos gates de geração e browser**

Run:

```powershell
python -m pytest tests/web_api/test_product_help.py tests/web_api/test_openapi.py -q
npm --prefix web run check:validators
npm --prefix web run test:e2e -- stage6-chat.spec.ts
```

Expected: catálogo/OpenAPI/E2E falham porque artefatos ainda não foram atualizados.

- [ ] **Step 3: Atualizar catálogo e provider controlado**

Adicionar item `page.quadro` com rota `/quadro`, propósito de comparar somente linhas selecionadas e aviso de que a tela não recalcula nem transforma simulação em cotação. Atualizar o provider E2E para usar `consultar_quadro` e emitir citação servida, sem ramificação baseada em texto privado além dos modos controlados já existentes.

- [ ] **Step 4: Regenerar artefatos oficiais**

Run:

```powershell
python -m servidor.export_openapi contracts/openapi.json
npm --prefix web run generate:api
npm --prefix web run check:validators
```

Expected: arquivos gerados mudam somente conforme o novo schema e o check termina PASS.

- [ ] **Step 5: Ampliar smoke real opt-in sem torná-lo gate automático**

Adicionar duas perguntas sintéticas ao teste manual: follow-up de interface e duas linhas BOARD. Manter `MOTOR_CHAT_REAL_OPT_IN=1`, ausência em CI e credencial/modelo externos. O teste deve verificar classificação, resposta não vazia e citação resolvida; não deve fixar texto do modelo.

- [ ] **Step 6: Rodar aceitação integrada**

Run:

```powershell
python -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_http.py tests/web_api/test_chat_scope.py tests/web_api/test_chat_tools.py tests/web_api/test_chat_privacy.py tests/web_api/test_chat_scanner.py tests/web_api/test_chat_real_opt_in.py tests/web_api/test_openai_provider.py tests/web_api/test_product_help.py tests/web_api/test_openapi.py -q
python -O -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_scope.py tests/web_api/test_chat_tools.py tests/web_api/test_openai_provider.py -q
npm --prefix web run test:unit -- src/chat src/pages/ComparisonBoardPage.test.ts --maxWorkers=1 --testTimeout=15000
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build -- --sourcemap
python -m tests.web_api.scan_credentials
npm --prefix web run test:e2e -- stage6-chat.spec.ts
```

Expected: todos PASS; o teste real permanece SKIP sem opt-in.

- [ ] **Step 7: Registrar mudança e evidência**

Adicionar entrada no topo do Diário com sintoma, causa, mudança e invalidação. Em `docs/testing.md`, registrar comandos, contagens e que a avaliação real continuou opt-in. Não declarar deploy, push ou qualidade semântica universal.

- [ ] **Step 8: Auditoria e checkpoint final sem commit**

Rodar `git diff --check`, revisar `git status --short`, confirmar que nenhuma mudança toca o motor e solicitar o `MOT-N` antes de commit/push/PR. Não publicar.
