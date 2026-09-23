# Mapa do repositório

Índice para achar as coisas sem procurar. Estado técnico e planejamento do
front-end atualizados em 2026-09-22.

## Comece por aqui

**Branch integrada: `main` em `c2ad175` pelo PR #37.** A sensibilidade, o fechamento
funcional, as MOT-15–MOT-22 e a política de autonetting preferencial já foram
integrados. A grade histórica não foi regenerada e continua identificada como legado
EDF global.

**Base integrada do front-end:** `origin/main` em `97601bf`, merge da PR #52, contém
a Etapa 2 v2. A branch local `codex/frontend-etapa-3` chega ao candidato
`57be689` antes do fechamento documental final da MOT-77. Seu gate global está
verde e o aceite técnico da Etapa 3 é **PASS**, incluindo prova browser específica
de teclado e zoom a 200% na página nova de diagnóstico robusto. Não houve push, PR,
CI publicado, aprovação de merge ou merge desta branch.

```
main
 └─ gabriel/metrica-tempo        PR #21   colunas de tempo no CSV
     └─ gabriel/varredura-completa  PR #22   a grade e o primeiro relatório
         └─ gabriel/mix-outbound      PR #23   5º mix, regrada, correções
             └─ analise/sensibilidade-custo    decomposição e exposição
```

Ordem de merge da pilha concluída: #21 → #22 → #23 → #24. A fundação web foi
integrada pelos PRs #25–#34. O PR #17 é de outro assunto, continua aberto e está
deliberadamente separado. A MOT-22 foi integrada pelo PR #34 a partir da branch
`codex/mot22-aceitacao-ci`, baseada em `2953a2b`.

```bash
git checkout main
pip install pytest pyyaml numpy
make test          # a contagem vigente é registrada em docs/testing.md
```

## Onde está cada resposta

| Pergunta | Arquivo |
|---|---|
| Regras do repo, restrições, o que não mexer | `AGENTS.md` |
| Onde a economia aparece (carteira, escala, prazo) | `docs/RELATORIO-VARREDURA.md` |
| De que a economia é feita, e a que é sensível | `docs/RELATORIO-DECOMPOSICAO-CUSTO.md` |
| Sensibilidade por custo na grade e exposição de IOF em N=8/12 | `docs/RELATORIO-SENSIBILIDADE-CUSTO.md` |
| Resumo curto para conversa e decisão com a Amanda | `docs/RESUMO-EXECUTIVO-AMANDA.md` |
| O que cada coluna dos CSVs significa | `docs/dicionario-csv.md` |
| O que mudou e quando, com o que cada mudança invalidou | `docs/DIARIO-DE-MUDANCAS.md` |
| Por que o custo é medido em bps e não em % de netabilidade | `docs/adr-cost-bps.md` |
| Por que a cobertura é EDF com desempate por id | `docs/adr-edf-tiebreak.md` |
| Por que autonetting precede a fase multilateral | `docs/adr-autonetting-preferencial.md` |
| Por que cada operação executa individualmente | `docs/adr-model-b.md` |
| Camadas e regra de importação | `docs/architecture.md`, `docs/ARQUITETURA.md` |
| Visão vigente do front-end completo | `docs/superpowers/specs/2026-09-19-frontend-motor-de-fluxo-design-v2.md` |
| Ordem vigente das seis etapas do front-end | `docs/superpowers/plans/2026-09-19-frontend-plano-geral-execucao-v2.md` |
| Escopo e contratos vigentes da Etapa 2 | `docs/superpowers/specs/2026-09-19-frontend-etapa-2-design-v2.md` |
| Plano técnico vigente da Etapa 2 | `docs/superpowers/plans/2026-09-19-frontend-etapa-2-plano-tecnico-v2.md` |
| Operar o fluxo implementado da Etapa 2 v2 | `docs/frontend/etapa-2-v2-operacao.md` |
| Aceite condicional, matriz S15 e handoff | `docs/frontend/etapa-2-v2-aceitacao.md` |
| Auditoria da base da Etapa 3 | `docs/frontend/etapa-3-auditoria-partida.md` |
| Especificação e plano técnico da Etapa 3 | `docs/superpowers/specs/2026-09-20-frontend-etapa-3-design.md`, `docs/superpowers/plans/2026-09-20-frontend-etapa-3-plano-tecnico.md` |
| Operar Empresas, Perfis e diagnóstico robusto | `docs/frontend/etapa-3-operacao.md` |
| Aceite da Etapa 3, matriz S15 e handoff | `docs/frontend/etapa-3-aceitacao.md` |
| Design aprovado e recorte MVP da Etapa 4 | `docs/superpowers/specs/2026-09-20-frontend-etapa-4-design.md`, `docs/superpowers/specs/2026-09-20-frontend-etapa-4-mvp-design.md` |
| Planos técnicos integral e MVP da Etapa 4 | `docs/superpowers/plans/2026-09-20-frontend-etapa-4-plano-tecnico.md`, `docs/superpowers/plans/2026-09-20-frontend-etapa-4-mvp-plano-tecnico.md` |
| Auditoria de partida e hashes do planejamento da Etapa 4 | `docs/frontend/etapa-4-auditoria-partida.md`, `docs/frontend/etapa-4-planejamento.sha256` |
| Operar hipóteses e comparação do MVP | `docs/frontend/etapa-4-mvp-operacao.md` |
| Aceite técnico do MVP da Etapa 4 | `docs/frontend/etapa-4-mvp-aceitacao.md` |
| Design, plano e auditoria da Evolução B da Etapa 4 | `docs/superpowers/specs/2026-09-21-frontend-etapa-4-evolucao-b-design.md`, `docs/superpowers/plans/2026-09-21-frontend-etapa-4-evolucao-b.md`, `docs/frontend/etapa-4-evolucao-b-auditoria.md` |
| Aceite técnico da Evolução B da Etapa 4 | `docs/frontend/etapa-4-evolucao-b-aceitacao.md` |
| Especificação aprovada e plano executável da Etapa 5 — Replay temporal | `docs/superpowers/specs/2026-09-22-frontend-etapa-5-replay-design.md`, `docs/superpowers/plans/2026-09-22-frontend-etapa-5-replay.md` |
| Operar o Replay Fronteira Viva da Etapa 5 | `docs/frontend/etapa-5-replay-operacao.md` |
| Aceite, evidências visuais e limite efetivo da Etapa 5 | `docs/frontend/etapa-5-replay-aceitacao.md`, `docs/frontend/evidencias/mot89-*` |
| IDs T0–T12 e auditoria de `50fc384`/`1270458` | seção "Rastreabilidade aprovada no Linear" e matriz da Task 0 no plano técnico v2 da Etapa 2 |
| Importação de fontes reais e Caso Observado | `docs/superpowers/specs/2026-09-19-importacao-dados-reais-design-v2.md` |
| Plano vigente do importador | `docs/superpowers/plans/2026-09-19-importacao-dados-reais-plano-tecnico-v2.md` |

