# Etapa 1 — registro de execução

## Estado

T0–T2 estão **integradas na `main`** até o PR #30, commit `21f0ce3`; T3 foi
implementada na branch `codex/mot18-api` e aguarda revisão e CI. As oito tarefas foram
cadastradas como MOT-15–MOT-22 no workspace **Felipe Bisca**, time
**MOTOR DE FLUXO**, com as dependências nativas do plano. A base integrada foi
publicada pelos PRs #21–#26 no commit `1aecc57`; MOT-16 e MOT-17 foram integradas
pelos PRs #27–#30. A T3 acrescenta a API autenticada, limites operacionais e a
distribuição segura do build React; o projeto Supabase real continua reservado aos
gates T5/T7.

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
| T2 | [MOT-17 — Adaptador único e validação de publicação](https://linear.app/felipe-bisca/issue/MOT-17/etapa-1-t2-adaptador-unico-e-validacao-de-publicacao) | Integrada pelo PR #30; portão real concluído |
| T3 | [MOT-18 — FastAPI, autenticação e mesma origem](https://linear.app/felipe-bisca/issue/MOT-18/etapa-1-t3-fastapi-autenticacao-e-mesma-origem) | Em progresso; implementação local e verificações concluídas |
| T4 | [MOT-19 — Shell e componentes acessíveis](https://linear.app/felipe-bisca/issue/MOT-19/etapa-1-t4-shell-e-componentes-acessiveis) | PR #29 aberto; precisa ser atualizado sobre a base integrada |
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

## T2 — evidência operacional

- [x] Adaptador único constrói o domínio diretamente dos DTOs e chama `analisar`
  uma vez, somente em modo `AGREGADO` e pelas interfaces públicas do motor.
- [x] Modos `LEGADO` e `NATURAL` preservam horizonte, aquecimento, coorte medida e
  liquidação posterior à medição.
- [x] Portão independente valida finitude, referências, dias, tipos, conservação
  exata por ordem/global/coorte, volumes medidos, taxa, identidade do manifesto e
  roundtrip do JSON canônico.
- [x] Fixture `reference-result.json` é gerada pelo adaptador real com relógio,
  UUID e SHA controlados e reproduz os números de aceitação.
- [x] Passaram 575 testes normais, 575 sob `python -O`, Ruff e mypy isolado da
  camada `servidor`; `git diff -- motor` permaneceu vazio. O mypy integral ainda
  atravessa imports e encontra 31 apontamentos preexistentes em `motor/analise`.

Detalhes, decisões e comandos: [registro da MOT-17](mot-17-implementacao.md).

## T3 — evidência operacional

- [x] Factory FastAPI real com health público e session, exemplo e prévia protegidos
  por Bearer verificado no servidor.
- [x] Verificador ES256/JWKS valida emissor, audience exata, tempo, UUID, role e
  allowlist; cache de cinco minutos, timeout de cinco segundos e atualização de
  `kid` desconhecido são protegidos por trava.
- [x] Corpo limitado a 1 MiB antes do parse, contratos limitam 1.000 ordens, uma
  prévia executa por vez e resposta acima de 8 MiB falha sem truncar.
- [x] Build React é servido somente nas rotas SPA conhecidas; API, assets ausentes,
  traversal e links resolvidos para fora do dist nunca recebem `index.html`.
- [x] Proxy Vite relativo `/api` aponta para `127.0.0.1:8000`; não há CORS curinga.
- [x] Passaram 627 testes Python normais e sob `-O`, Ruff, mypy da camada `servidor`, 15 testes
  Vitest, typecheck, wheel instalada fora do checkout e regeneração determinística
  dos quatro artefatos de contrato. Dois testes de symlink foram ignorados porque o
  Windows deste ambiente não permite criá-los; a contenção também é verificada em
  produção antes de servir cada caminho.

Detalhes, configuração e comandos: [registro da MOT-18](mot-18-implementacao.md).

## Arquivos preexistentes preservados

Permanecem intactos, no checkout original, os não rastreados `docs/superpowers/plans/2026-09-11-frontend-motor-de-fluxo-design.md`, `motor/cenarios/fluxo_gabriel.yaml` e `tests/test_exportar_player.py`. O trabalho não commitado da outra worktree não foi alterado nem incorporado.
