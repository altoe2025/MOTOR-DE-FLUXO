# Relatório da varredura completa — 2026-09-07

> **Nível absoluto NÃO é cotação.** Duas células da tabela de alíquotas carregam 34,5%
> do volume e não foram verificadas em norma: `ANEXO_V_BENS_SERVICOS` OUT (0,38% no
> código, com comentário admitindo que bens — isento — e serviços foram colapsados na
> mesma finalidade) e `ANEXO_V_ATIVOS_VIRTUAIS` OUT (3,5% por *fallback*, marcado
> `INCERTO` no próprio código). A margem de erro do nível é de cerca de 2×. **A forma
> das curvas não depende dessas células.** Todo número abaixo é forma, não preço.

Este documento é autocontido: quem o lê não precisa da conversa em que a varredura foi
rodada. Reproduz-se com `PYTHONPATH=. python scripts/varredura_completa.py`.

## O achado que muda a conversa

**Na ponta OUT-pesada do mercado, a economia colapsa.** O mix `outbound_extremo`
(9,5% de volume IN) rende **24 bps**, contra 121 do `retail_pesado` (28% IN) e 191 do
`psp_dominante` (53% IN). Não é uma queda gradual: é um quinto do valor.

Isso importa porque a primeira rodada desta varredura, feita antes de `outbound_extremo`
existir, tinha como mix mais OUT-pesado o `retail_pesado`, em 28% de IN — e o mercado
que o produto vai encontrar é estruturalmente mais OUT que isso. A grade estava medindo
uma região confortável e deixando a região desconfortável de fora.

A leitura correta é mecânica, não pessimista: netting multilateral **precisa de
contraparte**. Numa carteira em que quase todo mundo manda dinheiro para fora e quase
ninguém recebe, não há o que casar, e o produto não tem de onde tirar valor. A tese do
produto não é "juntar volume"; é **juntar volume dos dois lados**. Onde estiver o ponto
real do mercado nesse eixo é a pergunta comercial mais cara em aberto.

## O que foi medido

Grade fatorial completa e balanceada, com sementes pareadas:

| Eixo | Valores |
|---|---|
| `mix` | os 5 de `motor/mixes.py` |
| `N` (clientes) | 2, 3, 4, 6, 8, 12, 16, 24, 32 |
| `W` (janela) | 1, 7 |
| semente | 1..300, **as mesmas em todos os pontos** |
| horizonte | 365 dias |

5 × 9 × 2 × 300 = **27.000 rodadas**, todas presentes no CSV bruto.

O pareamento importa: a pool de um `(mix, N, semente)` é gerada **uma vez** e reusada
nos dois W. Com sementes diferentes por W, a variação entre pools abafaria o efeito da
janela e a comparação não responderia nada.

Saídas em `resultados/`:

- `varredura_bruta.csv` — 27.000 linhas, todas as colunas do motor mais `economia_bps`
  e `fracao_in_realizada`.
- `varredura_agregada.csv` — 90 linhas, uma por `(mix, N, W)`, com as 300 sementes
  colapsadas em p10/p50/p90.

O **p10** é a métrica de decisão, não a média: a promessa comercial do produto é sobre
o mês ruim. "Você economiza X em 9 de cada 10 meses" é uma frase que se pode dizer a um
cliente; a média, não.

## Duas verificações feitas antes de disparar

**Custo de uma rodada.** N=12/W=7 leva 0,031 s de simulação e **0,504 s de geração de
pool** — 94% do custo da grade é gerar ordens, não simular.

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

## Os mixes e o eixo direcional

O rótulo do mix não diz onde ele cai no eixo direcional; a fração de volume IN
realizada, sim. Medida sobre as pools efetivamente geradas, ponderada por volume.

| mix | fração IN | posição |
|---|---:|---|
| `outbound_extremo` | 0,095 | a ponta OUT |
| `retail_pesado` | 0,284 | OUT-pesado |
| `equilibrado` | 0,436 | meio |
| `corporativo_pesado` | 0,510 | equilibrado |
| `psp_dominante` | 0,527 | equilibrado |

`corporativo_pesado` e `psp_dominante` ocupam praticamente o mesmo ponto (0,51 vs
0,53), então o eixo tem quatro posições distintas, não cinco.

