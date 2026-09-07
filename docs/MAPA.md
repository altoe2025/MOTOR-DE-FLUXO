# Mapa do repositório

Índice para achar as coisas sem procurar. Estado de 2026-09-07.

## Comece por aqui

**Branch: `gabriel/mix-outbound`.** Todo o trabalho de análise está nela, empilhada
sobre outras duas. **Nada disso está na `main`.**

```
main
 └─ gabriel/metrica-tempo        PR #21   colunas de tempo no CSV
     └─ gabriel/varredura-completa  PR #22   a grade e o primeiro relatório
         └─ gabriel/mix-outbound      PR #23   5º mix, regrada, correções  ← AQUI
```

Ordem de merge é #21 → #22 → #23. Nenhum foi mergeado. PR #17 é de outro assunto
(cenários manuais) e está deliberadamente parado.

```bash
git checkout gabriel/mix-outbound
pip install pytest pyyaml numpy
make test          # 258 testes; passa também sob `python -O -m pytest -q`
```

## Onde está cada resposta

| Pergunta | Arquivo |
|---|---|
| Regras do repo, restrições, o que não mexer | `AGENTS.md` |
| Onde a economia aparece (carteira, escala, prazo) | `docs/RELATORIO-VARREDURA.md` |
| De que a economia é feita, e a que é sensível | `docs/RELATORIO-DECOMPOSICAO-CUSTO.md` |
| O que cada coluna dos CSVs significa | `docs/dicionario-csv.md` |
| O que mudou e quando, com o que cada mudança invalidou | `docs/DIARIO-DE-MUDANCAS.md` |
| Por que o custo é medido em bps e não em % de netabilidade | `docs/adr-cost-bps.md` |
| Por que a cobertura é EDF com desempate por id | `docs/adr-edf-tiebreak.md` |
| Por que cada operação executa individualmente | `docs/adr-model-b.md` |
| Camadas e regra de importação | `docs/architecture.md`, `docs/ARQUITETURA.md` |

Os dois relatórios são **autocontidos**: não pressupõem a conversa que os gerou.

## Dados

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `resultados/varredura_bruta.csv` | 27.000 linhas, 6,3 MB | uma linha por rodada (mix × N × W × semente) |
| `resultados/varredura_agregada.csv` | 90 linhas | uma por (mix, N, W), com as 300 sementes colapsadas em p10/p50/p90 |

Ambos têm **5 linhas de comentário `#` no topo** — pule-as antes de passar ao leitor de
CSV. Entraram no git com `add -f` contra a regra `*.csv` do `.gitignore`, de propósito.

Grade: `N ∈ {2,3,4,6,8,12,16,24,32}` × 5 mixes × `W ∈ {1,7}` × 300 sementes pareadas ×
horizonte 365 dias.

## Código do motor

Regra de importação, que não pode ser quebrada: `netting.py` e `custo.py` não se
importam; ambos só importam `dominio.py`; `dominio.py` não importa nada do projeto.

| Arquivo | O que faz | Entradas para achar rápido |
|---|---|---|
| `motor/dominio.py` (256) | entidades imutáveis, loader de YAML | `Ordem` :55 · `ParametrosCusto` :76 · `Cenario` :100 · `Ciclo` :155 · `Alocacao` :30 |
| `motor/netting.py` (181) | a política P0, pura, não sabe o que é dinheiro | `executar_p0` :53 · `_prioridade` (EDF) :48 |
| `motor/custo.py` (142) | precifica os ciclos | `aliquota_iof` :51 · `custo_baseline` :75 · `custo_netado` :97 |
| `motor/simulacao.py` (66) | junta netting + custo | `simular` :32 · `Resultado` :22 |
| `motor/geracao.py` (97) | gera ordens sintéticas por arquétipo | `gerar_ordens` :26 · `gerar_pool` :82 |
| `motor/arquetipos.py` (117) | os 6 perfis de cliente | `TODOS` :107 |
| `motor/mixes.py` (159) | os 5 mixes de carteira | `TODOS` :153 · `validar_mix` :30 |
| `motor/varredura.py` (696) | a grade e o CSV | ver abaixo |
| `motor/__main__.py` (185) | CLI | — |

### `motor/varredura.py`, por ser o maior

| Entrada | Linha | O quê |
|---|---:|---|
| `IOF_POR_FINALIDADE` | 51 | tabela de alíquotas — **duas células incertas, ver ressalva** |
| `PARAMETROS_VARREDURA` | 78 | parâmetros de custo da grade |
| `PontoVarredura` | 108 | uma linha do CSV bruto; a ordem dos campos é a ordem das colunas |
| `MetricasTempo` | 171 | as quatro métricas de espera |
| `_percentil_ponderado` | 201 | percentil por volume, **não** por contagem |
| `metricas_de_tempo` | 230 | espera por alocação, ponderada por volume |
| `_alocar_clientes` | 319 | reparte N clientes entre perfis — **origem do efeito do eixo N** |
| `montar_pool_do_ponto` | 365 | gera a pool de um (mix, N, semente) |
| `montar_ponto` | 377 | simula e embrulha numa linha |
| `rodar_varredura` | 488 | a grade |
| `ResumoCelula` / `resumir` | 537 / 589 | agregação por célula |
| `COLUNAS` | 640 | derivada dos campos do dataclass — acrescentar campo acrescenta coluna |

## Scripts de análise

Todos leem o motor e não o modificam. Precisam de `PYTHONPATH=.`.

