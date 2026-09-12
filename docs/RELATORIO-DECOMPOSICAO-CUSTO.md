# Decomposição do custo e sensibilidade aos parâmetros

> **CORREÇÃO DE SEMÂNTICA POSTERIOR:** cada `Ordem` já é a posição líquida que o
> cliente decidiu enviar ao orquestrador. A ressalva abaixo sobre economia
> "bruta" e autonetting foi superada; não se roda uma segunda P0 por cliente. A
> decomposição numérica deste documento continua correta para o cenário medido.
> A decomposição em toda a grade está em
> `docs/RELATORIO-SENSIBILIDADE-CUSTO.md`.

> **Nível absoluto NÃO é cotação.** Duas células da tabela de alíquotas carregam 34,5%
> do volume e não foram verificadas em norma — ver "Onde a incerteza mora", no fim.

Companheiro de `docs/RELATORIO-VARREDURA.md`. Aquele mede **onde** a economia aparece
(qual carteira, quantos clientes); este mede **de que ela é feita** e **a que ela é
sensível**. Reproduz-se com `PYTHONPATH=. python scripts/diagnostico_custo.py`.

Cenário de referência em todo o documento: mix `equilibrado`, N=12, horizonte 365,
semente 42, W=7 — 1.639 ordens, 247 ciclos, volume bruto R$ 510,6 mi, netabilidade
80,7%.

## O modelo de custo, na íntegra

Quatro termos ativos (`motor/custo.py`). `_BPS` = 10.000, `_DIAS_NO_ANO` = 365.

```
baseline = Σ_ordens [ v·aliq(finalidade, direção) + v·spread_bps/1e4 + fixo + espera ]
netado   = Σ_aloc REMETIDO [ v·aliq(finalidade, direção) ]
         + Σ_aloc CASADO   [ v·carry_cnr ]
         + Σ_aloc          [ v·(dia_aloc − dia_conhecida)·oport/365 ]
         + Σ_ciclos com resíduo>0 [ resíduo·spread_bps/1e4 + fixo ]
```

Bases de incidência, que não são todas iguais:

| Termo | Base | Baseline | Netado |
|---|---|---|---|
| IOF | volume | toda ordem | só o que atravessa |
| spread de rail | volume | toda ordem | só o resíduo |
| custo fixo | **contagem** | uma vez **por ordem** | uma vez **por ciclo** com resíduo |
| carry de CNR | volume | **zero** | as duas pernas de cada par casado |
| espera | volume × dias | zero por construção | zero enquanto `oport` = 0 |

Duas assimetrias que costumam ser lidas como erro e não são:

- **O carry só existe no lado netado.** Sem netting não há posição em conta de não
  residente para carregar. Não é viés a favor do baseline; é o custo que o netting
  cria.
- **A espera é zero no baseline por construção**, porque ali `dia_exec ==
  dia_conhecida`. Toda espera medida em qualquer lugar deste projeto foi causada pelo
  netting, sem precisar subtrair nada.

**O custo de movimentação interna é cobrado duas vezes por par casado**, uma alocação
`CASADO` por perna. É intencional e corresponde ao fenômeno: os reais se movem dentro
do Brasil *e* a moeda se move lá fora.

## De que a economia é feita

Três custos que o netting **evita**, um que ele **cria**:

| parcela | R$ | % da economia |
|---|---:|---:|
| `iof_evitado` | 5.571.594 | **85,75%** |
| `spread_evitado` | 1.030.154 | 15,85% |
| `custo_fixo_evitado` | 60.840 | 0,94% |
| `custo_interno_criado` (carry) | −164.825 | −2,54% |
| **soma** | **6.497.763** | 100% |

**A identidade fecha exatamente**, ao último dígito de `Decimal`: a soma das quatro
parcelas é igual a `baseline − netado`, sem resíduo. Isso é verificação, não
coincidência — se algum termo do modelo não estivesse capturado nesta decomposição, a
diferença apareceria aqui.

**A tese é a tese do IOF**, com 86% da economia. Mas o spread de rail responde por 16%
com um parâmetro que o próprio código declara ser chute de ordem de grandeza — ver
"Onde a incerteza mora".

## Sensibilidade ao custo de movimentação interna

`carry_cnr` está em 0,04% e nunca foi verificado contra prática de mercado. Variando só
ele:

| `carry_cnr` | economia | bps do volume bruto | volume casado |
|---:|---:|---:|---:|
| 0 | 6.662.588 | 130,49 | 412.061.701 |
| **0,04%** (atual) | 6.497.763 | **127,26** | 412.061.701 |
| 0,10% | 6.250.526 | 122,42 | 412.061.701 |
| 0,20% | 5.838.465 | 114,35 | 412.061.701 |
| 0,40% | 5.014.341 | 98,21 | 412.061.701 |

