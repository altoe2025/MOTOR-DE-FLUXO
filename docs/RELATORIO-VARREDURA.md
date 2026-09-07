# Relatório da varredura completa — 2026-09-07

> **Nível absoluto NÃO é cotação.** Duas células da tabela de alíquotas carregam 34,5%
> do volume e não foram verificadas em norma: `ANEXO_V_BENS_SERVICOS` OUT (0,38% no
> código, com comentário admitindo que bens — isento — e serviços foram colapsados na
> mesma finalidade) e `ANEXO_V_ATIVOS_VIRTUAIS` OUT (3,5% por *fallback*, marcado
> `INCERTO` no próprio código). A margem de erro do nível é de cerca de 2×. **A forma
> das curvas não depende dessas células.** Todo número abaixo é forma, não preço.

Este documento é autocontido: quem o lê não precisa da conversa em que a varredura foi
rodada. Reproduz-se com `PYTHONPATH=. python scripts/varredura_completa.py`.

Uma revisão externa de 2026-09-07 encontrou quatro afirmações desta análise que iam
além do que os dados sustentam. Estão corrigidas abaixo, e a seção
"[O que uma revisão externa corrigiu](#o-que-uma-revisão-externa-corrigiu)" registra o
que mudou — a versão anterior circulou e é preciso poder distingui-la.

## O achado que muda a conversa

**Na ponta OUT-pesada do mercado, o produto não adiciona valor nenhum.**

Não é que a economia caia: é que a economia que sobra **não pertence ao produto**. O
mix `outbound_extremo` (9,5% de volume IN) mostra 24 bps de economia bruta, mas seu
**netting incremental é zero em 300 das 300 sementes**. Todo o casamento ali é
autonetting — clientes casando o próprio fluxo de duas pontas na tesouraria deles, o
que eles fariam sozinhos, sem produto nenhum.

| mix | fração IN | economia bruta p50 | netabilidade bruta | **netting incremental** |
|---|---:|---:|---:|---:|
| `outbound_extremo` | 0,095 | 24 bps | 0,191 | **0,000** |
| `retail_pesado` | 0,284 | 121 bps | 0,535 | **0,037** |
| `equilibrado` | 0,436 | 125 bps | 0,827 | 0,347 |
| `corporativo_pesado` | 0,510 | 108 bps | 0,888 | 0,434 |
| `psp_dominante` | 0,527 | 191 bps | 0,881 | 0,299 |

(N=12, W=7, mediana entre 300 sementes.)

O colapso é mais abrupto na coluna que interessa do que na economia bruta. De
`equilibrado` para `retail_pesado` a economia bruta cai 3%, mas o incremental cai de
0,347 para 0,037 — **quase 10×**. A economia bruta esconde a queda porque o
autonetting cresce à medida que o netting multilateral desaparece.

A leitura é mecânica, não pessimista: netting multilateral **precisa de contraparte**.
Numa carteira em que quase todo mundo manda dinheiro para fora e quase ninguém recebe,
não há o que casar entre clientes diferentes, e o produto não tem de onde tirar valor.
A tese não é "juntar volume"; é **juntar volume dos dois lados**.

**Toda economia em bps neste documento é bruta e inclui autonetting.** Em conversa
comercial, use a coluna incremental. A conversão exata de netabilidade incremental para
bps exigiria reprecificar só as alocações incrementais, o que o motor hoje não faz — é
trabalho em aberto, e sem ele o valor comercial do produto não tem número próprio.

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

Saídas em `resultados/`: `varredura_bruta.csv` (27.000 linhas) e
`varredura_agregada.csv` (90 linhas, uma por `(mix, N, W)`).

**O que uma semente é, e o que o p10 significa.** Cada semente é **uma carteira
sintética inteira ao longo de 365 dias**, não um mês nem um período de operação. O p10
descreve a décima pior dessas 300 carteiras-ano. Ele é a métrica de decisão porque a
média esconde a cauda, mas a frase que ele autoriza é *"em 9 de cada 10 carteiras com
esta composição"* — **não** "em 9 de cada 10 meses". Nada nesta grade mede variação
mês a mês dentro de uma carteira; para isso seria preciso um eixo temporal que não foi
varrido.

## Duas verificações feitas antes de disparar

**Custo de uma rodada.** N=12/W=7 leva 0,031 s de simulação e **0,504 s de geração de
pool** — 94% do custo da grade é gerar ordens, não simular.

