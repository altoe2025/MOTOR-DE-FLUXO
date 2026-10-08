# Task 9 / MOT-29 — orquestração de execução e histórico imutável

## Entrega

- `executeStudyScenario` coordena `flush → snapshot → request → reserva CAS → POST →
  validação → append`, com deduplicação por controlador/cenário durante a tentativa.
- A reserva acrescenta um `ExecutionRecord(RUNNING)` contendo `executionId`,
  `request_id`, snapshot e fingerprint antes da rede. O CAS decide qual aba pode
  iniciar o POST; a conclusão acrescenta outro registro terminal correlacionado pelo
  mesmo `request_id`, sem reescrever a reserva nem o histórico anterior.
- O POST não tem retry automático. Falhas HTTP ou envelopes incompatíveis produzem
  `FAILED`; troca de sessão produz `INTERRUPTED` somente em memória e impede anexação
  no owner novo.
- `PREPARING` é transitório em memória; `RUNNING` é observável e durável.
  `SUCCEEDED` e `FAILED` são anexados ao histórico. Registros antigos não são
  reescritos e uma nova tentativa recebe novas identidades.
- O `execution_id` de sucesso vem do envelope, como exige o servidor real. Antes da
  resposta a tentativa usa ID local; o request não fabrica um ID que o servidor não
  recebe.
- A validação confere schema, versão, request/study/scenario/revisão, snapshot HTTP e,
  na restauração, o `execution_id` persistido. A sessão é protegida por owner e epoch.
- Edição analítica durante o POST preserva o resultado no histórico como
  desatualizado. Renomeação de cenário mantém o resultado atual porque o
  `inputFingerprint`, não a revisão editorial, decide se a entrada analítica mudou.
  Revisão e CAS continuam preservando concorrência e histórico.
- Falha ao persistir a resposta mantém envelope e tentativa terminal em memória e
  deixa o controlador em `STORAGE_FAILURE`; o último resultado válido do provider não
  é apagado por uma tentativa HTTP malsucedida.
- `PreviewProvider` mantém o fluxo de referência e agora expõe execução de request
  explícito e restauração validada de envelope, sempre com `retry: false`.
- `ExecutionHistory` lista status, instante, revisão, origem, versões e fingerprint;
  quando existe terminal para o mesmo `request_id`, apresenta-o no lugar da reserva.
  Selecionar uma execução apenas emite o registro escolhido e não altera autoria.

## TDD

- RED inicial: `executionService.test.ts` falhou por ausência de
  `./executionService`; os novos métodos do provider falharam por não existirem.
- GREEN inicial: 16 testes focados cobriram reserva, duplo clique, HTTP, sessão,
  edição durante POST e falha de storage.
- RED do histórico: import de `ExecutionHistory` inexistente; GREEN com o componente
  e seleção sem mutação.
- RED de envelope divergente: a resposta era atribuída antes do gate e terminava
  incorretamente como `SUCCEEDED`. A promoção passou a ocorrer somente depois da
  validação completa; o arquivo focado fechou verde.
- Cobertura final do serviço/provider: 18 testes. O teste do histórico também passou
  isoladamente durante o ciclo.

## Auditoria proporcional

Nenhum achado material permaneceu. Foram conferidos:

- corrida entre abas: somente a reserva vencedora chega ao POST;
- duplo clique: compartilha a mesma promise e faz um POST;
- retorno atrasado: fingerprint decide atual/desatualizado;
- troca de owner/epoch: resposta não atravessa sessão;
- append-only: registros terminais anteriores permanecem byte a byte;
- identidade do servidor: `execution_id` não é previsto pelo cliente;
- rejeição de envelope inválido antes de qualquer persistência de sucesso.

Limites deliberados: a seleção de histórico é um componente sem integração de página
nesta task; comparação com observado continua reservada à T10. O aviso de chunk Vite
acima de 500 kB é preexistente.

## Gates finais

- `npm --prefix web run test:unit -- src/study/executionService.test.ts src/preview/PreviewProvider.test.tsx`
  — 2 arquivos, 18 testes aprovados.
- `npm --prefix web run typecheck` — aprovado.
- `npm --prefix web run lint` — aprovado.
- `npm --prefix web run build` — aprovado, 247 módulos transformados.
- `git diff --check` — aprovado; somente avisos informativos LF→CRLF nos dois arquivos
  já rastreados do provider.

Não houve suíte global, Python, push, PR, merge ou alteração no Linear.

## Fix round única — reserva durável e falhas pré-POST

Os dois findings Important foram reproduzidos e corrigidos.