| Script | O que faz | Custo |
|---|---|---|
| `scripts/varredura_completa.py` | a grade de 27.000 rodadas e os dois CSVs | ~2,1 h |
| `scripts/diagnostico_custo.py` | decompõe a economia em 4 parcelas + sensibilidade ao carry | segundos |
| `scripts/varredura_janela.py` | medição pareada de 30 sementes sobre o eixo W | ~1 min |
| `scripts/projecao_varredura.py` | cronometra uma rodada e mede a fração IN de cada mix | ~1 min |

```bash
PYTHONPATH=. python scripts/diagnostico_custo.py
```

**Uma rodada custa 0,031 s de simulação e 0,504 s de geração de pool.** 94% do custo de
qualquer grade é gerar ordens. Cronometre antes de disparar algo grande.

## Sete armadilhas

Cada uma já custou uma conclusão errada neste projeto.

1. **A economia em bps é BRUTA e inclui autonetting.** Clientes que casam o próprio
   fluxo de duas pontas não precisam do produto. No mix `outbound_extremo` o netting
   incremental é **zero em 300 de 300 sementes** — o produto não rende 24 bps ali, rende
   zero. Use `taxa_netabilidade_incremental`. **O valor incremental ainda não tem número
   em bps**; converter exigiria reprecificar só as alocações incrementais.

2. **O eixo N não mede escala pura.** Cliente é coisa inteira, e na maioria dos N a
   repartição não realiza a proporção pedida — em N=2 o `equilibrado` vira uma carteira
   de cripto + exportador, sem quatro dos seis perfis. Nos N que dividem exato (6, 12,
   24 no `equilibrado`) a curva É monótona. Ver a seção "Como ler o eixo N" no relatório
   da varredura.

3. **O peso de um mix é contagem de CLIENTES, não de volume**, e o volume por cliente
   varia 7× entre perfis. "Equilibrado" quer dizer clientes iguais, não volume igual.

4. **Duas alíquotas com 34,5% do volume não foram verificadas em norma**:
   `ANEXO_V_BENS_SERVICOS` OUT (bens isento e serviços 0,38% colapsados) e
   `ANEXO_V_ATIVOS_VIRTUAIS` OUT (3,5% por fallback, marcado `INCERTO` no código).
   Margem de ~2× no nível absoluto. **A forma das curvas não depende disso.**

5. **`spread_rail_bps` (25) e `custo_fixo_remessa` (40) são chutes declarados**, não
   calibração. O spread carrega **16% da economia**. Calibrá-lo vale mais que refinar o
   `carry_cnr`, que carrega 2,5%.

6. **Cada semente é uma carteira-ANO de 365 dias**, não um mês. O p10 fala de "9 em cada
   10 carteiras", nunca "9 em cada 10 meses". Nada aqui mede variação mês a mês.

7. **`carry_cnr` só incide no lado netado, e isso está certo.** Sem netting não existe
   posição em conta de não residente para carregar. Não é viés; é o custo que o netting
   cria. Já foi levantado como suposto bug e verificado: o "ZERO por decisão de produto"
   em `varredura.py:84` é sobre `custo_oportunidade_aa`, outro parâmetro.

## O que já foi medido — não refaça

| Medição | Resultado | Onde |
|---|---|---|
| Decomposição da economia | IOF 85,75% · spread 15,85% · fixo 0,94% · carry −2,54%. Identidade fecha exatamente | `RELATORIO-DECOMPOSICAO-CUSTO.md` |
| Sensibilidade ao `carry_cnr` | 5 valores. Economia só zera em ~1,62%, 40× o atual | idem |
| Heterogeneidade da alíquota por par | mín 0,38% · mediana 3,50% · máx 3,88% — intervalo de 10× | idem |
| Eixo W | W=7, 14 e 30 idênticos em 30/30 sementes. Exceção: W=1 vence em 8 das 9 células do `corporativo_pesado` | `RELATORIO-VARREDURA.md` |
| Variância de `economia_bps` | `mix` 81,9% · `N` 10,8% · `W` 0,003% | idem |
| Base da netabilidade | **não** está inflada; teto é 100%; há teste que amarra | idem |

## O que NÃO foi medido — trabalho em aberto

- **Sensibilidade a `spread_rail_bps`, `custo_fixo_remessa` e às duas alíquotas
  incertas.** É onde a incerteza é maior, e nada disso foi varrido. A única
  sensibilidade que existe cobre o `carry_cnr`, que é o parâmetro que menos importa.
- **A decomposição de custo é de um cenário só** (`equilibrado`, N=12, semente 42). As
  proporções entre as quatro parcelas mudam com a composição da carteira e nunca foram
  varridas.
- **O valor incremental em bps.**
- **O mecanismo por trás da exceção do W=1 no `corporativo_pesado`** — registrado, não
  investigado, por decisão.
- **Mix como proporção de volume** em vez de contagem de clientes — decisão nomeada e
  adiada.

## Regras do repositório

- **Não alterar `motor/` numa tarefa de análise.** Se achar bug, reportar e parar.
- **Não criar issue no Linear nem reescrever descrição de tarefa** — sinalizar e parar.
- Não migrar contexto de negócio do vault Obsidian para o repo.
- Invariante de correção usa `raise`, nunca `assert` — a suíte roda sob `python -O`, que
  remove asserts.
- Commits: `tipo: descrição (MOT-N)`. **Os commits desta análise estão com `MOT-?`** —
  o ID do Linear ainda não foi atribuído.
- O art. 22 da Res. BCB 277 está gravado no código: pode-se **agregar** ordens numa
  remessa maior, nunca **quebrar** uma ordem em remessas menores.
- Casar por alíquota (deixar as baratas atravessarem) é planejamento tributário e **não
  entra sem parecer jurídico** — ver o docstring de `motor/custo.py`.
