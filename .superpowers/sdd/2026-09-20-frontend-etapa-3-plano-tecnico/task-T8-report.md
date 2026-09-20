# T8 / MOT-73 — relatório de implementação

## Entrega

- `ApiClient` implementa submit, status, resultado, cancelamento e retry com validação dos contratos gerados.
- `buildDiagnosticRequest` produz entrada fixa `count=1` ou planos 10/30/100 determinísticos, com UUIDs e seeds int63 únicos por participante; receita gerável ausente falha com `GENERATION_RECIPE_UNAVAILABLE`.
- Queries de status usam chave `owner/study/attempt/job`, polling somente em estados ativos e mantêm progresso fora do estudo persistido.
- O ciclo de autoridade é `flush → snapshot → request → reserva QUEUED por CAS → POST → poll GET → resultado → validação → terminal por CAS`.
- Study V3 e IndexedDB preservam histórico misto `PREVIEW`/`DIAGNOSTIC`, imutável e append-only.

## RED → GREEN

- Cliente HTTP: testes RED para os cinco endpoints; GREEN com POST sem retry implícito e GET de status delegável à query idempotente.
- Builder: RED para fixo, receita ausente e planos determinísticos; GREEN com validação gerada antes de retornar.
- Domínio/storage: RED para reserva + terminal, mutação e terminal duplicado; GREEN com um terminal máximo por `attemptId`.
- Orquestração: RED para ausência de persistência de progresso, reload, 404, troca de conta/estudo, resposta divergente, cancel e retry; 11 testes de serviço/query verdes.
- As duas falhas basais de `study/validation.test.ts` eram fixtures V3 sem `kind: PREVIEW`, portanto falhavam na estrutura antes das asserções semânticas. Como T8 introduziu a união V3, as fixtures foram atualizadas e os 8 testes ficaram verdes.

## Recuperação, sessão e resposta tardia

- Reload localiza a reserva ativa e consulta o `jobId` já persistido, sem novo POST.
- 404 de reserva ativa anexa `INTERRUPTED / SERVER_RESTART_OR_JOB_EXPIRED`.
- Troca de conta aborta polling local, não cancela job remoto e descarta retorno por owner/epoch.
- Troca de estudo grava o terminal por CAS no estudo de origem, sem selecioná-lo.
- `job_id`, `request_id`, estudo, cenário, revisão, fingerprint e envelope gerado são verificados antes do terminal; divergência mantém somente a reserva.
- Cancelamento só termina após observar `CANCELLED`; retry cria novo `attemptId`, nova reserva e novo `jobId = idempotency_key`, preservando o `request_id` original conforme T7.

## Verificação

- Gate obrigatório unit/storage: 53 testes verdes.
- Gate adicional validation/recovery/source: 36 testes verdes.
- Compatibilidade visual afetada pela união V3: 3 testes verdes em `ObservedComparisonTable.test.tsx`.
- `npm --prefix web run typecheck`: verde.
- `npm --prefix web run lint`: verde.
- `npm --prefix web run build`: verde; somente o warning preexistente de chunk maior que 500 kB.
- Suíte web completa: 322/324 verdes. As duas falhas restantes são preexistentes em `previewFlow.test.tsx`: procuram o link “Diagnóstico”, cuja navegação/UI pertence a T9/MOT-74 e ainda não existe. T8 não alterou router/sidebar nem implementou UI fora de escopo.

## Auditoria e preocupações

- Nenhum finding material confirmado após traçar API → builder → autoridade → CAS → storage → reload.
- A regra antiga de terminal único por `request_id` precisou permanecer apenas para `PREVIEW`: retry T7 preserva `request_id` e é identificado por novo `attemptId`/`jobId`.
- `generationInputSnapshot` é opcional para compatibilidade com snapshots legados; diagnóstico distribuído recusa explicitamente snapshots sem receita, em vez de tentar reconstruí-la.
- `ApplicationRepository`/`StudyController` continuam sendo a única fronteira de persistência; progresso transitório nunca entra em `DiagnosticExecutionRecord`.

## Fix Round 1 — auditoria independente

Três findings confirmados foram reproduzidos em RED e corrigidos:

1. `AGGREGATING` passou a ser estado ativo de polling, com regressão explícita no helper e no intervalo dinâmico.
2. Owner, epoch e `AbortSignal` são revalidados após cada await que pode ceder controle e imediatamente antes de `edit` ou `saveDetachedStudy`. Testes com flush terminal deferido comprovam que troca de owner, login do mesmo owner em novo epoch e abort não escrevem terminal tardio. A troca de estudo no mesmo epoch permanece válida e grava por CAS no estudo de origem.
3. Um terminal `DIAGNOSTIC` agora exige exatamente uma reserva `QUEUED` do mesmo `attemptId` e identidade imutável canonicamente idêntica. A comparação inclui `jobId`, request completo (IDs, idempotência e sampling), cenário/revisão, fingerprint, snapshots de origem/premissas/período, `createdAt` e qualquer outro campo não terminal. A regra existe no append, na validação integral/parser e chega ao storage; regressões negativas cobrem cada dimensão e documento artesanal, enquanto retry válido permanece uma nova tentativa independente.

Gate final do Round 1: 106 testes focados/adicionais verdes, `typecheck`, `lint` e `build` verdes; permaneceu apenas o warning conhecido de chunk maior que 500 kB.

## Fix Round 2 — auditoria independente

Dois findings adicionais foram reproduzidos em RED e corrigidos:

1. A validação do documento V3 agora agrupa todos os registros `DIAGNOSTIC` por
   `attemptId` e exige a forma persistida completa: exatamente uma reserva
   `QUEUED`, zero ou um terminal correlato e no máximo dois registros. Isso rejeita
   `RUNNING`/estados transitórios, reserva duplicada, terminal órfão e grupos
   excedentes no append, parser, validação integral e `saveStudy` do IndexedDB.
   Regressões diretas aceitam reserva isolada e reserva + terminal e recusam
   `RUNNING` e duas reservas, inclusive por documento artesanal antes do CAS.
2. Se o status já é `SUCCEEDED`, mas o GET do resultado retorna 404, a tentativa
   termina como `INTERRUPTED / SERVER_RESTART_OR_JOB_EXPIRED` pela mesma rotina de
   persistência terminal. A rotina mantém as guardas de owner, epoch e abort; uma
   resposta 404 após novo epoch do mesmo owner não grava. Erros de resultado que
   não são 404 continuam propagados sem fabricar terminal local.

Gate final do Round 2: 112 testes focados/adicionais verdes, `typecheck`, `lint` e
`build` verdes; permaneceu apenas o warning conhecido de chunk maior que 500 kB.
