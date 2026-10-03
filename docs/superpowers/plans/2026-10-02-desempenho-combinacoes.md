# Desempenho da análise de combinações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar Estudos, Diagnóstico e o lote de até 255 combinações responsivos sem alterar nenhum resultado financeiro.

**Architecture:** Separar o catálogo leve dos documentos completos; anexar resultados diagnósticos por delta atômico; executar computações remotas com um pool limitado a dois e persistir os deltas em série. A projeção de carteiras usa índices lineares e fica suspensa durante o lote.

**Tech Stack:** React 19, TypeScript 5.9, IndexedDB/fake-indexeddb, Vitest, Playwright, FastAPI e pytest; Node 24/npm 11 conforme `web/package.json`.

**Spec:** `docs/superpowers/specs/2026-10-02-desempenho-combinacoes-design.md`

## Global Constraints

- Não alterar fórmulas, política P0, EDF, custos, ordens, snapshots, fingerprints ou envelopes do motor.
- Oito empresas continuam produzindo exatamente 255 composições únicas.
- Navegação, filtros, expansão recolhida e análise local não fazem POST de preparação ou diagnóstico.
- Concorrência remota máxima igual a 2; persistência local estritamente serial.
- Cada terminal anunciado como concluído deve estar salvo; cancelamento preserva resultados concluídos.
- Estudos existentes devem migrar sem exportação/importação e sem remoção destrutiva de histórico.
- Toda invariante de correção usa `raise`/erro explícito, nunca `assert` de produção.
- Preview local e aceite do Gabriel antecedem PR, merge e deploy.

---

### Task 1: Baseline reproduzível de 255 combinações

**Files:**
- Modify: `web/src/pages/StudyDiagnosticCombinations.test.tsx`
- Create: `web/src/performance/portfolioPerformanceFixtures.ts`
- Create: `web/src/performance/portfolioPerformance.test.ts`

**Interfaces:**
- Produces: `makePortfolioStudy(companyCount, options)` para testes de 0, 63 e 255 resultados.
- Produces: medições separadas de projeção e de atualização de documento, sem orçamento dependente de CI neste teste unitário.

- [ ] Extrair uma fixture determinística capaz de materializar 255 cenários e resultados atuais sem chamar HTTP.
- [ ] Escrever teste de equivalência que confirme 255 composições, fingerprints distintos e ranking estável.
- [ ] Adicionar instrumentação de contagem para provar que abrir o overview não chama preparação/diagnóstico.
- [ ] Rodar os testes novos e registrar o baseline local no Diário somente ao final, junto da implementação.

### Task 2: Catálogo leve no IndexedDB

