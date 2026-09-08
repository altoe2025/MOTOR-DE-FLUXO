# Sensibilidade econômica do custo — posições líquidas

Uma versão curta para conversa com a Amanda está em
[`RESUMO-EXECUTIVO-AMANDA.md`](RESUMO-EXECUTIVO-AMANDA.md). Este documento preserva
o método, os cálculos e as ressalvas técnicas completas.

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

## Cenários de estresse e limites

Esta etapa não tenta adivinhar os valores reais que ainda faltam. Ela usa os dados
supostos atuais como referência e pergunta quanto da economia sobrevive quando as
premissas favoráveis são retiradas. Foram reprecificadas as mesmas 6.000
carteiras-ano, sem nova geração e sem alteração no motor.

Os oito testes são:

| cenário | alteração sobre a hipótese atual |
|---|---|
| `base_hipotetica` | mantém spread 25 bps, tarifa R$ 40, carry 4 bps e as alíquotas atuais |
| `sem_spread` | spread cai para zero |
| `sem_tarifa_fixa` | tarifa fixa cai para zero |
| `iof_incerto_zero` | BENS/SERVIÇOS OUT e ATIVOS VIRTUAIS OUT caem para zero |
| `piso_sem_componentes_incertos` | zera spread, tarifa e os dois IOFs incertos; mantém carry em 4 bps |
| `carry_25bps` | carry sobe de 4 para 25 bps |
| `combinado_severo` | aplica o piso acima e carry de 25 bps |
| `sem_carry` | retira o carry para mostrar um limite superior simples |

O custo de oportunidade continua zero porque isso é decisão do desenho do produto,
não falta de calibração: o orquestrador não custodia o dinheiro durante a janela.

Resultado conservador em W=7. A tabela compara o p10 da hipótese atual, do piso e
do cenário combinado severo. Cada p10 é a décima pior entre 300 carteiras-ano.

| mix | N | base p10 | piso p10 | severo p10 |
|---|---:|---:|---:|---:|
| equilibrado | 8 | 116,8 | 34,1 | 17,4 |
| equilibrado | 12 | 113,3 | 47,4 | 30,6 |
| retail_pesado | 8 | 109,1 | 51,5 | 40,9 |
| retail_pesado | 12 | 109,6 | 47,1 | 37,0 |
| corporativo_pesado | 8 | 78,4 | 47,7 | 31,2 |
| corporativo_pesado | 12 | 94,1 | 64,1 | 45,7 |
| psp_dominante | 8 | 163,1 | 83,7 | 67,3 |
| psp_dominante | 12 | 181,3 | 81,0 | 62,7 |
| outbound_extremo | 8 | 22,5 | 7,9 | 3,9 |
| outbound_extremo | 12 | 20,6 | 7,0 | 3,5 |

Todas as 6.000 carteiras permaneceram positivas até no cenário combinado severo.
Isso mostra margem dentro destes testes, mas não prova viabilidade comercial: os
mixes e volumes continuam sintéticos e ainda pode existir custo não modelado.

O `outbound_extremo` é claramente o limite frágil. Em N=12/W=7, seu p10 cai para
3,5 bps no teste severo. Nos demais mixes, o menor p10 severo é 17,4 bps.

### Ponto de economia zero

O limite de carry foi calculado carteira por carteira, em vez de escolhido numa
grade arbitrária. No p10 de W=7:

| mix | N | carry que zera na base | carry que zera no piso |
|---|---:|---:|---:|
| equilibrado | 8 | 153,8 bps | 46,7 bps |
| equilibrado | 12 | 146,0 bps | 62,4 bps |
| retail_pesado | 8 | 228,0 bps | 103,3 bps |
| retail_pesado | 12 | 229,3 bps | 98,0 bps |
| corporativo_pesado | 8 | 101,1 bps | 62,8 bps |
| corporativo_pesado | 12 | 114,8 bps | 77,9 bps |
| psp_dominante | 8 | 220,7 bps | 109,8 bps |
| psp_dominante | 12 | 220,9 bps | 97,4 bps |
| outbound_extremo | 8 | 119,9 bps | 44,1 bps |
| outbound_extremo | 12 | 122,4 bps | 44,2 bps |

