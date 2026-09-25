# Etapa 6B — Demonstração e Comunicação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar um Estudo demonstrativo reconciliado, tornar a composição
descobrível e publicar uma projeção única de dados para chat, apresentação e PDF.

**Architecture:** Um pacote gerado e versionado contém empresas, casos, perfis,
cenários, diagnósticos e Replays sintéticos. O `ApplicationRepository` instala esse
pacote de forma atômica; um `CommunicationDocumentV1` puro projeta somente dados já
validados, e um catálogo versionado fornece a semântica da interface.

**Tech Stack:** TypeScript, React, IndexedDB, Ajv, FastAPI/Pydantic, Vitest,
Playwright e scripts determinísticos Python/Node.

**Spec:** `docs/superpowers/specs/2026-09-23-frontend-etapa-6-comunicacao-publicacao-design.md`

## Global Constraints

- O pacote é sintético, não calibrado e nunca usa valores das 27.000 rodadas antigas.
- Os pesos de `motor/mixes.py` servem somente como receita de composição.
- Toda geração usa motor, preparação, diagnóstico e Replay vigentes.
- O Replay demonstrativo respeita no máximo 98 ordens e 365 dias.
- Instalação automática só ocorre quando não há Estudos e nunca após remoção explícita.
- Perfis existentes permanecem imutáveis.
- `CommunicationDocumentV1` não recalcula regra financeira.
- Indisponível permanece indisponível; Decimal permanece string.
- Tasks usam MOT-91 (demonstração) e MOT-92 (comunicação/ajuda).

## Model routing

| Tasks | Modelo | Esforço | Regra |
|---|---|---|---|
| B1 | `gpt-6-sol` | high | geração e reconciliação |
| B2 | `gpt-6-astra` | high | instalação atômica e recovery |
| B3 | `gpt-6-sol` | medium | descoberta e edição guiada |
| B4 | `gpt-6-astra` | high | contrato numérico compartilhado |
| B5 | `gpt-6-luna` | high | revisão `gpt-6-sol` medium |
| B6 | `gpt-6-sol` | high | aceite integrado |

Aplicam-se as regras de escalonamento do plano mestre; registre desvios no Diário.

---

### Task B1: Gerar e validar DemoStudyPackageV1

**Issue:** MOT-91 — `Etapa 6 / T1 — Estudo demonstrativo e exploração guiada`.

**Files:**
- Create: `servidor/demo/__init__.py`
- Create: `servidor/demo/generate_package.py`
- Create: `web/src/demo/domain.ts`
- Create: `web/src/demo/demoStudyPackage.schema.json`
- Create: `web/src/demo/validation.ts`
- Create: `web/src/demo/generated/demo-study.v1.json`
- Create: `web/src/demo/validation.test.ts`
- Create: `tests/web_api/test_demo_package.py`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: cinco pesos de `motor.mixes.TODOS`, APIs públicas de preparação,
  diagnóstico e Replay.
- Produces:

```ts
export type DemoStudyPackageV1 = Readonly<{
  apiVersion: '1.0.0';
  packageVersion: '1.0.0';
  generatedAt: string;
  motorBuildSha: string;
  recipeFingerprint: string;
  ownerPlaceholder: '$OWNER_SUB';
  companies: readonly CompanyRecord[];
  observedCases: readonly ObservedCase[];
  profiles: readonly OperationalProfileVersion[];
  study: StudyDocument;
}>;
```

- [ ] **Step 1: Escrever teste de pacote antes do gerador**

Exija cinco cenários com labels exatos, dez repetições cada, um Replay selecionado
por cenário, rótulo sintético, seeds explícitas e nenhuma referência a CSV histórico.

- [ ] **Step 2: Fixar a receita demonstrativa**

Use 12 participantes, medição de 30 dias, warmup de 30 dias, janela 7 e no máximo
quatro ordens mensais derivadas por participante. A alocação inteira aproxima os
pesos dos cinco mixes e registra pesos pedidos e contagens realizadas.

- [ ] **Step 3: Implementar gerador por APIs públicas**

O script não importa auxiliares privados. Ele prepara entradas, executa diagnóstico,
seleciona a repetição canônica e cria Replay pela mesma fronteira do servidor.

- [ ] **Step 4: Validar invariantes de reconciliação**

Para cada cenário, exija conservação, métricas iguais entre envelope e Replay,
build SHA único, hashes canônicos e até 98 ordens na repetição selecionada.

- [ ] **Step 5: Provar determinismo**

```powershell
python -m servidor.demo.generate_package --output web/src/demo/generated/demo-study.v1.json
git diff -- web/src/demo/generated/demo-study.v1.json
python -m servidor.demo.generate_package --output web/src/demo/generated/demo-study.v1.json
git diff --exit-code -- web/src/demo/generated/demo-study.v1.json
```

Expected: primeira geração produz o artefato; segunda é byte a byte idêntica.

- [ ] **Step 6: Rodar gates**

