# Análise de carteiras Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans para executar nesta sessão, tarefa a tarefa. Não delegar sem autorização. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar exploração local de combinações por objetivos, restrições, gráficos e contribuição marginal antes de qualquer publicação.

**Architecture:** Projetar execuções atuais em métricas compactas uma vez; aplicar funções puras de seleção, ranking, Pareto e diferenças. React consome uma única análise e mantém objetivo/filtros/seleção fora do documento persistido. Reutilizar Decimal, ECharts e o motor existente.

**Tech Stack:** React 19, TypeScript 5.9, Decimal.js, ECharts 6, Vitest, Playwright e FastAPI local já existentes; Node 24/npm 11 conforme package.json.

**Spec:** `docs/superpowers/specs/2026-09-30-carteiras-analise-design.md` (S1–S9).

## Global Constraints

- Sem push, PR, merge na main ou deploy nesta etapa.
- Não alterar Render, Supabase, autenticação de produção, motor, contratos HTTP ou documentos persistidos.
- Trocar objetivo/filtros/seleção não dispara diagnóstico nem altera o estudo.
- Resultados faltantes, inválidos ou desatualizados nunca valem zero.
- Ordenação usa decimais completos, não strings formatadas nem Number.
- Identidade de empresa usa companyByOrder.companyId; nome serve para apresentação.
- Não inventar ID, criar issue ou ampliar MOT-99.
- Varrer novas janelas fica fora desta entrega.

## Auditoria de partida

- [x] MAPA, Diário, AGENTS e ADR de bps consultados na base candidata.
- [x] Base local escolhida: `829d2248d3a6d28ee643af460dbedc27f9b4265d`; contém a tela e os ajustes de atalhos/replay/backup.
- [x] Worktree gerenciado criado e branch local `codex/carteiras-analise` criada.
- [x] Linear consultado em leitura; nenhuma tarefa específica encontrada nas buscas. MOT-99 conferida e não reaproveitada como autorização.
- [x] Issue criada com autorização de Gabriel: MOT-100, Em andamento.
- [x] Baseline e gates executados durante a implementação; resultados e limites estão no documento de aceite local.

## Modelos e paralelismo

Os modelos são escolhidos pela dificuldade e pelo risco do contrato, não pela ordem
das tarefas. Agentes paralelos recebem arquivos exclusivos; integração, revisão e
testes conjuntos pertencem ao agente coordenador.

| Etapa | Modelo / raciocínio | Pode rodar em paralelo | Dependências |
|---|---|---|---|
| T0 ambiente e baseline | gpt-6-luna / medium | com a leitura inicial | nenhuma |
| T1 projeção canônica | gpt-6-astra / high | com T2 e parte isolada de T6 | define `PortfolioMetrics` |
| T2 objetivos e filtros | gpt-6-sol / high | com T1, usando contrato escrito | consome o contrato, sem importar T1 até integração |
| T3 interface e tabela | gpt-6-sol / high | não; integra T1+T2 | T1 e T2 verdes |
| T4 gráfico e Pareto | gpt-6-sol / high | com T5 após T1 | `PortfolioMetrics` estável |
| T5 contribuição marginal | gpt-6-astra / high | com T4 | `PortfolioMetrics` estável |
| T6 launcher local | gpt-6-luna / high | parte Python com T1+T2; E2E depois de T3–T5 | runner existente; UI final para E2E |
| Revisões por etapa | gpt-6-sol / high | após cada integração | diff e testes da etapa |
| Revisão final transversal | gpt-6-astra / xhigh | após todos os gates | branch completa |

Ondas de execução:

```text
Onda A: T1 métricas ─────────┐
        T2 seleção ──────────┼─> integração/revisão ─> T3 interface
        T6a launcher local ──┘

Onda B: T4 gráfico/Pareto ───┐
        T5 marginais ────────┼─> integração/revisão ─> T6b E2E/aceite/preview
        T3 interface ────────┘
```

