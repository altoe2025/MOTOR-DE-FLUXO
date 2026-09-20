# Front-end Etapa 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar Empresas, Casos Observados, Perfis Operacionais versionados e diagnóstico robusto com fila, múltiplas repetições, sete eixos e comparação temporal, preservando os contratos integrados das Etapas 1 e 2.

**Architecture:** O navegador calcula perfis por funções puras e persiste versões imutáveis por `ApplicationRepository`; Perfil pode ser anexado como evidência a um estudo, mas não vira origem executável. O servidor expõe um executor de diagnóstico em processos, com jobs autenticados, progresso consultável, cancelamento cooperativo e resultados canônicos; o estudo persiste somente reserva e terminal append-only.

**Tech Stack:** React 19.3, TypeScript 5.9, React Router 7.18, TanStack Query 5.102, Decimal.js 10.6, ECharts 6.1.0, IndexedDB, Vitest 5, Playwright 1.63, FastAPI 0.141, Pydantic 2.13, `concurrent.futures.ProcessPoolExecutor` e pacote Python `motor`.

**Spec:** `docs/superpowers/specs/2026-09-20-frontend-etapa-3-design.md`

**Estado de execução:** T0–T12 executadas localmente em `codex/frontend-etapa-3`.
Gate global final verde em `03e87b8`; aceite técnico `CONDITIONAL` porque S15.14
ainda carece de prova browser específica da página robusta por teclado e a 200%.
Não houve push, PR, CI publicado ou merge.

## Global Constraints

- Basear cada worktree futura em `main` contendo `97601bf290128a199668f15efd9980beb5ca4ef8` ou sucessor explicitamente aprovado.
- Não alterar `motor/`, P0, custo, números ou medições sem necessidade demonstrada e aprovação explícita.
- `ApplicationRepository` continua sendo a única porta de persistência; componentes não usam IndexedDB.
- `ObservedOutcome` e resultado do motor permanecem independentes.
- Execuções, versões de perfil e snapshots são imutáveis e append-only.
- Perfil descreve observações; `PortfolioSource` continua com três origens na Etapa 3.
- Ausência, incompatibilidade e cobertura insuficiente nunca são convertidas em zero.
- Contratos públicos são regenerados somente por `python -m servidor.export_openapi` e `npm --prefix web run generate:api`.
- Invariantes Python usam `raise`, nunca `assert`.
- Nenhum arquivo real, payload bruto, binário ou credencial entra no repositório.
- Não usar linguagem de pareamento físico entre operações.
- Não implementar variantes, marginal, Replay, chat, PDF, apresentação ou publicação.
- Não criar nem alterar issues no Linear. T0–T12 são IDs locais.
- Não fazer push, PR ou merge sem autorização explícita.
- Toda task que for publicada atualiza `docs/DIARIO-DE-MUDANCAS.md` no mesmo commit;
  T12 consolida o estado final, não corrige o diário retroativamente.

---

## 1. Decisões que são gate de implementação

Este plano é executável sob as recomendações da especificação, mas T0 não pode
começar até haver aprovação explícita de:

- IndexedDB físico/lógico 2, `StudyDocument` 3.0.0 e Perfil 1.0.0;
- cálculo local do Perfil;
- Perfil como snapshot de evidência, sem quarta origem;
- distribuição indisponível para entrada fixa;
- opções 10/30/100, máximo 100;
- dois workers por padrão, configuráveis entre um e quatro;
- três jobs por usuário, 32 globais e retenção em memória por 24 horas;
- cancelamento cooperativo entre repetições e fila não durável.

Sem essa aprovação, o executor deve parar antes de editar código.

## 2. Mapa exato de arquivos

### 2.1 Perfil, Empresas e comparação temporal

```text
web/src/profiles/
  domain.ts
  compatibility.ts
  calculateOperationalProfile.ts
  fingerprints.ts
  validation.ts
  operationalProfile.schema.json
  *.test.ts
  components/
    ProfileBuilder.tsx
    ProfileCoverage.tsx
    ProfileVersionList.tsx
    *.test.tsx

web/src/companies/
  companyOverview.ts
  caseFilters.ts
  studyLinks.ts
  temporalComparison.ts
  *.test.ts
  components/
    CompanyList.tsx
    CompanySummary.tsx
    ObservedCaseHistory.tsx
    TemporalComparison.tsx
    *.test.tsx

web/src/pages/
  CompaniesPage.tsx
  CompanyPage.tsx
  CompanyCasesPage.tsx
  CompanyProfilesPage.tsx
  CompanyStudiesPage.tsx
```

### 2.2 Persistência e estudos

```text
web/src/storage/applicationRepository.ts
web/src/storage/indexedDbApplicationRepository.ts
web/src/storage/migrations.ts
web/src/storage/__fixtures__/application-database-v1-stage2.json
web/src/storage/*.test.ts
web/src/study/model.ts
web/src/study/domain.ts
web/src/study/validation.ts
web/src/study/study.schema.json
web/src/study/*.test.ts
```

### 2.3 Diagnóstico no servidor

```text
servidor/contracts/diagnostics.py
servidor/diagnostics/__init__.py
servidor/diagnostics/analysis.py
servidor/diagnostics/consequences.py
servidor/diagnostics/executor.py
servidor/diagnostics/service.py
servidor/routes/diagnostics.py
servidor/app.py
servidor/config.py
servidor/contracts/__init__.py
tests/web_api/test_diagnostics_contracts.py
tests/web_api/test_diagnostics_analysis.py
tests/web_api/test_diagnostics_executor.py
tests/web_api/test_diagnostics_http.py
```

### 2.4 Diagnóstico no front-end

```text
web/src/diagnostics/
  domain.ts
  buildDiagnosticRequest.ts
  diagnosticExecutionService.ts
  queries.ts
  presentation.ts
  *.test.ts
  components/
    DiagnosticControls.tsx
    DiagnosticProgress.tsx
    DiagnosticDistribution.tsx
    DiagnosticAxes.tsx
    DiagnosticEvidence.tsx
    EChart.tsx
    *.test.tsx

web/src/pages/StudyDiagnosticPage.tsx
web/src/api/client.ts
web/src/api/client.test.ts
web/src/app/router.tsx
web/src/app/router.test.tsx
web/src/app/AppShell.tsx
web/src/app/providers.tsx
web/src/styles/global.css
web/package.json
web/package-lock.json
```

### 2.5 Contratos gerados e aceite

