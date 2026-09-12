# Dicionário do CSV da varredura

As colunas são derivadas dos dataclasses de `motor/varredura.py` — `COLUNAS` é
`dataclasses.fields(PontoVarredura)`, na ordem de declaração. Acrescentar um campo ao
dataclass acrescenta a coluna; este documento não é a fonte da ordem, ele explica o
significado.

Dois arquivos saem da CLI:

- `--saida` — a **grade crua**, um `PontoVarredura` por (mix, N, W, semente).
- `--saida-resumo` — o **agregado**, um `ResumoCelula` por (mix, N, W), com o eixo de
  sementes colapsado em mediana e faixa.

Dinheiro sai com 2 casas; fração, com 6 (`_CASAS_DECIMAIS`). Uma fração com 2 casas
viraria degrau: 0,05% e 0,00% seriam a mesma linha.

## Grade crua (`PontoVarredura`)

### Identificação da célula

| Coluna | Significado |
|---|---|
| `nome_mix` | mix de arquétipos (`motor/mixes.py`) |
| `n_clientes` | N de clientes da pool |
| `janela_dias` | W da política P0 |
| `horizonte_dias` | duração da simulação |
| `seed_base` | semente da célula; a pool é a mesma para todos os W deste (mix, N, semente) |

### Volume

| Coluna | Significado |
|---|---|
| `n_ordens` | ordens geradas na pool |
| `n_ciclos` | fechamentos de lote |
| `volume_bruto_brl` | soma de `valor_brl` das ordens |
| `volume_casado_brl` | volume que não atravessou a fronteira, **contando as duas pernas** |
| `volume_residuo_brl` | volume que atravessou |
| `taxa_netabilidade` | `volume_casado_brl / volume_bruto_brl` |
| `teto_netabilidade` | o melhor que QUALQUER política conseguiria nesta pool |
| `eficiencia_vs_teto` | quanto do teto a política extraiu |
| `limite_intra_cliente_brl` | o que os clientes casariam sozinhos, na própria tesouraria |
| `volume_casado_incremental_brl` | casado menos o limite intra: **piso** do valor que o motor adiciona |
| `taxa_netabilidade_incremental` | a incremental sobre o bruto. **É esta que vai para conversa comercial, nunca a bruta** |

### Custo

`baseline_*` é cada ordem executando sozinha, no dia em que é conhecida; `netado_*` é
o mesmo cenário sob a política P0. Os sufixos são os cinco termos de `Custos`
(`motor/custo.py`): `iof`, `carry`, `spread`, `espera`, `fixo`, mais o `total`.

| Coluna | Significado |
|---|---|
| `baseline_total_brl` … `baseline_fixo_brl` | decomposição do custo sem netting |
| `netado_total_brl` … `netado_fixo_brl` | decomposição do custo com netting |
| `economia_brl` | `baseline_total_brl - netado_total_brl` |
| `economia_pct` | economia sobre o baseline |
| `economia_por_ordem_brl` | economia dividida pelo número de ordens |

`baseline_espera_brl` é sempre 0 (no baseline `dia_exec == dia_conhecida`) e
`baseline_carry_brl` também (não há posição em CNR sem netting). `netado_espera_brl` é
0 enquanto `custo_oportunidade_aa` for 0 — que é o padrão, por decisão de produto.

### Tempo até resolução

O que foi **pago** pela economia acima. Sem estas colunas a grade mede metade do
trade-off: esperar mais sempre neta mais, então com custo como métrica única o ótimo é
"espere o máximo possível", que nenhum cliente aceita.

A unidade é a **alocação, ponderada por volume**, não a ordem: uma ordem coberta em
tranches esperou prazos diferentes, e cada real conta o tempo que ele ficou parado.

| Coluna | Significado |
|---|---|
| `dias_espera_p90_volume_casado` | p90, ponderado por volume, dos dias de espera das alocações `CASADO` |
| `dias_espera_p90_volume_remetido` | o mesmo, sobre as alocações `REMETIDO` |
| `dias_espera_media_por_real` | média ponderada por volume, sobre todas as alocações |
| `pct_volume_espera_truncada` | fração do volume bruto em ordens com `dia_limite > horizonte_dias` |

p90 e não média nas duas primeiras porque a média esconde a cauda: média de 4 dias com
uma ordem que esperou 30 é um relatório bom sobre um cliente que cancela contrato. A
promessa que o produto consegue fazer é sobre a cauda.

`CASADO` e `REMETIDO` separados porque são coisas diferentes: o volume casado esperou e
economizou; o remetido esperou e atravessou a fronteira assim mesmo — espera que não
comprou nada. Numa coluna só esse custo desaparece.

`pct_volume_espera_truncada` é a ressalva de confiabilidade das outras três.
`executar_p0` drena no último dia as ordens cujo `dia_limite` cai depois do horizonte,
senão a conservação quebraria; a espera delas sai **menor** do que teria sido, porque
foram resolvidas por fim de simulação e não por prazo. Essas alocações continuam dentro
dos percentis — excluí-las trocaria um viés por outro — então a coluna diz qual fatia
dos tempos está encurtada. Na pool de referência (mix `equilibrado`, N=12, horizonte
365) são 3,62%; o efeito encolhe com horizontes maiores.

Quando não existe alocação de um tipo, o p90 daquele tipo sai 0 — indistinguível de
"tudo resolveu no mesmo dia" olhando só a coluna. Desempate: `volume_casado_brl` da
mesma linha.

**Não existe coluna de volume sem alocação.** Ela seria zero em toda linha:
`executar_p0` drena o que sobrou no fim do horizonte e levanta exceção se alguma ordem
ficar aberta. A invariante vive em
`tests/test_tempo.py::test_toda_ordem_recebe_alocacao_dentro_do_horizonte`.

## Resumo por célula (`ResumoCelula`)

Uma célula rodada com uma semente só é UMA amostra. Em N baixo a dispersão entre
sementes é maior que a diferença entre mixes, então o resumo reporta mediana **e**
faixa, nunca uma estatística sozinha.

| Coluna | Significado |
|---|---|
| `nome_mix`, `n_clientes`, `janela_dias`, `horizonte_dias` | a célula |
| `n_seeds` | quantas sementes entraram |
| `n_ordens_p50` | mediana do tamanho da pool |
| `taxa_netabilidade_p50`, `teto_netabilidade_p50`, `eficiencia_vs_teto_p50` | medianas |
| `taxa_netabilidade_incremental_p50` | mediana da incremental |
| `economia_pct_min` … `economia_pct_max` | faixa da economia entre sementes (min, p25, p50, p75, max) |
| `economia_brl_min`, `economia_brl_p50` | pior semente e mediana, em reais |
| `frac_seeds_positiva` | fração das sementes em que a economia foi positiva |

`economia_pct_min`/`max` são a pior e a melhor semente, **não** intervalo de confiança.
Com poucas sementes a faixa é o resultado. Barra de erro estreita num estimador
enviesado continua enviesada: isto separa ruído de sinal, não corrige viés.

O resumo **não carrega as colunas de tempo**. Quem precisar de prazo por célula lê a
grade crua.