O carry atual suposto é 4 bps. Mesmo depois de retirar spread, tarifa e os dois
IOFs incertos, o menor limite p10 observado é aproximadamente 44 bps. Além disso,
o spread mínimo para manter o p90 positivo no piso é zero em todas as 20 células:
há economia residual proveniente das demais regras de IOF mantidas no modelo.

Esses limites devem ser recalculados quando chegarem os valores reais. Como a
alocação não depende dos parâmetros de preço, basta reprecificar os mesmos dados.

## Projeção em BRL com fluxos hipotéticos — fase 4

> **Aviso obrigatório:** todos os fluxos desta seção são suposições sintéticas.
> Eles não vieram da Amanda e não são volumes reais de Wise, Nomad, AstroPay ou
> bancos. Os valores em reais são projeções exploratórias e deverão ser
> substituídos quando chegar a carteira real.

Não existe divulgação pública comparável que informe quanto dessas empresas seria
enviado ao nosso orquestrador. A pesquisa encontrou referências de escala, mas não
o dado comercial necessário:

- a [Wise divulgou US$ 243,5 bilhões](https://owners.wise.com/news-releases/news-release-details/wise-fy26-results)
  de volume transfronteiriço global no FY26; o recorte Business somou
  aproximadamente US$ 70,6 bilhões nos quatro trimestres;
- a [Nomad informa 3,8 milhões de clientes, R$ 8 bilhões sob custódia e R$ 50
  bilhões gastos em cartão](https://www.nomadglobal.com/quem-somos), mas não
  apresenta fluxo anual de câmbio enviado por uma carteira candidata;
- a [AstroPay informa milhões de usuários](https://www.astropay.com/business),
  sem divulgar volume transacionado na página consultada;
- o [Banco Central publica rankings mensais por instituição](https://www.bcb.gov.br/estatisticas/rankingcambioinstituicoes?ano=2026),
  mas eles medem operações registradas pelas instituições financeiras, não o
  fluxo líquido que seria entregue ao produto.

Esses números foram usados somente para conferir se a escala sintética estava
claramente fora da realidade. Não foram usados como fluxo da projeção.

### Como o fluxo foi suposto

O caso central reaproveita exatamente os tickets, frequências e dispersões que já
geraram as carteiras da varredura. O valor esperado anual de cada arquétipo é:

```text
fluxo central = ticket mediano × exp(sigma² / 2) × cadência mensal × 12
```

| arquétipo | referência descritiva | fluxo central por cliente/ano |
|---|---|---:|
| remessa outbound massiva | Wise/serviços de remessa | R$ 8,6 mi |
| PSP inbound | AstroPay/PSPs | R$ 24,8 mi |
| cripto sem fiat | plataformas cripto | R$ 59,4 mi |
| folha/fornecedor | plataformas de pagamentos corporativos | R$ 43,5 mi |
| exportador | empresas exportadoras | R$ 36,8 mi |
| tesouraria corporativa | bancos e tesourarias | R$ 58,5 mi |

Foram aplicadas três faixas:

| faixa | volume usado | natureza |
|---|---:|---|
| baixa | 0,5 × o volume sintético | suposição de incerteza |
| central | 1,0 × o volume sintético | hipóteses atuais do gerador |
| alta | 2,0 × o volume sintético | suposição de incerteza |

Os multiplicadores 0,5 e 2,0 não vieram de informação pública nem da Amanda. Eles
servem para mostrar quanto o resultado em reais muda se o fluxo suposto estiver
pela metade ou pelo dobro. Ao redimensionar o volume, a análise corrige a tarifa
fixa em bps: dobrar tickets não dobra a quantidade de tarifas. Spread, IOF e carry
continuam proporcionais ao valor.

### Resultado com a faixa central

W=7. `fluxo p50` é a mediana do volume anual sintético entre 300 carteiras. Os
valores em reais abaixo são anuais e hipotéticos.

| mix | N | fluxo p50 suposto | base p50 | severo p10 | severo p50 |
|---|---:|---:|---:|---:|---:|
| equilibrado | 8 | R$ 332,7 mi | R$ 4,25 mi | R$ 0,56 mi | R$ 0,87 mi |
| equilibrado | 12 | R$ 470,6 mi | R$ 5,85 mi | R$ 1,43 mi | R$ 1,84 mi |
| retail_pesado | 8 | R$ 188,4 mi | R$ 2,32 mi | R$ 0,76 mi | R$ 0,90 mi |
| retail_pesado | 12 | R$ 274,7 mi | R$ 3,32 mi | R$ 1,02 mi | R$ 1,18 mi |
| corporativo_pesado | 8 | R$ 343,0 mi | R$ 3,21 mi | R$ 1,04 mi | R$ 1,54 mi |
| corporativo_pesado | 12 | R$ 546,3 mi | R$ 5,90 mi | R$ 2,43 mi | R$ 3,16 mi |
| psp_dominante | 8 | R$ 219,7 mi | R$ 3,92 mi | R$ 1,44 mi | R$ 1,72 mi |
| psp_dominante | 12 | R$ 337,3 mi | R$ 6,45 mi | R$ 2,10 mi | R$ 2,43 mi |
| outbound_extremo | 8 | R$ 264,0 mi | R$ 0,73 mi | R$ 0,11 mi | R$ 0,14 mi |
| outbound_extremo | 12 | R$ 368,3 mi | R$ 0,89 mi | R$ 0,13 mi | R$ 0,17 mi |

O `outbound_extremo` continua sendo o caso frágil também em reais. O PSP dominante
tem a maior economia, apesar de não ter o maior fluxo, porque sua composição casa
mais volume e evita mais custos.

Exemplo da incerteza de volume no `equilibrado`, N=12 e W=7:

| faixa | fluxo p50 suposto | base p50 | severo p10 | severo p50 |
|---|---:|---:|---:|---:|
| baixa | R$ 235,3 mi | R$ 2,95 mi | R$ 0,71 mi | R$ 0,92 mi |
| central | R$ 470,6 mi | R$ 5,85 mi | R$ 1,43 mi | R$ 1,84 mi |
| alta | R$ 941,1 mi | R$ 11,63 mi | R$ 2,86 mi | R$ 3,68 mi |

Essa tabela não prevê receita nem volume capturável. Ela apenas converte a
economia técnica em BRL para três escalas explicitamente assumidas.

## O que falta para virar material calibrado da Amanda

Três dados substituem os placeholders:

1. spread real do rail/parceiro, em bps;
2. tarifa fixa real por remessa;
3. alíquotas confirmadas de BENS/SERVIÇOS OUT e ATIVOS_VIRTUAIS OUT;
4. fluxo anual líquido real da carteira candidata, por tipo de cliente.

Com os três primeiros valores, a reprecificação é direta e não exige nova
varredura. Com o quarto, substituímos as faixas sintéticas e publicamos a projeção
em BRL como estimativa calibrada. Até lá, os números em reais desta fase devem ser
apresentados sempre como hipótese, nunca como dado da Amanda ou das empresas.

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
- `scripts/estresse_sensibilidade.py` — reprecifica os cenários e calcula o ponto de economia zero.
- `resultados/sensibilidade/cenarios_estresse_bruta.csv` — 48.000 combinações de carteira e cenário.
- `resultados/sensibilidade/cenarios_estresse_agregada.csv` — 160 células de cenário.
- `resultados/sensibilidade/limites_break_even_bruta.csv` — limites nas 6.000 carteiras.
- `resultados/sensibilidade/limites_break_even_agregada.csv` — 20 células de limites.
- `scripts/projecao_fluxo_hipotetico.py` — aplica faixas de fluxo e converte bps para BRL.
- `resultados/sensibilidade/referencias_fluxo_publicas.csv` — referências públicas e limitações.
- `resultados/sensibilidade/premissas_fluxo_arquetipos.csv` — fluxo suposto por arquétipo e faixa.
- `resultados/sensibilidade/projecao_fluxo_hipotetico_bruta.csv` — 144.000 projeções detalhadas.
- `resultados/sensibilidade/projecao_fluxo_hipotetico_agregada.csv` — 480 células resumidas.

Reprodução:

```bash
python -m scripts.sensibilidade_custo --saida resultados/sensibilidade --n 8,12 --w 1,7 --sementes 1:300
python -m scripts.estresse_sensibilidade --saida resultados/sensibilidade
python -m scripts.projecao_fluxo_hipotetico --saida resultados/sensibilidade
```