**Base de cálculo da netabilidade — a suspeita de inflação não se confirma.**
`taxa_netabilidade = volume_casado_brl / volume_bruto_brl`, e
`tests/test_varredura.py::test_as_colunas_de_volume_do_ponto_fecham_entre_si` prova que
`casado + resíduo == bruto` em toda célula. Mesma base nos dois lados; o teto é 100%.

A expressão "duas pernas" do `docs/dicionario-csv.md` se refere a `ciclo.casado`, que é
grandeza de **um** lado e precisa ser dobrada para chegar à base das alocações. O volume
bruto já conta o `valor_brl` de cada ordem uma vez, e a ordem OUT e sua contraparte IN
são **duas ordens distintas**, ambas no denominador.

A inflação real é o autonetting, tratada na primeira seção.

## Os mixes e o eixo direcional

O rótulo do mix não diz onde ele cai no eixo direcional; a fração de volume IN
realizada, sim. Medida sobre as pools efetivamente geradas, ponderada por volume.

`corporativo_pesado` (0,510) e `psp_dominante` (0,527) ocupam praticamente o mesmo
ponto, então o eixo tem quatro posições distintas, não cinco.

O piso do que os arquétipos permitem é ~4,8% de IN (carteira só de
`payroll_fornecedor`, `p_out` 0,95). `outbound_extremo` para em 9,5% de propósito: com
`retail_pesado` em 28%, os dois **bracketam** a faixa OUT-pesada, e um mercado real em
15% ou 20% fica entre dois pontos medidos em vez de exigir extrapolação.

**A fração IN não é o único driver, e nem chega perto de explicar tudo.** Uma regressão
de `economia_bps` sobre `fracao_in_realizada` nas 27.000 linhas dá **R² de 50,7%**
(64,9% com termo quadrático). O restante vem de ticket, cadência, prazo e finalidade,
que mudam junto com o mix. `corporativo_pesado` (0,510 de IN) rende 108 bps e
`equilibrado` (0,436) rende 125 — o mais equilibrado dos dois rende *menos*.

## Curva N — quantos clientes bastam

`economia_bps_p10` (bruta, inclui autonetting), W=7.

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
precisa de contraparte, e ~8 clientes já bastam para achá-la.

**Escala não compra o que falta em `outbound_extremo`:** de N=8 a N=32 ele sai de 22
para 25 bps, e o incremental permanece zero em toda a faixa. Mais clientes do mesmo
lado não criam contraparte.

Sobre previsibilidade, a faixa p10–p90 relativa à mediana estreita com N, mas **o ponto
em que ela fica utilizável depende do mix**:

| N | outbound_extremo | retail_pesado | equilibrado | corporativo_pesado | psp_dominante |
|---:|---:|---:|---:|---:|---:|
| 8 | — | 21,8% | 16,8% | 32,2% | 16,3% |
| 12 | **32,3%** | 18,9% | 17,7% | 24,5% | 9,5% |
| 32 | — | 13,4% | 11,7% | 12,5% | 5,8% |

`psp_dominante` já está em 9,5% com N=12; `outbound_extremo` ainda está em 32,3% no
mesmo ponto, e `corporativo_pesado` em 24,5%. **Não existe um N universal.** Para os
mixes com contraparte, N≈12 entrega nível e previsibilidade juntos; para os
OUT-pesados, nenhum N testado entrega previsibilidade — o que é coerente com o
incremental ser zero, já que o que se está medindo ali é ruído de autonetting.

Cuidado com N=2 e N=3: a fração IN realizada nesses pontos foge do mix pedido. Pool
pequena não representa a composição, e essas linhas dizem mais sobre a amostra que
sobre o mix.

## Espera — o preço que o cliente paga

No ponto N=12, W=7 (mediana entre as 300 sementes do p90 ponderado por volume):

| mix | economia bruta p50 | incremental | p90 casado | p90 remetido | volume truncado |
|---|---:|---:|---:|---:|---:|
| outbound_extremo | 24 bps | 0,000 | 8 dias | 10 dias | 1,28% |
| retail_pesado | 121 bps | 0,037 | **4 dias** | 6 dias | 0,30% |
| equilibrado | 125 bps | 0,347 | 10 dias | 18 dias | 0,84% |
| corporativo_pesado | 108 bps | 0,434 | 17 dias | 23 dias | 1,97% |
| psp_dominante | **191 bps** | 0,299 | 18 dias | 26 dias | 1,50% |

**O mix mais lucrativo é também o mais lento**, e a razão é a mesma nos dois casos: os
arquétipos corporativos têm `buffer_dias` longo, então dão folga ao netting *e* esperam
mais. `psp_dominante` rende 191 bps ao custo de 18 dias de espera no p90;
`retail_pesado` rende 121 bps com 4 dias. Não é uma escolha de configuração — é uma
escolha de cliente-alvo.

