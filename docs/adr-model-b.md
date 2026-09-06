# ADR: Model B — CNR separada por cliente, custo rateado

## Contexto

O motor precisa decidir, tecnicamente, o que significa "casar" um `OUT` com um `IN`
quando os dois pertencem a clientes diferentes: os pares são compensados
operação-contra-operação (cada `OUT` fisicamente ligado a um `IN`) ou cada cliente
mantém sua própria operação, e o que se agrega é só a necessidade de funding externo?

## Decisão

O motor implementa o **Model B**: cada operação executa e é registrada
individualmente, na CNR do próprio cliente. O que o orquestrador agrega, por fora, é
a **posição agregada de tesouraria** — quanto, no total do dia, ainda precisa
atravessar a fronteira — e o que se rateia é o **custo do resíduo**, não a operação
em si. Essa correspondência está documentada no próprio código-fonte, no docstring de
`motor/netting.py`:

> "`casado` e `residuo` são POSIÇÃO AGREGADA DE TESOURARIA, não pareamento físico de
> operação com operação. A ordem A não é 'casada com' a ordem B — o motor calcula
> que, no agregado do dia, tal volume não precisou atravessar a fronteira. Isso é
> coerente com o Modelo B: cada operação executa e registra individualmente; o que se
> agrega é a necessidade de funding externo, e o que se rateia é o custo do
> resíduo."

Model B foi escolhido em vez de compensação direta entre operações porque
compensação direta exigiria vincular fisicamente a ordem de um cliente à de outro —
o que descaracterizaria a operação de cada cliente como própria e discreta perante o
regulatório (ver art. 22 da Res. BCB 277 em `AGENTS.md`).

**Ressalva confirmada por inspeção do código**: o rateio do custo do resíduo entre
clientes ainda **não** é uma função implementada. `motor/custo.py` calcula `Custos`
(`iof`, `carry`, `spread`, `espera`, `fixo`, `total`) no nível agregado do `Cenario`
inteiro — não há hoje uma função que quebre esse total por `cliente_id`. `Ordem`
carrega `cliente_id` como campo, mas nenhum módulo consome esse campo para dividir
custo. Isto é um gap de implementação em relação à decisão de arquitetura descrita
acima, não uma mudança de decisão.

## Consequências

- Estruturalmente, o motor fica mais próximo de uma **consolidação de tesouraria**
  entre CNRs de clientes distintos do que de uma compensação operação-contra-operação
  clássica: nenhuma ordem individual é modificada ou vinculada a outra, só o
  cálculo de quanto atravessa a fronteira é feito no agregado.
- Qualquer implementação futura de rateio por cliente precisa ler as `Alocacao`
  (não os `bruto_out`/`bruto_in` dos `Ciclo`) para saber exatamente quanto de cada
  ordem foi `CASADO` vs. `REMETIDO` — essa é a granularidade em que a conservação por
  ordem (e, por extensão, por cliente) é verificável (ver `docs/architecture.md`).
- Enquanto o rateio por cliente não existir como função própria, qualquer decisão de
  precificação por cliente feita fora do repositório (ex.: numa planilha ou
  orquestrador externo) não tem como ser validada contra os testes deste projeto.

Para a justificativa regulatória completa desta decisão, consultar o vault Obsidian.

Para contexto de negócio e proveniência, consultar o vault Obsidian.