**Files:**
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.test.ts`
- Modify: `web/src/storage/migrations.test.ts`
- Modify: `web/src/study/studyController.ts`
- Modify: `web/src/study/studyController.test.ts`

**Interfaces:**
- Produces: `StudySummary` e `ApplicationRepository.listStudySummaries(options?)`.
- Produces: store `study_summaries`, índices `by_owner` e `by_owner_deleted`, schema físico/lógico 4.
- Preserves: `listStudies` para consumidores que realmente precisam de documentos completos.

- [ ] Escrever testes RED para resumo de estudo ativo/lixeira, ordenação e isolamento por owner.
- [ ] Escrever teste RED de migração v3→v4 que cria resumos sem validar envelopes.
- [ ] Incrementar schema, criar store e implementar validação estrita do resumo.
- [ ] Atualizar `saveStudy`, `restoreStudy`, demo install e purge na mesma transação do estudo.
- [ ] Implementar fallback reparável quando um resumo legado estiver ausente.
- [ ] Expor `listStudySummaries` no controller mantendo a guarda de sessão.
- [ ] Rodar storage, migration e controller tests.

### Task 3: Estudos e hub com lazy load

**Files:**
- Modify: `web/src/study/components/StudyList.tsx`
- Modify: `web/src/pages/StudiesPage.tsx`
- Modify: `web/src/pages/StudiesPage.test.tsx`
- Modify: `web/src/pages/DiagnosticsHubPage.tsx`
- Modify: `web/src/pages/DiagnosticsHubPage.test.tsx`

**Interfaces:**
- Consumes: `StudySummary`, `controller.listStudySummaries`, `controller.loadStudy`.
- Produces: `StudyDiagnostics` que carrega um documento só ao expandir.

- [ ] Escrever teste RED de Estudos com resumo de 255 cenários e nenhuma leitura de execução.
- [ ] Trocar a lista de Estudos para resumos; carregar documento apenas em ações que o exigem.
- [ ] Escrever teste RED do hub: entrada recolhida faz zero `loadStudy`; expandir A carrega somente A.
- [ ] Implementar estados por estudo `COLLAPSED/LOADING/LOADED/ERROR` e evitar publicação indevida no controller ao fazer leitura destacada.
- [ ] Adicionar `controller.readStudy(id)` sem mudar a seleção corrente.
- [ ] Rodar testes das duas páginas, componente de lista e controller.

### Task 4: Projeção linear e pausa durante o lote

**Files:**
- Modify: `web/src/levers/portfolioAnalysis.ts`
- Modify: `web/src/levers/portfolioAnalysis.test.ts`
- Modify: `web/src/levers/PortfolioRecommendationPanel.tsx`
- Modify: `web/src/levers/PortfolioRecommendationPanel.test.tsx`
- Modify: `web/src/pages/StudyDiagnosticPage.tsx`
- Modify: `web/src/pages/StudyDiagnosticCombinations.test.tsx`

**Interfaces:**
- Produces: índice imutável de execução atual por `(scenarioId, revision, inputFingerprint)`.
- Produces: prop `deferred`/estado equivalente para não projetar a recomendação durante o lote.

- [ ] Escrever teste RED que falha se a coleta fizer busca do histórico uma vez por cenário.
- [ ] Criar o índice em uma única passagem e preservar exclusões/ordenação atuais.
- [ ] Escrever teste RED provando que 255 atualizações de progresso não projetam 255 vezes.
- [ ] Durante o lote, renderizar somente progresso compacto; ao terminar/cancelar/falhar, projetar uma vez.
- [ ] Comparar golden de ranking/marginais antes e depois.
- [ ] Rodar testes de análise, painel e página diagnóstica.

### Task 5: Append atômico e compacto de tentativa diagnóstica

**Files:**
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.test.ts`
- Modify: `web/src/diagnostics/domain.ts`
- Modify: `web/src/diagnostics/domain.test.ts`
- Modify: `web/src/study/studyController.ts`
- Modify: `web/src/study/studyController.test.ts`

**Interfaces:**
- Produces: `AppendDiagnosticAttemptMutation` com `studyId`, `expectedRevision`, `operationId`, `reservation`, `terminal`.
- Produces: `DiagnosticAppendDelta` com `revision`, `updatedAt`, `executions`.
- Produces: `controller.appendDiagnosticAttempt(...)` que publica um documento imutável atualizado sem save integral.

- [ ] Escrever testes RED para sucesso, rollback, owner, revisão, fingerprint, duplicidade e replay idempotente.
- [ ] Implementar validação do delta contra cenário certificado e identidade reserva/terminal.
- [ ] Gravar somente duas execution rows, metadados do estudo, resumo e operação compacta numa transação.
- [ ] Remover o documento cumulativo do intent desta nova operação, sem reescrever operações históricas.
- [ ] Aplicar delta no controller e atualizar canal/revisão de modo compatível com outras abas.
- [ ] Manter `saveStudy` como fallback para mutações estruturais e fluxos não diagnósticos.
- [ ] Rodar domain, repository e controller tests, inclusive conflito entre abas.

### Task 6: Computação remota separada e pool de dois

**Files:**
- Modify: `web/src/diagnostics/diagnosticExecutionService.ts`
- Modify: `web/src/diagnostics/diagnosticExecutionService.test.ts`
- Create: `web/src/diagnostics/runDiagnosticPool.ts`
- Create: `web/src/diagnostics/runDiagnosticPool.test.ts`
- Modify: `web/src/pages/StudyDiagnosticPage.tsx`
- Modify: `web/src/pages/StudyDiagnosticCombinations.test.tsx`

**Interfaces:**
- Produces: `computeDiagnosticAttempt(...)` que retorna reserva+terminal sem persistir.
- Produces: `runDiagnosticPool(items, { concurrency: 2, compute, commit, signal, onProgress })`.
- Consumes: `controller.appendDiagnosticAttempt` da Task 5.

- [ ] Extrair a fase remota do serviço e provar por teste que a execução individual mantém request/terminal idênticos.
- [ ] Escrever teste RED do pool com pico exato de dois computes e um commit por vez.
- [ ] Implementar fila, ordem independente de conclusão e progresso monotônico.
- [ ] Escrever testes de falha, cancelamento e navegação: não submeter novos itens; aguardar/salvar terminais ativos.
- [ ] Integrar o lote de combinações usando `count=1` e reutilização de resultados atuais.
- [ ] Em conflito de revisão, reler e tentar uma vez somente quando a tentativa ainda não estiver persistida.
- [ ] Rodar serviço, pool e página diagnóstica.

