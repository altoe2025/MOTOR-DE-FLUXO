# Especificação de autonetting preferencial no Motor de Fluxo

**Data:** 2026-09-16

**Status:** decisão funcional aprovada por Gabriel em conversa

**Base de implementação:** `origin/main` integrada; não a branch histórica
`analise/sensibilidade-custo`

## 1. Objetivo

Fazer do autonetting uma operação explícita do produto e garantir que, em cada
fechamento normal da política P0, posições opostas simultaneamente abertas do mesmo
cliente sejam casadas antes de qualquer casamento entre clientes.

O resultado precisa distinguir, de forma auditável:

- volume resolvido por autonetting (`INTRA_CLIENTE`);
- volume resolvido por netting multilateral (`INTER_CLIENTE`);
- volume remetido;
- economia, espera e custos derivados das ordens efetivamente resolvidas.

## 2. Decisão funcional

Cada `Ordem` representa uma operação ou posição submetida ao orquestrador. Ela não
é considerada previamente líquida contra todas as demais ordens do cliente.

O baseline continua sendo cada ordem executando isoladamente. Portanto, tanto o
autonetting quanto o netting multilateral pertencem ao benefício produzido pelo
produto.

Em cada fechamento já previsto pela P0:

1. o motor encontra `OUT` e `IN` abertos de cada cliente;
2. casa obrigatoriamente o máximo possível dentro de cada cliente;
3. somente os saldos remanescentes entram nas filas multilaterais;
4. o resíduo continua aberto ou é remetido segundo as regras atuais de vencimento e
   fim de horizonte.

A preferência intracliente prevalece sobre o EDF global. Dentro das filas de cada
cliente e, depois, dentro das filas multilaterais, permanece o EDF por
`(dia_limite, id)`.

## 3. Semântica temporal

Autonetting não cria um novo gatilho de fechamento. Os gatilhos continuam sendo:

- janela completa;
- vencimento de uma ordem aberta;
- fim aplicável da execução.

Somente ordens conhecidas e ainda abertas no momento do fechamento podem casar.
Não haverá:

- casamento retroativo;
- reabertura de ordem já resolvida;
- reserva de liquidez baseada em ordem futura ainda desconhecida;
- antecipação de fechamento quando a segunda ponta do cliente aparece;
- look-ahead usando fatos posteriores ao dia corrente.

## 4. Contrato do domínio

`TipoAlocacao` continua respondendo se a parcela atravessou a fronteira:

```python
class TipoAlocacao(Enum):
    CASADO = "CASADO"
    REMETIDO = "REMETIDO"
```

Uma dimensão ortogonal registra a origem de uma alocação casada:

```python
class OrigemCasamento(Enum):
    INTRA_CLIENTE = "INTRA_CLIENTE"
    INTER_CLIENTE = "INTER_CLIENTE"


@dataclass(frozen=True)
class Alocacao:
    ordem_id: str
    dia: int
    valor_brl: Decimal
    tipo: TipoAlocacao
    origem_casamento: OrigemCasamento | None
```

Invariantes obrigatórias:

- `CASADO` exige `origem_casamento`;
- `REMETIDO` exige `origem_casamento is None`;
- a soma das alocações de cada ordem continua igual ao valor da ordem;
- as duas pernas casadas de cada origem têm o mesmo volume em cada ciclo;
- `CASADO` total continua compatível com `Ciclo.casado`.

Não será criado pareamento físico ordem-a-ordem. O Modelo B continua valendo: as
operações executam individualmente, enquanto o motor registra a composição agregada
da necessidade de funding. A origem informa se a liquidez veio do próprio cliente ou
da pool, sem inventar uma contraparte jurídica específica.

## 5. Algoritmo do fechamento

No fechamento do dia `d`, com `pendente` e `abertas` já existentes:

```text
alocações = []

para cliente_id em ordem lexical:
    out_cliente = OUT abertos do cliente, em EDF/id
    in_cliente  = IN abertos do cliente, em EDF/id
    intra = min(saldo(out_cliente), saldo(in_cliente))
    consumir as duas filas em intra
    marcar as alocações como CASADO/INTRA_CLIENTE

out_residual = todos os OUT ainda positivos, em EDF/id
in_residual  = todos os IN ainda positivos, em EDF/id
inter = min(saldo(out_residual), saldo(in_residual))
consumir as duas filas em inter
marcar as alocações como CASADO/INTER_CLIENTE

processar vencimentos e remessas como hoje
```

A ordem lexical de `cliente_id` existe apenas para tornar a tupla de saída
determinística; o volume intracliente de um cliente não compete com o de outro.

## 6. Métricas oficiais

Toda métrica usa o volume das alocações, contando as duas pernas, como já ocorre com
a netabilidade total:

```text
volume_autonetting_brl
    = soma de CASADO/INTRA_CLIENTE

volume_netting_multilateral_brl
    = soma de CASADO/INTER_CLIENTE

volume_casado_brl
    = volume_autonetting_brl + volume_netting_multilateral_brl

taxa_autonetting
    = volume_autonetting_brl / volume_bruto_brl

taxa_netting_multilateral
    = volume_netting_multilateral_brl / volume_bruto_brl
```

`limite_intra_cliente_brl`, `volume_casado_incremental_brl` e
`taxa_netabilidade_incremental` não medem a execução temporal real e deixam de ser
métricas oficiais. Resultados e CSVs antigos permanecem preservados como legado, sem
ser combinados com execuções novas.

## 7. Custos e análise por cliente

As fórmulas de custo não mudam:

- baseline por ordem isolada;
- IOF sobre `REMETIDO`, conforme a ordem;
- carry e espera sobre `CASADO`;
- spread e custo fixo sobre o resíduo remetido.

A origem do casamento passa pelo ledger e pelos DTOs. Isso permite decompor volume e
ganho por mecanismo sem recalcular o algoritmo em consumidores. A soma por origem,
cliente e ciclo precisa reconciliar exatamente com o agregado.

A decomposição financeira usa três destinos contábeis: `INTRA_CLIENTE`,
`INTER_CLIENTE` e `REMETIDO`. O baseline de cada ordem é distribuído entre suas
alocações proporcionalmente ao valor. Custos netados diretos seguem a alocação;
spread e tarifa fixa de remessa seguem o rateio técnico já existente. Para cada
destino:

```text
economia_mecanismo_brl
    = baseline_atribuido_mecanismo_brl - custo_netado_mecanismo_brl
```

A soma dos três baselines, custos netados e economias precisa reconciliar exatamente
com o agregado. Essa decomposição é atribuição contábil explicativa, não afirmação
causal sobre qual seria o resultado de remover isoladamente um mecanismo.

Não será criada nesta entrega uma regra comercial de cobrança ou faturamento por
cliente.

## 8. Contratos públicos e front-end

O resultado canônico e a API passam a publicar os volumes e taxas reais de
autonetting e netting multilateral. `AlocacaoDTO` publica
`origem_casamento: INTRA_CLIENTE | INTER_CLIENTE | null`.

A alteração é uma quebra semântica deliberada e exige incremento da versão do schema
público. Fixtures, OpenAPI, tipos TypeScript e testes de round-trip precisam ser
regenerados pela fonte canônica; não serão editados manualmente para mascarar
divergência.

O front-end deve apresentar três parcelas — autonetting, netting multilateral e
remessa — usando exclusivamente valores recebidos da API.

## 9. Entrada e importação de dados

O importador de documentos reais continua sendo uma camada anterior ao motor. Ele
não pode pré-netar o cliente nem condensar operações que tenham diferenças capazes
de alterar execução ou custo.

Uma agregação de linhas só é admissível quando forem idênticos, no mínimo:

- `cliente_id`;
- direção;
- `dia_conhecida`;
- `dia_limite`;
- finalidade;
- classificação `eh_efx`;
- corredor e moeda quando esses campos existirem no contrato.

O importador completo dos arquivos reais permanece uma entrega separada. Esta
mudança apenas torna o contrato do motor compatível com ele.

## 10. Compatibilidade e resultados anteriores

A mudança invalida como resultado vigente:

- o contrato de “posição já líquida colocada na pool”;
- a interpretação comercial das métricas incrementais estimadas;
- as 27.000 simulações e relatórios produzidos com seleção global EDF;
- qualquer fixture pública cujo schema não exponha a origem do casamento.

Antes de qualquer regeneração integral, a política nova será executada numa amostra
pequena e pareada para medir efeito e custo operacional. A implementação, a API e o
front-end podem ser concluídos com essa amostra. A grade completa e a reescrita dos
relatórios só começam depois de aprovação explícita de Gabriel.

O cenário `exemplo_amanda.yaml` deve continuar reproduzindo o número de aceitação,
pois hoje possui apenas uma ordem por cliente e não exercita a nova preferência.
Essa expectativa é uma regressão, não licença para corrigir o número esperado.

## 11. Critérios de conclusão

1. Em qualquer fechamento, todo volume intracliente possível é consumido antes do
   intercliente.
2. EDF/id continua determinístico dentro de cada nível de prioridade.
3. Nenhuma ordem casa antes de ser conhecida ou depois de resolvida.
4. Conservação global, por ordem, por origem e por ciclo fecha exatamente.
5. Custos continuam atribuídos às ordens efetivamente casadas ou remetidas.
6. Resultado canônico, API e front-end distinguem volume, custo e economia dos três
   destinos contábeis.
7. Métricas legadas não aparecem como conclusão de produto em novas execuções.
8. Cenário Amanda continua reproduzível.
9. Suíte completa passa normalmente e sob `python -O`.
10. Uma amostra pareada demonstra o efeito e estima o custo da regeneração integral.
11. A grade completa e os relatórios são regenerados somente após aprovação explícita
    posterior de Gabriel.

