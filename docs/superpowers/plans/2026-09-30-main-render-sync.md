# Integração da versão Live na main

## Goal
Integrar na main a versão Live `29d955c38ee265d013119c02bde9d3f5efd6f488`, conforme autorização explícita de Gabriel em 2026-09-30.

## Architecture
Preservar o código publicado, integrar seu histórico por PR e verificar ancestralidade e paridade dos arquivos de produção. Render permanece no deploy atual.

## Tech Stack
Git/GitHub, Render Docker, Python/pytest, React/TypeScript/Vitest/Playwright.

## Spec
Referência Live conferida no dashboard; main inicial `3342059edddf1daaa881943a645a26dadd614139`, 52 commits atrás e nenhum exclusivo. Não incorporar branches posteriores ou alheias ao Live.

## Global Constraints
- Preservar comportamento publicado, exceto as correções explicitamente autorizadas durante o gate: abertura com IndexedDB indisponível, edição da janela, teto diagnóstico da coorte com aquecimento e prontidão do contexto do chat. Não alterar motor, credenciais ou configurações do Render.
- Preservar o checkout original e o commit Live; trabalhar em `codex/main-render-sync`.
- Ajustes de testes precisam refletir o comportamento já publicado, sem esconder falhas.
- Respeitar checks e proteção da main; não usar force push ou bypass.
- Registrar riscos e evidências; não declarar testes não executados como aprovados.

## Tasks
- [x] Conferir referência Live, estado remoto e divergência.
- [x] Auditar escopo e registrar inventário funcional e riscos.
- [x] Investigar testes incompatíveis com o Live e corrigir os defeitos autorizados.
- [x] Atualizar diário e mapa; publicar PR para main e revisar.
- [ ] Aguardar checks, integrar e verificar ancestralidade/paridade final.

## Evidência inicial
Render: `motor-de-fluxo-piloto`, deploy `dep-dauml9942hec73f2cpf0`, Live `29d955c`, branch configurada main, Auto-Deploy Off. Nenhuma ação de deploy nesta tarefa.

## Verificação e bloqueio (2026-09-30)
- PR #59 draft: https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/59.
- Front unitário: 144 arquivos / 1.236 testes aprovados após os ajustes de setup e sessão; typecheck e lint aprovados nesse candidato.
- CI 36779719966: 1.264 testes Python aprovados / 1 skip em modo normal e otimizado. Ruff apontou somente o alias `re.M` no teste de catálogo, corrigido para `re.MULTILINE`.
- E2E local confirmou expectativas de páginas retiradas (Premissas, Destaques do Replay, navegação antiga). Adaptações parciais permanecem locais, ainda sem validação; não foram publicadas como aprovadas.
- **Bloqueio real de runtime:** o teste `stage6-acceptance.spec.ts`, cenário "IndexedDB indisponível", permanece em "Preparando dados locais…". `providers.tsx:100` aguarda `switchSession` sem tratar rejeição; o reset em `studyController.ts:219` pode rejeitar. Não é apenas seletor desatualizado.
- Preservar exatamente o runtime Live e corrigir essa falha são objetivos incompatíveis. Nenhuma correção de produção, bypass da proteção, merge ou deploy foi feito. É necessária decisão do usuário sobre a correção mínima antes de prosseguir.

## Retomada autorizada
Gabriel autorizou corrigir a falha de armazenamento, concluir os testes e integrar a main, sem deploy. A correção captura a rejeição da inicialização, bloqueia os filhos, apresenta erro recuperável e recria a sessão no retry. Rejeições de conta anterior não alteram a conta atual. Teste RED reproduziu o carregamento infinito e a rejeição não tratada; GREEN: 7 testes de providers aprovados, incluindo IndexedDB real simulado, retry, reset pendente e A→B com rejeição tardia de A. Revisão independente não identificou bloqueador no diff runtime.

Testes migrados já validados: foundation + stage2 (4), importação/diagnostic-jobs/study-observed/study-synthetic (12). A migração troca fluxos PREVIEW retirados por DIAGNOSTIC publicado, preservando conservação, proveniência, persistência e isolamento. Relatórios completos de apresentação foram substituídos no Live por resumo/composição/variações; os testes passam a conferir esse conteúdo, mantendo evidência e seleção no documento do chat.

