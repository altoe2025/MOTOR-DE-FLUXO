# Sensibilidade econômica do custo — posições líquidas

> **Não é cotação nem projeção em reais.** Os volumes são sintéticos,
> `spread_rail_bps=25` e `custo_fixo_remessa=40` são placeholders, e duas regras de
> IOF continuam sem confirmação normativa. Até esses dados chegarem, a unidade de
> decisão é bps e o resultado útil é a inclinação de cada parâmetro.

## A decisão que governa a leitura

O orquestrador recebe somente a **posição líquida que o cliente decidiu colocar na
pool**. Não há uma segunda dedução de autonetting dentro do motor.

O contrafactual econômico é:

```text
cada posição líquida executa sozinha  versus  todas as posições líquidas na pool
```

Portanto, `economia_brl`/`economia_bps` da varredura publicada é a economia do
modelo sob esse contrato de entrada. `limite_intra_cliente_brl` e
`taxa_netabilidade_incremental` permanecem como diagnósticos de uma interpretação
alternativa, mas **não devem ser subtraídos novamente** para esta decisão de negócio.

## O que foi executado

Duas camadas:

1. As 27.000 linhas publicadas foram reaproveitadas para decompor IOF, spread,
   custo fixo, carry e espera nas 90 células `(mix, N, W)`. Nenhuma carteira foi
   regenerada para essa parte.
2. Para a escala de lançamento indicada — `N ∈ {8, 12}` — as 3.000 carteiras-base
   (5 mixes × 2 N × 300 sementes) foram regeneradas uma vez e reutilizadas em
   `W ∈ {1, 7}`. Isso abriu a base de IOF por `(finalidade, direção)`, que o CSV
   anterior guardava apenas agregada.

São 6.000 linhas de produto, 20 células agregadas e 100 exposições agregadas de
IOF. As 6.000 economias reproduzem as mesmas linhas do CSV original com diferença
máxima inferior a **0,005 bps** — 0,00 bps quando apresentada com duas casas. A
diferença vem do arredondamento monetário do CSV de origem.

Cada semente continua sendo uma carteira-ano sintética de 365 dias. p10 significa
a décima pior das 300 carteiras, não um mês ruim.

## Resultado na escala de lançamento

W=7. Valores atuais do modelo em bps.

| mix | N | p10 | p50 | p90 |
|---|---:|---:|---:|---:|
| equilibrado | 8 | 116,8 | 127,6 | 138,1 |
| equilibrado | 12 | 113,3 | 124,8 | 135,5 |
| retail_pesado | 8 | 109,1 | 123,3 | 136,0 |
| retail_pesado | 12 | 109,6 | 121,0 | 132,4 |
| corporativo_pesado | 8 | 78,4 | 93,3 | 108,4 |
| corporativo_pesado | 12 | 94,1 | 108,0 | 120,6 |
| psp_dominante | 8 | 163,1 | 180,4 | 192,5 |
| psp_dominante | 12 | 181,3 | 191,3 | 199,5 |
| outbound_extremo | 8 | 22,5 | 27,8 | 32,8 |
| outbound_extremo | 12 | 20,6 | 24,4 | 28,5 |

Todos os p10 são positivos sob os parâmetros atuais, mas isso não é ainda uma
afirmação comercial: o nível depende principalmente de IOF não confirmado e de
spread não calibrado.

## A decomposição muda com a carteira

Mediana entre 300 sementes, N=12/W=7. As participações são calculadas por semente
antes de tirar a mediana; por isso expressam a composição típica da economia.

| mix | economia p50 | IOF | spread | fixo | carry criado |
|---|---:|---:|---:|---:|---:|
| equilibrado | 124,8 bps | 85,1% | 16,6% | 1,0% | −2,7% |
| retail_pesado | 121,0 bps | 85,6% | 11,0% | 5,1% | −1,8% |
| corporativo_pesado | 108,0 bps | 82,4% | 20,6% | 0,2% | −3,3% |
| psp_dominante | 191,3 bps | 89,4% | 11,5% | 1,0% | −1,8% |
| outbound_extremo | 24,4 bps | 71,9% | 19,7% | 11,6% | −3,1% |

O relatório anterior dizia 85,75% IOF, 15,85% spread, 0,94% fixo e −2,54% carry,
mas isso descrevia apenas `equilibrado/N=12/seed=42`. A grade mostra agora:

- IOF: aproximadamente 72% a 89% da economia;
- spread: 11% a 21%;
- custo fixo: 0,2% a 11,6%;
- carry: reduz a economia em aproximadamente 1,8% a 3,3%.

O custo fixo quase não importa no corporativo, mas é material no retail e no
outbound. Uma única decomposição não podia mostrar essa inversão.

## Sensibilidade direta dos parâmetros

