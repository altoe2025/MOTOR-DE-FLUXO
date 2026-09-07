# Relatório da varredura completa — 2026-09-07

> **Nível absoluto NÃO é cotação.** Duas células da tabela de alíquotas carregam 34,5%
> do volume e não foram verificadas em norma: `ANEXO_V_BENS_SERVICOS` OUT (0,38% no
> código, com comentário admitindo que bens — isento — e serviços foram colapsados na
> mesma finalidade) e `ANEXO_V_ATIVOS_VIRTUAIS` OUT (3,5% por *fallback*, marcado
> `INCERTO` no próprio código). A margem de erro do nível é de cerca de 2×. **A forma
> das curvas não depende dessas células.** Todo número abaixo é forma, não preço.

Este documento é autocontido: quem o lê não precisa da conversa em que a varredura foi
rodada. Reproduz-se com `PYTHONPATH=. python scripts/varredura_completa.py`.

## O que foi medido

Grade fatorial completa e balanceada, com sementes pareadas:

| Eixo | Valores |
|---|---|
| `mix` | os 4 de `motor/mixes.py` (ver ressalva abaixo) |
| `N` (clientes) | 2, 3, 4, 6, 8, 12, 16, 24, 32 |
| `W` (janela) | 1, 7 |
| semente | 1..300, **as mesmas em todos os pontos** |
| horizonte | 365 dias |

4 × 9 × 2 × 300 = **21.600 rodadas**, todas presentes no CSV bruto.

O pareamento importa: a pool de um `(mix, N, semente)` é gerada **uma vez** e reusada
nos dois W. Com sementes diferentes por W, a variação entre pools abafaria o efeito da
janela e a comparação não responderia nada.

Saídas em `resultados/`:

- `varredura_bruta.csv` — 21.600 linhas, todas as colunas do motor mais `economia_bps`
  e `fracao_in_realizada`.
- `varredura_agregada.csv` — 72 linhas, uma por `(mix, N, W)`, com as 300 sementes
  colapsadas em p10/p50/p90.

O **p10** é a métrica de decisão, não a média: a promessa comercial do produto é sobre
o mês ruim. "Você economiza X em 9 de cada 10 meses" é uma frase que se pode dizer a um
cliente; a média, não.

## Duas verificações feitas antes de disparar

**Custo de uma rodada.** N=12/W=7 leva 0,031 s de simulação e **0,504 s de geração de
pool** — 94% do custo da grade é gerar ordens, não simular. Projeção de 1,68 h,
abaixo do teto de 3 h combinado; a execução real ficou dentro disso.

**Base de cálculo da netabilidade — a suspeita de inflação não se confirma.**
`taxa_netabilidade = volume_casado_brl / volume_bruto_brl`, e
`tests/test_varredura.py::test_as_colunas_de_volume_do_ponto_fecham_entre_si` prova que
`casado + resíduo == bruto` em toda célula. Mesma base nos dois lados; o teto é 100%
(`teto = 1 − |out−in| / total`, que vale 1 numa carteira direcionalmente equilibrada).

A expressão "duas pernas" do `docs/dicionario-csv.md` se refere a `ciclo.casado`, que é
grandeza de **um** lado e precisa ser dobrada para chegar à base das alocações. O volume
bruto já conta o `valor_brl` de cada ordem uma vez, e a ordem OUT e sua contraparte IN
são **duas ordens distintas**, ambas no denominador.

A ressalva real de netabilidade é outra, e já está medida: **autonetting** — o cliente
que casa o próprio fluxo de duas pontas, sem precisar de produto nenhum. É o que a
coluna `taxa_netabilidade_incremental` isola. **Em conversa comercial use a
incremental, nunca a bruta.**

## Os mixes: quatro, não cinco, e três posições

`motor/mixes.py` tem quatro mixes. Um quinto exigiria editar o motor, o que estava fora
do escopo desta medição. O rótulo do mix não diz onde ele cai no eixo direcional; a
fração de volume IN realizada, sim.

| mix | fração IN (mediana) | faixa | posição |
|---|---:|---|---|
| `retail_pesado` | 0,280 | 0,184–0,337 | o mais OUT-pesado |
| `equilibrado` | 0,448 | 0,408–0,498 | meio |
| `corporativo_pesado` | 0,523 | 0,462–0,664 | equilibrado |
| `psp_dominante` | 0,528 | 0,495–0,585 | equilibrado |