```text
contracts/openapi.json
web/src/api/generated.ts
web/src/api/schemas.json
web/src/api/validators.ts
web/src/api/validators.test.ts
web/e2e/company-profiles.spec.ts
web/e2e/diagnostic-jobs.spec.ts
web/e2e/stage2-regression.spec.ts
tests/web_api/test_stage3_acceptance.py
docs/frontend/etapa-3-operacao.md
docs/frontend/etapa-3-aceitacao.md
docs/MAPA.md
docs/architecture.md
docs/testing.md
docs/DIARIO-DE-MUDANCAS.md
```

## 3. Interfaces transversais congeladas

```ts
export type EvidenceValue<T> =
  | Readonly<{ state: 'AVAILABLE'; value: T; evidence: readonly string[] }>
  | Readonly<{ state: 'NOT_COLLECTED' | 'INSUFFICIENT_COVERAGE' | 'INCOMPATIBLE'; reason: string; evidence: readonly string[] }>;

export interface ApplicationRepositoryV3 extends ApplicationRepository {
  listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]>;
  getOperationalProfileVersion(id: string): Promise<OperationalProfileVersion | null>;
  appendOperationalProfileVersion(input: AppendProfileVersionMutation): Promise<OperationalProfileVersion>;
}

export type ExecutionRecordV3 = PreviewExecutionRecord | DiagnosticExecutionRecord;
```

```py
class DiagnosticJobState(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    AGGREGATING = "AGGREGATING"
    CANCEL_REQUESTED = "CANCEL_REQUESTED"
    CANCELLED = "CANCELLED"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
```

Qualquer alteração dessas assinaturas exige atualizar a especificação antes de
prosseguir para a task consumidora.

`ApplicationRepositoryV3` é apenas a notação deste plano. O código continua
exportando uma única interface chamada `ApplicationRepository`, evoluída em T2.

## 4. Modelos, revisão e correções

| Task | Implementação | Revisão | Risco que define o esforço da revisão |
|---|---|---|---|
| T0 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `high` | migration e contrato de compatibilidade |
| T1 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `medium` | cálculo determinístico puro |
| T2 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `high` | persistência, imutabilidade e CAS |
| T3 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `medium` | navegação e read models |
| T4 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `high` | integração Perfil/Estudo/persistência |
| T5 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `high` | contratos públicos |
| T6 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `medium` | sete eixos e regras determinísticas |
| T7 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `high` | executor, concorrência e cancelamento |
| T8 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `high` | persistência da tentativa e integração crítica |
| T9 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `medium` | apresentação e acessibilidade |
| T10 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `medium` | comparação temporal restrita |
| T11 | `gpt-5.6-sol` / `medium` | `gpt-5.6-terra` / `high` | integração, isolamento e regressão |
| T12 | `gpt-5.6-sol` / `medium` | `gpt-6-astra` / `high` | documentação e auditoria integrada final |

Finding Critical/Important volta ao executor original com
`gpt-5.6-sol/medium`. O re-review usa uma única rodada restrita ao diff do fix com
`gpt-5.6-terra/medium`. Sugestão cosmética não abre nova rodada.

## 5. Estratégia de commits sem inventar issue

T0–T12 não substituem IDs do Linear. Antes de criar a branch de cada task, o usuário
deve aprovar o mapeamento para uma issue real. Enquanto não houver mapeamento, não há
commit de implementação.

Depois do mapeamento, usar um commit focado por task com o fragmento de assunto da
tabela abaixo e acrescentar o sufixo `(MOT-N)` real já aprovado:

| Task | Fragmento de assunto |
|---|---|
| T0 | `test: fixa migration e compatibilidade da etapa 3` |
| T1 | `feat: calcula perfil operacional versionado` |
| T2 | `feat: persiste perfis e estudos v3` |
| T3 | `feat: entrega navegação de empresas e casos` |
| T4 | `feat: confirma perfis e vincula evidências` |
| T5 | `feat: define contratos do diagnóstico robusto` |
| T6 | `feat: calcula os sete eixos do diagnóstico` |
| T7 | `feat: executa diagnósticos em fila limitada` |
| T8 | `feat: orquestra e preserva diagnósticos` |
| T9 | `feat: apresenta diagnóstico robusto` |
| T10 | `feat: compara casos e perfis no tempo` |
| T11 | `test: fecha integração da etapa 3` |
| T12 | `docs: registra aceite da etapa 3` |

Cada commit inclui a entrada correspondente no topo de
`docs/DIARIO-DE-MUDANCAS.md`, com sintoma, causa, mudança e invalidações.

## Task T0: Freeze de contratos e fixture real da Etapa 2

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/high`.

**Files:**
- Create: `web/src/storage/__fixtures__/application-database-v1-stage2.json`
- Create: `web/src/storage/stage3Contract.test.ts`
- Modify: `web/src/study/model.ts`
- Modify: `web/src/study/validation.ts`
- Modify: `web/src/study/study.schema.json`

**Interfaces:**
- Consumes: `StudyDocument` 2.0.0, três `PortfolioSource`, reserva/terminal da Etapa 2.
- Produces: tipos V3 discriminados e fixture byte-estável usada pela T2.

- [ ] **Step 1: Capturar fixture V1 sem usar builders V3**

Copiar uma representação anonimizada de `studies`, `executions` e `meta` produzida
pelo schema físico 1. A fixture deve conter uma origem de cada tipo e uma tentativa
com reserva + terminal.

- [ ] **Step 2: Escrever testes RED de compatibilidade**

```ts
expect(parseStudyV3(stage2Study)).toMatchObject({
  schemaVersion: '3.0.0', evidenceSnapshots: [],
});
expect(parseStudyV3(stage2Study).executions.every((item) => item.kind === 'PREVIEW')).toBe(true);
```

Run:

```powershell
npm --prefix web run test:unit -- src/storage/stage3Contract.test.ts
```

Expected: FAIL porque V3 e o conversor ainda não existem.

- [ ] **Step 3: Definir a união V3 e o conversor puro**

Implementar `PreviewExecutionRecord`, `DiagnosticExecutionRecord`,
`ExecutionRecordV3`, `StudyEvidenceSnapshot`, `StudyDocumentV3` e:

```ts
export function migrateStudyDocumentV2(document: StudyDocumentV2): StudyDocumentV3;
```

O conversor adiciona somente discriminação/evidência vazia; não reconstrói receita
geradora ausente.

- [ ] **Step 4: Atualizar schema e validação**

Rejeitar `kind` desconhecido, terminal duplicado por `attemptId`, envelope do tipo
errado e perfil mutável dentro de `evidenceSnapshots`.

- [ ] **Step 5: Rodar gate focado**

```powershell
npm --prefix web run test:unit -- src/storage/stage3Contract.test.ts src/study/validation.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

