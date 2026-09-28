# Cobertura de interface no chat — 2026-09-28

Tarefa 1 do plano `docs/superpowers/plans/2026-09-28-chat-interface.md`, no worktree
`chat-context-quality`. O catálogo passou de 18 para **200 itens**: os 18 IDs
anteriores foram preservados e 182 IDs de telas, controles e campos foram
acrescentados. Não houve commit, push, publicação ou alteração do motor.

## Arquivos e contrato

- `servidor/catalogs/product_help.v1.json`: regras gerais de propósito, efeitos,
  limites, condições de desabilitação e recuperação, baseadas nos handlers.
- `web/src/help/helpIds.ts`: união frontend dos mesmos 200 IDs, sem ID novo fora
  do catálogo publicado.
- `tests/web_api/test_product_help.py`: consultas pela implementação real de
  `ReadOnlyTools` sem documento financeiro, referências HELP válidas, cobertura
  da união frontend pelo endpoint e condições de controles representativos.
- Este relatório: origem verificável e limites da cobertura.

O schema público foi preservado. Campos usam `elementKind: CONTROL`, já previsto
no contrato, e o catálogo está no limite existente de 200 itens. A versão continua
sendo o SHA-256 calculado pelo loader, sem versão fornecida no arquivo.

Labels estáticas reproduzem o frontend, incluindo nomes acessíveis de botões de
ícone. Labels variáveis são explicitamente modeladas com `{N}`, `{id}`,
`{empresa}` ou `{grupo}`; são famílias de controles, não cópias dos valores atuais.
O catálogo não contém arquivos, valores de formulário ou dados de uma carteira.

## Origem verificável

Os caminhos abaixo são relativos à raiz deste worktree. Cada família aponta para
o componente que publica a label e para o handler que determina seu efeito.