**`corporativo_pesado` e `psp_dominante` ocupam praticamente o mesmo ponto da curva**
(0,52 vs 0,53). A grade tem três posições direcionais, não quatro — e, mais importante,
**nenhum mix chega perto de um mercado OUT-pesado real**: o mais extremo disponível
ainda tem 28% de IN. Ver "Limites" no fim.

## Curva N — quantos clientes bastam

`economia_bps_p10`, W=7. É o piso: 9 em cada 10 sementes ficam acima.

| N | retail_pesado | equilibrado | corporativo_pesado | psp_dominante |
|---:|---:|---:|---:|---:|
| 2 | 51,8 | 82,4 | 62,7 | 83,0 |
| 3 | 61,5 | 55,0 | 49,8 | 98,2 |
| 4 | 70,0 | 77,8 | 55,7 | 150,0 |
| 6 | 75,8 | 98,5 | 69,1 | 163,7 |
| 8 | 109,1 | 116,8 | 78,4 | 163,1 |
| 12 | 109,6 | 113,3 | 94,1 | 181,3 |
| 16 | 110,1 | 112,3 | 88,1 | 163,2 |
| 24 | 103,9 | 120,3 | 105,1 | 178,1 |
| 32 | 111,4 | 127,6 | 102,6 | 185,8 |

**A curva satura em N≈8.** De N=2 a N=8 o p10 dobra; de N=8 a N=32 ele anda pouco e não
monotonicamente. Netting multilateral não precisa de escala grande — precisa de
contraparte, e ~8 clientes já bastam para achá-la.

A dispersão, essa, continua caindo com N. Largura da faixa p10–p90 relativa à mediana:

| N | retail | equilibrado | corporativo | psp |
|---:|---:|---:|---:|---:|
| 2 | 21,8% | 37,3% | 59,6% | 54,9% |
| 4 | 28,3% | 27,4% | 46,8% | 16,9% |
| 8 | 21,8% | 16,8% | 32,2% | 16,3% |
| 12 | 18,9% | 17,7% | 24,5% | 9,5% |
| 32 | 13,4% | 11,7% | 12,5% | 5,8% |

**A resposta à pergunta "quantos clientes" tem duas partes.** Para o *nível* da
economia, N≈8. Para *previsibilidade* — poder prometer um número a um cliente — é
preciso mais: abaixo de N=8 a faixa passa de 30% da mediana, o que torna qualquer
promessa vazia. **N=12 é o menor ponto em que as duas coisas valem.**

Cuidado com N=2 e N=3: a fração IN realizada nesses pontos foge do mix
(`retail_pesado` N=2 realiza 0,101 de IN, não 0,280). Pool pequena não representa a
composição pedida, e os números dessas linhas dizem mais sobre a amostra que sobre o
mix.

## Espera — o preço que o cliente paga

No ponto N=12, W=7 (mediana entre as 300 sementes do p90 ponderado por volume):

| mix | p90 volume casado | p90 volume remetido | volume truncado |
|---|---:|---:|---:|
| retail_pesado | **4 dias** | 6 dias | 0,75% |
| equilibrado | 10 dias | 18 dias | 2,84% |
| corporativo_pesado | 17 dias | 23 dias | 4,04% |
| psp_dominante | 18 dias | 26 dias | 3,96% |

**Este é o achado que mais muda a conversa de produto.** O mix mais lucrativo é também
o mais lento, e a razão é a mesma nos dois casos: os arquétipos corporativos têm
`buffer_dias` longo, então dão folga ao netting *e* esperam mais. `psp_dominante` rende
191 bps de mediana ao custo de 18 dias de espera no p90; `retail_pesado` rende 119 bps
com 4 dias. Não é uma escolha de configuração — é uma escolha de cliente-alvo.

O p90 do volume **remetido** é sempre maior que o do casado. Essa é espera que não
comprou nada: o volume esperou e atravessou a fronteira assim mesmo.