**Deliverable:** contrato V3 verificável, ainda sem tocar IndexedDB.

## Task T1: Domínio e cálculo determinístico do Perfil Operacional

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/medium`.

**Files:**
- Create: `web/src/profiles/domain.ts`
- Create: `web/src/profiles/compatibility.ts`
- Create: `web/src/profiles/calculateOperationalProfile.ts`
- Create: `web/src/profiles/fingerprints.ts`
- Create: `web/src/profiles/validation.ts`
- Create: `web/src/profiles/operationalProfile.schema.json`
- Test: `web/src/profiles/*.test.ts`

**Interfaces:**
- Consumes: `CompanyRecord`, `ObservedCase`, `FieldProvenance`, Decimal.js.
- Produces: `OperationalProfileVersion`, `EvidenceValue<T>`,
  `checkProfileCompatibility`, `calculateOperationalProfile`.

- [ ] **Step 1: Escrever matriz RED de compatibilidade**

```ts
expect(checkProfileCompatibility([]).blockers[0]?.code).toBe('EMPTY_SELECTION');
expect(checkProfileCompatibility([caseA, caseBFromOtherCompany]).blockers[0]?.code)
  .toBe('MULTIPLE_COMPANIES');
expect(checkProfileCompatibility([overlapA, overlapB]).warnings.map((item) => item.code))
  .toContain('OVERLAPPING_WINDOWS');
```

- [ ] **Step 2: Escrever exemplos dourados de métricas**

Usar dois casos sintéticos pequenos com datas e valores calculáveis à mão. Provar
volume, frequência, ticket, direção, prazo, finalidade, janelas, lacunas e meses sem
zero fabricado.

```ts
const profile = await calculateOperationalProfile({
  id: PROFILE_ID, ownerSub: OWNER, companyId: COMPANY,
  version: 1, createdAt: NOW, cases: [caseFebruary, caseJanuary],
});
expect(profile.metrics.volume.totalBrl).toEqual(available('600', evidence));
expect(profile.selectedCases.map((item) => item.caseId)).toEqual(['january', 'february']);
```

- [ ] **Step 3: Implementar cálculo mínimo**

Usar `Decimal`, datas civis UTC e funções explícitas:

```ts
export function nearestRank(values: readonly Decimal[], q: Decimal): Decimal;
export function weightedNearestRank(
  values: readonly Readonly<{ value: Decimal; weight: Decimal }>[], q: Decimal,
): Decimal;
export function calculateCoverage(cases: readonly ObservedCase[]): ProfileCoverage;
export async function calculateOperationalProfile(
  input: CalculateOperationalProfileInput,
): Promise<OperationalProfileVersion>;
```

- [ ] **Step 4: Implementar fingerprints e validação runtime**

`selectionFingerprint` usa casos/revisões/fingerprints; `documentFingerprint` usa o
documento sem o próprio campo. Validar ambos ao ler.

- [ ] **Step 5: Provar ausência e determinismo**

Reordenar casos e ordens deve produzir documento idêntico. Finalidade ausente deve
produzir `NOT_COLLECTED`, nunca bucket `0` ou string vazia.

- [ ] **Step 6: Gate focado**

```powershell
npm --prefix web run test:unit -- src/profiles
npm --prefix web run typecheck
npm --prefix web run lint
```

**Deliverable:** perfil puro e validado, ainda não persistido.

## Task T2: Migration física, store de perfis e evidência no estudo

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/high`.

**Files:**
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Modify: `web/src/storage/migrations.ts`
- Modify: `web/src/study/domain.ts`
- Test: `web/src/storage/indexedDbApplicationRepository.test.ts`
- Test: `web/src/storage/migrations.test.ts`
- Test: `web/src/storage/recovery.test.ts`
- Test: `web/src/study/domain.test.ts`

**Interfaces:**
- Consumes: V3 da T0 e Perfil da T1.
- Produces: IndexedDB 2, `profile_versions`, três métodos novos da porta e
  `attachOperationalProfileEvidence`.

- [ ] **Step 1: Escrever testes RED da porta append-only**

```ts
expect(await repository.appendOperationalProfileVersion({ operationId, document: v1 }))
  .toEqual(v1);
await expect(repository.appendOperationalProfileVersion({
  operationId: anotherOperation, document: { ...v1, metrics: changedMetrics },
})).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
```

Cobrir owner, versão 1/2 sequencial, salto de versão, chave idempotente e fingerprint
inválido.

- [ ] **Step 2: Escrever migration RED a partir da fixture T0**

Abrir IndexedDB V1, carregar fixture, abrir implementação V2 e provar:

```ts
expect(STORE_NAMES).toContain('profile_versions');
expect(migrated.schemaVersion).toBe('3.0.0');
expect(migrated.executions[0]?.kind).toBe('PREVIEW');
expect(migrated.evidenceSnapshots).toEqual([]);
```

Também abortar deliberadamente no segundo estudo e verificar rollback integral.

- [ ] **Step 3: Implementar upgrade 1→2**

Substituir `createSchema` por:

```ts
function upgradeSchema(
  database: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
): void;
```

Versão 0 cria todas as nove stores. Versão 1 cria `profile_versions`, migra estudos,
execuções e os `result_document`/`result_execution_ids` de operações idempotentes de
estudo/restauração; só então grava `meta.schema_version = 2` na mesma transação.

- [ ] **Step 4: Implementar métodos do repositório**

```ts
listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]>;
getOperationalProfileVersion(id: string): Promise<OperationalProfileVersion | null>;
appendOperationalProfileVersion(input: AppendProfileVersionMutation): Promise<OperationalProfileVersion>;
```

- [ ] **Step 5: Implementar vínculo imutável ao estudo**

```ts
export async function attachOperationalProfileEvidence(
  study: StudyDocumentV3,
  profile: OperationalProfileVersion,
  capturedAt: string,
): Promise<StudyDocumentV3>;
```

Duplicata de mesmo `profile.id/documentFingerprint` é idempotente; mesmo ID com
fingerprint diferente falha.

- [ ] **Step 6: Gate focado**

```powershell
npm --prefix web run test:unit -- src/storage/indexedDbApplicationRepository.test.ts src/storage/migrations.test.ts src/storage/recovery.test.ts src/study/domain.test.ts
npm --prefix web run typecheck
npm --prefix web run build
```

**Deliverable:** armazenamento migrado sem perda e perfis realmente imutáveis.

## Task T3: Navegação global, Empresas, Casos, cobertura e vínculos

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/medium`.

**Files:**
- Create: `web/src/companies/companyOverview.ts`
- Create: `web/src/companies/caseFilters.ts`
- Create: `web/src/companies/studyLinks.ts`
- Create/Test: componentes e páginas de Empresas listados no mapa
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/src/app/router.test.tsx`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: métodos de leitura do `ApplicationRepository`, perfis T2 e estudos V3.
- Produces: `deriveCompanyOverview`, `filterObservedCases`, rotas de Empresa e
  navegação global Empresas/Estudos.

- [ ] **Step 1: Escrever testes RED dos read models**

```ts
expect(deriveCompanyOverview(company, cases, profiles, studies).coverage.gaps)
  .toEqual([{ startDate: '2026-01-08', endDate: '2026-01-14' }]);
expect(deriveStudyLinks(caseId, studies).map((item) => item.studyId)).toEqual([studyId]);
```

Provar que vínculo usa snapshot histórico e não cenário atual incompatível.

- [ ] **Step 2: Implementar filtros puros**

```ts
export function filterObservedCases(
  cases: readonly ObservedCase[], filters: ObservedCaseFilters,
): readonly ObservedCase[];
```

Período usa interseção de janelas; tipo usa `sourceKind`; qualidade distingue warnings,
blockers e `NOT_COLLECTED`.

- [ ] **Step 3: Reestruturar rotas sem quebrar deep links**

Adicionar rotas S04. `/estudos/:studyId` redireciona para `/carteira`; preservar uma
rota de compatibilidade que abre o mesmo estudo usado pelos E2E da Etapa 2.

- [ ] **Step 4: Implementar lista e resumo da empresa**

Carregar dados por controlador/porta, mostrar coverage days, lacunas, volume por
direção, qualidade, perfil vigente e estudos relacionados. Estado vazio diz “não
coletado” ou “nenhum caso”, nunca `0` por default.

- [ ] **Step 5: Implementar histórico com filtros**

Tabela semântica com janela, fechamento, sourceKind, qualidade, volumes, revisão e
vínculos. Filtros atualizam URL por query string para serem reproduzíveis.

- [ ] **Step 6: Testar foco, teclado e zoom estrutural**

Cobrir navegação por teclado, título focado, rota inválida, empresa de outra conta e
labels dos filtros.

- [ ] **Step 7: Gate focado**

```powershell
npm --prefix web run test:unit -- src/companies src/app/router.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

**Deliverable:** catálogo navegável de empresas/casos sem acesso direto ao banco.

## Task T4: Seleção, confirmação e vínculo do Perfil Operacional

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/high`.

**Files:**
- Create/Test: `web/src/profiles/components/*`
- Modify: `web/src/pages/CompanyProfilesPage.tsx`
- Modify: `web/src/pages/CompanyStudiesPage.tsx`
- Modify: `web/src/study/studyController.ts`
- Modify: `web/src/study/studyController.test.ts`
- Modify: `web/src/app/providers.tsx`

**Interfaces:**
- Consumes: calculador T1 e repositório T2.
- Produces: fluxo selecionar → validar → pré-visualizar → confirmar versão → anexar
  snapshot a estudo.

- [ ] **Step 1: Escrever fluxo RED da seleção**

Cobrir seleção vazia, empresas misturadas, SHA duplicado, janela sobreposta, cobertura
incompleta e preview determinístico.

- [ ] **Step 2: Expor métodos no controlador**

```ts
listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]>;
appendOperationalProfileVersion(document: OperationalProfileVersion): Promise<OperationalProfileVersion>;
attachProfileToCurrentStudy(profile: OperationalProfileVersion): Promise<StudyDocumentV3>;
```

O controller gera `operationId`, respeita epoch e faz CAS do estudo.

- [ ] **Step 3: Implementar ProfileBuilder**

Seleção explícita mostra cada caso/revisão, blockers, warnings, overlap e lacunas.
Confirmar exibe empresa, quantidade de casos, período e próxima versão.

- [ ] **Step 4: Implementar coverage e métricas**

Renderizar cada `EvidenceValue` por estado. Sazonalidade exibe somente meses
observados, dias cobertos e média por dia coberto.

- [ ] **Step 5: Implementar versões e vínculo com estudo**

Lista não edita versões. “Usar como evidência em estudo” copia o perfil integral e
não altera `PortfolioSource` nem habilita execução.

- [ ] **Step 6: Provar reload, concorrência e conta A→B→A**

Duas abas tentando criar a mesma próxima versão: uma confirma, outra recebe conflito.
Conta B não lista perfis nem os vincula.

- [ ] **Step 7: Gate focado**

```powershell
npm --prefix web run test:unit -- src/profiles/components src/study/studyController.test.ts src/app/providers.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

**Deliverable:** Perfil versionado, persistente e vinculável sem virar carteira.

## Task T5: Contratos públicos do diagnóstico e geração oficial

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/high`.

**Files:**
- Create: `servidor/contracts/diagnostics.py`
- Modify: `servidor/contracts/__init__.py`
- Modify: `servidor/app.py` somente no schema app nesta task
- Test: `tests/web_api/test_diagnostics_contracts.py`
- Regenerate: `contracts/openapi.json`
- Regenerate: `web/src/api/generated.ts`
- Regenerate: `web/src/api/schemas.json`
- Regenerate: `web/src/api/validators.ts`
- Modify/Test: `web/src/api/validators.test.ts`

**Interfaces:**
- Consumes: `PreviaRequest`, `PreviewEnvelope`, `EffectiveInput`, primitives e limites existentes.
- Produces: `DiagnosticRequest`, `JobSnapshot`, `DiagnosticEnvelope` e DTOs dos sete eixos.

- [ ] **Step 1: Escrever testes Python RED de contrato**

Cobrir campo extra, `FIXED_INPUT count!=1`, repetição fora de 10/30/100, seed
duplicada, `selected_repetition_id` ausente, fingerprint inválido e progressos
impossíveis.

```py
with pytest.raises(ValidationError):
    DiagnosticRequest.model_validate(invalid_duplicate_seeds)
```

- [ ] **Step 2: Implementar modelos estritos**

Usar união discriminada por `kind`, Decimal como texto, UUIDs estritos e listas
limitadas. `EvidenceMetric` não aceita `value` quando `state != AVAILABLE`.

- [ ] **Step 3: Fixar limites de resposta**

Envelope contém no máximo 100 resumos e um `PreviewEnvelope`. Nenhum DTO aceita
payload de arquivo, nome bruto ou evento de importação.

- [ ] **Step 4: Publicar apenas schemas**

Registrar cinco rotas no `create_schema_app` com response models reais; as rotas
operacionais entram na T7.

- [ ] **Step 5: Regenerar duas vezes e provar determinismo**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --check
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --exit-code -- contracts/openapi.json web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts
```

O segundo `diff --exit-code` deve passar após os artefatos da primeira geração serem
incluídos no índice de revisão da task.

- [ ] **Step 6: Gate focado**

```powershell
python -m pytest tests/web_api/test_diagnostics_contracts.py -q
python -O -m pytest tests/web_api/test_diagnostics_contracts.py -q
npm --prefix web run test:unit -- src/api/validators.test.ts
npm --prefix web run typecheck
```

**Deliverable:** contrato público fechado antes de qualquer executor.

## Task T6: Cálculo puro dos sete eixos, consequências e limitações

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/medium`.

**Files:**
- Create: `servidor/diagnostics/__init__.py`
- Create: `servidor/diagnostics/analysis.py`
- Create: `servidor/diagnostics/consequences.py`
- Test: `tests/web_api/test_diagnostics_analysis.py`

**Interfaces:**
- Consumes: requests explícitos, `PreviewEnvelope` validado e contratos T5.
- Produces: `analyze_diagnostic_repetitions`, sete eixos, consequências e limitações.

- [ ] **Step 1: Criar fixtures manuais de uma repetição**

Usar três carteiras pequenas:

1. apenas OUT;
2. OUT/IN com potencial maior que captura;
3. OUT/IN com D+0, remessa e dois clientes.

Valores esperados são escritos no teste, não calculados chamando a função sob teste.

- [ ] **Step 2: Escrever RED dos eixos 1–4**

```py
axes = analyze_diagnostic_repetitions([fixture])
assert axes.structural_potential.ceiling_brl.value == "140"
assert axes.policy_capture.matched_brl.value == "120"
assert axes.cross_border_residual.remitted_brl.value == "20"
```

Provar `INCOMPATIBLE` para fração sem denominador.

- [ ] **Step 3: Escrever RED dos eixos 5–7**

Cobrir HHI, maior participação, percentis econômicos, fila máxima, espera ponderada,
vencimentos e duração medida pelo executor.

- [ ] **Step 4: Implementar agregadores puros**

Assinaturas exatas: `summarize_repetition(request: PreviaRequest, envelope:
PreviewEnvelope, duration_ms: int) -> RepetitionSummary` e
`analyze_diagnostic_repetitions(repetitions: tuple[RepetitionInput, ...]) ->
DiagnosticAxes`.

Usar `Decimal`, `percentil_empirico` apenas quando sua semântica coincide e funções
locais para percentil ponderado. Não importar módulos privados de `motor`.

- [ ] **Step 5: Implementar consequências versionadas**

Assinaturas exatas: `derive_consequences(axes: DiagnosticAxes) ->
tuple[DiagnosticConsequence, ...]` e `derive_limitations(context:
LimitationContext) -> tuple[DiagnosticLimitation, ...]`.

Ordenar por `(axis, rule_id)`. Cada `evidence_ref` deve resolver para uma métrica do
envelope; teste falha quando a referência não existe.

- [ ] **Step 6: Provar distribuição versus execução**

Entrada fixa retorna selected execution e robustez econômica
`INSUFFICIENT_COVERAGE`; 10 repetições produzem p10/p25/p50/p75/p90 sem usar a
execução selecionada como substituto da distribuição.

- [ ] **Step 7: Gate focado**

```powershell
python -m pytest tests/web_api/test_diagnostics_analysis.py -q
python -O -m pytest tests/web_api/test_diagnostics_analysis.py -q
python -m ruff check servidor/diagnostics tests/web_api/test_diagnostics_analysis.py
python -m mypy servidor/diagnostics
```

**Deliverable:** análise pura e auditável, sem HTTP ou threads.

## Task T7: Executor com fila, progresso, cancelamento e retry

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/high`.

**Files:**
- Create: `servidor/diagnostics/executor.py`
- Create: `servidor/diagnostics/service.py`
- Create: `servidor/routes/diagnostics.py`
- Modify: `servidor/routes/__init__.py`
- Modify: `servidor/app.py`
- Modify: `servidor/config.py`
- Test: `tests/web_api/test_diagnostics_executor.py`
- Test: `tests/web_api/test_diagnostics_http.py`

**Interfaces:**
- Consumes: contratos T5 e análise T6.
- Produces: `DiagnosticExecutor` e cinco endpoints S10.

- [ ] **Step 1: Escrever executor fake e testes RED de estado**

Injetar worker controlável por eventos para provar sem tempo real:

```py
executor.submit(owner_sub, request)
assert executor.get(owner_sub, job_id).state == "QUEUED"
worker.release_one()
assert executor.get(owner_sub, job_id).progress.completed == 1
```

Cobrir todas as transições válidas e rejeitar retorno de terminal para estado ativo.

- [ ] **Step 2: Escrever RED de limites e justiça FIFO**

Enfileirar 33 jobs globais e 4 do mesmo owner. Exigir `FILA_CHEIA`; liberar worker e
provar ordem FIFO. Nenhum payload de A aparece ao consultar como B.

- [ ] **Step 3: Implementar registry thread-safe**

`DiagnosticExecutor` expõe as assinaturas exatas
`submit(owner_sub: str, request: DiagnosticRequest) -> JobSnapshot`,
`get(owner_sub: str, job_id: UUID) -> JobSnapshot`,
`result(owner_sub: str, job_id: UUID) -> DiagnosticEnvelope`,
`cancel(owner_sub: str, job_id: UUID) -> JobSnapshot`,
`retry(owner_sub: str, job_id: UUID, key: UUID) -> JobSnapshot` e `close() -> None`.

Proteger registry e mapas de idempotência com `threading.Lock`; nunca manter o lock
durante execução do motor.

- [ ] **Step 4: Implementar ProcessPoolExecutor**

Worker top-level e picklable recebe uma repetição, prepara ordens quando gerada,
constrói `PreviaRequest`, chama `executar_previa` e retorna resumo + envelope somente
para a repetição selecionada. O coordenador agenda no máximo uma repetição por job.

- [ ] **Step 5: Implementar cancelamento cooperativo**

Cancel queued remove da fila. Cancel running marca `CANCEL_REQUESTED`, aguarda o
future corrente e finaliza `CANCELLED` sem agendar outro. Duas chamadas cancel são
idempotentes; cancel terminal retorna `CANCELAMENTO_TARDIO`.

- [ ] **Step 6: Implementar idempotência, retry e expiração**

Mesma `(owner, idempotency_key, request_fingerprint)` retorna job. Payload diferente
é 409. Retry só para `FAILED/CANCELLED`, referencia original e usa nova chave.
Relógio injetável expira terminal após 24h; ativos nunca expiram.

- [ ] **Step 7: Implementar rotas e lifespan**

Criar executor no lifespan, registrar router, fechar fila/processos no shutdown.
Config:

```py
diagnostic_max_workers: int = 2
diagnostic_max_jobs_per_user: int = 3
diagnostic_max_jobs_global: int = 32
diagnostic_retention_seconds: int = 86400
```

Validar workers entre 1 e 4.

- [ ] **Step 8: Testar HTTP autenticado**

POST 202, GET progress, result antes do terminal 409, cancel, retry, 404 cross-owner,
headers `no-store`, corpo >1 MiB e resposta inválida.

- [ ] **Step 9: Gate focado**

```powershell
python -m pytest tests/web_api/test_diagnostics_executor.py tests/web_api/test_diagnostics_http.py -q
python -O -m pytest tests/web_api/test_diagnostics_executor.py tests/web_api/test_diagnostics_http.py -q
python -m ruff check servidor/diagnostics servidor/routes/diagnostics.py tests/web_api/test_diagnostics_executor.py tests/web_api/test_diagnostics_http.py
python -m mypy servidor
```

**Deliverable:** fila real limitada e testável, separada da prévia síncrona.

## Task T8: Cliente, orquestração e persistência do diagnóstico

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/high`.

**Files:**
- Create: `web/src/diagnostics/domain.ts`
- Create: `web/src/diagnostics/buildDiagnosticRequest.ts`
- Create: `web/src/diagnostics/queries.ts`
- Create: `web/src/diagnostics/diagnosticExecutionService.ts`
- Test: `web/src/diagnostics/*.test.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.test.ts`
- Modify: `web/src/app/providers.tsx`
- Modify: `web/src/study/model.ts`
- Modify: `web/src/study/validation.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`

**Interfaces:**
- Consumes: API T7, Study V3 T2 e geração preservada no snapshot.
- Produces: `buildDiagnosticRequest`, queries e `executeStudyDiagnostic`.

- [ ] **Step 1: Estender ApiClient com contract tests RED**

```ts
submitDiagnostic(input: DiagnosticRequest, signal?: AbortSignal): Promise<JobSnapshot>;
getDiagnosticJob(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
getDiagnosticResult(jobId: string, signal?: AbortSignal): Promise<DiagnosticEnvelope>;
cancelDiagnostic(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
retryDiagnostic(jobId: string, idempotencyKey: string, signal?: AbortSignal): Promise<JobSnapshot>;
```

POSTs têm `retry:false`; GET de status pode repetir apenas transporte idempotente com
backoff limitado pelo TanStack Query.

- [ ] **Step 2: Escrever RED do request builder**

Entrada fixa gera count 1. Origem parametrizada sem `generationInputSnapshot` retorna
erro tipado `GENERATION_RECIPE_UNAVAILABLE`. Para 10/30/100, registrar mapa de seeds
com IDs de repetição únicos e determinísticos a partir de base seed + participante +
índice.

```ts
export async function buildDiagnosticRequest(
  input: BuildDiagnosticRequestInput,
): Promise<DiagnosticRequest>;
```

- [ ] **Step 3: Implementar reserva/terminal append-only**

Fluxo:

```text
flush → snapshot → request → reserva QUEUED por CAS → POST
→ poll GET → fetch result → validar identidade → terminal por CAS
```

`DiagnosticExecutionRecord` nunca recebe updates de progresso. Um terminal por
`attemptId`; reload encontra reserva, consulta `jobId` e continua polling.

- [ ] **Step 4: Implementar cancel e retry**

Cancel chama servidor e só anexa terminal ao observar `CANCELLED`. Retry cria nova
reserva/attempt e mantém failed/cancelled. Nenhuma ação reusa execution ID.

- [ ] **Step 5: Tratar restart, sessão e respostas tardias**

404 para reserva ativa gera `INTERRUPTED/SERVER_RESTART_OR_JOB_EXPIRED`. Troca de
conta cancela polling, não job alheio, e descarta retorno por owner/epoch. Troca de
estudo persiste terminal por CAS no estudo de origem sem selecioná-lo.

- [ ] **Step 6: Reforçar storage**

Teste rejeita alteração de reserva/terminal, terminal duplicado e envelope cujo
request fingerprint diverge. O padrão reserva + terminal permanece compatível com
histórico da Etapa 2.

- [ ] **Step 7: Gate focado**

```powershell
npm --prefix web run test:unit -- src/api/client.test.ts src/diagnostics src/storage/indexedDbApplicationRepository.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

**Deliverable:** job robusto integrado ao ciclo de autoridade do estudo.

## Task T9: Página do diagnóstico, gráficos, tabelas e proveniência

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/medium`.

**Files:**
- Create/Test: `web/src/diagnostics/components/*`
- Create: `web/src/diagnostics/presentation.ts`
- Create: `web/src/pages/StudyDiagnosticPage.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Interfaces:**
- Consumes: serviço T8 e `DiagnosticEnvelope` gerado.
- Produces: fluxo completo de configuração, execução e leitura dos sete eixos.

- [ ] **Step 1: Instalar dependência exata**

```powershell
npm --prefix web install --save-exact echarts@6.1.0
```

Não adicionar wrapper React. `EChart.tsx` registra somente módulos usados e descarta
instância em unmount.

- [ ] **Step 2: Escrever testes RED de estados**

Cobrir indisponível, queued, running, cancel requested, failed, cancelled, succeeded,
retry, restart e storage failure. `role=status` recebe progresso; falha usa
`role=alert` sem payload.

- [ ] **Step 3: Implementar controles**

Opções 10/30/100 somente para origem gerável. Entrada fixa explica por que existe
apenas execução individual. Cancel confirma o job exato; retry identifica a tentativa
anterior.

- [ ] **Step 4: Implementar separação visual semântica**

`DiagnosticDistribution` recebe apenas estatísticas/distribuição.
`SelectedExecution` recebe apenas `selected_execution`. Um componente não aceita o
tipo do outro.

- [ ] **Step 5: Implementar sete eixos**

Cada eixo tem título, pergunta respondida, métricas, gráfico quando útil, tabela
equivalente, consequência, limitação e evidence refs. `presentation.ts` só formata;
não recalcula números.

- [ ] **Step 6: Implementar EChart acessível**

Canvas/SVG tem descrição; tabela permanece no DOM; `ResizeObserver` redimensiona;
preferência de movimento reduzido desliga animação; cor não é único sinal.

- [ ] **Step 7: Testar reconciliação de gráfico/tabela**

Adapter recebe uma única `ChartSeries`; teste verifica que option e linhas tabulares
usam os mesmos pontos e labels. Estado indisponível não cria série de zeros.

- [ ] **Step 8: Gate focado**

```powershell
npm --prefix web run test:unit -- src/diagnostics/components src/diagnostics/presentation.test.ts src/app/router.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

**Deliverable:** diagnóstico legível, acessível e sem recomputação financeira.

## Task T10: Comparação temporal restrita de Casos e Perfis

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/medium`.

**Files:**
- Create: `web/src/companies/temporalComparison.ts`
- Create: `web/src/companies/temporalComparison.test.ts`
- Create/Test: `web/src/companies/components/TemporalComparison.tsx`
- Modify: `web/src/pages/CompanyPage.tsx`
- Modify: `web/src/pages/CompanyCasesPage.tsx`
- Modify: `web/src/pages/CompanyProfilesPage.tsx`

**Interfaces:**
- Consumes: casos/perfis da mesma empresa.
- Produces: `compareCompanyTimeline(items): TemporalComparison`.

- [ ] **Step 1: Escrever matriz RED de compatibilidade**

Bloquear empresa diferente, unidade diferente, definição incompatível e método de
percentil incompatível. Permitir caso versus perfil apenas para volume, direção,
ticket e prazo quando ambos estão disponíveis.

- [ ] **Step 2: Implementar projeções explícitas**

```ts
export function projectObservedCaseForTimeline(input: ObservedCase): TimelineObservation;
export function projectProfileForTimeline(input: OperationalProfileVersion): TimelineObservation;
export function compareCompanyTimeline(
  items: readonly TemporalComparisonItem[],
): TemporalComparison;
```

Cada linha contém `period`, `coveredDays`, `coverageState`, `definitionVersion`,
`value` e provenance. Delta só existe entre valores disponíveis e compatíveis.

- [ ] **Step 3: Implementar UI**

Selecionar 2–6 itens, mostrar cobertura antes de valores, linha temporal e tabela.
Texto diz “diferença entre observações selecionadas”, nunca tendência quando há um
único intervalo comparável.

- [ ] **Step 4: Provar limite da Etapa 4**

Teste de rota e conteúdo exige ausência de “cenário-base”, “hipótese”, “marginal” e
ações para criar variante.

- [ ] **Step 5: Gate focado**

```powershell
npm --prefix web run test:unit -- src/companies/temporalComparison.test.ts src/companies/components/TemporalComparison.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
```

**Deliverable:** comparação temporal de evidências, não de cenários.

## Task T11: Aceitação integrada, isolamento e regressão das Etapas 1–2

**Modelo:** implementação `gpt-5.6-sol/medium`; revisão `gpt-5.6-terra/high`.

**Files:**
- Create: `web/e2e/company-profiles.spec.ts`
- Create: `web/e2e/diagnostic-jobs.spec.ts`
- Create: `web/e2e/stage2-regression.spec.ts`
- Create: `tests/web_api/test_stage3_acceptance.py`
- Modify: `.github/workflows/test.yml`
- Modify: `tests/web_api/scan_credentials.py`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: T0–T10.
- Produces: evidência integrada e regressão global única no SHA de fechamento.

- [ ] **Step 1: E2E Empresa → Perfil → Estudo**

Conta A abre empresa, filtra casos, confirma perfil, recarrega, anexa versão ao estudo
e prova que criar v2 não altera snapshot de v1.

- [ ] **Step 2: E2E do job diagnóstico**

Com worker controlável de aceitação: enfileirar dois jobs, observar progresso,
cancelar um, concluir outro, recarregar e restaurar terminal. Repetir submit com a
mesma chave não duplica.

- [ ] **Step 3: E2E de ausência e separação**

Origem fixa exibe execução individual e distribuição indisponível. Fixture gerável
exibe 10 resumos e um envelope selecionado. Falha de repetição não publica
distribuição parcial.

- [ ] **Step 4: E2E de duas contas e duas abas**

Conta B recebe 404 para job de A e não lê perfil/estudo. Duas abas concorrem por
versão e CAS impede duplicidade.

- [ ] **Step 5: Regressão explícita da Etapa 2**

Percorrer observado, sintético/manual, Observado × Motor, reload, conflito, migration
V1, histórico e terminal único. Não reescrever os testes existentes como nova
semântica.

- [ ] **Step 6: Segurança, performance e limites**

Scanner prova ausência de tokens em URL, ordens em logs e binários. Medir 10/30/100
repetições com ambiente registrado; verificar que concorrência nunca excede workers
configurados e cancelamento não deixa processo órfão.

- [ ] **Step 7: Regenerar contratos e rodar gate global uma vez**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --exit-code -- contracts/openapi.json web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts
python -m pytest -q
python -O -m pytest -q
python -m ruff check servidor tests/web_api
python -m mypy servidor
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
npm --prefix web run test:e2e
python -m tests.web_api.scan_credentials
git diff --check
```

O Ruff global fora do escopo CI e auth real permanecem ressalvas separadas; não
expandir T11 para resolvê-los.

**Deliverable:** um SHA com evidência global legível, sem repetir gate sobre o mesmo
SHA.

## Task T12: Auditoria final, operação, aceite e handoff

**Modelo:** implementação documental `gpt-5.6-sol/medium`; auditoria integrada
`gpt-6-astra/high`. Correções usam o executor original `gpt-5.6-sol/medium`;
re-review único do diff usa `gpt-5.6-terra/medium`.

**Files:**
- Create: `docs/frontend/etapa-3-operacao.md`
- Create: `docs/frontend/etapa-3-aceitacao.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: este plano apenas para evidências finais

**Interfaces:**
- Consumes: SHA e evidências T11.
- Produces: decisão PASS/CONDITIONAL/FAIL, limites efetivos e handoff para Etapa 4.

- [x] **Step 1: Auditar fluxos de autoridade**

Rastrear:

```text
casos → cálculo puro → profile_versions → snapshot no estudo
cenário → request → reserva → job → repetição → eixos → terminal → IndexedDB → UI
```

Verificar owner, fingerprints, CAS, terminal único, ausência como estado e separação
distribuição/execução.

- [x] **Step 2: Conferir os 18 critérios S15**

Cada critério aponta para teste, comando, SHA e evidência. Não executado não vira
PASS.

- [x] **Step 3: Documentar operação**

Incluir limites reais, estados de job, cancelamento cooperativo, retry, restart,
migration, criação de perfil, vínculo e recuperação. Não sugerir que fila é durável.

- [x] **Step 4: Documentar contratos efetivos**

Registrar DB 2, store/índices, schemas, versões, endpoints, erros, retenção, worker
count, regras dos sete eixos e métodos estatísticos realmente implementados.

- [x] **Step 5: Corrigir apenas findings Critical/Important**

Enviar finding ao executor da task proprietária. Rodar somente testes/gates afetados
e uma re-review restrita ao diff. Cosméticos entram como follow-up, sem nova rodada.

- [x] **Step 6: Decidir aceite e handoff**

Etapa 4 recebe perfil imutável e receita geradora ainda não implementada. Não criar a
quarta origem nem iniciar código da Etapa 4 automaticamente.

**Deliverable:** aceite rastreável, sem publicação, PR, merge ou Linear automático.

## 6. Dependências e ordem linear segura

```text
T0 → T1 → T2 → T3 → T4
          └──────→ T5 → T6 → T7 → T8 → T9
                         T4 ───────────→ T10
T3 + T4 + T8 + T9 + T10 → T11 → T12
```

Ordem linear recomendada: **T0, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10,
T11, T12**. Um único agente escritor atua por vez. Revisão começa somente depois do
gate focado da task e não repete verificações já registradas para o mesmo SHA.

## 7. Matriz de critérios de aceite

| Critério da especificação | Tasks |
|---|---|
| Perfil determinístico e fingerprints | T1, T11 |
| Incompatibilidade, cobertura e ausência | T1, T3, T4, T10 |
| Imutabilidade de perfil e snapshot do estudo | T2, T4, T11 |
| Migration 1→2 e Study 2→3 | T0, T2, T11 |
| Fila, progresso e limites | T5, T7, T8, T11 |
| Cancelamento e terminal único | T7, T8, T11 |
| Idempotência, retry e duplicidade | T7, T8, T11 |
| Isolamento de usuários | T2, T4, T7, T8, T11 |
| Distribuição versus execução | T5, T6, T9, T11 |
| Seeds e geração reproduzível | T5, T7, T8, T11 |
| Sete eixos | T5, T6, T9, T11 |
| Consequências e limitações | T6, T9, T11 |
| Gráfico/tabela/proveniência | T9, T11 |
| Comparação temporal restrita | T10, T11 |
| Regressão das Etapas 1 e 2 | T11 |
| Operação e aceite | T12 |

## 8. Riscos e respostas

| Risco | Resposta planejada |
|---|---|
| Process pool no Windows não consegue serializar closure | worker top-level, payload Pydantic serializável e teste com spawn |
| Cancelamento interpretado como interrupção instantânea | estado `CANCEL_REQUESTED` e texto explícito “terminando repetição atual” |
| Reinício perde job em memória | reserva local reconciliada para `INTERRUPTED`, sem retry automático |
| Envelope de 100 repetições cresce demais | resumos por repetição e um único envelope completo |
| Snapshot sintético atual não reproduz novas seeds | migration preserva leitura; diagnóstico distribuído bloqueia sem `generationInputSnapshot` |
| Perfil duplica operações em janelas sobrepostas | aviso e cobertura por união de dias; nenhuma deduplicação silenciosa |
| Ausência aparece como zero em chart | `EvidenceValue` impede value indisponível e adapter não cria série |
| Comparação temporal vira Etapa 4 | tipos aceitam apenas Caso/Perfil da mesma empresa e testes proíbem variantes/marginal |
| ECharts aumenta bundle | imports modulares, medição no build e tabela disponível sem chart |
| Mudança quebra Etapa 2 | fixture V1 real, migration transacional e E2E dedicado de regressão |

## 9. Fora do escopo explícito

- `OPERATIONAL_PROFILE` em `PortfolioSource`;
- endpoint de geração por perfil;
- comparação cenário-base × hipótese;
- análise marginal ou leave-one-out novo;
- Replay ou persistência de todas as trajetórias;
- worker distribuído, Redis, banco remoto ou fila durável;
- edição/exclusão de versão de perfil;
- importação de arquivo;
- correção do Ruff legado global ou obtenção de credenciais de auth real;
- qualquer alteração regulatória, comercial ou do motor.

## 10. Critério de conclusão

A Etapa 3 está pronta para decisão de merge somente quando T0–T11 tiverem seus gates
registrados no mesmo encadeamento de SHAs, T12 não encontrar Critical/Important
aberto, os 18 critérios S15 estiverem rastreados e Gabriel tiver aprovado publicação,
PR e merge. Este plano por si só não concede essas autorizações.

## 11. Evidência final da execução

- T0–T10 foram implementadas e revisadas no encadeamento `9f1e975..d8fd3e1`.
- T11 produziu o candidato inicial `404533e`, invalidado pelos findings da primeira
  rodada, e o candidato final `03e87b8` após o fix `MOT-76`.
- O gate global final em `03e87b8` aprovou contratos sem drift, 772 testes Python e
  772 sob `-O` (2 skips em cada modo), Ruff, mypy, 388 testes web, typecheck, lint,
  build, 14 E2E e scanner.
- A auditoria T12 não confirmou finding Critical/Important de produto. O único gap
  material de aceite é S15.14: a página robusta possui prova de série/tabela e
  semântica acessível, mas não foi percorrida no browser por teclado e a zoom 200%.
- Decisão: **CONDITIONAL**. A matriz completa, limites e handoff estão em
  `docs/frontend/etapa-3-aceitacao.md`; operação em
  `docs/frontend/etapa-3-operacao.md`.
- A Etapa 4 recebe o Perfil Operacional imutável como evidência. Receita geradora de
  perfil, quarta origem, variantes e comparação de hipóteses continuam não
  implementadas.
