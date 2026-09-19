# Front-end Etapa 2 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o primeiro fluxo completo do estudo com carteiras sintéticas, manuais e observadas, persistência local robusta, execução reproduzível e conciliação Observado × Motor.

**Architecture:** Um domínio local versionado representa empresa, Caso Observado, estudo, cenário, snapshot e execução. `ApplicationRepository` concentra importador e estudo sobre IndexedDB transacional com CAS e migrations. Toda origem é projetada para `PreviaRequest`, executada pela API e preservada como `ExecutionRecord` imutável.

**Tech Stack:** React 19.3, TypeScript 5.9, Vite 8.3, React Router 7.18, TanStack Query 5.102, Decimal.js 10.6, IndexedDB, Vitest 5, Playwright 1.63, FastAPI 0.141, Pydantic 2.13 e pacote Python `motor`.

**Spec:** `docs/superpowers/specs/2026-09-19-frontend-etapa-2-design-v2.md`

## Global Constraints

- Ler a especificação global v2, a especificação desta etapa, o importador vigente, `AGENTS.md`, `MAPA.md` e o topo do diário antes de editar.
- Começar da `main` atual em worktree isolado; não implementar sobre a branch antiga.
- Auditar `50fc384` e `1270458` antes de reaproveitar qualquer arquivo.
- Não alterar `motor/`, P0, autonetting ou medições históricas.
- Não criar nem reescrever issues no Linear sem aprovação explícita; cada tarefa exige
  issue real confirmada. A reorganização aprovada em 2026-09-19 está registrada abaixo.
- Contratos gerados são regenerados pelas ferramentas oficiais e nunca resolvidos manualmente.
- Toda regra financeira e temporal permanece no servidor/motor.
- Observado × Motor compara estruturas independentes.
- Nenhuma mutação reescreve uma execução existente.
- Invariantes Python usam `raise`, não `assert`, e rodam sob `python -O`.
- Toda mudança publicada atualiza o diário no mesmo commit.

---

## Mapa de arquivos

### Domínio observado

```text
web/src/cases/
  domain.ts
  validation.ts
  fingerprints.ts
  observedComparison.ts
  observedCase.schema.json
  *.test.ts
```

### Domínio do estudo

```text
web/src/study/
  domain.ts
  model.ts
  validation.ts
  fingerprints.ts
  resultState.ts
  study.schema.json
  fixtures.ts
  *.test.ts
```

### Persistência e sessão

```text
web/src/storage/
  applicationRepository.ts
  indexedDbApplicationRepository.ts
  migrations.ts
  errors.ts
  *.test.ts

web/src/study/
  studyController.ts
  studyController.test.ts
```

### Preparação, execução e UI

```text
web/src/preparation/
  resolvePortfolioSource.ts
  buildPreviewRequest.ts
  *.test.ts

web/src/pages/
  StudiesPage.tsx
  StudyPortfolioPage.tsx
  StudyResultPage.tsx

web/src/study/components/
  StudyList.tsx
  StudyEditor.tsx
  PortfolioSourceSelector.tsx
  ExecutionHistory.tsx

web/src/ui/
  ObservedComparisonTable.tsx
```

### Servidor e contratos

```text
servidor/contracts/preparation.py
servidor/routes/preparation.py
tests/web_api/test_preparation_contracts.py
tests/web_api/test_preparation_http.py
contracts/fixtures/observed-case-request.json
```

Arquivos existentes modificados incluem `servidor/app.py`, exports de contratos,
OpenAPI, cliente gerado, validators, router, providers, PreviewProvider, estilos,
testes e documentação.

## Rastreabilidade aprovada no Linear

| Task | Issue(s) | Escopo aprovado |
|---|---|---|
| T0 | MOT-62 | gate documental, reorganização das issues e auditoria dos commits antigos |
| T1 | MOT-63 | contratos de Caso Observado e proveniência HTTP |
| T2 | MOT-23 / MOT-25 | contratos de preparação / geração oficial e integração HTTP |
| T3 | MOT-24 | domínio do estudo, snapshots e fingerprints |
| T4 | MOT-26 | `ApplicationRepository` e IndexedDB |
| T5 | MOT-27 | migrations, lixeira e recuperação |
| T6 | MOT-28 | controlador, sessão e múltiplas abas |
| T7 | MOT-64 | resolução das três origens e request canônico |
| T8 | MOT-30 | editor das três origens |
| T9 | MOT-29 | execução e histórico imutável |
| T10 | MOT-31 | resultado e Observado × Motor |
| T11 | MOT-32 | E2E, segurança e desempenho |
| T12 | MOT-33 | aceitação, documentação e handoff |

