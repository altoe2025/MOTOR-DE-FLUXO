# Importação de dados reais v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar adaptadores de origem e importação XLSX canônica que publiquem Casos Observados revisados no repositório compartilhado, preservando segurança, auditoria, concorrência e desempenho.

**Architecture:** `web/src/importer` contém domínio puro, registro de adaptadores, inspeção e parsing em Web Workers, validação e projeção de lotes/eventos. O importador usa `ApplicationRepository` da Etapa 2 e termina em `ObservedCase`; criação de estudo e execução pertencem à Etapa 2. Os requisitos detalhados de segurança do XLSX de 2026-09-17 permanecem obrigatórios.

**Tech Stack:** React 19.3, TypeScript 5.9, Vite 8.3, Vitest 5, Playwright 1.63, IndexedDB, Web Workers, Decimal.js 10.6, read-excel-file 9.3.10, fflate 0.8.3, saxen 11.1.1 e fake-indexeddb 6.2.5.

**Spec:** `docs/superpowers/specs/2026-09-19-importacao-dados-reais-design-v2.md`

## Global Constraints

- Preservar todos os limites, códigos de erro e regras OOXML da especificação de 2026-09-17.
- Não alterar `motor/`, P0, autonetting ou grade histórica.
- Não criar Estudo, Execução ou `PreviaRequest` dentro do importador.
- Publicar somente `ObservedCase` confirmado no `ApplicationRepository` compartilhado.
- Não persistir binário, `File`, `Blob`, `ArrayBuffer` ou XML descompactado.
- Não transmitir arquivo, nome bruto ou células originais ao servidor.
- Não agregar casos por mês nem transformar soma bruta em posição do motor sem regra aprovada.
- Direção, janela, fechamento e totais conservam regra e proveniência.
- Valores financeiros usam Decimal/string; datas são dias civis ISO.
- CAS, owner, migrations e múltiplas abas seguem a Etapa 2 v2.
- Não criar ou reescrever issues; usar somente IDs reais autorizados.

---

## Mapa de arquivos

```text
web/src/importer/
  public.ts
  domain.ts
  errors.ts
  adapters.ts
  adapterRegistry.ts
  sourceBundle.ts
  dates.ts
  decimals.ts
  normalization.ts
  validation.ts
  directionRules.ts
  controlTotals.ts
  clients.ts
  portfolio.ts
  eligibility.ts
  xlsxPreflight.ts
  xlsxParser.ts
  xlsx.worker.ts
  workerClient.ts
  controller.ts
  publisher.ts
  components/
    SourceSelectionStep.tsx
    UploadStep.tsx
    ReviewStep.tsx
    CaseConfirmation.tsx
    ImportFlowPage.tsx
```

Fixtures ficam em `web/src/importer/__fixtures__/`; gerador determinístico em
`web/scripts/build-import-fixtures.mjs`; e2e em `web/e2e/import-observed-case.spec.ts`.

## Task I0: Gate, base e integração com a Etapa 2

**Files:**
- Read: specs e planos v2
- Read: documentos de importação de 2026-09-17
- Inspect: `ApplicationRepository` e tipos de Caso Observado da Etapa 2

**Interfaces:**
- Consumes: contrato aprovado da Etapa 2.
- Produces: IDs reais, worktree, baseline e matriz de tipos compartilhados.

- [ ] **Step 1: Confirmar issue e dependências**

Verificar no Linear sem alterar. Se `ApplicationRepository` e `ObservedCase` ainda não
estiverem integrados, implementar somente módulos puros e manter o publisher atrás
da interface aprovada; não criar repositório paralelo.

- [ ] **Step 2: Rodar baseline completo**

```powershell
python -m pytest -q
python -O -m pytest -q
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

- [ ] **Step 3: Mapear requisitos antigos**

Relacionar cada Task 1–13 do plano de 2026-09-17 a uma tarefa I1–I11 deste plano e
registrar requisitos preservados. Nenhum requisito some sem decisão explícita.

## Task I1: Domínio público de adaptadores e rascunho

**Files:**
- Create: `web/src/importer/public.ts`
- Create: `web/src/importer/domain.ts`
- Create: `web/src/importer/adapters.ts`
- Create: `web/src/importer/domain.test.ts`

**Interfaces:**
- Consumes: `ObservedCaseDraft` compartilhado.
- Produces: `SourceAdapter`, `SourceBundle`, `SourceAdapterResult` e diagnósticos.

- [ ] **Step 1: Escrever contract tests**

```ts
expect(adapter.descriptor.version).toMatch(/^\d+\.\d+\.\d+$/);
expect(result.draft.status).toBe('DRAFT');
expect(result.diagnostics.every(isAdapterDiagnostic)).toBe(true);
```

Cobrir abort, adapter mismatch, dois matches equivalentes e resultado com tipo
proibido.

- [ ] **Step 2: Implementar contratos readonly**

`File` e `ArrayBuffer` só aparecem na fronteira de parsing; não entram no draft nem
nos diagnósticos persistíveis.

- [ ] **Step 3: Implementar invariantes**

Adapter sempre informa ID, versão, source kind, arquivos aceitos e regra de detecção.
Resultado inválido é recusado antes da UI.

- [ ] **Step 4: Gate**

```powershell
npm --prefix web run test:unit -- src/importer/domain.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