O piso do que os arquétipos permitem é ~4,8% de IN (carteira só de
`payroll_fornecedor`, `p_out` 0,95). `outbound_extremo` para em 9,5% de propósito: com
`retail_pesado` em 28%, os dois **bracketam** a faixa OUT-pesada, e um mercado real em
15% ou 20% fica entre dois pontos medidos em vez de exigir extrapolação.

**A fração IN é o driver dominante, mas não é o único.** `corporativo_pesado` (0,510)
rende 108 bps e `equilibrado` (0,436) rende 125 — o mais equilibrado dos dois rende
menos. Prazo e ticket também entram, e o eixo direcional sozinho não prevê o resultado.

## Curva N — quantos clientes bastam

`economia_bps_p10`, W=7. É o piso: 9 em cada 10 sementes ficam acima.

| N | outbound_extremo | retail_pesado | equilibrado | corporativo_pesado | psp_dominante |
|---:|---:|---:|---:|---:|---:|
| 2 | 9,2 | 51,8 | 82,4 | 62,7 | 83,0 |
| 3 | 6,6 | 61,5 | 55,0 | 49,8 | 98,2 |
| 4 | 11,1 | 70,0 | 77,8 | 55,6 | 150,0 |
| 6 | 12,1 | 75,8 | 98,5 | 69,1 | 163,7 |
| 8 | 22,5 | 109,1 | 116,8 | 78,4 | 163,1 |
| 12 | 20,6 | 109,5 | 113,3 | 94,1 | 181,3 |
| 16 | 18,9 | 110,1 | 112,3 | 88,1 | 163,2 |
| 24 | 22,6 | 103,9 | 120,3 | 105,1 | 178,1 |
| 32 | 25,3 | 111,4 | 127,6 | 102,6 | 185,8 |

**A curva satura em N≈8.** De N=2 a N=8 o p10 tipicamente dobra; de N=8 a N=32 anda
pouco e não monotonicamente. Netting multilateral não precisa de escala grande —
precisa de contraparte, e ~8 clientes já bastam para achá-la. **Escala não compra o que
falta em `outbound_extremo`:** de N=8 a N=32 ele sai de 22 para 25 bps. Se não há
contraparte na carteira, mais clientes do mesmo lado não criam nenhuma.

Para *previsibilidade* é preciso um pouco mais que N=8: abaixo disso a faixa p10–p90
passa de 30% da mediana, o que torna qualquer promessa vazia. **N=12 é o menor ponto em
que nível e previsibilidade valem juntos.**

Cuidado com N=2 e N=3: a fração IN realizada nesses pontos foge do mix pedido. Pool
pequena não representa a composição, e essas linhas dizem mais sobre a amostra que
sobre o mix.

## Espera — o preço que o cliente paga

No ponto N=12, W=7 (mediana entre as 300 sementes do p90 ponderado por volume):

| mix | economia p50 | faixa p10–p90 | p90 casado | p90 remetido | volume truncado |
|---|---:|---:|---:|---:|---:|
| outbound_extremo | 24 bps | 32,3% | 8 dias | 10 dias | 1,35% |
| retail_pesado | 121 bps | 18,9% | **4 dias** | 6 dias | 0,75% |
| equilibrado | 125 bps | 17,7% | 10 dias | 18 dias | 2,84% |
| corporativo_pesado | 108 bps | 24,5% | 17 dias | 23 dias | 4,04% |
| psp_dominante | **191 bps** | 9,5% | 18 dias | 26 dias | 3,96% |

**O mix mais lucrativo é também o mais lento**, e a razão é a mesma nos dois casos: os
arquétipos corporativos têm `buffer_dias` longo, então dão folga ao netting *e* esperam
mais. `psp_dominante` rende 191 bps ao custo de 18 dias de espera no p90;
`retail_pesado` rende 121 bps com 4 dias. Não é uma escolha de configuração — é uma
escolha de cliente-alvo.

`outbound_extremo` é o pior dos dois mundos em miniatura: rende pouco **e** ainda cobra
8 dias. A espera existe porque o motor segura a ordem procurando contraparte; quando ela
não aparece, o cliente esperou de graça.

O p90 do volume **remetido** é sempre maior que o do casado. Essa é espera que não
comprou nada: o volume esperou e atravessou a fronteira assim mesmo.

`pct_volume_espera_truncada` é efeito de borda do horizonte: ordens com `dia_limite`
além dos 365 dias são drenadas no último dia, então a espera delas sai menor do que
seria. Acima de ~4% os números de tempo daquela linha devem ser lidos como piso.