As descrições e relações foram atualizadas no Linear após aprovação explícita do
Gabriel. Nenhuma issue foi fechada e nenhuma atualização autoriza merge automático.

## Task 0: Gate, base, issues e auditoria da branch antiga

**Issue:** MOT-62

**Files:**
- Read: `AGENTS.md`
- Read: `docs/MAPA.md`
- Read: `docs/DIARIO-DE-MUDANCAS.md`
- Read: specs e planos v2
- Inspect: commits `50fc384` e `1270458`

**Interfaces:**
- Consumes: `main` atual, Linear e branch antiga. Alterações no Linear ocorreram
  somente depois da aprovação explícita de 2026-09-19.
- Produces: matriz arquivo a arquivo `REUSE`, `ADAPT`, `REGENERATE` ou `DROP`, IDs reais e worktree limpo.

**Estado em 2026-09-19:** documentação, IDs e auditoria concluídos neste PR. O
baseline e a criação da worktree de implementação continuam pendentes e devem partir
da `main` depois da integração deste gate, ou de outra base explicitamente aprovada.

- [ ] **Step 1: Confirmar estado e baseline**

Executar:

```powershell
git status --short --branch
git log --oneline -5
python -m pytest -q
python -O -m pytest -q
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run lint
```

Expected: árvore limpa da worktree e todos os gates verdes antes de qualquer patch.

- [x] **Step 2: Confirmar issues reais**

MOT-23–MOT-33 foram revisadas e reenquadradas após aprovação. Foram criadas MOT-62,
MOT-63 e MOT-64; MOT-29 ficou restrita à execução e ao histórico, enquanto MOT-64
recebeu a resolução de origens e a construção do request. A tabela acima é a fonte
de rastreabilidade desta etapa.

- [x] **Step 3: Auditar os dois commits**

Para cada arquivo do diff, registrar:

- contrato compatível com schema atual;
- dependência de arquivo gerado;
- conflito com Caso Observado ou repositório compartilhado;
- teste que comprova reaproveitamento.

### Matriz de auditoria consolidada

| Origem | Classificação | Arquivos/decisão |
|---|---|---|
| `50fc384` | REUSE | conceitos das validações de `Decimal`, seed e limites; composição realizada; casos úteis de teste |
| `50fc384` | ADAPT | `servidor/contracts/preparation.py`, `servidor/contracts/__init__.py`, `servidor/app.py`, `tests/web_api/{conftest.py,test_preparation_contracts.py}`, `contracts/fixtures/authored-input.json`, `web/scripts/generate-api.mjs` e `web/src/api/validators.test.ts` |
| `50fc384` | REGENERATE | `contracts/openapi.json`, `web/src/api/generated.ts`, `web/src/api/schemas.json` e `web/src/api/validators.ts`, somente pelas ferramentas oficiais após as rotas reais |
| `50fc384` | DROP/SUBSTITUTE | endpoints 501, catálogo/capabilities fictícios, `docs/frontend/etapa-2-operacao.md`, a entrada antiga do diário e endpoints mantidos apenas para publicar schema |
| `1270458` | REUSE | canonicalização e fingerprints; casos úteis dos testes de domínio; CAS e idempotência como referência; estratégia de teste com `fake-indexeddb` |
| `1270458` | ADAPT | `web/package.json`; `web/src/study/domain.ts`, `model.ts`, `validation.ts`, `fingerprints.ts`, `resultState.ts`, `fixtures.ts` e `study.schema.json`; `executionFixture.test-support.ts`; os testes correspondentes; `repository.ts`, `memoryRepository.ts` e seu teste somente como referências para `ApplicationRepository` |
| `1270458` | REGENERATE | `web/package-lock.json`, apenas depois de aprovadas as dependências efetivamente necessárias |
| `1270458` | DROP/SUBSTITUTE | `legacyTypes.ts`, `types.ts` e o `StudyDocument` antigo como contrato final; `StudyRepository` isolado como fronteira final; `docs/frontend/etapa-2-operacao.md` e a entrada antiga do diário |