T1 e T2 não editam a mesma fixture: T1 possui `portfolioAnalysisFixtures.ts`;
T2 usa fixtures locais em seu próprio teste. T6a toca apenas Python. T4 e T5 usam
arquivos distintos. Nenhum agente paralelo edita painel, CSS, plano, spec, Diário
ou MAPA. O coordenador resolve imports e faz as edições compartilhadas.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `web/src/levers/portfolioRecommendation.ts` | Fachada compatível do fluxo antigo; preservar export compositionComparisonReason usado por savingsOrigin |
| `web/src/levers/portfolioAnalysis.ts` | Projeção dos diagnósticos, IDs, métricas, conservação, cobertura e exclusões |
| `web/src/levers/portfolioSelection.ts` | Objetivos, filtros, razões, desempates e destaques |
| `web/src/levers/portfolioFrontier.ts` | Pareto bidimensional e dados do scatter |
| `web/src/levers/portfolioMarginal.ts` | Índice de conjuntos e deltas adicionar/remover |
| `web/src/levers/PortfolioRecommendationPanel.tsx` | Compor os controles e estado local da exploração |
| `web/src/levers/PortfolioCriteria.tsx` | Objetivos e restrições com validação |
| `web/src/levers/PortfolioTable.tsx` | Tabela paginada e ordenação independente |
| `web/src/levers/PortfolioTradeoffChart.tsx` | Scatter ECharts, seleção e fronteira |
| `web/src/levers/PortfolioMarginalPanel.tsx` | Barras divergentes e tabela de diferenças |
| `web/src/styles/global.css` | Estilos limitados ao painel de carteiras |
| `web/src/levers/portfolioAnalysisFixtures.ts` | Fixtures sintéticas compartilhadas apenas por testes |
| `web/e2e/study-portfolio-analysis.spec.ts` | Aceite integrado; nome já aceito pelo regex study-.* do Playwright |
| `scripts/preview_carteiras.py` | Launcher local interativo com cálculos liberados |
| `tests/web_api/test_preview_carteiras.py` | Loopback e execução/shutdown do pool de preview |
| `docs/frontend/carteiras-analise-aceitacao.md` | Evidências e comandos reais, versões e limitações |

Cada módulo novo terá teste homônimo `.test.ts` ou `.test.tsx`. Não modificar
`comparisonBoardBreakdown.ts`: não é necessário recalcular custos por cliente.

## Task 0: ambiente e baseline

**Files:** somente dependências ignoradas e evidências locais; nenhum código de produção.
**Consumes:** worktree dedicado no SHA registrado.
**Produces:** baseline com comandos, resultados e falhas preexistentes identificadas.

- [ ] Conferir HEAD e status do worktree; não editar outros checkouts.
- [ ] Conferir Node/npm e instalar dependências pelo lock com `npm --prefix web ci` se ausentes; não atualizar lock.
- [ ] Rodar baseline focado:

```powershell
npm --prefix web run test:unit -- src/levers/portfolioRecommendation.test.ts src/levers/PortfolioRecommendationPanel.test.tsx src/levers/savingsOrigin.test.ts src/pages/StudyDiagnosticCombinations.test.tsx
npm --prefix web run typecheck
```

- [ ] Registrar resultados. Falhas novas impedem alegar prontidão; investigar antes de atribuir regressão a esta entrega.

## Task 1: projeção canônica das métricas

**Files:** criar `portfolioAnalysis.ts`, `portfolioAnalysis.test.ts`, `portfolioAnalysisFixtures.ts`; adaptar `portfolioRecommendation.ts` sem ciclo de imports; teste `portfolioRecommendation.test.ts` preservado.

**Interfaces:** `collectPortfolioMetrics(study: StudyDocument): PortfolioDataset`;
`PortfolioDataset = { candidates: readonly PortfolioMetrics[]; excluded: readonly PortfolioExclusion[]; preparedCount: number; complete: boolean }`.
`PortfolioMetrics` contém `scenarioId`, `name`, `companyIds`, `companyNames`,
`savings`, `volume`, `baseline`, `netted`, `weightedWait`, `waitP95Days`, `matchedVolume`,
`netability` e `costDelta`. Decimais serializados como strings; weightedWait é soma
valor × dias, permitindo comparar médias sem perda por divisão. `costDelta` tem
iof/carry/spread/espera/fixo. Não duplicar envelopes pesados nessas estruturas.

- [ ] Extrair fixture existente de portfolioRecommendation.test.ts para helper `measuredStudyFixture` no arquivo de fixtures, mantendo volume 400, espera ponderada 150 e economia 10. Acrescentar baseline 20/netado 10 coerentes, preservar totais publicados e cobrir separadamente um resíduo decimal legítimo entre total e componentes.
- [ ] Escrever testes dos campos de período, P95 ponderado e conservação; exemplo:

```ts
it('mede espera por volume de alocação no período', async () => {
  const { study } = await measuredStudyFixture();
  const item = collectPortfolioMetrics(study).candidates[0]!;
  expect(item.volume).toBe('400');
  expect(item.weightedWait).toBe('150');
  expect(item.waitP95Days).toBe(2);
});
```

- [ ] Acrescentar casos: duas empresas homônimas com IDs distintos; baseline zero; diagnóstico desatualizado; alocação incompleta; empresa parcial; ordens fora do período; cenário duplicado não faz complete=true.
- [ ] Rodar `npm --prefix web run test:unit -- src/levers/portfolioAnalysis.test.ts` e confirmar falha pela função ausente.
- [ ] Implementar a extração reaproveitando elegibilidade atual. Manter soma, produtos e comparações com precisão explícita dimensionada, sem Decimal.set global.
- [ ] Rodar novos testes e os de portfolioRecommendation/savingsOrigin. Confirmar que fachada mantém consumidores existentes até Task 3.

## Task 2: objetivos, filtros e explicações

**Files:** criar `portfolioSelection.ts` e `.test.ts`; ampliar fixtures.

**Interfaces:** `PortfolioObjective = 'savings' | 'efficiency' | 'costReduction' | 'wait' | 'companyCount' | 'netability'`.
`PortfolioFilters = { maxWaitDays: string | null; minVolume: string | null; minSavings: string | null; maxCompanies: number | null; requiredCompanyIds: readonly string[]; retainBestPercent: string | null }`.
`selectPortfolios(candidates: readonly PortfolioMetrics[], objective: PortfolioObjective, filters: PortfolioFilters): PortfolioSelection`.
`PortfolioSelection` contém ranked, winner, ineligible (candidato e motivos), relativeReference e highlights (objetivo → scenarioId ou null).

- [ ] Criar fixture `rankingCandidates()` com A: economia 100, volume 10.000, baseline 200, média 3, 3 empresas; B: 90, 3.000, 100, média 1, 2 empresas; C: 40, 2.000, 80, média 0,5, 1 empresa. Netabilidades: A=0,8/B=0,6/C=0,4. Todos valores sintéticos, não envelopes financeiros de produção.
- [ ] Escrever testes de escolhas e referência relativa:

```ts
it('distingue escala, eficiência e espera', () => {
  const rows = rankingCandidates();
  expect(selectPortfolios(rows, 'savings', emptyFilters).winner?.scenarioId).toBe('A');
  expect(selectPortfolios(rows, 'efficiency', emptyFilters).winner?.scenarioId).toBe('B');
  expect(selectPortfolios(rows, 'wait', emptyFilters).winner?.scenarioId).toBe('C');
  const chosen = selectPortfolios(rows, 'companyCount', { ...emptyFilters, retainBestPercent: '90' });
  expect(chosen.relativeReference).toBe('100');
  expect(chosen.winner?.scenarioId).toBe('B');
});
```

- [ ] Cobrir limites inclusivos, UUID obrigatório, percentuais inválidos, todos negativos, baseline zero só exclui do objetivo percentual, empate com valores que arredondam igual, diferenças além de 20 algarismos e ordem de entrada invertida.
- [ ] Rodar `npm --prefix web run test:unit -- src/levers/portfolioSelection.test.ts`; confirmar RED.
- [ ] Implementar regras S3/S4, produtos cruzados e desempates determinísticos; sem comparação por números arredondados.
- [ ] Rodar GREEN, registrar a semântica da referência relativa nas explicações.

## Task 3: primeira interface local completa

**Files:** `PortfolioRecommendationPanel.tsx`/`.test.tsx`; novos `PortfolioCriteria.tsx`, `PortfolioTable.tsx` e testes; `global.css`; regressão `StudyDiagnosticCombinations.test.tsx`.
**Consumes:** collectPortfolioMetrics + selectPortfolios.
**Produces:** primeira entrega navegável; seleção única por scenarioId.

- [ ] Criar testes de interação com fixture de três carteiras e fixture de 255 métricas compactas. O builder de 255 deve usar subconjuntos únicos de 8 IDs; não gerar envelopes enormes para testar paginação.

```tsx
it('troca objetivo sem editar nem executar o estudo', async () => {
  const user = userEvent.setup();
  render(<PortfolioRecommendation study={await threePortfolioStudy()} />);
  await user.selectOptions(screen.getByLabelText('Objetivo'), 'efficiency');
  expect(screen.getByRole('heading', { name: /Composição recomendada: B/ })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: /Todas as composições/ })).toBeInTheDocument();
});
```

