# T8 / MOT-30 — editor de estudos

## Entrega original

- Lista de estudos com abertura, restauração e exclusão para lixeira confirmando o alvo.
- Rotas de estudos, editor com nome, duplicação, status de autosave, erro de storage e conflito entre abas.
- Seletor acessível das origens sintética, manual e observada.
- O controlador expõe consultas e ações de repositório ligadas à sessão; componentes não acessam IndexedDB.

## Fix round — fluxos completos do editor

Os cinco findings Important foram confirmados: a primeira entrega renderizava uma descrição de autoria e sintético, mas não resolvia nem persistia trocas de origem; observado não apresentava o snapshot completo; a lista não criava, renomeava ou duplicava; e o teste de “zoom” no jsdom não media layout.

Correções:

1. Trocas de origem agora produzem `PortfolioSourceSnapshot` exclusivamente por `resolvePortfolioSource` (T7), atualizam o cenário por `updateScenario` e entregam o documento ao `StudyController` (T6) para autosave. Autoria local suja exige confirmação antes de ser descartada.
2. Autoria manual ganhou grupos e participantes, herança e overrides, frequência, ticket, direção, prazo, finalidade e perfil. Decimais permanecem texto e são validados localmente com `decimal.js`; somente a resposta da preparação oficial vira snapshot.
3. O catálogo expõe cinco exemplos sintéticos: mix equilibrado, remessas outbound, PSP inbound, exportadores e tesourarias corporativas. Todos chamam a preparação oficial; o navegador não fabrica ordens.
4. A origem observada lista somente `CONFIRMED`, mostra empresa, janela, quantidade de ordens, total BRL, qualidade, proveniência e revisão. A aplicação deriva snapshot imutável pelo resolver; alterações exigem a ação explícita “Converter para autoria manual”.
5. A lista preserva abrir/lixeira/restaurar e acrescenta Novo estudo, renomear e duplicar. Novo estudo materializa uma origem sintética válida pela preparação oficial antes de persistir e navegar.
6. O layout agora usa wrapping, grids `auto-fit`, `minmax(min(100%, …))`, larguras máximas e breakpoints de 760/480 px para reflow de formulários, resumos, lista e ações.

## Zoom e evidência responsiva

A alegação anterior de “zoom 200%” foi removida: jsdom não executa layout e um `toBeVisible()` não constitui evidência de reflow. Nesta rodada, o contrato verificável é o CSS responsivo e a ausência de dependência em largura fixa nos novos componentes. A prova visual real em navegador a 200%, incluindo ausência de scroll horizontal em viewport de desktop equivalente, continua sendo gate de acessibilidade/browser da T11; não foi falsamente marcada como aprovada aqui.

Limite de integração real: o contrato T7 exige `expected_build_sha`, mas a API atual não oferece esse SHA em endpoint de bootstrap. Estudos sintéticos já persistidos reutilizam o SHA da própria receita. Para estudo novo ou origem sem receita sintética, a implantação deve fornecer `VITE_MOTOR_BUILD_SHA`; o fallback de 40 zeros preserva o ambiente local de referência, mas uma implantação cujo backend use outro SHA rejeitará a preparação até essa variável ser configurada. O contrato T1–T7 não foi alterado para esconder essa lacuna.

## Evidência TDD

- RED: 6 dos 7 testes novos falharam contra a entrega original por ausência dos formulários, catálogo, resumo observado e ações da lista.
- GREEN intermediário: os testes focados de editor/router passaram com 20 testes.
- A regressão de zoom enganosa foi removida; nenhum teste jsdom afirma medir layout.

## Gates finais

- `npm --prefix web run test:unit -- src/study/components/studyEditor.test.tsx src/app/router.test.tsx` — PASS, 2 arquivos e 20 testes.
- `npm --prefix web run typecheck` — PASS.
- `npm --prefix web run lint` — PASS.
- `npm --prefix web run build` — PASS, 246 módulos; permanece apenas o aviso preexistente de chunk acima de 500 kB.
- `git diff --check` — PASS; somente avisos informativos de normalização LF/CRLF no Windows.

Nenhuma suíte web global ou Python foi executada. Nenhum push, PR, merge ou alteração no Linear foi realizado.