## Task I2: Registro, detecção e seleção de adaptador

**Files:**
- Create: `web/src/importer/adapterRegistry.ts`
- Create: `web/src/importer/sourceBundle.ts`
- Create: `web/src/importer/adapterRegistry.test.ts`

**Interfaces:**
- Consumes: adaptadores I1.
- Produces: `matchSourceBundle` e seleção explícita.

- [ ] **Step 1: Escrever matriz de detecção**

Cobrir zero, um e múltiplos adapters; diferença entre `SUPPORTED`, `POSSIBLE` e
`UNSUPPORTED`; nome do arquivo sozinho não pode confirmar formato estrutural.

- [ ] **Step 2: Implementar seleção sem heurística silenciosa**

```ts
export async function matchSourceBundle(
  bundle: SourceBundle,
  adapters: readonly SourceAdapter[],
): Promise<AdapterSelection>;
```

Um `SUPPORTED` único pode ser pré-selecionado; empate exige usuário.

- [ ] **Step 3: Validar bundle**

Rejeitar arquivo repetido, bundle vazio, total acima do limite do adapter e extensão
não aceita. Hash não é calculado duas vezes.

- [ ] **Step 4: Gate**

Rodar unitários, typecheck e lint.

## Task I3: Inspeção OOXML e parser canônico em worker

**Files:**
- Create: `web/src/importer/xlsxPreflight.ts`
- Create: `web/src/importer/xlsxParser.ts`
- Create: `web/src/importer/xlsx.worker.ts`
- Create: `web/src/importer/workerClient.ts`
- Create: testes e fixtures estruturais
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Interfaces:**
- Consumes: `SourceBundle` com XLSX canônico.
- Produces: linhas serializadas, hash, metadados e erros estruturados.

- [ ] **Step 1: Fixar dependências exatas**

Instalar somente versões definidas na especificação preservada.

- [ ] **Step 2: Gerar fixtures mínimas**

Válida, fórmula, merge, macro, link externo, OLE, criptografada, aba extra, header
alterado, ZIP excessivo, 1.001 linhas e XML malformado.

- [ ] **Step 3: Implementar preflight incremental**

Validar assinatura, content types, workbook, relationships e worksheet; abortar em
limite. Não usar regex para reconhecer OOXML.

- [ ] **Step 4: Implementar worker e cancelamento**

Thread principal transfere buffer e recebe apenas estrutura serializável. Cancelar
termina worker e descarta resultado tardio.

- [ ] **Step 5: Reproduzir todos os códigos antigos**

Testes exigem códigos estáveis definidos em 2026-09-17; mensagens podem evoluir.

- [ ] **Step 6: Gate**