`threePortfolioStudy()` será definido em portfolioAnalysisFixtures com execuções FIXED_INPUT válidas para base e subconjuntos, derivado do helper medido da Task 1; não falsificar resultado financeiro de motor como evidência E2E.

- [ ] Cobrir campo inválido, limpar filtros, nenhum elegível, 25/50/100 linhas, última página, ordenação que não muda objetivo, nomes homônimos e seleção removida pelo filtro.
- [ ] Rodar `npm --prefix web run test:unit -- src/levers/PortfolioRecommendationPanel.test.tsx src/levers/PortfolioCriteria.test.tsx src/levers/PortfolioTable.test.tsx` e confirmar RED.
- [ ] Implementar controle acessível e extração memoizada por estudo/execuções; apresentar cobertura, quatro destaques deduplicados, explicação e tabela. Preservar link Abrir composição e fluxo de estudo comum.
- [ ] Rodar testes focados, typecheck e lint. Conferir imutabilidade do StudyDocument antes/depois das interações.
- [ ] Entregar preview da Task 6 nesta primeira etapa e colher ajustes de Gabriel; publicação permanece vedada.

## Task 4: gráfico, Pareto e detalhes

**Files:** `portfolioFrontier.ts`/`.test.ts`, `PortfolioTradeoffChart.tsx`/`.test.tsx`; painel e estilos.
**Interfaces:** `paretoScenarioIds(candidates: readonly PortfolioMetrics[]): ReadonlySet<string>`; gráfico recebe candidates, frontier, selectedScenarioId e onSelect(scenarioId).

- [ ] Testar fronteira sintética: A=(espera 3,economia 100), B=(1,90), C=(2,80); A/B permanecem, C é dominada. Igualdade exata mantém ambos; não comparar valores arredondados.

```ts
expect([...paretoScenarioIds(paretoFixture())].sort()).toEqual(['A', 'B']);
```

- [ ] Rodar `npm --prefix web run test:unit -- src/levers/portfolioFrontier.test.ts` e confirmar RED.
- [ ] Implementar Pareto restrito às elegíveis; projeção Number apenas para desenhar, conservar strings exatas na seleção. Implementar scatter com registro modular ScatterChart de ECharts já instalado e renderer SVG, lazy import se necessário. Não ampliar o wrapper EChart genérico sem necessidade.
- [ ] Testar seleção por evento e teclado via tabela, pontos sobrepostos, dispose/resize e redução de movimento; nomes com markup não viram HTML executável.
- [ ] Acrescentar P95 e detalhes dos cinco componentes de custo vindos do período. Preservar totais e economia publicados; testar tanto reconciliação exata quanto resíduo decimal legítimo, exibido como nota neutra e sem alterar valores.
- [ ] Rodar unitários, build e inspeção visual 1280×800 e zoom 200%; validar gráfico e tabela na mesma seleção.

## Task 5: contribuição marginal

**Files:** `portfolioMarginal.ts`/`.test.ts`, `PortfolioMarginalPanel.tsx`/`.test.tsx`; painel e estilos.
**Interfaces:** `portfolioMarginals(allComparable: readonly PortfolioMetrics[], selectedScenarioId: string, universeCompanyIds: readonly string[]): readonly MarginalRow[]`.
`MarginalRow` contém companyId, action ADD/REMOVE, targetScenarioId ou null, reason ou null, e deltas de savings/volume/weightedMeanWait/bps/companyCount quando disponíveis.

- [ ] Fixture com S={A,B}, economia 100; {A}=30; {B}=20; {A,B,C}=120. Remover B dá -70; remover A dá -80; adicionar C dá +20.

```ts
const rows = portfolioMarginals(marginalFixture(), 'AB', ['A', 'B', 'C']);
expect(rows.find(r => r.companyId === 'B' && r.action === 'REMOVE')?.savingsDelta).toBe('-70');
expect(rows.find(r => r.companyId === 'C' && r.action === 'ADD')?.savingsDelta).toBe('20');
```

- [ ] Cobrir contraparte ausente, singleton/vazio, homônimos, duplicatas compatíveis resolvidas deterministicamente, contraditórias indisponíveis e contraparte fora dos filtros ainda analisável com aviso.
- [ ] Rodar `npm --prefix web run test:unit -- src/levers/portfolioMarginal.test.ts` e confirmar RED.
- [ ] Indexar por JSON.stringify(ids ordenados), calcular alvo menos selecionada e apresentar tabela/barras com sinais corretos. Não usar breakdownByCompany como substituto da simulação do subconjunto.
- [ ] Testar mudança de seleção atualizando a análise, navegação para contraparte e aviso de não aditividade/não rateio. Rodar GREEN.

