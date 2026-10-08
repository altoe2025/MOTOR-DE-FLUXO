# Etapa 6A — Integração da Importação XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o importador XLSX comprovado para os contratos atuais e entregar o
percurso local XLSX → Caso Observado → Empresa → Perfil → Estudo.

**Architecture:** Parser, validação e projeção permanecem módulos puros em
`web/src/importer`; arquivo é inspecionado e lido em Web Worker. A publicação final
usa uma única mutação no `ApplicationRepository`; não existe banco, Estudo ou
execução próprios do importador.

**Tech Stack:** TypeScript 5.9, React 19.3, IndexedDB, Web Workers, Decimal.js
10.6.0, fflate 0.8.3, read-excel-file 9.3.10, saxen 11.1.1, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-frontend-etapa-6-comunicacao-publicacao-design.md`

## Global Constraints

- Preservar os requisitos de `2026-09-19-importacao-dados-reais-design-v2.md`.
- Suportar no piloto somente `xlsx-operacoes/1.0.0`.
- Não portar `ImportStudy`, `ImportRepository`, `indexedDbRepository.ts`,
  `previewAdapter.ts` ou execução acoplada da pilha antiga.
- Não persistir `File`, `Blob`, `ArrayBuffer`, XML, células brutas ou nomes brutos.
- Não enviar XLSX ao FastAPI.
- `ObservedCase.schemaVersion` permanece `2.0.0`.
- Valores BRL são strings decimais sem expoente.
- Confirmação com blocker é proibida; avisos não são descartados.
- Todo commit usa a issue existente indicada e atualiza o Diário.

## Model routing

| Tasks | Modelo | Esforço | Regra |
|---|---|---|---|
| A0 | `gpt-6-astra` | high | reconciliação arquitetural |
| A1 | `gpt-6-luna` | high | revisão `gpt-6-sol` medium antes do commit |
| A2 | `gpt-6-sol` | high | domínio e validação |
| A3 | `gpt-6-astra` | high | transação, CAS e owner |
| A4 | `gpt-6-luna` | high | revisão `gpt-6-sol` medium |
| A5 | `gpt-6-sol` | high | integração React completa |
| A6 | `gpt-6-astra` | high | privacidade e aceite transversal |

Luna sobe para Sol ao tocar contrato compartilhado não previsto; Sol sobe para
Astra diante de risco sistêmico ou duas falhas repetidas. Registre o desvio no Diário.

---

### Task A0: Auditoria de portabilidade e baseline

**Issue:** MOT-90 para a reconciliação; MOT-49–MOT-61 permanecem como
issues de implementação dos módulos.

**Files:**
- Create: `docs/frontend/etapa-6-importacao-portabilidade.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: `origin/test/importacao-xlsx-aceitacao`, HEAD da Etapa 5 e contratos
  atuais de Caso/Repository.
- Produces: matriz `PORTAR`, `REESCREVER`, `DESCARTAR` por arquivo e SHA de base.

- [ ] **Step 1: Provar a divergência sem alterar a árvore**

```powershell
git merge-base HEAD origin/test/importacao-xlsx-aceitacao
git rev-list --left-right --count HEAD...origin/test/importacao-xlsx-aceitacao
git diff --stat HEAD...origin/test/importacao-xlsx-aceitacao -- web/src/importer web/src/storage web/src/app servidor
```

Expected: base `c2ad175`; a pilha não é ancestral direta de HEAD.

- [ ] **Step 2: Classificar os arquivos**

Registre pelo menos:

```text
PORTAR: dates, decimals, normalization, validation, xlsxPreflight, xlsxParser,
        xlsx.worker, workerClient e fixtures seguras.
REESCREVER: domain, clients, portfolio, eligibility, controller, components,
           catalogClient e publisher.
DESCARTAR: ImportStudy, ImportRepository, indexedDbRepository, previewAdapter,
          ExecutionConfirmation e qualquer execução dentro do importador.
```

- [ ] **Step 3: Verificar contratos atuais**

Confirme que `ObservedCaseDraft`, `ObservedCase`, `CompanyRecord`,
`ConfirmObservedCaseMutation`, `calculateOperationalProfile` e
`attachProfileToCurrentStudy` são as únicas fronteiras de saída necessárias.

- [ ] **Step 4: Rodar baseline focado**