Na branch antiga, a evidência histórica registrada era de 680 testes Python em modo
normal e otimizado, 135 testes web, typecheck, build e lint verdes. Esses números não
foram reexecutados neste gate documental e não substituem o baseline da nova worktree.

- [ ] **Step 4: Criar worktree da primeira issue autorizada**

Usar `superpowers:using-git-worktrees`, base `main` atual e convenção `codex/`.

**Gate:** nenhuma implementação começa sem baseline, IDs e matriz de auditoria.

## Task 1: Contratos observados e proveniência HTTP

**Issue:** MOT-63

**Files:**
- Create: `web/src/cases/domain.ts`
- Create: `web/src/cases/validation.ts`
- Create: `web/src/cases/observedCase.schema.json`
- Create: `web/src/cases/domain.test.ts`
- Modify: `servidor/contracts/primitives.py`
- Modify: `servidor/contracts/input.py`
- Test: `tests/web_api/test_contracts.py`

**Interfaces:**
- Consumes: tipos gerados atuais e decisões S04/S05.
- Produces: `ObservedCaseDraft`, `ObservedCase`, `ObservedOutcome`, `FieldProvenance` e validação estrita.

- [ ] **Step 1: Escrever testes TypeScript falhando**

Cobrir caso confirmado válido, draft bloqueado, fechamento fora da janela, ordem
duplicada, total divergente e resultado observado ausente.

```ts
expect(validateObservedCase(validCase)).toEqual({ ok: true, value: validCase });
expect(validateObservedCase({ ...validCase, status: 'DRAFT' }).ok).toBe(false);
```

- [ ] **Step 2: Implementar domínio mínimo**

Definir uniões discriminadas e objetos readonly. Valores BRL são strings decimais;
datas são ISO civis; não usar `number` para valor financeiro.

- [ ] **Step 3: Escrever testes Python de proveniência**

Provar que `DADO_OBSERVADO` é aceito nos caminhos autorizados, `NAO_COLETADO` mantém
as restrições vigentes e valores desconhecidos são recusados também sob `python -O`.

- [ ] **Step 4: Implementar extensão Pydantic**

Ampliar apenas os contratos necessários. Não introduzir Caso Observado inteiro no
request do motor; o servidor recebe a entrada canônica e proveniência projetada.

- [ ] **Step 5: Rodar gates focados**

```powershell
python -m pytest tests/web_api/test_contracts.py -q
python -O -m pytest tests/web_api/test_contracts.py -q
npm --prefix web run test:unit -- src/cases/domain.test.ts
npm --prefix web run typecheck
```

- [ ] **Step 6: Commit**

Usar `feat: define casos observados e proveniência (MOT-63)`.

## Task 2: Contratos de preparação e geração oficial

**Issues:** MOT-23 (T2A, contratos) e MOT-25 (T2B, geração/HTTP)

**Files:**
- Create or Adapt: `servidor/contracts/preparation.py`
- Create: `servidor/routes/preparation.py`
- Modify: `servidor/contracts/__init__.py`
- Modify: `servidor/app.py`
- Test: `tests/web_api/test_preparation_contracts.py`
- Test: `tests/web_api/test_preparation_http.py`
- Regenerate: `contracts/openapi.json`
- Regenerate: `web/src/api/generated.ts`
- Regenerate: `web/src/api/schemas.json`
- Regenerate: `web/src/api/validators.ts`

**Interfaces:**
- Consumes: geradores públicos, catálogo atual e auth existente.
- Produces: DTOs de preparação manual/sintética e resposta com ordens explícitas canônicas.

- [ ] **Step 1: Avaliar `50fc384`**

Reaproveitar somente tipos que não colidam com schema atual nem inventem segunda
regra financeira. Registrar decisão por arquivo na matriz da Task 0.

- [ ] **Step 2: Escrever testes de request/response**

Cobrir payload válido, campo extra, seed, limites, Decimal, período e autenticação.

- [ ] **Step 3: Implementar contratos estritos**