`pct_volume_espera_truncada` fica entre 0,2% e 6,3% (mais alto em pools pequenas e nos
mixes de prazo longo). É efeito de borda do horizonte: ordens com `dia_limite` além dos
365 dias são drenadas no último dia, então a espera delas sai menor do que seria. Acima
de ~4% os números de tempo daquela linha devem ser lidos como piso.

## Decomposição de variância de `economia_bps`

ANOVA sobre as 21.600 linhas. Desenho balanceado, então a soma de quadrados se separa
direto. A semente **não** é um eixo a atribuir: é o resíduo dentro da célula.

| Fonte | Fração da variância |
|---|---:|
| `mix` | **58,55%** |
| `N` | **27,43%** |
| resíduo (semente) | 8,29% |
| `mix × N` | 5,70% |
| `mix × W` | 0,010% |
| `W` | **0,008%** |
| `N × W` | 0,003% |

Desvio-padrão de `economia_bps`: 37,67.

**`W`, `mix × W` e `N × W` explicam menos de 1% cada — juntos, menos de 0,03%.** A
janela é irrelevante para o resultado. Isso confirma, em 21.600 rodadas e quatro mixes,
o que uma medição pareada anterior de 30 sementes já indicava num mix só: acima de W=7
a janela não morde, porque o fechamento é sempre disparado por vencimento de ordem, não
pelo relógio da janela.

### O que perguntar à interlocutora, em ordem

Esta é a tradução prática da tabela acima — o objetivo é substituir "manda tudo que
você tiver" por um pedido curto e justificado.

1. **O split direcional dos clientes candidatos** (que fração do volume de cada um é
   IN vs OUT). Explica ~59% do resultado sozinho, e é o único eixo em que o modelo
   ainda extrapola — nenhum mix disponível cobre um mercado com menos de 18% de IN.
2. **Quantos clientes entram na primeira leva, e o ticket de cada um.** Explica ~27%.
   Basta saber se são 3, 8 ou 20 — a diferença entre 24 e 32 não muda nada.
3. **A tolerância de prazo real de cada arquétipo** (`buffer_dias`). Não aparece na
   tabela porque não foi varrido, mas é o que determina a coluna de espera, e a espera
   é o que o cliente sente.
4. **Não perguntar sobre cadência operacional nem sobre com que frequência o ciclo
   fecha.** É o eixo W, e ele explica 0,008%. Perguntar isso gasta capital de relação
   com a interlocutora por um dado que não muda nenhuma decisão.

## Limites deste resultado

- **Nível ≠ cotação**, pela ressalva do topo. Duas alíquotas com 34,5% do volume não
  foram verificadas em norma.
- **Nenhum mix é OUT-pesado o bastante.** O mais extremo tem 28% de IN, e o mercado que
  o produto vai encontrar é estruturalmente mais OUT que isso. Toda a curva pode estar
  medindo uma região que não existe comercialmente. **Esta é a maior lacuna.**
- **Arquétipos e pesos de mix são placeholders declarados**, não calibração de mercado
  (`AGENTS.md`, `motor/arquetipos.py`). A varredura mede o comportamento do modelo.
- **`p_out` é sorteado por ordem, não por cliente**, então há autonetting embutido. A
  coluna `taxa_netabilidade_incremental` mede o piso do valor que o motor de fato
  adiciona; a economia em bps deste relatório **não** desconta o autonetting.
- **W=1 vs W=7 troca de sinal conforme o mix** (em `corporativo_pesado` o p10 de W=1 é
  marginalmente maior). Como o eixo explica 0,008% da variância, isso é ruído, não
  achado — mas invalida a leitura de que "W=1 é sempre pior".
- **A validade regulatória do mecanismo está fora do código.** O simulador quantifica a
  economia *caso* o mecanismo seja válido; ele não decide se é.

## Procedência

- `scripts/varredura_completa.py` — a grade e os dois CSVs.
- `scripts/projecao_varredura.py` — cronometragem e fração IN por mix.
- `scripts/varredura_janela.py` — a medição pareada de 30 sementes que reduziu o eixo W.
- `scripts/diagnostico_custo.py` — a decomposição da economia em IOF, spread, custo
  fixo e custo interno.
- `docs/dicionario-csv.md` — o significado de cada coluna.

Nada em `motor/` foi alterado por esta medição.