```powershell
npm --prefix web run test:unit -- src/cases src/storage src/profiles src/study
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 5: Commitar a matriz**

Commit `docs: reconcilia pilha da importação (MOT-90)`.

### Task A1: Portar preflight, parser e normalização

**Issues:** MOT-50, MOT-51 e MOT-52.

**Files:**
- Create: `web/src/importer/errors.ts`
- Create: `web/src/importer/dates.ts`
- Create: `web/src/importer/decimals.ts`
- Create: `web/src/importer/normalization.ts`
- Create: `web/src/importer/xlsxPreflight.ts`
- Create: `web/src/importer/xlsxParser.ts`
- Create: `web/src/importer/xlsx.worker.ts`
- Create: `web/src/importer/workerClient.ts`
- Create: testes e `web/src/importer/__fixtures__/*.xlsx`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Interfaces:**
- Consumes: `File` somente em `parseCanonicalXlsx(file, signal)`.
- Produces:

```ts
export type ParsedImport = Readonly<{
  layout: 'xlsx-operacoes/1.0.0';
  sha256: string;
  byteSize: number;
  rows: readonly ParsedImportRow[];
}>;

export async function parseCanonicalXlsx(
  file: File,
  signal: AbortSignal,
): Promise<ParsedImport>;
```

- [ ] **Step 1: Fixar dependências exatas**

```powershell
npm --prefix web install --save-exact fflate@0.8.3 read-excel-file@9.3.10 saxen@11.1.1
```

Expected: somente `package.json` e lock mudam.

- [ ] **Step 2: Portar testes estruturais antes do código**

Traga fixtures válida mínima, 1.000 linhas, fórmula, merge, macro, link externo,
aba extra, headers errados, 1.001 linhas e ZIP excessivo. Remova metadados pessoais.

- [ ] **Step 3: Rodar os testes para confirmar falha**

```powershell
npm --prefix web run test:unit -- src/importer/xlsxPreflight.test.ts src/importer/xlsxParser.test.ts src/importer/workerClient.test.ts
```

Expected: FAIL porque os módulos ainda não existem.

- [ ] **Step 4: Portar somente as unidades puras**

Mantenha os limites e códigos da pilha MOT-51. Adapte imports ao TypeScript atual;
não traga tipos de `ImportStudy` ou repositório antigo.

- [ ] **Step 5: Provar cancelamento e fronteira serializável**

O teste inicia parsing, aborta, confirma término do worker e verifica que o resultado
tardio não é publicado. `ParsedImport` não contém `File`, buffer ou XML.

- [ ] **Step 6: Rodar gate**

```powershell
npm --prefix web run test:unit -- src/importer/xlsxPreflight.test.ts src/importer/xlsxParser.test.ts src/importer/workerClient.test.ts src/importer/dates.test.ts src/importer/decimals.test.ts src/importer/normalization.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Expected: PASS.

- [ ] **Step 7: Commitar por responsabilidade**

Use commits `feat: porta domínio canônico da importação (MOT-50)`,
`feat: porta parser XLSX seguro (MOT-51)` e
`feat: porta validação por linha (MOT-52)`, cada um com sua entrada de Diário.

### Task A2: Projetar clientes, lotes, correções e elegibilidade

**Issues:** MOT-53, MOT-54 e MOT-55.

**Files:**
- Create: `web/src/importer/domain.ts`
- Create: `web/src/importer/clients.ts`
- Create: `web/src/importer/portfolio.ts`
- Create: `web/src/importer/eligibility.ts`
- Create: testes correspondentes

**Interfaces:**
- Consumes: `ParsedImport`, `CompanyRecord` selecionada e `ownerSub`.
- Produces:

```ts
export type ImportReview = Readonly<{
  company: CompanyRecord;
  draft: ObservedCaseDraft;
  batches: readonly ImportBatchRecord[];
  events: readonly ImportEventRecord[];
  blockers: readonly DataQualityIssue[];
  warnings: readonly DataQualityIssue[];
}>;

export function createImportReview(input: CreateImportReviewInput): ImportReview;
export function applyImportCommand(
  review: ImportReview,
  command: ImportCommand,
): ImportReview;
```

- [ ] **Step 1: Escrever testes de aliases e identidade**

Cubra NFKC, espaços, caixa, diacríticos conforme regra existente, alias explícito,
sem fuzzy merge e UUID estável por identidade confirmada.

- [ ] **Step 2: Escrever testes de lote e conflito**

Cubra ID novo, repetido idêntico, repetido divergente, resolução explícita,
exclusão/restauração e reversão determinística do lote.

- [ ] **Step 3: Escrever testes de projeção para Caso Observado**

Exija datas ISO, direção, Decimal, finalidade nullable, `efxStatus: NOT_COLLECTED`,
totais OUT/IN reconciliados e proveniência por campo.

- [ ] **Step 4: Implementar comandos puros**

`ImportCommand` é união discriminada para corrigir campo, associar alias, resolver
conflito, excluir, restaurar e reverter lote. Nenhum comando recebe callback.

- [ ] **Step 5: Implementar bloqueios**

Empresa ausente, direção desconhecida, valor não positivo, data inválida, duplicata
não resolvida, total divergente e posição não identificada entram em `blockers`.
Finalidade ausente permitida e eFX não coletado entram em `warnings` conforme os
contratos atuais.

- [ ] **Step 6: Rodar gate**

```powershell
npm --prefix web run test:unit -- src/importer/clients.test.ts src/importer/portfolio.test.ts src/importer/eligibility.test.ts src/cases/domain.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 7: Commitar**

Use MOT-53 para identidade, MOT-54 para lotes e MOT-55 para correções/elegibilidade.

### Task A3: Publicar atomicamente no ApplicationRepository

**Issue:** MOT-56.

**Files:**
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.test.ts`
- Create: `web/src/importer/publisher.ts`
- Create: `web/src/importer/publisher.test.ts`

**Interfaces:**
- Consumes: `ImportReview` sem blockers.
- Produces:

```ts
export async function confirmImport(
  review: ImportReview,
  repository: ApplicationRepository,
  operationId: string,
): Promise<ObservedCase>;
```

- [ ] **Step 1: Enriquecer registros persistíveis**

`ImportBatchRecord` guarda ID, sequência, owner, empresa, hash, tamanho, versão do
layout e contagens. `ImportEventRecord` guarda sequência, kind, path e valores de
auditoria permitidos. Nenhum dos dois guarda nome bruto, células ou binário.

- [ ] **Step 2: Escrever teste atômico que falha**

Force erro ao gravar cada store e confirme ausência de Empresa, Caso, lote, evento e
operation parcial. Repetir `operationId` retorna o mesmo Caso.

- [ ] **Step 3: Implementar publisher**

Revalide `ObservedCase` imediatamente antes de chamar
`repository.confirmObservedCase`. Recuse blockers e owner divergente.

- [ ] **Step 4: Testar CAS, duas contas e tipos proibidos**

Duas instâncias na mesma revisão: uma confirma; outra recebe conflito. Conta B não
lê o caso. Mutation contendo `File`, `Blob` ou `ArrayBuffer` falha antes de abrir a
transação.

- [ ] **Step 5: Rodar gate**

```powershell
npm --prefix web run test:unit -- src/importer/publisher.test.ts src/storage/indexedDbApplicationRepository.test.ts src/storage/recovery.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 6: Commitar**

Commit `feat: integra importação ao repositório compartilhado (MOT-56)`.

### Task A4: Reconciliar catálogo autenticado

**Issues:** MOT-57 e MOT-58.

**Files:**
- Create: `servidor/catalogs/__init__.py`
- Create: `servidor/catalogs/importacao.py`
- Create: `servidor/catalogs/importacao.v1.json`
- Create: `servidor/contracts/importation.py`
- Create: `servidor/routes/importation.py`
- Modify: `servidor/app.py`
- Modify: `pyproject.toml`
- Modify/Regenerate: contratos OpenAPI e cliente web
- Create: `web/src/importer/catalogClient.ts`
- Create: testes Python e TypeScript

**Interfaces:**
- Consumes: bearer auth existente.
- Produces: `GET /api/v1/catalogos/importacao`, autenticado, `no-store`, com catálogo
  versionado e estado explícito `NAO_CONFIGURADO`.

- [ ] **Step 1: Portar testes do catálogo**

Exija schema, hash determinístico, autenticação, `Cache-Control: no-store` e ausência
de finalidades inventadas em produção.

- [ ] **Step 2: Implementar contrato e rota**

Inclua o JSON como package data. A rota lê recurso empacotado, valida na inicialização
e devolve modelo congelado.

- [ ] **Step 3: Regenerar cliente oficial**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
```

- [ ] **Step 4: Implementar cliente web**

Use `ApiClient`; não crie fetch paralelo sem tratamento uniforme de 401, timeout e
schema. Catálogo ausente bloqueia confirmação executável, não a revisão local.

- [ ] **Step 5: Rodar gate**

```powershell
python -m pytest tests/web_api/test_import_catalog.py tests/web_api/test_openapi.py -q
python -O -m pytest tests/web_api/test_import_catalog.py -q
python -m ruff check servidor tests/web_api
python -m mypy servidor
npm --prefix web run test:unit -- src/importer/catalogClient.test.ts src/api/client.test.ts
npm --prefix web run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commitar**

Use MOT-57 para servidor/contrato e MOT-58 para cliente/configuração.

### Task A5: Entregar fluxo React até Perfil e Estudo

**Issue:** MOT-60.

**Files:**
- Create: `web/src/importer/controller.ts`
- Create: `web/src/importer/components/ImportFlowPage.tsx`
- Create: `web/src/importer/components/UploadStep.tsx`
- Create: `web/src/importer/components/ReviewStep.tsx`
- Create: `web/src/importer/components/CaseConfirmation.tsx`
- Create: testes correspondentes
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/src/companies/CompaniesPage.tsx`
- Modify: `web/src/companies/CompanyCasesPage.tsx`
- Modify: `web/src/companies/CompanyProfilesPage.tsx`
- Modify: `servidor/static.py`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: parser, domínio, publisher, `StudyController` e rotas existentes.
- Produces: `/importar` e `/empresas/:companyId/importar`, terminando em
  `{caseId, revision}` e ações explícitas de continuidade.

- [ ] **Step 1: Testar máquina de estados**

Cubra `SELECTING_SOURCE → INSPECTING → PARSING → REVIEW_REQUIRED →
READY_TO_CONFIRM → CONFIRMING → CONFIRMED`, cancelamento e troca de sessão.

- [ ] **Step 2: Implementar controller sem execução**

O controller recebe portas de parser e publisher. `confirm()` retorna apenas Caso;
não chama preparação, prévia ou diagnóstico.

- [ ] **Step 3: Escrever testes de rota e interação**

Cubra arquivo válido, inválido, correção, alias, conflito, confirmação, reload,
empresa predefinida, foco, teclado e mensagens de erro.

- [ ] **Step 4: Implementar upload e revisão**

Input `accept=.xlsx`, botão **Ler planilha**, progresso/cancelamento, tabela semântica
filtrável e ações de correção. Nenhum processamento começa na seleção do arquivo.

- [ ] **Step 5: Implementar continuidade explícita**

Após confirmar, ofereça links para Caso, Perfis da Empresa e Estudos. Em Perfis,
pré-selecione o novo Caso somente por query validada; confirmação da nova versão
continua manual. Anexação ao Estudo continua usando `ProfileVersionList`.

- [ ] **Step 6: Atualizar fallback SPA**

Aceite `/importar` e `/empresas/:companyId/importar`; continue recusando caminhos
arbitrários e traversal.

- [ ] **Step 7: Rodar gate**

```powershell
npm --prefix web run test:unit -- src/importer/components src/importer/controller.test.ts src/app/router.test.ts src/companies
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
python -m pytest tests/web_api/test_static.py -q
```

Expected: PASS.

- [ ] **Step 8: Commitar**

Commit `feat: integra fluxo visual de importação ao produto (MOT-60)`.

### Task A6: Aceite ponta a ponta e privacidade

**Issue:** MOT-61.

**Files:**
- Create: `web/e2e/import-observed-case.spec.ts`
- Create: `web/e2e/fixtures/*.xlsx`
- Modify: `web/playwright.config.ts`
- Modify: `tests/web_api/scan_credentials.py`
- Modify: `.github/workflows/test.yml`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: A1–A5.
- Produces: evidência reproduzível do percurso XLSX → Caso → Perfil → Estudo.

- [ ] **Step 1: Escrever E2E principal**

Importe XLSX, revise, confirme, crie Perfil, anexe a Estudo, execute diagnóstico e
abra Replay. Recarregue entre Caso, Perfil e Estudo para provar persistência.

- [ ] **Step 2: Escrever E2E de falhas**

Cubra estrutura proibida, linha inválida, conflito, cancelamento, CAS de duas abas e
conta B vazia. Nenhum caso parcial pode aparecer.

- [ ] **Step 3: Instrumentar privacidade**

Capture requests e IndexedDB. Falhe se encontrar XLSX, ZIP `PK`, `File`, `Blob`,
`ArrayBuffer`, XML, célula bruta ou nome original do arquivo.

- [ ] **Step 4: Medir fixture de 1.000 linhas**

Registre ambiente, tempo de parsing, tarefas longas, memória aproximada e tamanho do
Caso. Não transforme esse limite de importação em promessa de 1.000 ordens no Replay.

- [ ] **Step 5: Rodar verificação completa**

Execute o gate global do plano mestre, exceto Docker/Render ainda não implementados.

- [ ] **Step 6: Revisar e commit**

Use `project-auditor` para rastrear arquivo → worker → revisão → transação → Caso →
Perfil → Estudo. Commit `test: fecha integração da importação XLSX (MOT-61)`.