`outbound_extremo` é o pior dos dois mundos: incremental zero **e** ainda cobra 8 dias.
A espera existe porque o motor segura a ordem procurando contraparte; quando ela não
aparece, o cliente esperou de graça.

O p90 do volume **remetido** é sempre maior que o do casado. Essa é espera que não
comprou nada: o volume esperou e atravessou a fronteira assim mesmo.

`pct_volume_espera_truncada` mede o volume **drenado pela borda** — resolvido no último
dia da simulação por ordens cujo prazo ainda estava à frente, e cuja espera portanto
saiu menor do que teria sido. Fica entre 0,3% e 2,0%, baixo o bastante para não
comprometer os prazos acima.

## Decomposição de variância de `economia_bps`

ANOVA sobre as 27.000 linhas. Desenho balanceado, então a soma de quadrados se separa
direto. A semente **não** é um eixo a atribuir: é o resíduo dentro da célula.

| Fonte | Fração da variância |
|---|---:|
| `mix` (fator categórico) | **81,90%** |
| `N` | **10,78%** |
| `mix × N` | 3,68% |
| resíduo (semente) | 3,63% |
| `mix × W` | 0,005% |
| `W` | **0,003%** |
| `N × W` | 0,001% |

Desvio-padrão de `economia_bps`: 51,48. A interação tripla omitida vale 0,003%.

**Cuidado ao ler os 81,9%.** Eles pertencem ao fator categórico `mix`, que muda **cinco
coisas ao mesmo tempo**: split direcional, ticket, cadência, prazo (`buffer_dias`) e
finalidade — e a finalidade determina a alíquota de IOF. Não são 81,9% do split
direcional. O split direcional sozinho, medido por regressão contínua sobre
`fracao_in_realizada`, explica **50,7%**. Separar as cinco contribuições exigiria uma
grade que varie um atributo de arquétipo por vez, que não foi rodada.

O domínio do mix **cresceu** de 58,6% para 81,9% quando `outbound_extremo` entrou, e o
resíduo caiu de 8,3% para 3,6%. Não é que o mix tenha passado a importar mais: é que a
grade antiga não continha a ponta em que ele importa. Uma decomposição de variância só
enxerga a região que foi amostrada — o que vale como aviso sobre esta também.

### Sobre o eixo W: o que a grade mostra e o que ela não mostra

`W`, `mix × W` e `N × W` somam menos de 0,01% da variância. **Em média, a janela não
move o resultado.** Mas há três ressalvas que impedem a leitura de que "a janela é
irrelevante":

- A grade compara **apenas W=1 e W=7**. Os valores 3, 14 e 30 foram testados em
  `scripts/varredura_janela.py` com 30 sementes e **um único mix** (`equilibrado`).
  Nada aqui prova que W≥7 é indiferente nos outros quatro.
- Por célula, a diferença de p10 entre W=1 e W=7 chega a **4,02 bps** (`equilibrado`,
  N=4). Pequeno diante de um desvio-padrão de 51, mas não zero.
- Por semente, a diferença pareada vai de **−7,28 a +11,43 bps**, e **W=1 é melhor em
  1.388 das 13.500 sementes**. O sinal não é constante.

A conclusão sustentável é mais estreita: *no agregado desta grade, escolher W entre 1 e
7 não muda a decisão de produto, e não vale gastar pergunta com a interlocutora sobre
cadência de fechamento.* Não é "W não importa em nenhuma configuração".

### O que perguntar à interlocutora, em ordem

1. **O split direcional dos clientes candidatos** — que fração do volume de cada um é
   IN vs OUT. É o eixo em que o valor incremental vai de zero a 0,43, e sozinho explica
   ~51% da variação da economia. Se a carteira real ficar perto de `outbound_extremo`,
   **a tese do produto muda de dono**, e é melhor saber antes de construir.
2. **Ticket, cadência e prazo típicos de cada cliente.** Entram nos 81,9% junto com o
   split, e a grade não os separa. Prazo é o que determina a espera, e a espera é o que
   o cliente sente.
3. **Quantos clientes entram na primeira leva.** Basta saber se são 3, 8 ou 20 — a
   diferença entre 24 e 32 não muda nada.
4. **Não perguntar sobre com que frequência o ciclo fecha.** É o eixo W, e no agregado
   ele não muda decisão. Gastaria capital de relação por um dado inerte.

## Como ler o eixo N: ele carrega composição junto