| Família de IDs | Labels e comportamento cobertos | Origem no frontend |
|---|---|---|
| `page.importacao`, `control.importacao.*`, `field.importacao.*` | Empresa, nova Empresa provisória, XLSX, operações explícitas, leitura/cancelamento, filtro, correção, exclusão/restauração, alias, conflitos e confirmação | `importer/components/UploadStep.tsx`, `ReviewStep.tsx`, `CaseConfirmation.tsx`; `ImportFlowPage.tsx` (`busy`, `onCommand`, `onCreateCompany`, `onRead`, `flow.confirm`) |
| `page.empresas`, `control.empresa.excluir` | Lista de Empresas e exclusão confirmada de Empresa/Casos/Perfis; Estudos já copiados continuam | `companies/CompaniesPage.tsx` (`load`, `remove`) |
| `field.casos.*` | Início, Fim, Tipo de fonte, Qualidade | `companies/CompanyCasesPage.tsx` (`update`, `filterObservedCases`) |
| `field.perfis.*`, `control.perfis.*` | Casos da nova versão, destino de evidência, confirmação de versão e anexação | `profiles/components/ProfileBuilder.tsx` (`compatibility`, `preview`, `onConfirm`), `ProfileVersionList.tsx`; `companies/CompanyProfilesPage.tsx` (`onConfirm`, `onAttach`) |
| `page.estudos`, `control.estudos.*` | Novo estudo, demonstração, renomear, duplicar, lixeira, excluir e restaurar | `study/components/StudyList.tsx`; `pages/StudiesPage.tsx` (`initialStudy`, `restoreDemo`, `editExisting`, `remove`) |
| `page.carteira-rascunho`, `field.carteira.rascunho-nome`, `control.carteira.referencia` | Rascunho local /carteira e prévia sintética de referência | `pages/PortfolioPage.tsx` (`changeName`, `recovery.save`, `preview.executeReference`) |
| `page.carteira`, `field.carteira.*`, `control.carteira.*` | Editor salvo /carteira/:id; nome, origem, Caso, receita sintética, autoria, premissas/período, prévia, navegação diagnóstica, comparação e apagar hipótese | `study/components/StudyEditor.tsx` (`ScenarioSettings`, `submit`); `PortfolioSourceSelector.tsx` (`selectKind`, `request`, `onConvertObserved`); `pages/StudyPortfolioPage.tsx` (`applySource`, `execute`, `deleteScenario`, `navigateAfterFlush`) |
| `field.autoria.*`, `field.operacoes.*` | Nome/grupo, parâmetros de grupo/participante, sobrescrita e oito campos da cópia de operações explícitas | `study/components/PortfolioSourceSelector.tsx` (`ParameterFields`, `AuthoredForm`, `ExplicitOrdersForm`) |
| `control.alavancas.*`, `field.alavancas.*` | Empresa, retirada inteira ou de ordens, volumes IN/OUT, deslocamento, espaçamento, prazo, combinações e Criar variação | `levers/LeverBuilder.tsx` (`levers`, `create`, `createCombinations`); `applyLevers.ts` (remoção → volume → espaçamento → deslocamento → prazo); `leverScenario.ts`; `pages/StudyPortfolioPage.tsx` (`createLeverVariation`, `createCombinations`) |
| `control.hipotese.criar`, `field.hipotese.*` | Rascunho e criação de hipótese, campos escalares do construtor legado | `hypotheses/components/HypothesisBuilder.tsx` (`HypothesisBuilder`, `LegacyHypothesisBuilder`, `submit`); `pages/StudyPortfolioPage.tsx` (`createHypothesis`) |
| `control.composicao.*`, `field.composicao.*` | Acesso ao editor de composição, volume/ticket/fração/arquétipo/finalidades/eFX por participante e regras de IOF | `hypotheses/components/PortfolioCompositionSummary.tsx` (`canEditComposition`, `onEdit`); `CompositionHypothesisBuilder.tsx` (`updateParticipant`, `setCosts`, `submit`) |
| `field.simulacao-perfil.*`, `control.simulacao-perfil.preparar` | Identidade, perfil do gerador, seed, finalidades explícitas e eFX para preparar simulação por Perfil | `hypotheses/components/ProfileScenarioBuilder.tsx` (`update`, `submit`, `deriveProfileMvpSelection`) |
| `field.diagnostico.repeticoes`, `control.diagnostico.*` | Repetições, executar, Rodar todas, cancelar, repetir tentativa, Replay e apresentação | `diagnostics/components/DiagnosticControls.tsx`; `DiagnosticStatus.tsx`; `pages/StudyDiagnosticPage.tsx` (`generated`, `effectiveCount`, `run`, `runAll`, `cancel`, `retry`); `levers/VariationComparison.tsx` (`pending`, `currentDiagnostic`) |
| `field.comparacao.*`, `control.comparacao.*` | Execução base, execução da hipótese, Comparar e Apresentar comparação | `pages/StudyComparisonPage.tsx` (`candidates`, `base`, `hypotheses`, `compare`, `compareMvpDiagnostics`) |
| `field.quadro.*`, `control.quadro.*` | Filtro, marcar todos/filtrados, limpar, remover, ordenar e nomes locais de grupos | `pages/ComparisonBoardPage.tsx` (`candidates`, `board`, `updateSelection`, `selectedForChat`, `rename`) |
| `field.replay.dia`, `control.replay.*` | Tocar, pausar, recomeçar, 1×/2×/4×, anterior/seguinte, fechamento, repetir evento, Chegada/EDF e retorno | `replay/components/ReplayControls.tsx`; `replay/useReplayPlayback.ts` (`pauseAndMove`, `togglePlaying`, `repeat`); `replay/ReplayPage.tsx` |
| `control.apresentacao.*`, `page.relatorio` | Salvar PDF e repetir carregamento da apresentação | `presentation/PrintActions.tsx` (`window.print`), `PresentationPage.tsx`, `PresentationRoute.tsx` (`retry`); rotas em `app/router.tsx` |
| `control.chat.*`, `field.chat.pergunta` | Perguntar, fechar, conversas, nova conversa, exclusão/confirmar/cancelar, pergunta, enviar/cancelar | `chat/components/ChatPanel.tsx` (`idle`, `close`), `ChatComposer.tsx` (`send`, `onKeyDown`); `chat/ChatProvider.tsx` (`canSend`, `messageLimitReached`, `cancel`); `chat/chatService.ts` |

## Regras concretas e distinções verificadas

