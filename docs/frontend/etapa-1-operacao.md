# Etapa 1 — registro de execução

## Estado

T0 está **Em andamento** após aprovação explícita do plano e autorização para cadastrar suas tarefas no Linear, no workspace **Felipe Bisca**, time **MOTOR DE FLUXO**. As oito tarefas foram cadastradas como MOT-15–MOT-22, com as dependências nativas do plano. Gabriel escolheu aguardar a base integrada após o fechamento funcional; por isso a execução está parada no gate do SHA integrado. Não houve implementação de código, instalação de dependências, criação de worktree, commit, push ou merge.

Fonte de execução: [plano técnico aprovado](../superpowers/plans/2026-09-11-frontend-etapa-1-plano-tecnico.md). As três referências indicadas no plano continuam obrigatórias.

## T0 — verificações concluídas

- [x] Aprovação do plano e autorização de cadastro recebidas na conversa.
- [x] Checkout local identificado: `analise/sensibilidade-custo`, SHA `19f2a7f43778acaefcf9b24ececc6d3d3773d7db`.
- [x] Confirmado que este é o checkout principal (`git-dir` e `git-common-dir` iguais a `.git`), não um worktree isolado.
- [x] Diretório `.worktrees` já ignorado pelo Git.
- [x] Remote confirmado: `https://github.com/altoe2025/MOTOR-DE-FLUXO.git`.
- [x] Referências locais `main` e `origin/main`: `c4659852dca252bab66ffc52936371e937e0b625`. Este registro não equivale a um fetch atualizado da referência remota.
- [x] Fechamento funcional identificado no worktree existente: branch `implementacao/fechamento-funcional-motor`, SHA `3bc2839fab7268594d8825f1a27a5babaad9413d`.
- [x] Consulta real de PRs abertos no GitHub confirmou a pilha abaixo; nenhum PR aberto da branch de fechamento foi retornado.
- [x] Linear autenticado; workspace **Felipe Bisca** e time **MOTOR DE FLUXO** confirmados.
- [x] Busca inicial não encontrou tarefas da etapa 1; T0–T7 foram cadastradas como MOT-15–MOT-22.
- [x] Dependências nativas configuradas conforme o grafo do plano.
- [x] Gabriel escolheu aguardar a base integrada após o fechamento funcional. A decisão foi registrada em MOT-15 em 2026-09-12.

| PR | Branch | Base |
|---|---|---|
| [#21](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/21) | `gabriel/metrica-tempo` | `main` |
| [#22](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/22) | `gabriel/varredura-completa` | `gabriel/metrica-tempo` |
| [#23](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/23) | `gabriel/mix-outbound` | `gabriel/varredura-completa` |
| [#17](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/17) | `docs/auditoria-2026-09-06` | `main`; assunto separado |

## T0 — ações pendentes

- [ ] Confirmar que o fechamento funcional foi integrado e registrar o SHA exato da nova base. Esta tarefa não autoriza realizar os merges do fechamento.
- [ ] Confirmar nessa base os exports exigidos pela seção 5.1 do plano.
- [ ] Criar worktree próprio da primeira entrega, a partir do SHA integrado, pelo fluxo `using-git-worktrees`; compartilhar documentação por commit/branch, sem copiar alterações do worktree concorrente.
- [ ] Executar o baseline integral nesse worktree. A execução anterior de 270 testes pertence ao checkout de planejamento e excluiu um teste não rastreado; não substitui esta validação.
- [ ] Registrar responsável humano pelo provisionamento Supabase. Sua ausência não impede T1–T4 depois dos demais pré-requisitos, mas impede aceitar o login real na T5/T7.

## Cadastro no Linear

| Tarefa do plano | Issue | Situação |
|---|---|---|
| T0 | [MOT-15 — Confirmar base Git e pré-requisitos](https://linear.app/felipe-bisca/issue/MOT-15/etapa-1-t0-confirmar-base-git-e-pre-requisitos) | Em andamento; aguardando base integrada |
| T1 | [MOT-16 — Contratos, identidade e apresentação](https://linear.app/felipe-bisca/issue/MOT-16/etapa-1-t1-contratos-identidade-e-apresentacao) | Backlog; bloqueada por MOT-15 |
| T2 | [MOT-17 — Adaptador único e validação de publicação](https://linear.app/felipe-bisca/issue/MOT-17/etapa-1-t2-adaptador-unico-e-validacao-de-publicacao) | Backlog; bloqueada por MOT-16 |
| T3 | [MOT-18 — FastAPI, autenticação e mesma origem](https://linear.app/felipe-bisca/issue/MOT-18/etapa-1-t3-fastapi-autenticacao-e-mesma-origem) | Backlog; bloqueada por MOT-17 |
| T4 | [MOT-19 — Shell e componentes acessíveis](https://linear.app/felipe-bisca/issue/MOT-19/etapa-1-t4-shell-e-componentes-acessiveis) | Backlog; bloqueada por MOT-16 |
| T5 | [MOT-20 — Login, convite e recuperação de rascunho](https://linear.app/felipe-bisca/issue/MOT-20/etapa-1-t5-login-convite-e-recuperacao-de-rascunho) | Backlog; bloqueada por MOT-18 e MOT-19 |
| T6 | [MOT-21 — Cliente tipado e integração navegador–motor](https://linear.app/felipe-bisca/issue/MOT-21/etapa-1-t6-cliente-tipado-e-integracao-navegador-motor) | Backlog; bloqueada por MOT-20 |
| T7 | [MOT-22 — Aceitação, CI e passagem para etapa 2](https://linear.app/felipe-bisca/issue/MOT-22/etapa-1-t7-aceitacao-ci-e-passagem-para-etapa-2) | Backlog; bloqueada por MOT-21 |

Dependências nativas verificadas: T1 depende de T0; T2 de T1; T3 de T2; T4 de T1; T5 de T3 e T4; T6 de T5; T7 de T6. Não atribuir a pessoas com base nos nomes dos modelos; a distribuição Astra/Sol/Terra é orientação de execução, não identidade de membro do Linear.

## Arquivos preexistentes preservados

Permanecem intactos os não rastreados `docs/superpowers/plans/2026-09-11-frontend-motor-de-fluxo-design.md`, `motor/cenarios/fluxo_gabriel.yaml` e `tests/test_exportar_player.py`. O trabalho do outro worktree não foi alterado. O plano, este registro e a entrada correspondente do Diário serão compartilhados por commit antes da criação da base integrada.