O eixo N **não mede escala pura**. A cada valor de N a carteira muda de composição, e
parte do que a curva acima mostra é isso, não o efeito de ter mais clientes.

A causa é aritmética simples: **cliente é coisa inteira**. O mix pede uma proporção de
cada perfil, e o motor reparte N clientes entre os seis perfis por maiores médias
(`_alocar_clientes`). Quando N não divide a proporção pedida, a carteira que sai não é
a que foi pedida. No `equilibrado`, que pede um sexto de cada perfil:

| N | carteira que sai de fato |
|---:|---|
| 2 | cripto 1, exportador 1 — **quatro perfis não existem** |
| 3 | cripto 1, payroll 1, exportador 1 |
| 4 | psp 1, cripto 1, payroll 1, exportador 1 |
| **6** | um de cada — **exato** |
| 8 | remessa 1, psp 1, cripto **2**, payroll 1, exportador **2**, tesouraria 1 |
| **12** | dois de cada — **exato** |
| 16 | remessa 2, psp **3**, cripto 3, payroll 3, exportador 3, tesouraria **2** |
| **24** | quatro de cada — **exato** |

Em N=2 o `equilibrado` é, na verdade, uma carteira de cripto + exportador. O exportador
é o perfil mais IN de todos, e é por isso que a fração de entrada em N=2 dá 0,527 em vez
dos 0,44 que o mix pede. No `psp_dominante` é mais extremo: em N=2 e N=3 a carteira é
**só PSP**, e os outros cinco perfis não aparecem.

**O efeito é grande e não é ruído.** Com 300 sementes por célula, o erro amostral da
mediana fica entre 0,2 e 1,0 bps; as quedas da curva de N chegam a 34 bps. Nos 40 passos
de N da grade, economia e fração IN se movem no mesmo sentido em 31, e as quatro maiores
quedas coincidem todas com a carteira ficando mais OUT-pesada.

**Nos pontos limpos, a curva se comporta.** No `equilibrado`, olhando só os N que
dividem exato:

| N | fração IN | economia p50 |
|---:|---:|---:|
| 6 | 0,433 | 112,2 bps |
| 12 | 0,436 | 124,8 bps |
| 24 | 0,435 | 130,3 bps |

Composição constante, curva **monótona crescente**. O eixo N não está errado — está mal
amostrado. Nenhum dos outros quatro mixes divide exato em nenhum N desta grade (o
`psp_dominante` precisaria de múltiplos de 40, porque tem peso 0,25 numa soma de 10).

### A questão de fundo: mix é proporção de clientes ou de volume?

Hoje o peso de um mix é **contagem de clientes**. Mas o que move a economia é **volume**,
e o volume por cliente varia 7× entre perfis — `remessa_outbound_massiva` move ~0,6
M/mês, `tesouraria_corporativa` ~4,5 M/mês. No `equilibrado`, com um cliente de cada, a
tesouraria carrega ~30% do volume e a remessa ~4%. **"Equilibrado" significa clientes
iguais, não volume igual.**

É escolha de modelagem legítima, mas é dela que vem boa parte da instabilidade: trocar um
cliente de remessa por um de tesouraria muda o volume da carteira em 7× e a contagem em
zero.

**Decisão em aberto, deliberadamente adiada.** Fazer o mix significar proporção de volume
exigiria mudar a montagem da carteira, recalibrar os cinco mixes e refazer todos os
números. Não foi feito porque a pergunta "quantos clientes bastam" só vira decisão quando
se souber a composição real da carteira da interlocutora — e essa composição virá descrita
em volume, não em contagem. Mudar agora significaria refazer duas vezes.

**Até lá, leia assim:** as afirmações "satura em N≈8" e "N≈12 entrega nível e
previsibilidade" descrevem o comportamento **conjunto** de escala e composição, não o
efeito isolado de escala. A conclusão principal deste relatório — o colapso do valor
incremental na ponta OUT — **não depende do eixo N**: ela é medida sobre o eixo de mix,
com N fixo.

## Conferência independente da grade

Quatro checagens de sanidade sobre o CSV agregado, rodadas depois da varredura.

| # | Checagem | Veredito |
|---|---|---|
| 1 | `economia_bps_p50` monótona não-decrescente em N | **falha** — 13 quedas, todas além do erro amostral. Causa na seção acima: o eixo N carrega composição |
| 2 | dispersão cai conforme N cresce | **ok** — faixa p10–p90 sobre a mediana cai em todos os cinco mixes (ex.: `psp_dominante` 54,9% em N=2 → 5,8% em N=32) |
| 3 | W=1 pior que W=7 em toda a grade | **falha** — W=1 empata ou ganha em 8 das 45 células, **todas do `corporativo_pesado`**, de N=3 a N=32. Vantagem máxima de W=1: 1,36 bps |
| 4 | `pct_volume_espera_truncada` sem explodir em nenhum canto | **ok** — 0,18% a 4,00%, mediana 1,23% |