- **Ler planilha** depende de arquivo, Empresa, confirmação de operações explícitas
  e ausência de leitura em andamento. A finalidade opcional e a disponibilidade do
  catálogo de finalidade não são gates de confirmação do Caso.
- **Confirmar Caso Observado** requer `READY_TO_CONFIRM`. A nova Empresa da etapa
  de upload é provisória; sua publicação ocorre junto do Caso. Perfil e Estudo
  continuam sendo etapas manuais separadas.
- **Executar diagnóstico** no editor da carteira salva e navega. O botão com o
  mesmo texto na tela de diagnóstico inicia a tentativa. IDs diferentes preservam
  essa diferença.
- **Rodar todas** processa apenas cenários sem diagnóstico atual e fica
  desabilitado se há execução ou nenhum pendente. O controle só aparece quando o
  Estudo possui pelo menos dois cenários. A sequência preserva os já concluídos.
- **Criar variação** cria cenário novo no mesmo Estudo e deixa a base intacta.
  O formulário exige ordens explícitas e algum grupo; receita sintética exibe
  explicação de indisponibilidade. Combinações aparecem a partir de duas Empresas
  e são geráveis até oito. Validação de alavancas ocorre no handler, não na
  condição `disabled` do botão.
- **Comparar** depende de escolhas não vazias e diferentes. Compatibilidade é
  avaliada depois do clique; não foi inventado bloqueio prévio de compatibilidade.
- **Recomeçar** volta para D0 e fica pausado; Tocar retoma reprodução.
  Chegada/EDF apenas ordena os cartões da visualização.
- **Salvar PDF** abre impressão do mesmo DOM da apresentação. O ID antigo
  `page.relatorio` foi mantido, mas sua rota agora é `/estudos/:studyId/apresentacao`:
  `app/router.tsx` não publica `/relatorio`.
- **Enviar** exige pergunta, conversa ativa, cliente, catálogo e histórico
  disponível, além de não estar gerindo conversa/limite de mensagens. `canSend`
  não testa quota diretamente. Cancelar envio pode deixar resposta com estado de
  falha no histórico, permitindo repetir; não desfaz mudanças no produto.

## TDD e verificação

Ambiente Python existente:
`C:/Users/gabriel Altoe/.codex/worktrees/frontend-etapa-6-integracao/motor-de-fluxo/.venv/Scripts/python.exe`.
Os comandos foram executados com diretório de trabalho neste worktree, usando
aprovação de sandbox para o runtime/arquivos temporários necessários.

1. RED inicial: `python -m pytest tests/web_api/test_product_help.py -q`:
   **14 falhas, 9 passes**. As consultas de novos controles retornavam
   `available: false`, os IDs faltavam na união frontend e a consulta das regras
   de bloqueio não encontrava o item. Os testes antigos passavam.
2. GREEN inicial: após catálogo/IDs, testes de catálogo + ferramentas:
   **58 passes**; catálogo frontend: **7 passes**.
3. RED adicional, antes de adicionar referência e acesso à composição:
   **3 falhas, 22 passes** no arquivo de catálogo. Dois controles continuavam
   indisponíveis e ausentes na união frontend.
4. GREEN final: `python -m pytest tests/web_api/test_product_help.py
   tests/web_api/test_chat_tools.py -q`: **60 passes**, com dois avisos de
   depreciação das dependências Starlette/httpx/AnyIO.
5. `npm run test:unit -- src/help/catalog.test.ts src/chat/uiContext.test.ts`:
   **11 passes em 2 arquivos**. Uma tentativa inicial sem aprovação de sandbox
   falhou antes de iniciar Vitest por `EPERM` ao criar `.vite-temp`; a repetição
   autorizada executou normalmente.

As 14 consultas parametrizadas passam pela classe real `ReadOnlyTools`, com
`ChatRequestV1` sem documento financeiro. Elas conferem label, rota, tipo de
controle, citação HELP e sua validação como fonte efetivamente servida. A
comparação da união frontend com o endpoint real detecta tanto IDs órfãos quanto
itens publicados sem ID frontend. Não há mock do catálogo ou da ferramenta.

## Limites