1. **Autoridade entre abas.** O `WeakMap` era apenas local e a antiga reserva CAS
   avançava a revisão sem persistir identidade/status da tentativa. Agora a reserva
   é um `ExecutionRecord(RUNNING)` anexado e commitado antes do POST. Outra instância
   que carrega essa revisão encontra a reserva ativa por cenário e `request_id`,
   retorna `ExecutionInProgressError`/`INTERRUPTED` e não chama a rede. O `WeakMap`
   permanece somente como deduplicação de duplo clique na mesma instância.
2. **Falhas pré-POST.** Exceções do flush inicial e do commit da reserva escapavam da
   API. O serviço agora as converte em tentativa terminal observável: conflito/CAS é
   `INTERRUPTED`; falha de storage é `FAILED` com `persistenceError`. O controlador
   preserva `STORAGE_FAILURE` e o documento em memória, e `runPreview` permanece com
   zero chamadas.

### Evidência RED/GREEN

- RED: a reserva commitada continha zero execuções; uma segunda instância não via
  `RUNNING` e iniciava outro POST.
- GREEN: a segunda instância carrega a revisão reservada, recusa a tentativa e os
  dois controladores somam exatamente um POST.
- RED: falha no flush inicial e no save da reserva rejeitavam a promise com `quota`.
- GREEN: ambos retornam `FAILED`, emitem `PREPARING → FAILED`, preservam
  `STORAGE_FAILURE`/documento e não chamam o cliente HTTP.
- RED: o histórico mostrava simultaneamente reserva e conclusão.
- GREEN: o terminal correlacionado substitui visualmente a reserva, que continua
  preservada no documento append-only.

### Gates da fix round

- `npm --prefix web run test:unit -- src/study/executionService.test.ts src/preview/PreviewProvider.test.tsx src/study/components/ExecutionHistory.test.tsx`
  — 3 arquivos, 23 testes aprovados.
- `npm --prefix web run typecheck` — aprovado.
- `npm --prefix web run lint` — aprovado.
- `git diff --check` — aprovado.
- Build não é necessário: a fix round não altera dependências nem o grafo de bundle;
  o componente continua fora do grafo de páginas e o typecheck cobre os módulos.

## Correção final — cancelamento e reconciliação de reserva

A re-review encontrou uma janela após o commit de `RUNNING` e antes do POST: quando
`flush()` retornava `null` ou o signal era abortado, a tentativa terminava apenas em
memória e deixava a reserva ativa indefinidamente.

- Com owner e epoch ainda válidos, o serviço agora grava a transição excepcional
  `RUNNING → INTERRUPTED` já autorizada pelo repositório, preservando exatamente o
  mesmo `ExecutionRecord.id`, `request_id` e snapshot. A escrita usa CAS destacado
  pelo controlador, sem trocar a seleção atual do usuário.
- Com perda de sessão/epoch, nenhum recurso fechado é reutilizado. A reserva continua
  bloqueante por um lease determinístico de cinco minutos. Uma sessão posterior
  recusa novo POST antes do prazo; depois do prazo, primeiro reconcilia a reserva para
  `INTERRUPTED` via CAS e somente então pode reservar uma nova tentativa.
- A correlação deixa de depender apenas de convenção visual: cancelamento persistido
  conserva identidade e o histórico continua mostrando um único estado por tentativa.

### Evidência focada

- RED: cancelamento após a reserva retornava `INTERRUPTED` em memória, mas o documento
  persistido permanecia `RUNNING` com `finishedAt = null`.
- GREEN: zero POST na tentativa cancelada, terminal `INTERRUPTED` persistido com os
  mesmos IDs, e uma nova tentativa posterior conclui normalmente.
- Perda de epoch: zero POST original; reabertura antes do lease recebe
  `ExecutionInProgressError` e não chama a rede; após expiração, a sequência
  persistida é `INTERRUPTED, RUNNING, SUCCEEDED`, com um único POST novo.
- Self-review focada: CAS continua sendo autoridade; `saveDetachedStudy` só opera na
  mesma sessão/epoch, publica apenas IDs no canal e deixa conflitos para o repositório.

### Gates desta correção

- `npm --prefix web run test:unit -- src/study/executionService.test.ts src/preview/PreviewProvider.test.tsx src/study/components/ExecutionHistory.test.tsx`
  — 3 arquivos, 25 testes aprovados.
- `npm --prefix web run typecheck` — aprovado.
- `npm --prefix web run lint` — aprovado.
- `git diff --check` — aprovado.
- Build continua dispensado: sem dependência ou mudança no grafo de produção.