As inclinações abaixo permitem substituir o placeholder pelo valor real sem nova
simulação. N=12/W=7, mediana entre sementes.

| mix | efeito de +1 bp de spread | efeito de +R$ 1 no fixo | efeito de +1 bp de carry |
|---|---:|---:|---:|
| equilibrado | +0,827 bps | +0,031 bps | −0,826 bps |
| retail_pesado | +0,535 bps | +0,154 bps | −0,534 bps |
| corporativo_pesado | +0,888 bps | +0,006 bps | −0,887 bps |
| psp_dominante | +0,881 bps | +0,046 bps | −0,881 bps |
| outbound_extremo | +0,191 bps | +0,071 bps | −0,190 bps |

Fórmulas de atualização por célula:

```text
efeito do spread = (spread_real_bps − 25) × inclinação_spread
efeito do fixo   = (fixo_real_brl − 40) × inclinação_fixo
efeito do carry  = (carry_real_bps − 4) × inclinação_carry
```

Spread e carry têm inclinações quase opostas porque ambos incidem sobre o volume
que deixou de atravessar: o spread é custo evitado, enquanto o carry é custo criado.
O carry continua secundário porque seu nível atual é 4 bps, contra 25 bps do spread.

## Onde a incerteza de IOF bate

Contribuição atual e derivada das duas regras ainda não confirmadas, N=12/W=7,
mediana. Ausência na tabela significa que o mix não realizou aquela combinação de
arquétipo na composição inteira de N=12.

| mix | finalidade incerta | contribuição atual | efeito de +1 bp na alíquota |
|---|---|---:|---:|
| equilibrado | ATIVOS_VIRTUAIS OUT | 39,1 bps | +0,112 bps |
| equilibrado | BENS_SERVIÇOS OUT | 5,9 bps | +0,156 bps |
| retail_pesado | ATIVOS_VIRTUAIS OUT | 46,9 bps | +0,134 bps |
| corporativo_pesado | BENS_SERVIÇOS OUT | 9,1 bps | +0,240 bps |
| psp_dominante | ATIVOS_VIRTUAIS OUT | 76,1 bps | +0,217 bps |
| outbound_extremo | ATIVOS_VIRTUAIS OUT | 5,5 bps | +0,016 bps |
| outbound_extremo | BENS_SERVIÇOS OUT | 2,4 bps | +0,062 bps |

A incerteza dominante não é a mesma para todos:

- PSP, retail e parte do equilibrado dependem fortemente de ATIVOS_VIRTUAIS OUT.
- O corporativo depende de BENS/SERVIÇOS OUT.
- O outbound tem nível baixo e divide sua exposição entre as duas regras.

Isto é exposição, não interpretação jurídica. A alíquota correta deve vir da
norma/parecer; depois basta multiplicar a diferença em bps pela inclinação acima.

## Janela continua sem prioridade econômica

Na faixa N=8–12, trocar W=1 por W=7 mudou a mediana entre −0,28 e +1,76 bps e o
p10 entre −0,26 e +2,09 bps. A exceção negativa continua no
`corporativo_pesado`; nos demais mixes W=7 melhora pouco.

Isso confirma a decisão de não gastar a primeira sensibilidade refinando W.

## O que falta para virar material da Amanda

Três dados substituem os placeholders:

1. spread real do rail/parceiro, em bps;
2. tarifa fixa real por remessa;
3. alíquotas confirmadas de BENS/SERVIÇOS OUT e ATIVOS_VIRTUAIS OUT.

Com esses valores, a reprecificação é direta e não exige nova varredura. BRL só
deve ser calculado depois que houver volume real da carteira candidata.

Racionalidade individual e regra de rateio não entram nesta entrega, conforme a
decisão de escopo. p99 também não entra: exige corrigir primeiro o horizonte para
aquecimento, 365 dias medidos e liquidação natural.

## Arquivos produzidos

- `scripts/sensibilidade_custo.py` — execução e reprecificação.
- `resultados/sensibilidade/decomposicao_grade_bruta.csv` — 27.000 linhas existentes decompostas.
- `resultados/sensibilidade/decomposicao_grade_agregada.csv` — 90 células.
- `resultados/sensibilidade/sensibilidade_produto_bruta.csv` — 6.000 linhas em N=8/12.
- `resultados/sensibilidade/sensibilidade_produto_agregada.csv` — 20 células.
- `resultados/sensibilidade/sensibilidade_iof_bruta.csv` — exposição por rodada e regra.
- `resultados/sensibilidade/sensibilidade_iof_agregada.csv` — 100 exposições agregadas.

Reprodução:

```bash
python -m scripts.sensibilidade_custo --saida resultados/sensibilidade --n 8,12 --w 1,7 --sementes 1:300
```
