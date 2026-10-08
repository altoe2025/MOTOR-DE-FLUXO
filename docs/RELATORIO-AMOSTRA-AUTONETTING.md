# Amostra do autonetting preferencial — 2026-09-16

## Escopo e ressalva

Esta é uma amostra sintética para conferir a política nova e dimensionar a
regeneração. Não substitui a grade oficial de 27.000 rodadas, não é cotação e não é
projeção comercial. Nenhum CSV histórico foi sobrescrito.

A comparação isola somente a seleção: as mesmas ordens, custos, janelas e horizonte
foram executados pela P0 antiga (EDF global) e pela P0 vigente (intracliente antes do
saldo multilateral). A sombra da política antiga reproduziu os gatilhos e o EDF/id da
base `a655d9d9fc166507e084b71bce98f2b601fb5d79` usando o domínio atual apenas para
carregar a origem obrigatória das alocações.

## Configuração exata

- mix: `equilibrado`;
- clientes: `N=12`;
- horizonte: 365 dias;
- seeds pareadas: 1 e 2;
- janelas: `W=1` e `W=7`;
- custos: `motor.varredura.PARAMETROS_VARREDURA`;
- carteiras: 1.608 ordens / R$ 464.346.849,58 na seed 1 e 1.605 ordens /
  R$ 499.993.272,42 na seed 2;
- base da comparação antiga: commit `a655d9d9`;
- política nova medida na branch `codex/autonetting-preferencial` após a MOT-44.

Os volumes em BRL são sintéticos. “Casado” conta as duas pernas, igual às alocações e
à métrica pública do motor.

## Resultado por mecanismo na política nova

| Seed | W | Autonetting | Taxa auto | Multilateral | Taxa multi | Casado total | Netabilidade | Remetido |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | R$ 55.945.197,30 | 12,0481% | R$ 332.826.009,78 | 71,6762% | R$ 388.771.207,08 | 83,7243% | R$ 75.575.642,50 |
| 1 | 7 | R$ 61.288.925,50 | 13,1990% | R$ 329.077.254,46 | 70,8688% | R$ 390.366.179,96 | 84,0678% | R$ 73.980.669,62 |
| 2 | 1 | R$ 53.679.284,08 | 10,7360% | R$ 358.250.097,42 | 71,6510% | R$ 411.929.381,50 | 82,3870% | R$ 88.063.890,92 |
| 2 | 7 | R$ 57.021.648,36 | 11,4045% | R$ 358.798.010,94 | 71,7606% | R$ 415.819.659,30 | 83,1651% | R$ 84.173.613,12 |

Nas quatro células, o autonetting foi positivo e fecharam exatamente:

```text
autonetting + multilateral = casado
casado + remetido = bruto
soma exata dos custos por cliente = custo agregado
```

## Mudança contra o EDF global

| Seed | W | Netabilidade antiga | Nova | Delta (p.p.) | Casado novo − antigo | Economia antiga | Nova | Delta da economia |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 84,5327% | 83,7243% | −0,8084 | −R$ 3.753.797,52 | R$ 5.497.737,68 | R$ 5.432.480,79 | −R$ 65.256,89 |
| 1 | 7 | 85,0664% | 84,0678% | −0,9986 | −R$ 4.637.058,88 | R$ 5.555.370,70 | R$ 5.467.120,99 | −R$ 88.249,71 |
| 2 | 1 | 82,4813% | 82,3870% | −0,0944 | −R$ 471.801,62 | R$ 5.950.443,01 | R$ 5.982.509,38 | +R$ 32.066,37 |
| 2 | 7 | 83,3282% | 83,1651% | −0,1631 | −R$ 815.648,22 | R$ 6.089.704,07 | R$ 6.106.177,28 | +R$ 16.473,22 |

A preferência obrigatória reduziu o casamento total futuro nas quatro células. Isso
não é uma falha do requisito: usar a contraparte do próprio cliente agora muda quais
saldos flexíveis sobrevivem para fechamentos seguintes. A perda observada ficou entre
0,094 e 0,999 ponto percentual de netabilidade nesta amostra.