Preparação retorna ordens e composição realizada. O resultado inclui versão do
contrato e fingerprint dos parâmetros; não executa a prévia.

- [ ] **Step 4: Integrar gerador oficial**

Chamar interfaces públicas existentes. Não copiar distribuição ou sorteio para
`servidor/` ou `web/`.

- [ ] **Step 5: Regenerar e verificar determinismo**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --check
python -m pytest tests/web_api/test_preparation_contracts.py tests/web_api/test_preparation_http.py -q
npm --prefix web run test:unit -- src/api/validators.test.ts
npm --prefix web run typecheck
```

- [ ] **Step 6: Commits focados**

Separar a fronteira contratual da integração real: `feat: define contratos de
preparação (MOT-23)` e `feat: publica preparação canônica de carteira (MOT-25)`.

## Task 3: Domínio do estudo v2, snapshots e fingerprints

**Issue:** MOT-24

**Files:**
- Create or Adapt: `web/src/study/domain.ts`
- Create or Adapt: `web/src/study/model.ts`
- Create or Adapt: `web/src/study/validation.ts`
- Create or Adapt: `web/src/study/fingerprints.ts`
- Create or Adapt: `web/src/study/resultState.ts`
- Create: `web/src/study/study.schema.json`
- Create: `web/src/study/fixtures.ts`
- Test: `web/src/study/*.test.ts`

**Interfaces:**
- Consumes: tipos da Task 1 e contratos gerados da Task 2.
- Produces: `StudyDocument`, `ScenarioDocument`, `PortfolioSourceSnapshot`, `ExecutionRecord` e funções puras.

- [ ] **Step 1: Auditar `1270458`**

Comparar modelo, validação, fingerprints e result state com S04. Reaproveitar testes
que continuem semanticamente corretos; não manter `StudyDocument` 1.0 por conveniência.

- [ ] **Step 2: Escrever testes das três origens**

```ts
expect(snapshot.source.kind).toBe('OBSERVED_CASE');
expect(snapshot.observedOutcome).toEqual(caseRecord.observedOutcome);
expect(() => mutateExecution(existing)).toThrow();
```

Cobrir sintética, manual e observada, além de alteração de nome que não muda
fingerprint e alteração de premissa que muda.

- [ ] **Step 3: Implementar agregados e comandos**

Funções `createStudy`, `renameStudy`, `duplicateStudy`, `updateScenario`,
`appendExecution` e `moveStudyToTrash` retornam novos documentos validados.

- [ ] **Step 4: Implementar schemas e validação runtime**

Schema rejeita campo extra, owner divergente, cenário base ausente, execução ligada a
revisão inexistente e envelope incompatível.

- [ ] **Step 5: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/study
npm --prefix web run typecheck
npm --prefix web run lint
```

- [ ] **Step 6: Commit**

Usar `feat: modela estudos e snapshots imutáveis (MOT-24)`.

## Task 4: Porta única de repositório e schema IndexedDB

**Issue:** MOT-26

**Files:**
- Create: `web/src/storage/applicationRepository.ts`
- Create: `web/src/storage/errors.ts`
- Create: `web/src/storage/indexedDbApplicationRepository.ts`
- Create: `web/src/storage/indexedDbApplicationRepository.test.ts`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Interfaces:**
- Consumes: empresas, casos e estudos das Tasks 1/3.
- Produces: `ApplicationRepository`, transações CAS e oito stores de S07.

- [ ] **Step 1: Fixar fake IndexedDB para testes**

Instalar a versão exata aprovada no plano do importador somente se ainda não estiver
presente.

- [ ] **Step 2: Definir porta sem tipos IDB**

```ts
export interface ApplicationRepository {
  listCompanies(): Promise<CompanyRecord[]>;
  listObservedCases(companyId?: string): Promise<ObservedCase[]>;
  getObservedCase(id: string): Promise<ObservedCase | null>;
  confirmObservedCase(input: ConfirmObservedCaseMutation): Promise<ObservedCase>;
  listStudies(options?: { includeDeleted?: boolean }): Promise<StudyDocument[]>;
  getStudy(id: string): Promise<StudyDocument | null>;
  saveStudy(input: CASMutation<StudyDocument>): Promise<StudyDocument>;
  restoreStudy(id: string, expectedRevision: number, operationId: string): Promise<StudyDocument>;
  purgeStudy(id: string): Promise<void>;
  close(): void;
}
```

`ConfirmObservedCaseMutation` contém `expectedRevision`, `operationId`, empresa,
caso, lotes e eventos a confirmar na mesma transação. `CASMutation<T>` contém
`expectedRevision`, `operationId` e documento completo validado. Callback não entra
na porta.

- [ ] **Step 3: Escrever testes de schema e isolamento**

Verificar nome do banco, stores, índices, round-trip, owner, ausência de File/Blob e
fechamento no logout.

- [ ] **Step 4: Implementar CAS e atomicidade**

Ler revisão, verificar idempotência, gravar entidades relacionadas e resolver a
promise somente em `transaction.oncomplete`.

- [ ] **Step 5: Testar corrida**

Duas instâncias salvam revisão 3; uma chega a 4 e outra recebe
`RevisionConflictError` sem escrita parcial.

- [ ] **Step 6: Rodar gates e commit**

```powershell
npm --prefix web run test:unit -- src/storage/indexedDbApplicationRepository.test.ts
npm --prefix web run typecheck
npm --prefix web run build
```

Commit `feat: unifica persistência local da aplicação (MOT-26)`.

## Task 5: Migrations, recuperação, lixeira e corrupção

**Issue:** MOT-27

**Files:**
- Create: `web/src/storage/migrations.ts`
- Create: `web/src/storage/migrations.test.ts`
- Create: `web/src/storage/recovery.test.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Fixtures: `web/src/storage/__fixtures__/`

**Interfaces:**
- Consumes: schema físico da Task 4 e formatos legados identificados na Task 0.
- Produces: `migrateDatabase`, leitura segura, lixeira e recuperação explícita.

- [ ] **Step 1: Criar fixtures legadas byte-estáveis**

Incluir rascunho da Etapa 1, estudo 1.0 da branch antiga e base experimental do
importador. Não usar objetos produzidos pelo schema atual como falsa fixture antiga.

- [ ] **Step 2: Escrever testes de migration falhando**

Cobrir sucesso, repetição idempotente, falha no meio, versão futura e documento
corrompido.

- [ ] **Step 3: Implementar migrations transacionais**

Cada passo recebe versão conhecida, valida saída e grava marcador somente no commit.
Versão futura retorna `SCHEMA_UNSUPPORTED`; corrupção retorna `DOCUMENT_CORRUPT`.

- [ ] **Step 4: Implementar lixeira**

Excluir marca `deletedAt`; restaurar incrementa revisão; purge remove estudo e
execuções numa transação. Caso observado referenciado não é apagado do snapshot.

- [ ] **Step 5: Implementar recuperação de rascunho**

Estado parcial de formulário pode ser reaberto sem declará-lo salvo. Tentativa
interrompida vira `INTERRUPTED` e nunca repete POST.

- [ ] **Step 6: Gates e commit**

```powershell
npm --prefix web run test:unit -- src/storage/migrations.test.ts src/storage/recovery.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Commit `feat: migra e recupera dados locais (MOT-27)`.

## Task 6: Controlador, autosave, sessão e múltiplas abas

**Issue:** MOT-28

**Files:**
- Create: `web/src/study/studyController.ts`
- Create: `web/src/study/studyController.test.ts`
- Modify: `web/src/app/providers.tsx`
- Modify: `web/src/app/queryClient.ts`

**Interfaces:**
- Consumes: repositório Tasks 4/5, auth e domínio Task 3.
- Produces: `StudyController`, autosave serial, epoch de sessão e protocolo de conflito.

- [ ] **Step 1: Escrever máquina de estados**

Estados: `IDLE`, `DIRTY`, `SAVING`, `SAVED`, `CONFLICT`, `STORAGE_FAILURE` e
`CLOSED`. Testar transições válidas e rejeitar chamada depois de `close`.

- [ ] **Step 2: Implementar fila de autosave e flush**

Última edição nunca ultrapassa uma escrita anterior. `flush()` resolve somente após
commit. Falha mantém o documento em memória e estado `STORAGE_FAILURE`.

- [ ] **Step 3: Implementar BroadcastChannel**

Canal transmite IDs e revisão, sem payload financeiro. Aba limpa recarrega; aba suja
entra em conflito. CAS decide a verdade.

- [ ] **Step 4: Implementar isolamento de sessão**

Troca de usuário incrementa epoch, cancela queries/fetches, fecha banco e impede
retorno tardio de ser aplicado.

- [ ] **Step 5: Testar A → B → A e duas abas**

Nenhum estudo, query ou retorno de A aparece em B. Retornar a A reabre seu banco sem
perda.

- [ ] **Step 6: Gates e commit**

```powershell
npm --prefix web run test:unit -- src/study/studyController.test.ts src/app
npm --prefix web run typecheck
npm --prefix web run lint
```

Commit `feat: controla estudos e concorrência local (MOT-28)`.

## Task 7: Resolver origens e construir request canônico

**Issue:** MOT-64

**Files:**
- Create: `web/src/preparation/resolvePortfolioSource.ts`
- Create: `web/src/preparation/resolvePortfolioSource.test.ts`
- Create: `web/src/preparation/buildPreviewRequest.ts`
- Create: `web/src/preparation/buildPreviewRequest.test.ts`
- Modify: `web/src/api/client.ts`

**Interfaces:**
- Consumes: Caso Observado, autoria, receita sintética e API de preparação.
- Produces: `resolvePortfolioSource(source): Promise<PortfolioSourceSnapshot>` e `buildPreviewRequest(snapshot, premises, period): PreviaRequest`.

- [ ] **Step 1: Escrever fixtures douradas das três origens**

As três produzem ordens explícitas com mesma ordenação canônica e proveniência
correta. Caso observado não chama gerador; sintético chama preparação do servidor.

- [ ] **Step 2: Implementar resolução observada**

Exigir `CONFIRMED`, copiar ordens e resultado observado, registrar revisão e
fingerprint. Não modificar o caso.

- [ ] **Step 3: Implementar resolução manual/sintética**

Manual usa preparação validada; sintética registra recipe, seed e composição
realizada retornada pelo servidor.

- [ ] **Step 4: Implementar request**

Usar tipos gerados e validator runtime. Ordenar ordens de modo canônico, medir
tamanho e rejeitar limite antes da rede.

- [ ] **Step 5: Provar ausência de dados indevidos**

JSON não contém filename, nome bruto, correções internas, arquivo, Blob ou histórico
de eventos.

- [ ] **Step 6: Gates e commit**

```powershell
npm --prefix web run test:unit -- src/preparation
npm --prefix web run typecheck
npm --prefix web run lint
```

Commit `feat: resolve origens para execução canônica (MOT-64)`.

## Task 8: Editor de estudo e carteira

**Issue:** MOT-30

**Files:**
- Create: `web/src/pages/StudiesPage.tsx`
- Create: `web/src/pages/StudyPortfolioPage.tsx`
- Create: `web/src/study/components/StudyList.tsx`
- Create: `web/src/study/components/StudyEditor.tsx`
- Create: `web/src/study/components/PortfolioSourceSelector.tsx`
- Create: `web/src/study/components/studyEditor.test.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/router.test.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: controlador, domínio e resolução das Tasks 3/6/7.
- Produces: lista e editor acessíveis das três origens.

- [ ] **Step 1: Implementar lista**

Criar, abrir, renomear, duplicar, excluir e restaurar. Mostrar origem, estado do
resultado, data e conflito. Ações destrutivas confirmam alvo exato.

- [ ] **Step 2: Implementar seletor de origem**

Troca de origem exige confirmação quando descarta autoria não salva. Caso observado
lista apenas confirmados da conta e mostra empresa, janela, ordens, total e qualidade.

- [ ] **Step 3: Implementar autoria manual e exemplos sintéticos**

Preservar grupos, participantes, herança, overrides, frequência, ticket, direção,
prazo, finalidade e os cinco exemplos aprovados.

- [ ] **Step 4: Implementar premissas e proveniência**

Campos tipados, Decimal como texto, origem visível e validação local. Não aceitar
alteração direta de ordem observada como se a fonte tivesse mudado.

- [ ] **Step 5: Testar interação e acessibilidade**

Cobrir teclado, foco, erro inline, troca de origem, conflito, autosave, zoom 200% e
layout desktop.

- [ ] **Step 6: Gates e commit**

```powershell
npm --prefix web run test:unit -- src/study/components/studyEditor.test.tsx src/app/router.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Commit `feat: entrega editor completo de estudos (MOT-30)`.

## Task 9: Orquestração de execução e histórico imutável

**Issue:** MOT-29

**Files:**
- Modify: `web/src/preview/PreviewProvider.tsx`
- Modify: `web/src/preview/PreviewProvider.test.tsx`
- Create: `web/src/study/executionService.ts`
- Create: `web/src/study/executionService.test.ts`
- Create: `web/src/study/components/ExecutionHistory.tsx`

**Interfaces:**
- Consumes: controller, request Task 7 e cliente real.
- Produces: `executeStudyScenario` e restauração validada de envelopes persistidos.

- [ ] **Step 1: Escrever testes de tentativa**

Cobrir flush, reserva CAS, duplo clique, falha HTTP, resposta atrasada, troca de
conta, edição durante POST e falha ao salvar resposta.

- [ ] **Step 2: Generalizar PreviewProvider**

Preservar fluxo de referência e expor execução de request explícito e restauração de
envelope validado. Nenhum retry automático de POST.

- [ ] **Step 3: Implementar serviço**

Ordem: flush → snapshot → request → reserva → POST → validação → anexação. Mudança
durante POST guarda resultado como histórico desatualizado, não atual.

- [ ] **Step 4: Implementar histórico**

Listar status, momento, versão, origem e fingerprint. Selecionar execução antiga não
altera autoria. Nova tentativa cria novo ID.

- [ ] **Step 5: Gates e commit**

```powershell
npm --prefix web run test:unit -- src/study/executionService.test.ts src/preview/PreviewProvider.test.tsx
npm --prefix web run typecheck
npm --prefix web run build
```

Commit `feat: executa e preserva histórico de estudos (MOT-29)`.

## Task 10: Resultado básico e Observado × Motor

**Issue:** MOT-31

**Files:**
- Create: `web/src/cases/fingerprints.ts`
- Create: `web/src/cases/observedComparison.ts`
- Create: `web/src/cases/observedComparison.test.ts`
- Create: `web/src/ui/ObservedComparisonTable.tsx`
- Create: `web/src/ui/ObservedComparisonTable.test.tsx`
- Create: `web/src/pages/StudyResultPage.tsx`
- Modify: `web/src/ui/ComparisonSummary.tsx`
- Modify: `web/src/presentation/format.ts`

**Interfaces:**
- Consumes: `ObservedOutcome` e `PreviewEnvelope`.
- Produces: `ObservedComparison` e resultado com seções semanticamente separadas.

- [ ] **Step 1: Fixar registro de compatibilidade**

Cada código observado aponta para caminho canônico, unidade e versão de definição.
Código sem mapeamento é `INCOMPATIBLE`, nunca aproximado.

- [ ] **Step 2: Escrever testes de comparação**

Cobrir igualdade, diferença, denominador zero, ausente, unidade incompatível e
definição incompatível. Usar Decimal para diferença.

- [ ] **Step 3: Implementar função pura**

Não aplicar tolerância oculta. Percentual é `null` quando não definido. Ordenação
segue registro, não ordem da fonte.

- [ ] **Step 4: Implementar resultado básico**

Mostrar mecanismos canônicos, volumes, resíduos, custos, economia, netabilidade,
versões, origem e histórico. `ComparisonSummary` não recebe dados observados.

- [ ] **Step 5: Implementar tabela observada**

Estados legíveis, valores tabulares, explicação de incompatibilidade e `não
informado`. Sem cor como único sinal.

- [ ] **Step 6: Gates e commit**

```powershell
npm --prefix web run test:unit -- src/cases/observedComparison.test.ts src/ui/ObservedComparisonTable.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Commit `feat: concilia observado e motor (MOT-31)`.

## Task 11: E2E, migrations reais, segurança e desempenho

**Issue:** MOT-32

**Files:**
- Create: `web/e2e/study-observed.spec.ts`
- Create: `web/e2e/study-synthetic.spec.ts`
- Create: `web/e2e/study-concurrency.spec.ts`
- Create: `tests/web_api/test_stage2_acceptance.py`
- Modify: `.github/workflows/test.yml`
- Modify: `tests/web_api/scan_credentials.py`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: solução Tasks 1–10.
- Produces: evidência real em Chromium, API e motor.

- [ ] **Step 1: Percurso observado**

Fixture anonimizada: confirmar caso, criar estudo, executar, ver comparação, recarregar,
editar cenário derivado e preservar execução anterior.

- [ ] **Step 2: Percurso sintético/manual**

Executar exemplo sintético e carteira manual pelo mesmo serviço e validar envelope
persistido após reload.

- [ ] **Step 3: Duas abas e duas contas**

Provar CAS, conflito visível, isolamento A/B, retorno a A e ausência de payload entre
abas.

- [ ] **Step 4: Migrations e falhas reais do browser**

Carregar fixtures legadas, interromper tentativa, injetar quota, blocked e corrupção.
Não confundir injeção com falha física; registrar o limite do teste.

- [ ] **Step 5: Fronteira de rede e segredo**

Inspecionar requests; não transmitir arquivo, nomes brutos, tokens em URL ou histórico
de edição. Scanner continua verde.

- [ ] **Step 6: Gates completos**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
python -m pytest -q
python -O -m pytest -q
python -m ruff check servidor tests
python -m mypy servidor
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
npm --prefix web run test:e2e
python -m tests.web_api.scan_credentials
git diff --check
```

- [ ] **Step 7: Commit**

Usar `test: fecha percurso completo da etapa 2 (MOT-32)`.

## Task 12: Aceitação, documentação e handoff

**Issue:** MOT-33

**Files:**
- Create: `docs/frontend/etapa-2-v2-operacao.md`
- Create: `docs/frontend/etapa-2-v2-aceitacao.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/architecture.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: este plano somente para evidências finais

**Interfaces:**
- Consumes: gates e evidências Task 11.
- Produces: operação reproduzível, aceitação e fronteiras para Etapa 3.

- [ ] **Step 1: Conferir os 12 critérios S15**

Cada critério aponta para teste, comando, SHA e evidência. Falha ou não executado não
vira aprovado.

- [ ] **Step 2: Documentar operação**

Iniciar ambiente, criar estudo, importar/selecionar caso, executar, reabrir, resolver
conflito, recuperar storage e limpar dados da conta.

- [ ] **Step 3: Documentar contratos efetivos**

Registrar schema local, stores, migrations, tipos públicos, fingerprints, limites,
erros e versões realmente implementados.

- [ ] **Step 4: Revisão crítica**

Usar `superpowers:requesting-code-review` e `project-auditor`. Rastrear origem →
snapshot → request → API → motor → resultado → persistência → conciliação.

- [ ] **Step 5: Finalizar branch**

Usar `superpowers:verification-before-completion` e
`superpowers:finishing-a-development-branch`. Merge depende de CI e aprovação do
Gabriel; não iniciar Etapa 3 automaticamente.

## Dependências

```text
T0
├── T1 ── T3 ── T4 ── T5 ── T6
└── T2 ────────────────┬───── T7
                       └───── T8
T6 + T7 + T8 ── T9 ── T10 ── T11 ── T12
```

Ordem linear segura: **T0, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12**.
Paralelismo só depois de contratos fechados e autorização explícita.

## Matriz de cobertura

| Requisito | Tarefas |
|---|---|
| Empresa leve, Caso Observado e proveniência | T1, T4 |
| Preparação oficial manual/sintética | T2, T7 |
| Estudo, cenário, snapshot e execução | T3, T9 |
| Repositório único, CAS e atomicidade | T4 |
| Migrations, lixeira e recuperação | T5 |
| Sessão, autosave e múltiplas abas | T6 |
| Três origens e request canônico | T7 |
| Editor completo e acessível | T8 |
| Execução e histórico | T9 |
| Observado × Motor | T10 |
| E2E, auth, segurança e desempenho | T11 |
| Aceitação e handoff | T12 |

## Critério de conclusão

A Etapa 2 só termina quando todas as origens executam, dados sobrevivem a recarga e
conflitos, histórico é imutável, conciliação é semanticamente segura, migrations são
comprovadas e todos os gates passam na mesma revisão publicada.
