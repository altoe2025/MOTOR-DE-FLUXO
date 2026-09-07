# AGENTS.md

## Projeto

Este repositório implementa o Motor de Fluxo: simula netting multilateral de fluxo de
câmbio e execução via política de janela fixa (P0), com prioridade de cobertura EDF
(earliest deadline first) e desempate por order ID.

## Fonte de verdade

- Código, arquitetura técnica, testes e decisões de implementação vivem neste
  repositório.
- Contexto de negócio, regulatório, relatos da Amanda, hipóteses S1-S16 e decisões
  com proveniência vivem no vault Obsidian do projeto — não aqui.
- Não copiar contexto de negócio do vault para o repo sem autorização explícita do
  Gabriel.
- Quando uma tarefa depender de contexto de negócio (ex.: o que a Amanda quer, uma
  decisão regulatória), pare e peça ao usuário o trecho relevante do vault — não
  assuma nem infira.

## O mecanismo

- `OUT` = cliente tem reais no Brasil, precisa de moeda no exterior.
- `IN` = cliente tem moeda no exterior, precisa de reais no Brasil.
- Quando um `OUT` casa com um `IN`: os reais do `OUT` vão para a CNR do `IN` dentro do
  Brasil, e a moeda do `IN` vai para o `OUT` fora do Brasil. Ninguém remete nada, e o
  fato gerador do IOF de transferência ao exterior não ocorre. Só o **excedente**
  entre bruto `OUT` e bruto `IN` atravessa a fronteira e paga IOF.
- `casado` e `resíduo` são posição agregada de tesouraria, não pareamento físico de
  operação com operação: nenhuma ordem específica é "casada com" outra — o motor
  calcula que, no agregado do dia, tal volume não precisou atravessar a fronteira
  (`motor/netting.py`).

## Regra de importação

`netting.py` não importa `custo.py`; `custo.py` não importa `netting.py`; ambos
importam só `dominio.py`. `dominio.py` não importa nenhum outro módulo do projeto.
Isso existe para que branches diferentes avancem em paralelo sem colidir: o único
contrato compartilhado entre `netting.py` e `custo.py` é o `Ciclo`, definido em
`dominio.py` (ver `docs/architecture.md`).

Se uma tarefa parecer exigir quebrar essa regra, **a fronteira entre as camadas está
errada** — pare e pergunte, não contorne.

## Pureza

`geracao`, `netting`, `custo` e `simulacao` são funções puras: sem estado global, sem
I/O, sem `random` sem seed explícita. Dentro do pacote só três funções tocam disco:
`carregar_cenario` (lê YAML), `varredura.escrever_csv` (escreve o CSV da grade) e a
CLI em `__main__.py`.

## Restrição regulatória gravada no código

O motor pode **agregar** ordens numa remessa maior, mas nunca **quebrar** uma ordem
em remessas menores — é o art. 22 da Res. BCB 277 (vedado fracionar operação para
aproveitar prerrogativa de limite). Cobertura parcial de uma ordem ao longo de vários
dias (`Alocacao`) não é fracionamento — nenhuma operação é quebrada em remessas
menores para aproveitar prerrogativa de limite; o que existe é resolução da mesma
ordem em parcelas. Não "otimize" essa distinção, mesmo que pareça reduzir custo.

## Decisões técnicas fechadas

- **Model B**: cada operação executa e é registrada individualmente; o que o
  orquestrador agrega é a necessidade de funding externo (posição agregada), e o que
  se rateia é o custo do resíduo. Essa correspondência está gravada no próprio
  docstring de `motor/netting.py`. **Ressalva confirmada no código**: hoje não existe
  um módulo ou função separada que faça o rateio do custo entre clientes —
  `motor/custo.py` calcula `Custos` no nível agregado do `Cenario` (`custo_baseline`,
  `custo_netado`), não por cliente. `Ordem.cliente_id` existe como campo, mas o
  rateio per-cliente ainda não tem uma função própria implementada.
