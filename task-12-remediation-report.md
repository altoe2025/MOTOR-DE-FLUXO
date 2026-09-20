# Task 12 / MOT-33 — remediação integrada da auditoria

Base auditada: `b46017b`. A remediação ficou restrita a `web/`; nenhum arquivo em
`motor/` foi alterado.

## Matriz de fechamento

| Finding importante | Evidência automatizada | Commit(s) |
|---|---|---|
| 1. Execução histórica preserva o snapshot analítico exato, inclusive origem, caso observado, premissas, período e comparação | `executionService.test.ts` cobre alteração posterior do cenário; `validation.test.ts` rejeita snapshot histórico adulterado; `ExecutionHistory.test.tsx`, `ObservedComparisonTable.test.tsx` e `study-observed.spec.ts` exercitam reabertura/renderização | `56a95e4`, `630835c`, `9a504c9` |
| 2. Conversão OBSERVED → AUTHORED copia operações explícitas sem gerador ou reamostragem | `resolvePortfolioSource.test.ts` compara IDs, cliente compartilhado, direção, datas, valor, finalidade e EFX; `studyEditor.test.tsx` edita a definição explícita convertida | `ab6fc85`, `6c1518f` |
| 3. Proveniência permanece associada a ordem/campo e a premissas/período | `resolvePortfolioSource.test.ts` e `buildPreviewRequest.test.ts` misturam `OBSERVED`, `USER_CORRECTED` e `INFERRED`; `studyEditor.test.tsx` cobre autoria; schema valida a estrutura completa | `ab6fc85`, `199af7a`, `41dbdc6` |
| 4. Resposta de A após navegação para B conclui A por CAS sem trocar a seleção B | `executionService.test.ts` cobre POST pendente, troca A → B, resposta, permanência em B e reabertura de A com `INTERRUPTED` + `SUCCEEDED` | `401ed10` |
| 5. Autoria e editor tipado sobrevivem a persistência/rehidratação | `indexedDbApplicationRepository.test.ts` e `studyEditor.test.tsx` cobrem editar → salvar → reload → editar, grupos, participantes, herança, overrides, operações explícitas e Decimals mantidos como texto | `ab6fc85`, `6c1518f`, `41dbdc6` |
| 6. Fontes legadas reais alimentam o provider de produção sem binários | `productionRepository.test.ts` inicializa com fonte legada real e verifica original, marcadores e arquivo; `migrations.test.ts` e `recovery.test.ts` preservam compatibilidade e recuperação | `84e3773` |

## Compatibilidade e migração

- A versão documental permanece `2.0.0`. Os novos snapshots de execução são
  opcionais no schema para que documentos `2.0.0` já persistidos não se tornem
  silenciosamente inválidos; toda execução nova os grava.
- Migrações v1 preenchem os snapshots a partir do cenário histórico disponível e
  passam pela validação semântica. Documentos v2 antigos continuam legíveis, mas a
  UI só usa o cenário corrente como fallback quando ID, revisão e fingerprint ainda
  coincidem — contexto desconhecido não é apresentado como se fosse histórico.
- A definição autorada é um union tipado: `PARAMETRIC` preserva grupos,
  participantes, herança e overrides; `EXPLICIT_ORDERS` preserva as ordens copiadas
  e a proveniência por campo. A geração parametrizada continua uma ação distinta.
- O provider padrão descobre as fontes legadas suportadas, serializa somente dados
  estruturados e recusa valores binários antes da importação.

## Gates proporcionais finais

| Gate | Resultado |
|---|---|
| testes focados domain/storage/controller/preparation/execution/comparison/UI | 117 aprovados em 16 arquivos |
| `npm --prefix web run typecheck` | aprovado |
| `npm --prefix web run lint` | aprovado |
| `npm --prefix web run build` | aprovado; permanece o aviso conhecido de chunk > 500 kB |
| `python -m pytest -q tests/web_api` via `.venv` | 191 aprovados, 2 ignorados |
| `python -O -m pytest -q tests/web_api` via `.venv` | 191 aprovados, 2 ignorados |
| `python -m ruff check servidor tests/web_api` via `.venv` | aprovado |
| E2E `study-concurrency.spec.ts` | 4 aprovados |
| E2E `study-observed.spec.ts` | 1 aprovado após atualizar a expectativa antiga para os dois registros preservados (`INTERRUPTED` + `SUCCEEDED`) |
| `git diff --check` | aprovado no fechamento |

Não foi repetida a regressão global: a rodada foi deliberadamente proporcional ao
escopo transversal pedido para a remediação.

## Limites honestos carregados

- O Ruff global literal (`python -m ruff check servidor tests`) permanece fora do
  gate: a base registrou 296 violações preexistentes em testes legados fora de
  `tests/web_api`. O escopo CI vigente (`servidor tests/web_api`) passou; este
  relatório não declara o Ruff global aprovado.
- O E2E `real-auth` exige `MOT_REAL_AUTH_BASE_URL`, `MOT_REAL_AUTH_EMAIL` e
  `MOT_REAL_AUTH_PASSWORD`. As credenciais não estavam no ambiente e não foram
  inventadas; nenhuma aceitação de autenticação real é alegada.
- Não houve push, PR, merge, publicação ou alteração no Linear.