```powershell
npm --prefix web run test:unit -- src/importer/xlsxPreflight.test.ts src/importer/xlsxParser.test.ts src/importer/workerClient.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

## Task I4: Datas, decimais, normalização e validação

**Files:**
- Create: `web/src/importer/dates.ts`
- Create: `web/src/importer/decimals.ts`
- Create: `web/src/importer/normalization.ts`
- Create: `web/src/importer/validation.ts`
- Create: testes correspondentes

**Interfaces:**
- Consumes: células serializadas.
- Produces: valores normalizados, `ImportIssue[]` e linhas persistíveis.

- [ ] **Step 1: Escrever tabelas de datas e Decimal**

Cobrir serial Excel, `DD/MM/AAAA`, bissexto, ISO inválido, vírgula decimal, expoente,
milhar, zero, negativo, seis casas e limite `10^12`.

- [ ] **Step 2: Implementar sem `Number` financeiro**

Converter texto diretamente para Decimal e serializar ASCII sem expoente.

- [ ] **Step 3: Implementar validação por linha**

Conservar original, normalizado, número, lote e issues. Linha inválida não elimina
válidas.

- [ ] **Step 4: Gate**

Rodar unitários, typecheck e lint.

## Task I5: Regras de janela, direção e totais

**Files:**
- Create: `web/src/importer/directionRules.ts`
- Create: `web/src/importer/controlTotals.ts`
- Create: `web/src/importer/sourceAdapters/`
- Create: testes e fixtures anonimizadas

**Interfaces:**
- Consumes: bundle da origem e dados normalizados.
- Produces: janela, fechamento, pernas, ordens candidatas, totais e proveniência.

- [ ] **Step 1: Fixar regra como dado versionado**

Cada regra informa campos lidos, condição, direção, evidência e versão. Nenhum fuzzy
matching ou default silencioso.

- [ ] **Step 2: Testar janela do título**

Cobrir intervalo válido, virada de mês/ano, ano ausente com contexto, ambiguidade,
fechamento final e correção explícita.

- [ ] **Step 3: Testar fontes de direção**

Cobrir todos os sinais aprovados para cada adapter e conflito entre sinais. Conflito
gera blocker.

- [ ] **Step 4: Implementar totais de controle**

Registrar `OBSERVED`, `DERIVED` ou `INFERRED`, localização e regra. Comparar Decimal
sem tolerância oculta.

- [ ] **Step 5: Bloquear posição não identificada**

Soma de linhas brutas não vira ordem do motor sem regra de posição líquida. O adapter
retorna blocker descritivo.

- [ ] **Step 6: Gate**

Rodar unitários, typecheck, lint e medição com fixture extensa.

## Task I6: Clientes, aliases, lotes, eventos e projeção

**Files:**
- Create: `web/src/importer/clients.ts`
- Create: `web/src/importer/portfolio.ts`
- Create: `web/src/importer/eligibility.ts`
- Create: testes correspondentes

**Interfaces:**
- Consumes: linhas e metadados I4/I5.
- Produces: projeção vigente do draft e comandos puros.

- [ ] **Step 1: Preservar chave mecânica e aliases explícitos**

NFKC, trim, espaços, lowercase e diacríticos conforme spec antiga. Pontuação e sufixo
não fazem merge automático.

- [ ] **Step 2: Implementar replay determinístico**

Ordenar lotes, linhas e eventos pelas sequências canônicas. Nenhum timestamp decide
precedência.

- [ ] **Step 3: Implementar duplicidade e conflito**

Novo, idêntico, diferente e duplicado no lote; conflito nunca escolhe vencedor.

- [ ] **Step 4: Implementar correção, exclusão e reversão**

Eventos append-only preservam original, anterior, novo e autoria local. Reverter lote
recompõe projeção.

- [ ] **Step 5: Implementar elegibilidade**

Separar blockers e avisos da spec v2. Rascunho com blocker pode ser salvo, mas não
confirmado como executável.

- [ ] **Step 6: Gate**

Rodar todos os unitários do domínio, typecheck e lint.

## Task I7: Integração com ApplicationRepository

**Files:**
- Create: `web/src/importer/publisher.ts`
- Create: `web/src/importer/publisher.test.ts`
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Test: storage e concorrência

**Interfaces:**
- Consumes: projeção elegível e repositório Etapa 2.
- Produces: `confirmObservedCase` transacional.

- [ ] **Step 1: Escrever teste de publicação atômica**

Empresa, caso, lotes, eventos e operationId entram na mesma transação. Falha em
qualquer store não deixa caso parcial.

- [ ] **Step 2: Implementar publisher**

```ts
export async function confirmObservedCase(input: {
  draft: ObservedCaseDraft;
  expectedRevision: number;
  operationId: string;
  repository: ApplicationRepository;
}): Promise<ObservedCase>;
```

Validar novamente imediatamente antes do commit e chamar
`repository.confirmObservedCase` com empresa, caso, lotes e eventos em uma única
mutação.

- [ ] **Step 3: Testar CAS e idempotência**

Duas abas confirmam mesma revisão: uma vence; outra recebe conflito. Repetir
operationId retorna caso já confirmado.

- [ ] **Step 4: Testar isolamento**

Conta B não lê aliases, draft ou caso de A. Logout fecha conexão sem apagar.

- [ ] **Step 5: Gate**

Rodar storage, publisher, typecheck e build.

## Task I8: Catálogo e parâmetros de revisão

**Files:**
- Preserve/Create: catálogo servidor e contratos previstos em 2026-09-17
- Create: `web/src/importer/catalogClient.ts`
- Test: API e cliente

**Interfaces:**
- Consumes: auth e catálogo versionado.
- Produces: finalidades e defaults somente leitura para validação/revisão.

- [ ] **Step 1: Preservar catálogo não configurado**

Produção não inventa finalidades. Importação pode revisar sem catálogo; confirmação
executável identifica dependências ausentes.

- [ ] **Step 2: Testar cache e versão**

Resposta autenticada `no-store`, schema e hash canônico. Mudança de catálogo não
reescreve caso confirmado; snapshot posterior registra versão usada.

- [ ] **Step 3: Regenerar contratos oficiais**

Rodar exporter, generate:api, testes Python/TypeScript e diff determinístico.

## Task I9: Controlador do fluxo de importação

**Files:**
- Create: `web/src/importer/controller.ts`
- Create: `web/src/importer/controller.test.ts`

**Interfaces:**
- Consumes: registry, workers, domínio, catálogo e publisher.
- Produces: máquina de estados da spec v2.

- [ ] **Step 1: Testar estados e cancelamento**

Cobrir seleção, parsing, review, confirmação, conflito, storage failure, troca de
conta e resultado tardio.

- [ ] **Step 2: Implementar session epoch**

Worker e publisher pertencem à sessão. Troca de conta cancela e descarta retorno.

- [ ] **Step 3: Implementar confirmação**

Somente `READY_TO_CONFIRM` chama publisher. Sucesso retorna `{caseId, revision}` e
nunca chama API de prévia.

- [ ] **Step 4: Gate**

Rodar controller, typecheck e lint.

## Task I10: Interface de seleção, upload e revisão

**Files:**
- Create: componentes listados no mapa
- Create: `web/src/importer/components/importFlow.test.tsx`
- Modify: router, providers, shell e estilos

**Interfaces:**
- Consumes: controller I9.
- Produces: fluxo acessível até Caso Observado confirmado.

- [ ] **Step 1: Implementar seleção de fonte**

Arquivos e pasta, adapters candidatos, versão e limites visíveis. Ambiguidade exige
confirmação.

- [ ] **Step 2: Implementar progresso e cancelamento**

`role=status`, erro `role=alert`, sem upload automático, cancelamento funcional.

- [ ] **Step 3: Implementar resumo e amostras**

Empresa, janela, direção, totais, ordens, resultado observado, blockers, avisos e
proveniência. Linhas extensas usam paginação/virtualização acessível.

- [ ] **Step 4: Implementar correções e conflitos**

Salvar/cancelar, alias, versão, excluir/restaurar e desfazer lote. Ações materiais
confirmam alvo exato.

- [ ] **Step 5: Implementar confirmação**

Botão informa empresa, janela e quantidade de ordens. Sucesso oferece “Abrir caso” e
“Criar estudo com este caso”. A segunda ação pertence à rota da Etapa 2.

- [ ] **Step 6: Acessibilidade**

Teclado, foco, zoom 200%, tabela semântica, conteúdo como texto e redução de movimento.

- [ ] **Step 7: Gate**

Rodar unitários UI, router, typecheck, lint e build.

## Task I11: Aceitação, segurança, desempenho e handoff

**Files:**
- Create: `web/e2e/import-observed-case.spec.ts`
- Create: fixtures canônicas e extensas anonimizadas
- Modify: CI, scanner, `docs/testing.md`, `docs/architecture.md`, `MAPA.md` e diário

**Interfaces:**
- Consumes: I1–I10 e Etapa 2 integrada.
- Produces: evidência de arquivo → caso → estudo sem vazamento ou perda.

- [ ] **Step 1: E2E canônico completo**

Importar 1.000 ordens, revisar, confirmar, criar estudo, executar pela Etapa 2 e
reabrir. O importador em si termina antes da execução.

- [ ] **Step 2: E2E de fonte extensa**

Adapter extrai janela, direção e totais, mostra amostras, publica poucas ordens
canônicas justificadas e não renderiza todas as linhas.

- [ ] **Step 3: Segurança**

Inspecionar rede e IndexedDB; provar ausência de binário, XML, nomes brutos proibidos,
HTML injetado e logs de linha.

- [ ] **Step 4: Concorrência e isolamento**

Duas abas confirmam; uma recebe conflito. Conta A/B fica isolada. Reversão e reload
preservam projeção.

- [ ] **Step 5: Performance**

Medir limites canônicos preservados e orçamento próprio da fixture extensa. Registrar
ambiente, amostras, p95 e tarefas longas.

- [ ] **Step 6: Verificação completa**

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

- [ ] **Step 7: Revisão e handoff**

Usar verification, requesting-code-review e project-auditor. Rastrear arquivo →
adapter → draft → eventos → caso → repositório → estudo. Merge somente com aprovação.

## Dependências

```text
I0 → I1 → I2
      ├── I3 → I4 ──┐
      └── I5 ───────┤
I4 + I5 → I6 → I7 ──┤
I8 ─────────────────┤
                     ▼
                    I9 → I10 → I11
```

I7 depende do repositório compartilhado da Etapa 2. I1–I6 podem ser desenvolvidos
como módulos puros antes dessa integração, sem criar banco alternativo.

## Critério de conclusão

O importador termina quando fontes suportadas produzem Casos Observados reproduzíveis,
revisáveis, persistentes e seguros, e a Etapa 2 os consome sem redigitação. Nenhuma
execução do motor é responsabilidade do importador.