- Cobertura é das telas e controles/campos principais enumerados acima, não um
  inventário de cada instância de linha, link ou botão com identidade dinâmica.
  Navegação temporal de Empresa, identificadores técnicos e campos adicionais
  de composição continuam podendo exigir consulta por conceito/clarificação.
- Labels repetidas como Prazo, Nome do estudo e Criar hipótese, ou labels com
  identificadores variáveis, não autorizam inferir qual instância a pessoa quis
  dizer. A observação do estado atual pertence ao snapshot da tarefa 2; catálogo
  registra apenas regras gerais.
- Os campos escalares por Perfil em `LegacyHypothesisBuilder` são de componente
  legado. Na carteira atual com Perfis disponíveis, `HypothesisBuilder` usa
  `CompositionHypothesisBuilder`. Não se afirma que todo item seja renderizado
  simultaneamente ou esteja disponível em toda origem.
- `Regenerar documento` existe no componente de apresentação ausente, mas não é
  estado publicado pela rota atual e não recebeu ID novo neste catálogo.
- Campos de receita por Perfil exigem finalidades explícitas nesse fluxo. Isso
  não contradiz a importação XLSX, que aceita finalidade ausente; não se transporta
  o gate de um fluxo para o outro.
- Nenhuma causa específica de botão desabilitado pode ser deduzida somente do
  catálogo. Não houve chamada ao provider real nem aceite browser nesta tarefa;
  a verificação integrada de snapshot/resposta/build fica com as demais tarefas
  do plano. O catálogo não é prova da qualidade semântica universal do modelo.

## Correções da revisão integrada — contexto BOARD e apresentação

Escopo adicional autorizado na revisão: `web/src/chat/ChatProvider.tsx`,
`components/ChatHistory.tsx`, `ChatProvider.test.tsx`,
`components/ChatCitation.tsx` e `components/ChatCitation.test.ts`. As alterações
de captura limitada de controles/helpId do restante do plano foram preservadas.

**BOARD A → B na mesma URL.** O fingerprint vinha do último contexto enviado A,
e a compatibilidade BOARD só conferia a rota `/quadro`. Por isso, publicar B
mantinha a resposta como atual. O histórico também resolvia a citação com A, cuja
única URL `/quadro` não restaura aquela seleção. O provider agora usa o fingerprint
do BOARD publicado atual; o histórico usa esse contexto atual para referências
BOARD. `sentContext` continua disponível para referências STUDY com links que
restauram execuções explícitas. A resposta antiga permanece legível, mostra
“Contexto anterior” e sua referência BOARD vira texto indisponível, sem link
enganoso de restauração.

**Citações HELP da apresentação.** A whitelist de destinos não incluía a rota
implementada `/estudos/:studyId/apresentacao`. Além disso, o componente passava
somente `pathname`, perdendo a seleção da query. A rota agora é aceita, e o
destino preserva apenas `cenario`, `execucao`, `comparacao` e `dia`, com IDs/dia
validados, seleção obrigatória de cenário/execução e recusa de parâmetros
duplicados ou URL atual não local. A query extra não vai para o link. Em outra
tela, a apresentação só recebe link se o contexto já tiver cenário e execução
explícitos; a falta desses IDs continua sendo referência indisponível.

RED observado antes da correção: a regressão BOARD A → B falhou por ausência de
“Contexto anterior”, e a regressão de apresentação recebeu `href: null` para
seleção completa. Uma primeira tentativa do teste BOARD encontrou tanto a
resposta quanto seu anúncio acessível; o seletor foi restringido ao parágrafo
visível antes de confirmar o RED comportamental.

GREEN: `npm run test:unit -- src/chat/ChatProvider.test.tsx
src/chat/components/ChatCitation.test.ts
src/chat/components/ChatCitationHistory.test.tsx` → **22 passes em 3 arquivos**.
Inclui preservação de referências históricas de Estudo, troca de seleção BOARD,
destinos de PDF/apresentação/relatório, ausência de seleção e parâmetros
ambíguos/não locais. `npm run typecheck` também passou; `git diff --check`
dos arquivos desta correção não apontou erros. Sem commit, push ou provider real.
