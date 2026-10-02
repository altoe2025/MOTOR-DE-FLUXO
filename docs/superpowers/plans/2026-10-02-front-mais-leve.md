# Front mais leve — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o front do Motor de Fluxo leve: cada tela mostra a ação principal e o resultado; o resto fica recolhido, num menu "⋯" ou atrás de um "?".

**Architecture:** Três componentes de UI novos e reutilizáveis (`ActionMenu`, `Disclosure`, `HelpTip`) aplicados tela a tela, sem mudar dados, cálculos, contratos, armazenamento ou rotas. As telas continuam com os mesmos handlers; muda só a apresentação e a ordem.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library (jsdom), Playwright (e2e), CSS em `web/src/styles/global.css` com tokens de `web/src/styles/tokens.css`.

**Spec:** protótipo aprovado pelo Gabriel em 2026-10-02 — `entregaveis/prototipo-front-mais-leve.html` (fora do repo; artifact https://claude.ai/artifact/5G4QpgKTddu223j2V31mVC). Fora do escopo por decisão dele: a tela de **recomendação de carteira** e **Empresas** (lista e página da empresa).

## Global Constraints

- Nenhum número, cálculo, regra do motor, contrato de API, store do IndexedDB, rota ou variável muda. Nada de funcionalidade some: o que sai da tela vai para "⋯", painel recolhido ou "?".
- Acessível por teclado: `aria-expanded`/`aria-controls` nos painéis; menu "⋯" com `aria-haspopup="menu"`, itens `role="menuitem"`, Esc fecha e devolve o foco, setas navegam, clique fora fecha; nome acessível "Mais ações: <item>".
- Os `data-chat-help-id` existentes acompanham o controle para onde ele for (itens de menu incluídos). Controle removido → ficha do catálogo `servidor/catalogs/product_help.v1.json` atualizada.
- Vírgula decimal continua aceita onde já era; textos de ajuda viram `HelpTip`.
- Cada commit com testes verdes; entrada no `docs/DIARIO-DE-MUDANCAS.md` no commit final da série.

---

### Task 1: Componentes base

**Files:**
- Create: `web/src/ui/ActionMenu.tsx`, `web/src/ui/Disclosure.tsx`, `web/src/ui/HelpTip.tsx`
- Create: `web/src/ui/lightUi.test.tsx`
- Modify: `web/src/styles/global.css` (bloco novo "Interface leve")

**Interfaces (Produces):**
- `ActionMenu({ label: string; items: readonly ActionMenuItem[]; className?: string })`, com `ActionMenuItem = { label: string; onSelect(): void; danger?: boolean; disabled?: boolean; helpId?: string; ariaLabel?: string } | 'separator'`. Itens só existem no DOM com o menu aberto.
- `Disclosure({ id: string; label: ReactNode; hint?: ReactNode; defaultOpen?: boolean; className?: string; children: ReactNode })` — botão `aria-expanded`/`aria-controls`; conteúdo só renderiza aberto.
- `HelpTip({ label: string; children: ReactNode })` — botão "?" com `aria-label="Ajuda: <label>"`, tooltip `role="tooltip"` em hover/foco/clique, Esc fecha.

- [ ] Testes: menu abre/fecha, itens chamam `onSelect` e fecham, Esc devolve foco, setas navegam, clique fora fecha, item `danger`; disclosure alterna `aria-expanded` e monta/desmonta conteúdo, `defaultOpen`; help tip mostra/esconde tooltip.
- [ ] Ver falhar (`npx vitest run src/ui/lightUi.test.tsx`), implementar, ver passar, commit.

### Task 2: Lista de estudos e navegação

**Files:** `web/src/study/components/StudyList.tsx`, `web/src/pages/StudiesPage.tsx`, `web/src/app/AppShell.tsx`, testes `web/src/pages/StudiesPage.test.tsx`, `web/src/study/components/*StudyList*.test.tsx` (onde existirem), `web/src/app/router.test.tsx`.

- Cabeçalho: "Comparar estudos" (link para `/quadro`), "Novo estudo" (principal, `control.estudos.novo`) e "⋯ Mais ações: criar" com Nova combinação de carteiras (`control.estudos.nova-combinacao`), Importar estudo (`control.estudos.importar`), Carregar estudo demonstrativo (quando não instalado), Carregar empresas sintéticas (só e2e), Lixeira de estudos/Voltar aos estudos.
- Cada estudo: nome abre (`aria-label="Abrir <nome>"` mantido); data; "⋯ Mais ações: <nome>" com Renomear/Duplicar/Exportar/Excluir (aria-labels antigos viram `ariaLabel` dos itens). Lixeira: "Restaurar" continua botão visível.
- `StudyList` passa a receber `showTrash`/`onShowTrashChange` (estado sobe para `StudiesPage`); textos de apoio das opções de criação saem; aviso de armazenamento vira uma linha curta no fim.
- Menu lateral: Estudos, Empresas, Importar (+ "Apresentar" contextual já existente). Quadro e Diagnóstico saem do menu (rotas continuam).
- [ ] Testes primeiro (ações via menu, atalho "Comparar estudos", menu lateral com 3 destinos), implementar, ajustar testes antigos, commit.

### Task 3: Editor de estudo — cabeçalho, origem e premissas

**Files:** `web/src/study/components/StudyEditor.tsx`, `web/src/study/components/studyEditor.test.tsx`.

- Sem eyebrows "Passo N". Título + "⋯ Mais ações: estudo" (Renomear abre o formulário de nome existente; Duplicar). Status de salvamento continua.
- Origem: linha de resumo (já existe) compacta + "Trocar" (`control.carteira.trocar-origem`).
- Premissas: linha com os valores em uso (IOF OUT/IN, Carry, PTAX, janela) + botão "Editar premissas". Sem selo "padrão/alteradas": o estudo não guarda uma referência de padrão, e o resumo já mostra o valor ativo. O formulário atual (`ScenarioSettings`) abre embaixo; janela, aquecimento/medição/horizonte dentro de `Disclosure` "Avançado". Hints viram `placeholder`/`title`.
- [ ] Testes: premissas fechadas por padrão; resumo mostra os valores; Editar abre e Salvar chama `onScenarioChange` como antes; Avançado contém janela. Ajustar testes que preenchiam campos direto (abrir antes). Commit.

### Task 4: Alavancas com a Composição primeiro e cenários com "⋯"

**Files:** `web/src/levers/LeverBuilder.tsx`, `web/src/pages/StudyPortfolioPage.tsx`, testes `web/src/levers/*.test.tsx`, `web/src/pages/*Portfolio*.test.tsx`.

- `LeverBuilder` (estudo comum): bloco "Composição" primeiro (chips + "Fazer composição (N combinações)", explicação em `HelpTip`); o resto (empresa, tirar empresa, volume, datas, espaçamento, prazo, ordens, Criar variação) dentro de `Disclosure` "Ajustar uma empresa". Sem várias empresas: só o `Disclosure`.
- `LeverBuilder` em `applyToBase` (combinação): tudo dentro de `Disclosure` "Ajustar uma empresa".
- `StudyPortfolioPage`: ordem Editor → Alavancas → Cenários. Cenário: selo "rodado"/"pendente", nome, "Abrir diagnóstico"/"Executar diagnóstico" (`control.carteira.diagnostico`), "⋯" com Usar como base (não-base atual), Renomear, Apagar (não original). Rádio sai; cabeçalho mostra "base: <nome>". Combinação: "Diagnosticar combinações" fica como bloco final curto, sem "Passo".
- [ ] Testes primeiro, implementar, ajustar testes de alavancas/cenários, commit.

### Task 5: Escolha de empresas da combinação

**Files:** `web/src/study/components/PortfolioSourceSelector.tsx` (`CaseCombiner`), `web/src/study/components/StudyEditor.tsx`, testes correspondentes.

- `CaseCombiner`: busca ("Buscar empresa"), "Selecionar todas", escolhidas como chips removíveis, resultados só com texto na busca; botão "Usar N casos juntos" mantido.
- Combinação já aplicada (`sourceCases` presentes): linha "Empresas: N empresas · nomes" + "Trocar", que abre o `CaseCombiner`.
- [ ] Testes, implementar, commit.

### Task 6: Diagnóstico — resposta primeiro

**Files:** `web/src/diagnostics/components/DiagnosticEngineResult.tsx`, `web/src/ui/ComparisonSummary.tsx`, `web/src/ui/CostTable.tsx`, `web/src/diagnostics/components/DiagnosticControls.tsx`, `web/src/levers/VariationComparison.tsx`, `web/src/pages/StudyDiagnosticPage.tsx`, testes de cada um.

- `ComparisonSummary`: título "Resultado do motor" mantido; destaque com Economia no período (`data-testid="economia-brl"`), Netabilidade (`data-testid="netabilidade"`) com barra e Custo sem → com pool; volume bruto/compensado/remetido numa linha menor. "Composição do fluxo" dentro de `Disclosure` "Como a economia se forma".
- `CostTable`: dentro de `Disclosure` "Custos por componente" (título "Decomposição de custos" mantido dentro).
- `SavingsDistributionSummary`: P50 como número; P10–P90 numa frase; repetição selecionada e ressalva em `HelpTip`.
- `DiagnosticControls`: barra compacta (sem "Configuração"); repetições só quando gerado.
- `VariationComparison`: tabela principal (cenário, netabilidade, economia, Δ); "Economia por empresa" e "De onde vem a economia" dentro de `Disclosure` "Detalhes por empresa". Textos longos → `HelpTip`.
- `StudyDiagnosticPage`: introdução curta; Replay e Apresentar lado a lado; nota de IOF padrão em `HelpTip`. Recomendação de carteira (combinação) intocada.
- [ ] Testes primeiro, implementar, ajustar testes que liam regiões recolhidas (abrir antes), commit.

### Task 7: Quadro comparativo agrupado

**Files:** `web/src/pages/ComparisonBoardPage.tsx`, `web/src/pages/ComparisonBoardPage.test.tsx` (ou equivalente).

- Candidatos agrupados por estudo: checkbox do estudo (marca/desmarca todos, `indeterminate` parcial), contador "N de M", `Disclosure` com os cenários. Busca mantida. "Marcar todos"/"Limpar quadro" mantidos.
- "Apagar estudo" removido do quadro (lista e tabela); catálogo de ajuda sem `control.quadro.apagar-estudo`.
- [ ] Testes, implementar, commit.

### Task 8: Importar em dois passos

**Files:** `web/src/importer/components/UploadStep.tsx`, `web/src/importer/components/UploadStep.test.tsx`, e2e de importação.

- "Baixar modelo (.xlsx)" no topo (`control.importacao.modelo`). Passo 1 · Empresa: select + "+ Nova empresa" (troca pelo formulário de nome; `Usar nova empresa neste Caso` mantido). Passo 2 · Planilha: input de arquivo, confirmação "Confirmo que cada linha é uma operação real do cliente" (mesma semântica), "Como montar a planilha" em `Disclosure`, "Ler planilha".
- [ ] Testes, implementar, ajustar e2e por rótulo, commit.

### Task 9: Integração final

- Catálogo de ajuda do chat atualizado; `python -m pytest tests/web_api/test_product_help.py -q`.
- E2E afetados atualizados; `npm run test:e2e` local (Windows) com as referências `win32` revisadas; referências `linux` regeneradas em contêiner Playwright (Docker) ou sinalizadas para o fluxo de deploy.
- `npx vitest run`, `npm run lint`, `npx tsc -b --pretty false`, `npm run build`, `python -m pytest -q`.
- Contagem de controles à vista por tela (script do prompt anterior) antes/depois.
- Diário + PR para `main`. Merge e deploy pelo Codex, com autorização do Gabriel.