```powershell
python -m pytest tests/web_api/test_demo_package.py -q
python -O -m pytest tests/web_api/test_demo_package.py -q
npm --prefix web run test:unit -- src/demo/validation.test.ts
npm --prefix web run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commitar**

Commit `feat: gera estudo demonstrativo reconciliado (MOT-91)`.

### Task B2: Instalar, remover e restaurar demonstração atomicamente

**Issue:** MOT-91.

**Files:**
- Create: `web/src/demo/materializeDemoPackage.ts`
- Create: `web/src/demo/installDemoStudy.ts`
- Create: testes correspondentes
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.test.ts`
- Modify: `web/src/study/studyController.ts`
- Modify: `web/src/pages/StudiesPage.tsx`

**Interfaces:**
- Consumes: `DemoStudyPackageV1`, `ownerSub` e repositório da sessão.
- Produces:

```ts
type DemoInstallMode = 'FIRST_EMPTY_SESSION' | 'EXPLICIT_RESTORE';

interface ApplicationRepository {
  installDemoStudy(input: {
    package: DemoStudyPackageV1;
    mode: DemoInstallMode;
    operationId: string;
  }): Promise<StudyDocument>;
}
```

- [ ] **Step 1: Escrever testes do marcador**

Primeiro uso vazio instala uma vez; recarga não duplica; repositório com qualquer
Estudo não auto-instala; purge do demo marca `REMOVED`; nova sessão não ressuscita;
restauração explícita reinstala sem tocar em outros Estudos.

- [ ] **Step 2: Materializar owner e fingerprints**

Substitua `$OWNER_SUB`, gere IDs/fingerprints dependentes da instalação somente
pelas funções canônicas e preserve resultados financeiros independentes do owner.
Valide todos os documentos depois da materialização.

- [ ] **Step 3: Implementar transação única**

Empresas, Casos, Perfis, Estudo, execuções e marker entram numa transação. Falha em
qualquer store não deixa dado parcial. `operationId` é idempotente.

- [ ] **Step 4: Integrar ao ciclo de sessão**

Depois de `switchSession`, liste Estudos. Se vazio e marker ausente, instale. Na
página vazia, ofereça **Carregar estudo demonstrativo** para restauração explícita.

- [ ] **Step 5: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/demo src/storage/indexedDbApplicationRepository.test.ts src/study/studyController.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 6: Commitar**

Commit `feat: instala estudo demonstrativo local (MOT-91)`.

### Task B3: Tornar composição e repetição descobríveis

**Issue:** MOT-91.

**Files:**
- Create: `web/src/hypotheses/components/PortfolioCompositionSummary.tsx`
- Create: `web/src/diagnostics/selectedRepetition.ts`
- Create: testes correspondentes
- Modify: `web/src/pages/StudyPortfolioPage.tsx`
- Modify: `web/src/hypotheses/components/CompositionHypothesisBuilder.tsx`
- Modify: `web/src/pages/StudyDiagnosticPage.tsx`
- Modify: `web/src/diagnostics/components/SelectedExecution.tsx`
- Modify: `web/src/replay/ReplayPage.tsx`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: composição e `selected_execution` já persistidos.
- Produces: ação **Criar hipótese / alterar carteira** e apresentação do ID, total e
  critério da repetição selecionada.

- [ ] **Step 1: Escrever testes de linguagem**

Exija definições visíveis de Perfil, participante, arquétipo, repetição e Replay;
remover participante não altera Perfil; criar hipótese preserva cenário base.

- [ ] **Step 2: Extrair critério canônico**

```ts
export function describeSelectedRepetition(
  envelope: DiagnosticEnvelope,
): Readonly<{ repetitionId: string; total: number; criterion: string }>;
```

`criterion` deriva do contrato efetivo do diagnóstico; não inventa “mediana” se o
envelope não comprovar essa seleção.

- [ ] **Step 3: Reorganizar a página de Estudo**

Mostre resumo da composição e ação junto à lista de cenários. O formulário completo
pode permanecer abaixo, mas recebe foco/âncora ao acionar a ação.

- [ ] **Step 4: Atualizar Diagnóstico e Replay**

Ambos mostram o mesmo repetition ID, total executado e critério. Link para Replay
preserva `executionId`; não adiciona seletor de 5A.

- [ ] **Step 5: Rodar gates**