## Evidências da retomada e pendências adicionais
- Stage4/5: 6 testes aprovados; teste de duplicação/janela continua ativo e falha por defeito real de evento React em `StudyEditor.tsx`: acesso a `event.currentTarget.value` dentro de updater tardio, quando currentTarget já é null. Correção adicional solicitada ao usuário; não implementada.
- Stage6 acceptance/accessibility/visual Windows: 10 aprovados na rodada inicial; o único restante (cinco mixes) passou após verificar os participantes da execução selecionada em vez de exigir 12 em todas as repetições. Desempenho: 2 aprovados, incluindo 20 amostras e orçamento de 350 KiB.
- Demo/presentation: 5 de 7 aprovados. Os dois restantes reproduzem erro em `servidor/diagnostics/analysis.py:281`: para janela8/seed de amostragem111, a coorte medida casa com estoque anterior (warmup30); casado 1.616.124,65 excede o teto 1.582.063,64 calculado somente com OUT/IN da coorte. Diferença 34.061,01, não erro decimal. A fórmula de pool fechada não limita essa coorte aberta. Não removido o invariante, não alteradas seeds para mascarar o erro, não alteradas regras do motor. Investigação/correção adicional solicitada ao usuário.
- Fixture `helpers/windowScenario.ts` prepara uma janela pelo domínio real para testar publicação/comparação; não substitui aceite de criação pela UI. O teste de UI que detecta o crash continua presente.
- Captura Linux 36782323685 aprovada; 7 imagens inspecionadas, 6 divergiam das referências antigas e foram copiadas com hash conferido. Login permaneceu idêntico. Workflow temporário removido. Essa captura atualiza referências revisadas, não equivale à execução final da CI comparando-as.
- Suíte completa do front após correção: 144 arquivos / 1.239 testes aprovados (192s); validadores atuais. Typecheck e lint aprovados após migração. Revisão independente dos testes não encontrou falsa aprovação material. Main e Render ainda não alterados; PR permanece draft até correção das falhas reais e gates completos.

## Correções finais autorizadas
- A edição de `Janela em dias` capturava `event.currentTarget.value` dentro de um updater de estado; o evento já podia estar inválido. O valor agora é capturado antes do updater. A regressão falhou antes e passou depois; 22 testes do editor e 7 E2E das Etapas 4/5 passaram.
- O teto estrutural da coorte medida usava `2 * min(OUT medido, IN medido)`, embora ordens medidas possam casar com estoque do aquecimento. O teto agora é `min(OUT medido, IN total) + min(IN medido, OUT total)`. O numerador continua restrito à coorte, a checagem `casado <= teto` foi preservada e a fórmula reduz à anterior numa coorte fechada. A consequência de direção oposta ausente passou a depender de teto zero, sob a regra `1.1.0`; contratos `1.0.0` continuam aceitos.
- O pacote demonstrativo versionado foi regenerado, porque os valores derivados do teto mudaram. As baselines Windows divergiram somente em teto, potencial não capturado e fração capturada; os pixels foram inspecionados e as duas imagens afetadas foram atualizadas. A captura Linux final `36787589692` confirmou as mesmas duas divergências; ambas foram inspecionadas e atualizadas, enquanto as outras cinco imagens permaneceram idênticas por hash. O workflow temporário foi removido antes do gate final.
- O gate integral revelou uma corrida adicional no chat do Replay: o formulário permitia envio durante os 75 ms de debounce e a construção assíncrona do documento, produzindo `context: null`. Rotas com estudo, cenário e execução selecionados agora só habilitam envio quando o contexto `STUDY` correspondente à seleção está pronto; `send` repete o guard defensivamente. Quatro regressões falharam antes e passaram depois; 17/17 E2E de chat passaram sem sleeps.

## Gate local do candidato final
- Python normal: 1.270 passed / 3 skipped; Python com `-O`: 1.270 passed / 3 skipped.
- Ruff, mypy, contratos/validadores, scanner de credenciais, typecheck, lint e build de produção: PASS. O aviso conhecido de chunks Vite acima de 500 kB permanece.
- Front unitário antes do último guard do chat: 144 arquivos / 1.240 testes; mais 32 testes focados do chat após o guard, incluindo quatro regressões novas.
- Playwright integral: 63/66 na primeira rodada final; as três falhas eram a corrida do chat e duas referências visuais com os valores derivados antigos. Após as correções, 17/17 do chat e 2/2 visuais Windows passaram. A revisão visual Linux final passou; resta somente o check integral publicado do commit sem o workflow temporário.