## Task 6: preview manual e aceite integrado

**Files:** launcher e teste Python do mapa; `web/e2e/study-portfolio-analysis.spec.ts`; documento de aceite.
**Consumes:** build E2E e build_e2e_app existentes, UI das Tasks 3–5.
**Produces:** aplicação acessível em loopback para Gabriel e evidências reproduzíveis.

- [ ] Escrever teste do pool imediato: submit chama execute_repetition com a tarefa correta, future retorna resultado/erro; shutdown libera recursos. Confirmar bind exclusivo 127.0.0.1.
- [ ] Implementar launcher de desenvolvimento:

```python
class ImmediateDiagnosticPool:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=1)

    def submit(self, task):
        return self.executor.submit(execute_repetition, task)

    def shutdown(self, *, wait, cancel_futures):
        self.executor.shutdown(wait=wait, cancel_futures=cancel_futures)
```

Importar ThreadPoolExecutor de concurrent.futures, execute_repetition de
servidor.diagnostics.service. Usar build_e2e_app(diagnostic_worker_pool=pool),
`uvicorn.run(app, host='127.0.0.1', port=8031, access_log=False)` e shutdown em
finally. Não usar endpoints de controle que chamam snapshot/release nesse preview;
eles pertencem ao runner de testes. O launcher fica fora do entrypoint de produção.

- [ ] Instalar dependências Python de desenvolvimento previstas no repo em ambiente próprio se necessário, sem copiar .env ou segredos. Rodar `python -m pytest tests/web_api/test_preview_carteiras.py -q`.
- [ ] Construir e iniciar manualmente a partir da raiz isolada:

```powershell
node web/scripts/build-e2e.mjs
python -m scripts.preview_carteiras
```

- [ ] Abrir http://127.0.0.1:8031 no navegador; manter processo disponível para experimentação. Conferir login fictício aceito pelo cliente E2E da base; registrar instrução exata no aceite.
- [ ] E2E com 3 empresas/7 carteiras usa motor local real e liberação controlada dos jobs no runner Playwright original; aguardar todas terminarem. A partir daí interceptar/contar POSTs a `/api/v1/diagnosticos` e `/api/v1/preparacoes`; trocar objetivo, filtros, tabela, gráfico e seleção marginal deve acrescentar zero chamadas.
- [ ] Confirmar no E2E que números da tela reconciliam com envelopes reais capturados; não cravar vencedor baseado em fixture artificial.
- [ ] Rodar gates:

```powershell
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
npm --prefix web run test:e2e -- study-portfolio-analysis.spec.ts
git diff --check
```

- [ ] Como build de produção sobrescreve dist, reconstruir modo E2E antes de deixar o preview ligado. Não deixar servidor de teste usando bundle incompatível.
- [ ] Medir em navegador aquecido a troca de filtro/objetivo com 255 resultados compactos: 20 interações, registrar mediana/p95 e hardware; alvo p95 <=200 ms, investigar travamento antes do aceite. Não alegar SLA universal.
- [ ] Verificar teclado, zoom 200%, tamanho do painel, ponto sobreposto, ausência de NaN, rótulos negativos e recuperação sem perda de estudo. Revisão focada em regressão e contratos, sem refazer auditoria financeira histórica.
- [ ] Registrar checks reais, falhas e limitações em docs/frontend/carteiras-analise-aceitacao.md. Atualizar Diário/MAPA apenas nesta branch quando houver implementação e ID definido.
- [ ] Entregar URL local e roteiro a Gabriel, aguardar experimentação e incorporar ajustes pedidos. Aceite local não autoriza push/main/deploy.

## Revisão do plano

S1/base → Task 0; S2/elegibilidade → Task 1; S3/métricas → Tasks 1/2/4;
S4/filtros → Tasks 2/3; S5/interface → Tasks 3/4; S6/marginais → Task 5;
S7/aceite e S8/preview → Task 6; S9/escopo → restrições globais.

Documentos e base preparados; implementação, testes, preview e aceite humano ainda
não executados. Antes de declarar cada entrega pronta, preencher evidências, não
inferir sucesso das contagens históricas de outras branches.
