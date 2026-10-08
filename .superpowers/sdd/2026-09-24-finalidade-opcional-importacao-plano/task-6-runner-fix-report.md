# Task 6 — correção da separação de runners

**Data:** 2026-09-24
**Worktree:** `C:\Users\gabriel Altoe\.codex\worktrees\frontend-etapa-6-integracao\motor-de-fluxo`
**HEAD de partida:** `07a46cd9170ae9d77e1c7dac7ee3f67b4e1f3150`

## Escopo

Corrigida exclusivamente a coleta indevida de
`web/scripts/render-smoke-gate.test.mjs` pelo Vitest. O arquivo é um teste
`node:test` executado pelo script dedicado `node --test`; não foi convertido para
Vitest, nem foram alterados timeout, orçamento, testes de rota, documentos de
aceite ou configuração do gate de Render.

## RED

Foi incluída primeiro em `web/vite.config.test.ts` a asserção de que a configuração
do Vitest contém a exclusão explícita de `scripts/render-smoke-gate.test.mjs`.

O comando focado foi:

```powershell
npm --prefix web run test:unit -- vite.config.test.ts --maxWorkers=1 --testTimeout=15000
```

A primeira tentativa foi impedida antes de executar por `EPERM` ao gravar
`web/node_modules/.vite-temp/...mjs`. Em uma única repetição controlada fora do
sandbox, o RED foi confirmado: 1 teste passou e a nova asserção falhou porque
`exclude` continha apenas `e2e/**`, `node_modules/**` e `dist/**`.

## GREEN

`web/vite.config.ts` passou a excluir exatamente
`scripts/render-smoke-gate.test.mjs`, além das exclusões já existentes. Nenhum
padrão de inclusão foi relaxado e nenhum outro arquivo foi excluído.

O teste de configuração repetido passou: **1 arquivo, 2 testes, 0 falhas**.

## Gates executados

| Gate | Comando | Resultado |
|---|---|---|
| Configuração Vitest | `npm --prefix web run test:unit -- vite.config.test.ts --maxWorkers=1 --testTimeout=15000` | PASS — 2/2 |
| Unitário serial | `npm --prefix web run test:unit -- --maxWorkers=1 --testTimeout=15000` | BLOCKED — a coleta foi corrigida; 1.038/1.039 testes passaram, 1 falhou |
| Smoke gate dedicado | `npm --prefix web run test:render-gate` | PASS — 4/4 |
| TypeScript | `npm --prefix web run typecheck` | PASS |
| ESLint | `npm --prefix web run lint` | PASS |
| Diff check | `git diff --check`; `git diff --check 6dce838...HEAD`; `git diff --find-renames 6dce838...HEAD` | PASS — exit 0 |

## Bloqueador separado

O comando unitário completo não falhou mais por
`scripts/render-smoke-gate.test.mjs`; foram coletados **116 arquivos** e executados
**1.039 testes**. Ele terminou em exit 1 por uma falha distinta, fora do escopo
desta correção:

```text
FAIL src/app/router.test.tsx > application routes > omits chat on authentication route /login
Error: expect(element).not.toBeInTheDocument()
expected document not to contain element, found <button aria-expanded="false" type="button">Perguntar</button> instead
Test Files  1 failed | 115 passed (116)
Tests  1 failed | 1038 passed (1039)
```

`src/app/router.test.tsx` e o roteador não foram alterados. Há também avisos já
emitidos pelo jsdom sobre `HTMLCanvasElement.getContext()` sem o pacote `canvas`;
eles não foram a causa do exit 1.

## Estado

Não houve push, PR, merge, deploy ou alteração de documentos de aceite. A correção
remove o bloqueador de coleta do Task 6, mas a suíte unitária integral permanece
bloqueada pelo teste de rota acima.