Economia e netabilidade não se moveram sempre no mesmo sentido. Na seed 2 a política
nova casou um pouco menos, mas deixou atravessar uma combinação de finalidades com IOF
mais barato; por isso a economia aumentou. A alíquota continua fora do critério de
seleção — o efeito é consequência, não otimização fiscal.

## Custos: delta da política nova menos a antiga

| Seed | W | IOF | Carry | Spread | Espera | Fixo | Custo total | Economia |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | +R$ 57.133,92 | −R$ 1.501,52 | +R$ 9.384,49 | R$ 0,00 | +R$ 240,00 | +R$ 65.256,89 | −R$ 65.256,89 |
| 1 | 7 | +R$ 78.271,89 | −R$ 1.854,82 | +R$ 11.592,65 | R$ 0,00 | +R$ 240,00 | +R$ 88.249,71 | −R$ 88.249,71 |
| 2 | 1 | −R$ 33.177,15 | −R$ 188,72 | +R$ 1.179,50 | R$ 0,00 | +R$ 120,00 | −R$ 32.066,37 | +R$ 32.066,37 |
| 2 | 7 | −R$ 18.306,08 | −R$ 326,26 | +R$ 2.039,12 | R$ 0,00 | +R$ 120,00 | −R$ 16.473,22 | +R$ 16.473,22 |

`custo_oportunidade_aa=0` nos parâmetros atuais; por isso o custo de espera não muda,
embora os dias de resolução mudem para muitas ordens.

## Ordens afetadas

| Seed | W | Perfil de alocação alterado | Destino CASADO/REMETIDO alterado | Dia de resolução alterado |
|---:|---:|---:|---:|---:|
| 1 | 1 | 317 | 104 | 258 |
| 1 | 7 | 355 | 106 | 297 |
| 2 | 1 | 287 | 87 | 224 |
| 2 | 7 | 291 | 88 | 234 |

Exemplo discriminante na seed 1: a ordem
`cripto_native_sem_fiat-0000-cripto_native_sem_fiat-00001`, no dia 323, tinha
R$ 6.123,21 casados e R$ 737.571,50 remetidos sob EDF global. Com a preferência,
R$ 743.694,71 foram remetidos. A contraparte que a cobria foi consumida antes pelo
próprio cliente, mudando o saldo disponível naquele fechamento.

## Tempo e projeção da grade

Para não extrapolar apenas a partir de N=12, a fumaça de tempo cobriu todos os cinco
mixes, os nove valores de N, W em `{1, 7}` e as seeds `{1, 2}`:

- 90 pools geradas;
- 180 rodadas executadas;
- geração: 3,016 s;
- simulação e montagem de pontos: 8,302 s;
- total: 11,318 s;
- fração da grade: 180 / 27.000 = 1/150;
- projeção linear: 1.697,65 s = **28 min 18 s** neste ambiente.

A projeção não inclui escrita final, relatórios derivados, revisão nem variação de
carga da máquina. É uma estimativa operacional, não promessa. Como referência
histórica, o MAPA registrava ~2,1 h antes das otimizações e neste outro ambiente. Um
planejamento prudente deve reservar até algumas horas para computação e, sobretudo,
tempo separado para conferir e reescrever as conclusões.

## Verificações adicionais

- `scripts/varredura_completa.py`, `diagnostico_custo.py` e
  `sensibilidade_custo.py` compilam;
- o diagnóstico isolado fechou sua identidade de custos exatamente;
- 28 testes dos scripts de sensibilidade/estresse/projeção passaram;
- o cenário Amanda permaneceu em baseline R$ 2.370.600, netado R$ 1.344.600,
  economia R$ 1.026.000 e netabilidade 58,82%;
- a regressão de aceitação da Amanda passou (`1 passed`).

## Decisão pendente

Esta amostra é suficiente para confirmar comportamento, propagação e ordem de
grandeza do custo operacional. Ela não autoriza a MOT-47: a grade completa e os
relatórios só podem ser regenerados após aprovação explícita do Gabriel.