Os documentos de front-end de 2026-09-11 e de Etapa 2 de 2026-09-13 permanecem como
histórico. Os documentos XLSX de 2026-09-17 preservam os requisitos detalhados do
parser canônico, mas sua arquitetura e sequência executável foram substituídas pelas
versões de 2026-09-19.

Os dois relatórios são **autocontidos**: não pressupõem a conversa que os gerou.

O gate documental da Etapa 2 é MOT-62. A Etapa 3 usa MOT-65–MOT-77 para T0–T12.
O MVP da Etapa 4 usa MOT-78–MOT-81, a Evolução B usa MOT-82–MOT-85 e o Replay
da Etapa 5 usa MOT-86–MOT-89. Os candidatos e matrizes de evidência não
implicam autorização de publicação, merge ou deploy.

## Dados

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `resultados/varredura_bruta.csv` | 27.000 linhas, 6,3 MB | **legado EDF global**; uma linha por rodada (mix × N × W × semente) |
| `resultados/varredura_agregada.csv` | 90 linhas | **legado EDF global**; uma por (mix, N, W), com 300 sementes resumidas |

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
| `scripts/sensibilidade_custo.py` | decompõe a grade e abre as bases de custo/IOF | ~3 min em N=8/12 |
| `scripts/estresse_sensibilidade.py` | reprecifica oito cenários e calcula limites de economia zero | segundos; não regenera carteiras |
| `scripts/projecao_fluxo_hipotetico.py` | converte bps para BRL em fluxos sintéticos de 0,5×, 1× e 2× | segundos; não regenera carteiras |

```bash
PYTHONPATH=. python scripts/diagnostico_custo.py
```

**Uma rodada custa 0,031 s de simulação e 0,504 s de geração de pool.** 94% do custo de
qualquer grade é gerar ordens. Cronometre antes de disparar algo grande.

