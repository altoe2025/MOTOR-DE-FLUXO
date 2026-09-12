# Etapa 1 — registro de execução

## Estado

T0 e T1 estão **integradas na `main`**. As oito tarefas foram
cadastradas como MOT-15–MOT-22 no workspace **Felipe Bisca**, time
**MOTOR DE FLUXO**, com as dependências nativas do plano. A base integrada foi
publicada pelos PRs #21–#26 no commit `1aecc57`; a MOT-16 foi integrada pelo PR #27,
levando a `main` a `d2a261b`. A T1 acrescenta contratos, identidade,
apresentação, geração e locks; não executa o adaptador T2, autenticação/API funcional
T3 ou interface T4.

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
- [x] Worktree `.worktrees/frontend-etapa-1-contratos` criada na branch `codex/frontend-etapa-1-contratos`.
- [x] Linhas divergentes desde `2fc62a2` integradas por merge limpo: documentação em `da271ad` e fechamento em `3bc2839`.
- [x] Exports públicos confirmados: `analisar`, `criar_manifesto`, `ConfiguracaoAnalise`, `ConfiguracaoTemporal` e `resultado_para_json`.
- [x] Baseline em venv própria, Python 3.14.4: 504 testes normais e 504 sob `-O`; o único aviso sob `-O` é o aviso esperado do pytest sobre asserts.
- [x] Cenário Amanda reproduzido: baseline R$ 2.370.600, netado R$ 1.344.600, economia R$ 1.026.000 e netabilidade 58,82%.

| PR | Branch | Base |
|---|---|---|
| [#21](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/21) | `gabriel/metrica-tempo` | `main` |
| [#22](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/22) | `gabriel/varredura-completa` | `main` |
| [#23](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/23) | `gabriel/mix-outbound` | `main` |
| [#24](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/24) | `analise/sensibilidade-custo` | `main` |
| [#25](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/25) | `codex/frontend-base-docs` | `main` |
| [#26](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/26) | `codex/fechamento-funcional-integracao` | `main` |
| [#17](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/17) | `docs/auditoria-2026-09-06` | `main`; assunto separado |

## Base integrada e pendência externa

- [x] Criar a base integrada, confirmar os contratos públicos e executar o baseline integral em worktree isolada.
- [x] Revalidar Python 3.11 localmente: lock gerado, instalado, suíte normal e sob
  `-O` executadas com CPython 3.11.16. O CI repetirá essa evidência quando a branch
  for publicada.
- [ ] Registrar responsável humano pelo provisionamento Supabase. Sua ausência não impede T1–T4 depois dos demais pré-requisitos, mas impede aceitar o login real na T5/T7.

## Cadastro no Linear

| Tarefa do plano | Issue | Situação |
|---|---|---|
| T0 | [MOT-15 — Confirmar base Git e pré-requisitos](https://linear.app/felipe-bisca/issue/MOT-15/etapa-1-t0-confirmar-base-git-e-pre-requisitos) | Concluída; base integrada e baseline verificados |
| T1 | [MOT-16 — Contratos, identidade e apresentação](https://linear.app/felipe-bisca/issue/MOT-16/etapa-1-t1-contratos-identidade-e-apresentacao) | Integrada pelo PR #27; contratos e gates verificados em Python 3.11/Node 24 |
| T2 | [MOT-17 — Adaptador único e validação de publicação](https://linear.app/felipe-bisca/issue/MOT-17/etapa-1-t2-adaptador-unico-e-validacao-de-publicacao) | Backlog; liberada pela conclusão de MOT-16 |
| T3 | [MOT-18 — FastAPI, autenticação e mesma origem](https://linear.app/felipe-bisca/issue/MOT-18/etapa-1-t3-fastapi-autenticacao-e-mesma-origem) | Backlog; bloqueada por MOT-17 |
| T4 | [MOT-19 — Shell e componentes acessíveis](https://linear.app/felipe-bisca/issue/MOT-19/etapa-1-t4-shell-e-componentes-acessiveis) | Backlog; liberada pela conclusão de MOT-16 |
| T5 | [MOT-20 — Login, convite e recuperação de rascunho](https://linear.app/felipe-bisca/issue/MOT-20/etapa-1-t5-login-convite-e-recuperacao-de-rascunho) | Backlog; bloqueada por MOT-18 e MOT-19 |
| T6 | [MOT-21 — Cliente tipado e integração navegador–motor](https://linear.app/felipe-bisca/issue/MOT-21/etapa-1-t6-cliente-tipado-e-integracao-navegador-motor) | Backlog; bloqueada por MOT-20 |
| T7 | [MOT-22 — Aceitação, CI e passagem para etapa 2](https://linear.app/felipe-bisca/issue/MOT-22/etapa-1-t7-aceitacao-ci-e-passagem-para-etapa-2) | Backlog; bloqueada por MOT-21 |

Dependências nativas verificadas: T1 depende de T0; T2 de T1; T3 de T2; T4 de T1; T5 de T3 e T4; T6 de T5; T7 de T6. Não atribuir a pessoas com base nos nomes dos modelos; a distribuição Astra/Sol/Terra é orientação de execução, não identidade de membro do Linear.

## T1 — evidência operacional

- [x] Contratos Pydantic estritos para entrada, saída canônica e envelope versionado.
- [x] Fingerprints separados para execução numérica e proveniência.
- [x] Fixture de referência derivada do YAML empacotado e OpenAPI gerável sem
  settings, rede ou segredos.
- [x] Tipos TypeScript e validadores Ajv gerados, sem coerção, remoção de campos ou
  defaults.
- [x] Formatadores `decimal.js` com HALF_UP/pt-BR e repositório de estudo isolado por
  `owner_sub`.
- [x] Locks instalados em Python 3.11.16 e Node 24.19.0; wheel testada fora do
  checkout; geração repetida com hashes idênticos.

Detalhes, decisões e comandos: [registro da MOT-16](mot-16-implementacao.md).

## Arquivos preexistentes preservados

Permanecem intactos, no checkout original, os não rastreados `docs/superpowers/plans/2026-09-11-frontend-motor-de-fluxo-design.md`, `motor/cenarios/fluxo_gabriel.yaml` e `tests/test_exportar_player.py`. O trabalho não commitado da outra worktree não foi alterado nem incorporado.