## Decomposição de variância de `economia_bps`

ANOVA sobre as 27.000 linhas. Desenho balanceado, então a soma de quadrados se separa
direto. A semente **não** é um eixo a atribuir: é o resíduo dentro da célula.

| Fonte | Fração da variância |
|---|---:|
| `mix` | **81,90%** |
| `N` | **10,78%** |
| `mix × N` | 3,68% |
| resíduo (semente) | 3,63% |
| `mix × W` | 0,005% |
| `W` | **0,003%** |
| `N × W` | 0,001% |

Desvio-padrão de `economia_bps`: 51,48.

**`W`, `mix × W` e `N × W` explicam menos de 1% cada — juntos, menos de 0,01%.** A
janela é irrelevante para o resultado. Isso confirma, em 27.000 rodadas e cinco mixes,
o que uma medição pareada anterior de 30 sementes já indicava num mix só: acima de W=7
a janela não morde, porque o fechamento é sempre disparado por vencimento de ordem, não
pelo relógio da janela.

O domínio do mix **cresceu** de 58,6% para 81,9% quando `outbound_extremo` entrou, e o
resíduo caiu de 8,3% para 3,6%. Não é que o mix tenha passado a importar mais: é que a
grade antiga não continha a ponta em que ele importa. Uma decomposição de variância só
enxerga a região que foi amostrada.

### O que perguntar à interlocutora, em ordem

Tradução prática da tabela acima — o objetivo é substituir "manda tudo que você tiver"
por um pedido curto e justificado.

1. **O split direcional dos clientes candidatos** — que fração do volume de cada um é
   IN vs OUT. Explica ~82% do resultado sozinho, e é onde a economia varia de 24 a 191
   bps. Se a carteira real ficar perto de `outbound_extremo`, **a tese do produto muda
   de dono**, e é melhor saber disso antes de construir.
2. **Quantos clientes entram na primeira leva, e o ticket de cada um.** Explica ~11%.
   Basta saber se são 3, 8 ou 20 — a diferença entre 24 e 32 não muda nada.
3. **A tolerância de prazo real de cada arquétipo** (`buffer_dias`). Não aparece na
   tabela porque não foi varrido, mas é o que determina a coluna de espera, e a espera
   é o que o cliente sente.
4. **Não perguntar sobre cadência operacional nem sobre com que frequência o ciclo
   fecha.** É o eixo W, e ele explica 0,003%. Perguntar isso gasta capital de relação
   por um dado que não muda nenhuma decisão.

## Limites deste resultado

- **Nível ≠ cotação**, pela ressalva do topo. Duas alíquotas com 34,5% do volume não
  foram verificadas em norma.
- **Onde o mercado real cai no eixo direcional continua desconhecido.** A grade agora
  cobre de 9,5% a 52,7% de IN, então há ponto medido nos dois extremos — mas qual deles
  descreve a carteira da interlocutora é dado que não temos. É a pergunta nº 1 acima.
- **Arquétipos e pesos de mix são placeholders declarados**, não calibração de mercado
  (`AGENTS.md`, `motor/arquetipos.py`). A varredura mede o comportamento do modelo.
- **`p_out` é sorteado por ordem, não por cliente**, então há autonetting embutido. A
  economia em bps deste relatório **não** desconta o autonetting; quem precisa do piso
  do valor incremental usa `taxa_netabilidade_incremental`.
- **W=1 vs W=7 troca de sinal conforme o mix.** Como o eixo explica 0,003% da variância,
  isso é ruído, não achado — mas invalida a leitura de que "W=1 é sempre pior".
- **A validade regulatória do mecanismo está fora do código.** O simulador quantifica a
  economia *caso* o mecanismo seja válido; ele não decide se é.

## Procedência

- `scripts/varredura_completa.py` — a grade e os dois CSVs.
- `scripts/projecao_varredura.py` — cronometragem e fração IN por mix.
- `scripts/varredura_janela.py` — a medição pareada de 30 sementes que reduziu o eixo W.
- `scripts/diagnostico_custo.py` — a decomposição da economia em IOF, spread, custo
  fixo e custo interno.
- `docs/dicionario-csv.md` — o significado de cada coluna.

Nada em `motor/netting.py`, `motor/custo.py` ou na tabela de alíquotas foi alterado por
esta medição. A única mudança de motor associada a ela é o mix `outbound_extremo`, em
`motor/mixes.py`.