A exceção do item 3 fica **registrada, não investigada**. É sistemática (um mix inteiro,
não espalhada), o que descarta ruído, mas o efeito vale no máximo 1,36 bps contra um nível
de 108 — cerca de 1%. Ela invalida a frase "W=1 é sempre pior", e nada além disso. Se o
`corporativo_pesado` virar carteira-alvo real, vale entender o mecanismo: é o perfil de
prazos mais longos, justamente onde esperar "deveria" ajudar mais.

### Inclinação do eixo direcional

Entre os dois mixes mais OUT-pesados, N=12, W=7:

    (121,0 − 24,4) bps / (28,4 − 9,5) pontos percentuais = 5,11 bps por ponto percentual
    de volume IN

É a região mais íngreme da curva. Perto do equilíbrio ela achata e chega a inverter
(`corporativo_pesado`, com 51,0% de IN, rende menos que `equilibrado`, com 43,6%).

## O que uma revisão externa corrigiu

Registro do que mudou em 2026-09-07, para quem tiver lido a versão anterior:

| Afirmação anterior | Correção |
|---|---|
| "economiza X em 9 de cada 10 **meses**" | Cada semente é uma carteira-**ano**. O p10 fala de carteiras, não de meses |
| split direcional "explica ~82%" | 81,9% é do fator `mix` inteiro. O split sozinho: **50,7%** |
| "a janela é irrelevante" | Vale no agregado desta grade. W≥7 só foi testado num mix; há diferenças de até 4 bps por célula |
| "N=12 é o menor ponto previsível" | Depende do mix. `outbound_extremo` ainda tem faixa de 32,3% em N=12 |
| autonetting citado só em "Limites" | Passou a ser o achado principal: incremental **zero em 300/300** no `outbound_extremo` |
| `pct_volume_espera_truncada` | Contava a ordem inteira mesmo quando parte casou antes do fim; superestimava em até 3,4×. **Corrigido no motor** |
| curva de N lida como efeito de escala | O eixo N carrega composição junto — ver "Como ler o eixo N" |
| "W=1 é pior" | Falso no `corporativo_pesado`, em 8 das 9 células |

Um achado da revisão **não** foi acatado: a alegação de que `carry_cnr` (0,04%,
cobrado só do lado netado) contraria uma decisão de zerá-lo. Não há tal decisão — o
"ZERO por decisão de produto" em `motor/varredura.py` é sobre `custo_oportunidade_aa`,
outro parâmetro. `carry_cnr` está fixado em `docs/adr-cost-bps.md`, e a assimetria é
correta: sem netting não existe posição em CNR para carregar.

## Limites deste resultado

- **O valor incremental não tem número em bps.** A economia aqui é bruta. Converter
  exigiria reprecificar só as alocações incrementais, o que o motor não faz.
- **Nível ≠ cotação**, pela ressalva do topo.
- **Onde o mercado real cai no eixo direcional continua desconhecido.** A grade cobre de
  9,5% a 52,7% de IN, com ponto medido nos dois extremos — mas qual deles descreve a
  carteira da interlocutora é dado que não temos.
- **Arquétipos e pesos de mix são placeholders declarados**, não calibração de mercado.
- **`p_out` é sorteado por ordem, não por cliente**, o que é a origem do autonetting.
  Num modelo em que a direção fosse propriedade do cliente, o incremental e o bruto
  ficariam muito mais próximos, e os números desta grade mudariam.
- **A validade regulatória do mecanismo está fora do código.**

## Procedência

- `scripts/varredura_completa.py` — a grade e os dois CSVs.
- `scripts/projecao_varredura.py` — cronometragem e fração IN por mix.
- `scripts/varredura_janela.py` — a medição pareada de 30 sementes sobre o eixo W.
- `scripts/diagnostico_custo.py` — decomposição da economia em IOF, spread, custo fixo
  e custo interno.
- `docs/dicionario-csv.md` — o significado de cada coluna.

`motor/netting.py`, `motor/custo.py`, `motor/arquetipos.py` e a tabela de alíquotas
estão intocados. As mudanças de motor associadas a esta análise são o mix
`outbound_extremo` e a correção de `pct_volume_espera_truncada`, ambas em
`motor/mixes.py` / `motor/varredura.py`.
