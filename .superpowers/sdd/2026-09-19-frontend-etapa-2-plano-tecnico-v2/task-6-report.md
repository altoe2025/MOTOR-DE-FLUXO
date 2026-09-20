# T6 / MOT-28 — controlador, autosave, sessão e múltiplas abas

## Entrega

- `StudyController` com estados `IDLE`, `DIRTY`, `SAVING`, `SAVED`, `CONFLICT`,
  `STORAGE_FAILURE` e `CLOSED`, assinatura observável e rejeição de operações após
  `close`.
- Autosave serial por revisão, criação por CAS `0 → 1`, `flush()` ligado à promise
  de commit do repositório e preservação do documento local em falha ou conflito.
- Canal injetável e opcional por projeto/owner. As mensagens contêm exclusivamente
  `studyId`, `revision` e `operationId`; aba limpa relê o repositório e aba suja
  entra em conflito. O repositório/CAS permanece a autoridade.
- Epoch monotônico de sessão, `AbortSignal` para trabalhos ligados à sessão,
  cancelamento de queries, descarte de retornos tardios e fechamento de repositório
  e canal. A sequência A → B → A cria três recursos isolados e reabre o banco de A.
- `ApplicationProviders` mantém o controlador através das trocas de identidade,
  fornece `useStudyController` e troca imediatamente o `QueryClient` visível para
  impedir que o cache de A apareça em B. O descarte cancela fetches antes de limpar
  cada cache.

## Decisão do Minor de T3

Não houve reabertura do domínio nem mudança em `resultState.ts`. Revisão persistida
e CAS continuam sendo a autoridade de concorrência; `inputFingerprint` continua
representando apenas alterações analíticas. Nomes e timestamps permanecem fora do
fingerprint, conforme o contrato já entregue por T3.

## Evidência TDD

- RED inicial: o teste do controlador falhou por ausência de
  `./studyController`; GREEN com a máquina, fila, canal e epoch.
- RED do QueryClient: `disposeUserQueryClient is not a function`; GREEN cancelando
  queries antes de limpar o cache.
- RED do provider: `useStudyController is not a function`; GREEN com contexto e
  recursos por sessão.
- RED de isolamento: o cache de A ainda apareceu em B; GREEN ao restaurar um
  `QueryClient` distinto por identidade, mantendo o controlador estável.
- REDs de concorrência reproduziram filas antigas bloqueando B e outro estudo,
  além de carregamento tardio sobrescrevendo a seleção nova. As filas agora são
  invalidadas por epoch de sessão e de seleção, sem aguardar o retorno antigo.
- RED de criação provou que `IDLE` não aceitava o primeiro documento; GREEN com CAS
  `expectedRevision = 0`.

## Self-review enxuta

Achados confirmados e corrigidos:

1. Uma promise de autosave de A podia continuar sendo a fila ativa de B.
2. Reutilizar um único QueryClient deixava o cache anterior visível durante o
   primeiro render da nova identidade.
3. Dois carregamentos concorrentes na mesma sessão permitiam que o mais antigo
   sobrescrevesse a seleção nova.
4. Trocar de estudo durante um commit pendente podia bloquear o autosave do estudo
   recém-selecionado.

Não restou achado material no escopo. BroadcastChannel indisponível apenas remove a
otimização; concorrência continua protegida por CAS. Falha física por quota/perda de
energia permanece no limite já documentado do repositório T4/T5.

## Gates finais

- `npm --prefix web run test:unit -- src/study/studyController.test.ts src/app` — PASS.
- `npm --prefix web run typecheck` — PASS.
- `npm --prefix web run lint` — PASS.
- `npm --prefix web run build` — PASS; executado porque `providers.tsx` alterou o
  grafo de produção.
- `git diff --check` — PASS.

Commit único: `feat: controla estudos e concorrência local (MOT-28)`.

## Fix round única — conflito durante autosave

O finding Important foi confirmado. Enquanto `saveStudy` aguardava o commit, uma
mensagem remota de revisão maior mudava o estado para `CONFLICT`; a continuação de
`#drain`, porém, publicava `SAVED` incondicionalmente quando a fila ficava vazia.

O controlador agora registra uma versão monotônica dos conflitos aceitos pelo canal.
Cada commit captura essa versão antes do `await`; se ela mudar durante a escrita, o
commit local concluído é contabilizado, mas a drenagem para, preserva o documento em
memória e termina em `CONFLICT`. Assim uma revisão local já ultrapassada não volta a
ser apresentada como limpa nem libera edições posteriores da fila.

Evidência RED/GREEN:

- RED: mensagem remota de revisão 3 entregue durante o save local da revisão 2;
  após a conclusão local, o estado observado era incorretamente `SAVED`.
- GREEN: o mesmo teste termina em `CONFLICT`, com o documento local preservado;
  o arquivo focado fecha com 12 testes passando.

Gates da fix round:

- `npm --prefix web run test:unit -- src/study/studyController.test.ts` — PASS,
  12 testes.
- `npm --prefix web run typecheck` — PASS.
- `npm --prefix web run lint` — PASS.
- `git diff --check` — PASS.

Commit adicional: `fix: preserva conflito durante autosave (MOT-28)`.