### Task 7: Preparação idempotente

**Files:**
- Modify: `web/src/study/model.ts`
- Modify: `web/src/study/validation.ts`
- Modify: `web/src/levers/prepareCombinationStudy.ts`
- Modify: `web/src/levers/prepareCombinationStudy.test.ts`
- Modify: `web/src/study/studyTransfer.test.ts`

**Interfaces:**
- Produces: assinatura opcional de cobertura de combinações no StudyDocument V3.
- Preserves: importação de documentos V3 anteriores sem o campo.

- [ ] Escrever teste RED: segunda preparação idêntica não chama `buildLeverScenario`.
- [ ] Definir assinatura canônica com cenário-base, empresas, premissas e período.
- [ ] Persistir a assinatura somente depois de materializar exatamente todas as combinações.
- [ ] Invalidar/ignorar assinatura após qualquer mudança relevante.
- [ ] Testar round-trip, importação antiga, mudança de premissa e empresa removida/adicionada.
- [ ] Rodar testes de preparação, validação e transferência.

### Task 8: Integração, medição e aceite local

**Files:**
- Modify: `web/e2e/study-portfolio-analysis.spec.ts`
- Create: `web/e2e/portfolio-performance.spec.ts`
- Create: `tests/web_api/measure_portfolio_performance.py`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: `docs/MAPA.md`

**Interfaces:**
- Produces: relatório JSON com ambiente, amostras, p50/p95, long tasks, requisições, concorrência e tempos por fase.

- [ ] Adicionar E2E com 255 cenários salvos verificando zero POST incidental e lazy load.
- [ ] Medir 20 aberturas quentes de Estudos e Diagnóstico; exigir p95 ≤ 200 ms.
- [ ] Medir feedback do clique de nova combinação; exigir ≤ 100 ms.
- [ ] Medir filtros/objetivos após lote; exigir p95 ≤ 200 ms e zero long tasks > 200 ms.
- [ ] Rodar lote real de 63 e, se viável no gate local, 255 combinações; registrar compute/persist/projection e pico de concorrência 2.
- [ ] Verificar equivalência dos envelopes/ranking e ausência de crescimento quadrático do armazenamento novo.
- [ ] Rodar `npm --prefix web run test:unit`, build, E2Es relevantes, `pytest -q` e `python -O -m pytest -q`.
- [ ] Atualizar Diário e MAPA com números, limitações e referência ao commit.
- [ ] Abrir preview local e entregar URL ao Gabriel antes de qualquer PR/merge/deploy.

## Paralelismo e modelos

| Frente | Modelo / raciocínio | Paralela | Arquivos exclusivos durante a onda |
|---|---|---|---|
| Catálogo/storage (T2) | gpt-6-astra / high | Onda A | storage + controller contracts/tests |
| Projeção (T4) | gpt-6-sol / high | Onda A | levers/portfolio* |
| Baseline/fixtures (T1) | gpt-6-luna / high | Onda A | performance fixtures/tests |
| Páginas lazy (T3) | gpt-6-sol / high | Onda B | StudiesPage, DiagnosticsHub, StudyList |
| Append diagnóstico (T5) | gpt-6-astra / xhigh | Onda B após T2 | storage/controller/domain delimitados |
| Pool remoto (T6) | gpt-6-astra / high | Onda C após T5 | diagnostic service/pool + integração de página |
| Preparação idempotente (T7) | gpt-6-sol / high | Onda C | model/validation/prepareCombinationStudy |
| Auditoria final (T8) | gpt-6-astra / xhigh | após integração | somente leitura primeiro; E2E/docs pelo coordenador |

O agente principal é dono de arquivos compartilhados (`StudyDiagnosticPage.tsx`,
`applicationRepository.ts`, `studyController.ts`, `indexedDbApplicationRepository.ts`),
integra contratos entre ondas, resolve conflitos e executa todos os gates.

## Checkpoints

```text
Onda A: T1 baseline ─────────────┐
        T2 catálogo ─────────────┼─> integração e testes de contrato
        T4 projeção ─────────────┘

Onda B: T3 páginas lazy ─────────┐
        T5 append incremental ───┼─> integração de persistência

Onda C: T6 pool de dois ─────────┐
        T7 preparação idempotente┼─> E2E, medição, auditoria e preview
```