- **Quem paga o IOF do resíduo**: cada `Alocacao(REMETIDO)` aponta para uma ordem
  específica e paga a alíquota daquela ordem — não mais uma média pro-rata do lado
  (correção documentada em `motor/custo.py`). Quem decide a ordem de cobertura é o
  EDF por `dia_limite`, um critério operacional; a alíquota nunca entra nesse
  critério (ver art. 22 acima).
- **IOF por finalidade**: alíquota por `(finalidade do Anexo V, direção)`, com
  fallback para `iof_out`/`iof_in` quando a finalidade não tem regra própria
  (`motor/custo.py:aliquota_iof`). As taxas atuais, usadas tanto na grade de
  varredura (`PARAMETROS_VARREDURA` em `motor/varredura.py`) quanto no cenário de
  aceitação (`motor/cenarios/exemplo_amanda.yaml`), são: `iof_out` 3,5%, `iof_in`
  0,38%, `carry_cnr` 0,04%. Custo nunca deve ser reduzido a uma % de "netabilidade"
  isolada — o mesmo % pode representar custos reais muito diferentes conforme o mix
  de direções (ver `docs/adr-cost-bps.md`).
- **Política P0**: janela fixa de `janela_dias` dias. O lote fecha no primeiro destes
  eventos: (1) já passaram `janela_dias` desde o último fechamento; (2) alguma ordem
  aberta vence hoje; (3) o horizonte da simulação terminou. Ao fechar, casa
  `min(pendente_out, pendente_in)` cobrindo cada lado em ordem EDF
  (`(dia_limite, id)`). O que sobra **permanece aberto** e só vira remessa
  (`Alocacao(REMETIDO)`) no dia em que a **própria ordem** atinge seu `dia_limite` —
  o vencimento de uma ordem força a saída só daquela ordem, nunca do lote inteiro
  (`motor/netting.py`).