## Sete armadilhas

Cada uma já custou uma conclusão errada neste projeto.

1. **Cada Ordem é uma operação explícita; não pré-nete o cliente.** OUT e IN do mesmo
   `cliente_id` precisam chegar separados ao motor. Em cada fechamento, a P0 faz
   primeiro o autonetting possível e só então o netting multilateral dos saldos.
   Métricas incrementais e resultados produzidos pelo EDF global são legado; use as
   origens observadas das alocações.

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

## O que já foi medido — legado da política anterior

As medições abaixo continuam úteis para reproduzir e auditar a execução histórica,
mas foram produzidas com EDF global. Não são números vigentes da política de
autonetting preferencial e não devem ser transportadas para ela por inferência.

| Medição | Resultado | Onde |
|---|---|---|
| Decomposição da economia | IOF 85,75% · spread 15,85% · fixo 0,94% · carry −2,54%. Identidade fecha exatamente | `RELATORIO-DECOMPOSICAO-CUSTO.md` |
| Sensibilidade ao `carry_cnr` | 5 valores. Economia só zera em ~1,62%, 40× o atual | idem |
| Heterogeneidade da alíquota por par | mín 0,38% · mediana 3,50% · máx 3,88% — intervalo de 10× | idem |
| Eixo W | W=7, 14 e 30 idênticos em 30/30 sementes. Exceção: W=1 vence em 8 das 9 células do `corporativo_pesado` | `RELATORIO-VARREDURA.md` |
| Variância de `economia_bps` | `mix` 81,9% · `N` 10,8% · `W` 0,003% | idem |
| Base da netabilidade | **não** está inflada; teto é 100%; há teste que amarra | idem |
| Decomposição em toda a grade | IOF 72–89% · spread 11–21% · fixo 0,2–11,6% · carry −1,8% a −3,3% em N=12/W=7 | `RELATORIO-SENSIBILIDADE-CUSTO.md` |
| Sensibilidade de spread/fixo/carry | Inclinações por célula nas 27.000 linhas, sem nova simulação | idem |
| Exposição das duas alíquotas incertas | Aberta por finalidade/direção em 6.000 rodadas de N=8/12 | idem |
| Cenários de estresse e break-even | 8 cenários × 6.000 carteiras; todas positivas no combinado severo; menor limite p10 de carry no piso ≈ 44 bps | idem |
| Fluxos hipotéticos em BRL | 3 escalas × 48.000 cenários; volumes continuam sintéticos e substituíveis | idem |

## O que NÃO foi medido — trabalho em aberto

- **Impacto integral do autonetting preferencial.** A amostra pareada vem antes; a
  grade de 27.000 rodadas só será regenerada após aprovação explícita do Gabriel.
- **Calibração**, não mais estrutura de sensibilidade: faltam o spread e a tarifa
  fixa reais, a confirmação normativa de BENS/SERVIÇOS OUT e ATIVOS_VIRTUAIS OUT
  e o fluxo anual líquido real da carteira candidata. A projeção em BRL publicada
  usa apenas 0,5×, 1× e 2× do volume sintético e não deve ser tratada como dado.
- **Racionalidade individual e rateio por cliente.** A arquitetura prevê rateio do
  custo do resíduo, mas a função e a regra comercial ainda não existem.
- **O mecanismo por trás da exceção do W=1 no `corporativo_pesado`** — registrado, não
  investigado, por decisão.
- **Mix como proporção de volume** em vez de contagem de clientes — decisão nomeada e
  adiada.

## Regras do repositório

- **Não alterar `motor/` numa tarefa de análise.** Se achar bug, reportar e parar.
- **Não criar issue no Linear nem reescrever descrição de tarefa sem aprovação
  explícita** — sinalizar e parar quando essa autorização não existir.
- Não migrar contexto de negócio do vault Obsidian para o repo.
- Invariante de correção usa `raise`, nunca `assert` — a suíte roda sob `python -O`, que
  remove asserts.
- Commits novos: `tipo: descrição (MOT-N)`. Entradas históricas do Diário ainda
  identificadas como `MOT-?` não autorizam repetir o placeholder.
- O art. 22 da Res. BCB 277 está gravado no código: pode-se **agregar** ordens numa
  remessa maior, nunca **quebrar** uma ordem em remessas menores.
- Casar por alíquota (deixar as baratas atravessarem) é planejamento tributário e **não
  entra sem parecer jurídico** — ver o docstring de `motor/custo.py`.
