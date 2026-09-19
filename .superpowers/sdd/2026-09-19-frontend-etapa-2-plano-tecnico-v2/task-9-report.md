# Task 9 / MOT-29 — orquestração de execução e histórico imutável

## Entrega

- `executeStudyScenario` coordena `flush → snapshot → request → reserva CAS → POST →
  validação → append`, com deduplicação por controlador/cenário durante a tentativa.
- A reserva avança a revisão do estudo sem criar uma execução mutável. Isso faz o
  CAS decidir qual aba pode iniciar o POST e preserva o contrato append-only do
  repositório: cada tentativa acrescenta no máximo um registro terminal.
- O POST não tem retry automático. Falhas HTTP ou envelopes incompatíveis produzem
  `FAILED`; troca de sessão produz `INTERRUPTED` somente em memória e impede anexação
  no owner novo.
- `PREPARING` e `RUNNING` são estados transitórios observáveis por `onStatus`;
  `SUCCEEDED` e `FAILED` são anexados ao histórico. Registros antigos não são
  reescritos e uma nova tentativa recebe uma nova identidade.
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
  selecionar uma execução apenas emite o registro escolhido e não altera autoria.

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