- **P1 não está implementado na `main`**: existiu como spike na branch local
  `netting/p1` (`executar_p1`, nunca mergeada — commit describes it as "política
  dominada"). Não referenciar `executar_p1` como código existente em `main`.
- **`Alocacao(ordem_id, dia, valor_brl, tipo)`**, com `tipo ∈ {CASADO, REMETIDO}`, é a
  granularidade em que vive o invariante de conservação: a soma das alocações de um
  `ordem_id`, em todos os ciclos, é igual ao `valor_brl` da ordem. Toda métrica de
  volume (netabilidade inclusive) se soma pelas alocações, nunca pelos
  `bruto_out`/`bruto_in` dos ciclos.
- **Prioridade de cobertura EDF com desempate por `id`** (ver `docs/adr-edf-tiebreak.md`).

## Número de aceitação

Cenário da Amanda (`motor/cenarios/exemplo_amanda.yaml`), reconferido ao vivo em
2026-09-06 (`python -m motor motor/cenarios/exemplo_amanda.yaml`): baseline ≈
US$ 439 k, netado ≈ US$ 249 k, economia ≈ US$ 190 k, taxa de netabilidade 58,82%. Se
o código de `netting.py`/`custo.py` não bater nesse número quando implementado,
**o código está errado**, não o número. O mesmo número é cravado em
`tests/test_varredura.py::test_celula_do_grid_reproduz_o_numero_de_aceitacao_da_amanda`.

## Relatórios de análise

Duas análises de 2026-09-07 vivem no repo e são autocontidas — leia antes de propor
qualquer medição nova, para não refazer o que já foi medido:

- `docs/RELATORIO-VARREDURA.md` — grade de 27.000 rodadas (5 mixes x 9 N x 2 W x 300
  sementes). Onde a economia aparece, decomposição de variância, curvas, espera.
- `docs/RELATORIO-DECOMPOSICAO-CUSTO.md` — de que a economia é feita (IOF 86%, spread
  16%, fixo 1%, carry −2,5%) e a que ela é sensível.
- `docs/dicionario-csv.md` — o significado de cada coluna dos CSVs.

**A economia em bps desses relatórios é BRUTA e inclui autonetting.** Em mixes
OUT-pesados o valor incremental é zero. Nunca cite economia bruta como valor do
produto — use `taxa_netabilidade_incremental`.

Estão nas branches `gabriel/metrica-tempo`, `gabriel/varredura-completa` e
`gabriel/mix-outbound` (PRs #21, #22, #23), **não na `main`**.

## Diário de mudanças

`docs/DIARIO-DE-MUDANCAS.md` é o estado compartilhado entre colaboradores deste
repositório. **Leia a entrada do topo antes de começar qualquer tarefa** — uma tarefa
escrita a partir do que está em `origin/main` pode estar descrevendo código que já
mudou na `main` local.

Toda mudança que vai para o GitHub ganha uma entrada, no mesmo commit que a faz.

## Convenções de commit

```
tipo: descrição (MOT-N)
```

Exemplo real do histórico: `fix: alocações REMETIDO em ordem canônica, não na ordem
de entrada (MOT-11)`. Confirmado em `git log`: todos os commits do histórico atual
usam o sufixo `(MOT-N)` — não há nenhum commit usando `(GAB-N)`; esse padrão só
aparece hoje como placeholder no `.github/pull_request_template.md` e está
desatualizado.

## Convenções de branch

Padrões observados no histórico real (`git log --all`): `feat/*`, `fix/*`, `perf/*`,
`docs/*`, `modelo/*`, e branches nomeadas por área (`geracao/arquetipos`,
`varredura/grid-mix-janela`). Historicamente também existiram `felipe/netting` e
`gabriel/custo` (PRs #1, #3, #5, #6) — já mergeadas e removidas, mas o padrão de
"branch por dono de arquivo" abaixo continua valendo quando alguém retomar trabalho
nessas camadas.

### Divisão de arquivos por branch

| Branch | Arquivos que pode tocar |
|---|---|
| `felipe/netting` | `motor/netting.py`, `tests/test_netting.py`, `motor/cenarios/cenario_temporal.yaml` |
| `gabriel/custo` | `motor/custo.py`, `tests/test_custo.py`, `docs/ARQUITETURA.md` |
| `geracao/arquetipos` | `motor/geracao.py`, `motor/arquetipos.py`, `tests/test_geracao*.py` |
| `varredura/grid-mix-janela` | `motor/mixes.py`, `motor/varredura.py`, `motor/__main__.py`, `tests/test_mixes.py`, `tests/test_varredura.py`, `tests/test_cli.py` |
| `main` (dois donos juntos) | `motor/dominio.py`, `motor/simulacao.py`, `tests/test_integracao.py`, config |

Se uma tarefa exigir editar arquivo fora da coluna da branch atual, **pare e avise** —
é sinal de que o contrato em `dominio.py` está errado, e o conserto é feito na
`main`, com os dois donos presentes.

## Ambiente

- **Dependências** (`pyproject.toml`): `pyyaml`, `numpy`; extra `dev`: `pytest`.
  Comando confirmado em `.github/workflows/test.yml`:
  ```bash
  pip install pytest pyyaml numpy
  ```
- **Suíte de testes completa**:
  ```bash
  make test
  # equivalente a: pytest -q
  ```
- **Cenário isolado** (roda um único cenário YAML, não a grade):
  ```bash
  python -m motor motor/cenarios/exemplo_amanda.yaml
  # equivalente a: make exemplo
  ```
- **Um arquivo ou teste isolado da suíte** (uso padrão do pytest, não um alvo do Makefile):
  ```bash
  pytest tests/test_netting.py -q
  pytest -k nome_do_teste -q
  ```
- **Grade de varredura completa** (~8 min, 400 células, até 1000 clientes em 365 dias):
  ```bash
  make varredura
  # equivalente a: python -m motor varredura --saida varredura.csv
  ```

## Testes

- A suíte atual possui **257 testes**, todos passando (`pytest -q`, reconferido em
  2026-09-07).
- A suíte também passa inteira sob **`python -O -m pytest -q`**. Isso não é detalhe:
  invariante de correção neste repo não pode ser `assert`, porque `-O` os remove. Se
  você adicionar um invariante que garante correção do resultado (conservação,
  validação de entrada), use `raise`, não `assert`.
- **Os 7 cenários manuais de validação, o runner `scripts/rodar_casos_manuais.py` e o
  script `scripts/exportar_timeline.py` NÃO estão na `main`.** Estão na branch
  `docs/auditoria-2026-09-06` (commit `cbc900d`), aberta como **PR #17** e
  deliberadamente não mergeada. O `docs/DIARIO-DE-MUDANCAS.md` descreve esses
  artefatos como escritos e rodados — o que é verdade naquela branch, não na `main`.
  Não trate como regressão disponível até o PR #17 ser mergeado.
- O dashboard "Fronteira Viva" **não está e nunca esteve neste repositório** — é um
  Artifact publicado fora do repo (ver `docs/DIARIO-DE-MUDANCAS.md`, entrada de
  2026-09-06). Não referenciar como parte do código-fonte.

## Limitações conhecidas (não são bugs a "consertar" sem decisão)

Auditadas e confirmadas no código em 2026-09-06. Cada uma é escolha de modelagem ou
lacuna deliberada, não descuido — mudar qualquer uma altera os números da varredura e
exige decisão do Gabriel + atualização dos cenários de regressão.

- **Ordem com `dia_limite` além do horizonte é drenada no último dia.** O gerador
  produz `dia_limite = dia_conhecida + buffer`, que pode passar do horizonte;
  `executar_p0` remete o que sobrou no fim para não quebrar a conservação. Isso
  concentra resíduo artificial no último dia. Registrado como efeito de borda
  desprezível acima de ~180 dias — não confirmado por teste dedicado.
- **A direção é sorteada por ordem, não por cliente**, então um cliente pode casar o
  próprio fluxo ("autonetting"), o que infla a netabilidade bruta. Isto **já é medido
  e separado**: `limite_intra_cliente_brl` e `taxa_netabilidade_incremental` no CSV, e
  a linha "descontado o que cada cliente casaria sozinho" na saída da CLI. Use a
  incremental em conversa comercial, nunca a bruta.
- **`visibilidade_dias_min/max` do arquétipo não entra na geração.** O campo documenta
  a intenção de modelar antecedência de forecast separada de `dia_conhecida`; há um
  TODO explícito em `motor/geracao.py`. Hoje é campo inerte.
- **Os valores de arquétipos, mixes, `spread_rail_bps` e `custo_fixo_remessa` são
  placeholders explícitos.** A varredura mede o comportamento do modelo, não
  viabilidade comercial calibrada. Não citar número de varredura como projeção de
  negócio sem dizer isso.
- **A validade regulatória do mecanismo (S13 — consolidação permitida vs. compensação
  vedada) está fora do código.** O simulador quantifica a economia *caso* o mecanismo
  seja válido; ele não decide se é. Contexto no vault Obsidian.

## Antes de implementar

1. Ler este arquivo.
2. Ler a entrada do topo de `docs/DIARIO-DE-MUDANCAS.md`.
3. Verificar a issue correspondente no Linear (workspace "Felipe Bisca", time
   "MOTOR DE FLUXO").
4. Verificar se há ADR técnico relevante em `docs/`, e se a medição já foi feita
   (ver "Relatórios de análise" acima).
5. Rodar os testes relacionados antes e depois da mudança.
6. Abrir PR pequeno e focado.

## Atualização

Última revisão: 2026-09-07.

Sempre que uma decisão técnica desta lista mudar, atualizar esta seção no mesmo
commit da mudança de código. Um AGENTS.md desatualizado é pior que nenhum, porque o
agente confia nele sem checar.

## Proibições

- Não migrar contexto de negócio do Obsidian para o GitHub.
- Não inventar premissas regulatórias.
- Não alterar migrations antigas sem justificativa explícita.
- Não mudar regras de simulação sem atualizar cenários de regressão.
- Nunca criar issues no Linear ou reescrever descrições de tarefa de forma autônoma —
  sinalizar a decisão necessária e parar.