**O volume casado é idêntico nas cinco linhas**, como tem que ser: a política de
casamento não olha para esse parâmetro. Se algum dia diferir, é achado, não ruído.

**A economia só zera em `carry_cnr` ≈ 1,62%**, quarenta vezes o valor atual. Adiar a
verificação desse parâmetro é seguro. Acima de ~0,20% ele deixa de ser ruído — passa a
custar mais de 10% da economia — mas em nenhum ponto do intervalo plausível ele muda a
conclusão do produto.

## Onde a incerteza mora

Distribuição do volume por `(finalidade, direção)`, com a alíquota aplicada:

| finalidade | direção | % do bruto | alíquota | procedência |
|---|---|---:|---:|---|
| DISPONIBILIDADE | IN | 19,02% | 0,38% | fallback |
| BENS_SERVICOS | OUT | 18,32% | 0,38% | **regra explícita, incerta** |
| DISPONIBILIDADE | OUT | 16,47% | 3,5% | fallback |
| ATIVOS_VIRTUAIS | OUT | 16,16% | 3,5% | **fallback, marcado INCERTO** |
| RECEITA_EXPORTACAO | IN | 15,66% | **0%** | regra explícita (isenção) |
| REMESSA_TERCEIRO | OUT | 7,72% | 3,5% | fallback |
| ATIVOS_VIRTUAIS | IN | 6,65% | 0,38% | fallback |

**Duas células com 34,5% do volume não foram verificadas em norma:**

1. `ANEXO_V_BENS_SERVICOS` OUT (18,3%). Bens de importação é isento e serviços paga
   0,38%; as duas naturezas estão colapsadas na mesma finalidade e não temos o split.
   Usa-se 0,38%, e **a incerteza aponta para baixo**: se o fluxo for majoritariamente
   bens, a alíquota é 0 e a economia cai.
2. `ANEXO_V_ATIVOS_VIRTUAIS` OUT (16,2%). Cai em 3,5% por *fallback*, e o código marca
   `INCERTO, verificar`. Não é pesquisa, é o padrão.

Vale notar também que **15,7% do volume bruto é receita de exportação entrando a 0%**.
Esse volume não gera economia de IOF nenhuma quando casado — só spread e custo fixo.
Ele infla a netabilidade sem inflar a tese.

E o `spread_rail_bps` (25) e o `custo_fixo_remessa` (40) são chutes de ordem de
grandeza declarados como tais no docstring de `PARAMETROS_VARREDURA` e em `AGENTS.md`.
O spread carrega 16% da economia. **Calibrá-lo com a interlocutora vale mais que
refinar o carry**, que carrega 2,5%.

## Heterogeneidade da alíquota: existe escolha de casamento não feita

Para os pares efetivamente formados pelo netting, o valor de cada BRL casado é
`aliquota_out + aliquota_in` do par. Reconstruído por *waterfall* dentro de cada ciclo
— o motor não forma pares nomeados, ele casa posição agregada, então isto é uma
atribuição, não um registro.

| estatística | valor |
|---|---:|
| mínimo | 0,38% |
| mediana ponderada por volume | 3,50% |
| máximo | 3,88% |

Só quatro valores distintos existem: 0,38%, 0,76%, 3,50%, 3,88%. **O intervalo é de
10×.**

A leitura: a política de cobertura é EDF, por prazo. Ela casa um par de 0,38% e um de
3,88% com indiferença. Existe portanto uma escolha de casamento **por valor** que o EDF
não faz, e ela vale até 10× por real casado.

**Isso não é trabalho de custo, é trabalho de política — e está travado por decisão
que não é técnica.** O docstring de `motor/custo.py` registra que casar primeiro as
ordens caras para deixar as baratas atravessarem é planejamento tributário embutido, e
que não entra sem parecer jurídico (mesmo espírito da regra do art. 22 gravada em
`motor/netting.py`). O número acima quantifica o que está em jogo; a decisão de
atravessar ou não essa linha é do Gabriel, com apoio jurídico.

## O que este documento não responde

- Este documento não contém a confirmação posterior de que a entrada já é líquida;
  a correção de leitura está no aviso do topo.
- A decomposição daqui é de um cenário só (`equilibrado`, N=12, semente 42).
- A decomposição em toda a grade, as inclinações de spread/fixo/carry e a exposição
  das duas alíquotas incertas foram fechadas depois em
  `docs/RELATORIO-SENSIBILIDADE-CUSTO.md`.