```powershell
npm --prefix web run test:unit -- src/hypotheses/components src/diagnostics src/replay/ReplayPage.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 6: Commitar**

Commit `feat: guia composição e repetição do estudo (MOT-91)`.

### Task B4: Definir CommunicationDocumentV1

**Issue:** MOT-92 — `Etapa 6 / T2 — Documento de Comunicação e catálogo de ajuda`.

**Files:**
- Create: `servidor/contracts/communication.py`
- Create: `tests/web_api/test_communication_contracts.py`
- Create: `web/src/communication/domain.ts`
- Create: `web/src/communication/communicationDocument.schema.json`
- Create: `web/src/communication/validation.ts`
- Create: `web/src/communication/buildCommunicationDocument.ts`
- Create: `web/src/communication/evidence.ts`
- Create: testes correspondentes

**Interfaces:**
- Consumes: `StudyDocument`, execução diagnóstica, comparação compatível e
  `ReplayDocumentV1`.
- Produces:

```ts
export function buildCommunicationDocument(input: Readonly<{
  study: StudyDocument;
  scenarioId: string;
  diagnosticExecutionId: string;
  comparisonExecutionId: string | null;
  replay: ReplayDocument | null;
  replayDay: number | null;
}>): CommunicationDocumentV1;
```

- [ ] **Step 1: Escrever contratos espelhados**

Modele exatamente tipos, limites e literais da spec em Pydantic e TypeScript/JSON
Schema. Use as mesmas fixtures válidas e inválidas nos testes Python e Vitest. Não
crie endpoint artificial apenas para expor o tipo.

- [ ] **Step 2: Implementar validação local**

Compile o JSON Schema com o Ajv já instalado. `buildCommunicationDocument` só
retorna depois de validar. Na Task C3, `ChatRequestV1` referencia o modelo Pydantic,
fazendo o contrato entrar naturalmente no OpenAPI e no cliente gerado.

- [ ] **Step 3: Escrever fixtures observada e sintética**

Cubra ausência de comparação/Replay, indisponíveis, Decimal, limitações, versões e
evidências quebradas.

- [ ] **Step 4: Implementar projeção pura**

Leia somente campos publicados. Métricas recebem `evidenceRefs`; referência ausente,
duplicada ou de outro contexto falha fechado. Calcule apenas fingerprint canônico da
projeção, nunca métricas financeiras.

- [ ] **Step 5: Provar identidade**

Compare cada métrica com envelope, comparação ou Replay de origem. Voltar ao mesmo
dia/reload produz documento e fingerprint iguais, exceto `generatedAt` excluído do
fingerprint.

- [ ] **Step 6: Rodar gates**

```powershell
python -m pytest tests/web_api/test_communication_contracts.py tests/web_api/test_openapi.py -q
npm --prefix web run test:unit -- src/communication
npm --prefix web run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commitar**

Commit `feat: publica documento único de comunicação (MOT-92)`.

### Task B5: Publicar catálogo versionado de ajuda

**Issue:** MOT-92.

**Files:**
- Create: `servidor/catalogs/product_help.v1.json`
- Create: `servidor/catalogs/product_help.py`
- Create: `servidor/routes/product_help.py`
- Create: testes Python
- Modify: `servidor/app.py`
- Modify: `web/src/api/client.ts`
- Create: `web/src/help/catalog.ts`
- Create: `web/src/help/helpIds.ts`
- Create: `web/src/help/catalog.test.ts`

**Interfaces:**
- Consumes: rotas e controles autenticados.
- Produces: `GET /api/v1/catalogos/ajuda` e `ProductHelpCatalogV1` congelado.

- [ ] **Step 1: Escrever catálogo mínimo completo**

Inclua páginas e conceitos de importação, Empresa, Caso, Perfil, participante,
arquétipo, composição, seed, repetição, Replay, diagnóstico, comparação,
apresentação, relatório e chat.

- [ ] **Step 2: Implementar endpoint autenticado**

Valide JSON na inicialização; devolva `no-store`; não inclua instruções de negócio do
vault ou afirmações regulatórias não presentes no produto.

- [ ] **Step 3: Gerar união de IDs**

`helpIds.ts` exporta constantes literais consumidas pelos componentes. Um teste
percorre todos os usos `helpId` e falha se o catálogo não contiver o ID.

- [ ] **Step 4: Implementar cliente e cache de sessão**

Cache apenas em memória por sessão autenticada; logout limpa. Falha do catálogo
remove ajuda contextual, mas não bloqueia produto.

- [ ] **Step 5: Rodar gates**

```powershell
python -m pytest tests/web_api/test_product_help.py -q
npm --prefix web run test:unit -- src/help src/api/client.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 6: Commitar**

Commit `feat: versiona catálogo de ajuda do produto (MOT-92)`.

### Task B6: Aceitar demonstração e comunicação ponta a ponta

**Issue:** MOT-92.

**Files:**
- Create: `web/e2e/stage6-demo-communication.spec.ts`
- Modify: `web/playwright.config.ts`
- Modify: `docs/testing.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: B1–B5 e 6A concluída.
- Produces: evidência do primeiro acesso e igualdade da projeção.

- [ ] **Step 1: Testar primeiro acesso**

Conta vazia recebe um demo; reload não duplica; remoção impede ressurgimento;
restauração explícita funciona sem apagar Estudo importado.

- [ ] **Step 2: Percorrer cinco composições**

Abra cada cenário, confirme rótulo sintético, diagnóstico, repetition ID e Replay.
Adicione/remova participante numa hipótese sem alterar Perfil original.

- [ ] **Step 3: Comparar projeções**

Extraia `CommunicationDocumentV1` e compare valores/textos com tela de Diagnóstico,
Comparação e Replay.

- [ ] **Step 4: Rodar gate de B**

```powershell
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
npm --prefix web run test:e2e -- stage6-demo-communication.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commitar**

Commit `test: fecha demonstração e comunicação compartilhada (MOT-92)`.
