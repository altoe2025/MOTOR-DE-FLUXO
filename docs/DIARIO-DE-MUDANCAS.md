# Diário de mudanças

Onde o Gabriel e o Felipe registram o que cada um está mexendo e o que já mudou no
GitHub. Serve para que os dois analisem o motor a partir do **mesmo estado**, e não
da lembrança que cada um tem de quando olhou pela última vez.

## A regra

**Toda mudança que vai para o GitHub entra aqui.** Push na `main`, merge de PR,
branch nova que começa a andar, spike que muda de status — tudo. Uma mudança que
não está no diário é uma mudança que o outro vai descobrir tarde, provavelmente
no meio de uma tarefa que já assumiu outra coisa.

Isso não é burocracia; é o remédio para um problema que já aconteceu neste repo —
ver a entrada de 2026-09-05.

Escreva a entrada **no mesmo commit** que faz a mudança, não depois.

## Formato de uma entrada

Quatro partes, sempre nesta ordem. Entradas novas vão **no topo** da lista.

1. **Sintoma** — o que se observou, de fora, que estava errado ou faltando.
2. **Causa** — por que acontecia. A explicação, não a linha de código.
3. **O que foi feito** — a mudança, com os arquivos e as branches envolvidas.
4. **O que isso invalida** — medições, números, previsões escritas à mão,
   critérios de aceitação de issue e conclusões anteriores que deixaram de valer.
   **Esta é a parte que mais importa para o outro.** Se ficar vazia, escreva
   "nada" de propósito — vazio por esquecimento e vazio por verificação parecem
   iguais depois.

## Estado atual das branches

Atualize esta tabela em todo push. A data é do último toque.

Atualizada em 2026-09-07, depois da projeção com fluxos hipotéticos.

| Branch | Situação | Dono |
|---|---|---|
| `main` | **em dia**: PRs #1 a #16 mergeadas, 240 testes passando, zero xfail | os dois |
| `netting/p1` | spike do P1, **NÃO MERGEAR** — dominado, e agora sabemos que a folga é zero em N ≥ 50. Só local, nunca foi pro GitHub | Felipe |
| `fix/semantica-remessa-p0` | PR #11, mergeada | Felipe |
| `fix/previsao-temporal-e-colunas-csv` | PR #12, mergeada | Gabriel |
| `feat/teto-e-eficiencia-no-csv` | PR #13, mergeada | Gabriel |
| `feat/netting-incremental-no-csv` | PR #14, mergeada | Gabriel |
| `perf/netting-sem-custo-quadratico` | PR #15, mergeada | Gabriel |
| `docs/estado-das-branches` | PR #16, mergeada | Gabriel |
| `geracao/arquetipos`, `modelo/*`, `varredura/grid-mix-janela` | mergeadas em 2026-09-04 | Gabriel |
| `gabriel/metrica-tempo` | PR #21, aberta; base da pilha de varredura | Gabriel |
| `gabriel/varredura-completa` | PR #22, aberta; empilhada sobre #21 | Gabriel |
| `gabriel/mix-outbound` | PR #23, aberta; empilhada sobre #22 | Gabriel |
| `analise/sensibilidade-custo` | sensibilidade, estresse, limites e fluxo hipotético; 270 testes passando | Codex |

As quatro últimas branches formam uma pilha e ainda não estão na `main`. Toda a
auditoria de 2026-09-05 está integrada. Apagada em 2026-09-06 a branch remota
`github.com/altoe2025/MOTOR-DE-FLUXO`
— push acidental (nome de branch = URL do repo), sem código exclusivo, nunca foi PR.

---

## 2026-09-07 — Projeção em BRL com fluxos hipotéticos

1. **Sintoma.** A sensibilidade terminava em bps porque não existe volume real da
   carteira candidata. Ainda assim, era necessário estimar a ordem de grandeza em
   reais sem apresentar números inventados como dados da Amanda ou das empresas.

2. **Causa.** Wise, Nomad, AstroPay e os rankings bancários divulgam métricas de
   escalas, períodos e geografias diferentes. Nenhuma dessas referências informa
   quanto fluxo líquido seria enviado ao orquestrador. Multiplicar o bps por um
   volume qualquer também distorceria a tarifa fixa quando a escala mudasse.

3. **O que foi feito.** Na branch `analise/sensibilidade-custo`, sem alteração em
   `motor/`, `scripts/projecao_fluxo_hipotetico.py` usa o volume sintético existente
   como faixa central e aplica 0,5× e 2,0×. A tarifa fixa em bps é corrigida em cada
   escala. Quatro CSVs registram fontes públicas, premissas por arquétipo, 144.000
   projeções detalhadas e 480 células agregadas. O relatório e o dicionário marcam
   cada fluxo como suposição substituível. Quatro testes novos elevam a suíte a 270.

4. **O que isso invalida.** Invalida somente a orientação anterior de não calcular
   nenhum valor em BRL antes do volume real. BRL agora pode ser apresentado como
   cenário exploratório, desde que o fluxo usado e sua natureza hipotética apareçam
   junto do número. Não transforma nenhuma faixa em previsão comercial ou dado da
   Amanda; a calibração por carteira continua pendente.

---

## 2026-09-07 — Cenários de estresse e limites da sensibilidade

1. **Sintoma.** A sensibilidade fornecia inclinações isoladas, mas ainda não dizia
   quanto da economia sobreviveria à retirada simultânea das premissas incertas nem
   em que ponto o carry faria o resultado chegar a zero.

2. **Causa.** Os parâmetros podiam ser reprecificados sem nova simulação, mas as
   combinações e os limites matemáticos ainda não haviam sido materializados por
   carteira e por célula.

3. **O que foi feito.** Na branch `analise/sensibilidade-custo`, sem alteração em
   `motor/`, `scripts/estresse_sensibilidade.py` reaproveita as 6.000 linhas já
   publicadas. Oito cenários geram 48.000 linhas e 160 células agregadas. Outros
   dois CSVs calculam o break-even de carry e o spread mínimo em cada carteira.
   Quatro testes novos cobrem a identidade da base, os efeitos combinados, o ponto
   zero e a fração de resultados positivos.

4. **O que isso invalida.** Nada nos CSVs ou relatórios anteriores. Acrescenta a
   ressalva de que a robustez é desigual: todos os resultados permanecem positivos
   no teste combinado severo, mas `outbound_extremo` chega a apenas 3,5 bps no p10
   de N=12/W=7. Os testes não substituem a calibração futura.

---

## 2026-09-07 — Sensibilidade de custo e contrato de entrada líquida

1. **Sintoma.** A decomposição de custo publicada cobria uma única carteira e a
   economia da varredura passou a ser descontada como "autonetting". Essa leitura
   contradizia o funcionamento informado pelo Gabriel: o orquestrador recebe somente
   a posição líquida que o cliente decidiu colocar na pool.

2. **Causa.** A semântica da entrada não estava escrita no repositório. Na ausência
   dela, `limite_intra_cliente_brl` foi interpretado como valor que o cliente faria
   sozinho, embora isso aplique uma segunda dedução de netting sobre uma entrada que
   já chega líquida. Ao mesmo tempo, spread, custo fixo e IOF estavam agregados de
   forma que não permitia reprecificar todas as células sem nova análise.

3. **O que foi feito.** Branch `analise/sensibilidade-custo`, sem alteração em
   `motor/`.
   - `scripts/sensibilidade_custo.py` reaproveita as 27.000 linhas para decompor
     IOF/spread/fixo/carry/espera e calcular inclinações de preço em todas as 90
     células.
   - Em N=8/12, 3.000 carteiras-base foram geradas uma vez e reutilizadas em W=1/7,
     produzindo 6.000 linhas e abrindo a exposição de IOF por finalidade/direção.
   - A reprecificação por bases é conferida exatamente contra `custo_netado`; as
     6.000 economias reproduzem o CSV original com diferença máxima inferior a
     0,005 bps (0,00 bps a duas casas), explicada pelo arredondamento monetário.
   - `tests/test_sensibilidade_custo.py` cobre reprecificação, ausência de valor sem
     contraparte, duas posições opostas, identidade da decomposição e percentuais.
   - `docs/RELATORIO-SENSIBILIDADE-CUSTO.md` registra método, resultados e fórmulas.

4. **O que isso invalida.**
   - Invalida a conclusão comercial de que a economia em bps precisa ser descontada
     novamente por `taxa_netabilidade_incremental`. Sob a entrada líquida, isso faria
     netting interno duas vezes. Em particular, o `outbound_extremo` volta a ser lido
     como cerca de 24 bps no modelo atual — baixo, mas não zero.
   - Não invalida nenhuma das 27.000 simulações: o CSV estava correto e foi
     reaproveitado. Invalida a interpretação de autonetting dos relatórios antigos.
   - A decomposição de um cenário só (85,75% IOF, 15,85% spread, 0,94% fixo,
     −2,54% carry) não pode ser generalizada. Em N=12/W=7, a grade mede IOF 72–89%,
     spread 11–21%, fixo 0,2–11,6% e carry −1,8% a −3,3% conforme o mix.
   - Os níveis ainda não são cotação: faltam spread/tarifa reais e confirmação das
     duas regras incertas de IOF.

---

## 2026-09-07 — Varredura completa, o mix que faltava, e uma revisão externa que corrigiu quatro afirmações (MOT-?)

> **ID do Linear pendente** nesta entrada e nos commits das branches citadas.

1. **Sintoma.** O motor media custo e tempo, mas nunca tinha sido rodado em grade sobre
   uma faixa de composições de carteira. Não havia resposta para "que mistura de
   clientes faz o netting valer a pena", que é a pergunta do projeto.

2. **Causa.** A varredura existia como código (`motor/varredura.py`) mas só tinha sido
   exercitada em grades pequenas de teste. E faltava um mix na ponta OUT-pesada: o mais
   extremo disponível, `retail_pesado`, realiza 28% de volume IN, enquanto o mercado
   brasileiro é estruturalmente mais OUT que isso.

3. **O que foi feito.** Três branches empilhadas, **nenhuma mergeada**:
   `gabriel/metrica-tempo` (PR #21) -> `gabriel/varredura-completa` (PR #22) ->
   `gabriel/mix-outbound` (PR #23).
   - Mix `outbound_extremo` em `motor/mixes.py`, realizando ~9,5% de volume IN.
   - Grade de 27.000 rodadas (5 mixes x 9 N x 2 W x 300 sementes pareadas, horizonte
     365), em `resultados/varredura_bruta.csv` e `varredura_agregada.csv`. Os CSVs
     entram com `git add -f` contra a regra `*.csv` do `.gitignore`, deliberadamente:
     são o dado que sustenta o relatório.
   - `docs/RELATORIO-VARREDURA.md` e `docs/RELATORIO-DECOMPOSICAO-CUSTO.md`, ambos
     autocontidos.
   - Correção em `pct_volume_espera_truncada`: contava a ordem inteira mesmo quando
     parte dela casou antes do horizonte; superestimava de 1,06x a 3,45x.
   - `netting.py`, `custo.py`, `arquetipos.py` e a tabela de alíquotas **intocados**.

4. **O que isso invalida.**
   - **A economia bruta não é o valor do produto.** Ela inclui autonetting. No
     `outbound_extremo` o netting incremental é **zero em 300 de 300 sementes** — o
     produto não rende 24 bps ali, rende zero. Em `retail_pesado`, 0,037 contra 0,535 de
     netabilidade bruta. Qualquer citação anterior de economia em bps como valor
     comercial está errada.
   - **Quatro afirmações do relatório foram corrigidas** depois de revisão externa
     (Codex): "9 em cada 10 meses" (cada semente é uma carteira-ANO); "o split
     direcional explica 82%" (81,9% é do fator `mix` inteiro; o split sozinho dá R2 de
     50,7%); "a janela é irrelevante" (vale no agregado — W=1 vence em 8 das 9 células
     do `corporativo_pesado`); "N=12 é o menor ponto previsível" (não vale para
     `outbound_extremo`, que ainda tem faixa de 32,3% ali).
   - **A curva de N não mede escala pura.** O eixo carrega composição junto, porque
     cliente é coisa inteira e a repartição por maiores médias não realiza a proporção
     pedida na maioria dos N. Em N=2 o `equilibrado` é uma carteira de cripto +
     exportador. Nos N que dividem exato (6, 12, 24) a curva É monótona. Qualquer
     leitura de "quantos clientes bastam" a partir desta grade lê os dois efeitos juntos.
   - **Um achado da revisão NÃO foi acatado**: a alegação de que `carry_cnr` contraria
     uma decisão de zerá-lo. O "ZERO por decisão de produto" em `motor/varredura.py` é
     sobre `custo_oportunidade_aa`, outro parâmetro.
   - **Uma decisão de modelagem foi nomeada e adiada**: o peso de um mix é contagem de
     CLIENTES, mas o que move a economia é VOLUME, e o volume por cliente varia 7x entre
     perfis. Mudar isso exigiria recalibrar os cinco mixes e refazer todos os números;
     adiado até a composição real da carteira chegar.
   - A varredura anterior de 4 mixes (21.600 rodadas) está superada. A decomposição de
     variância dela dava `mix` 58,6%; com a ponta OUT na amostra, dá 81,9%.

---

## 2026-09-07 — Tempo até resolução entra no CSV, e o eixo W se revela quase inerte (MOT-?)

> **ID do Linear pendente.** Não foi criada issue para esta mudança; o `MOT-?` acima
> precisa ser trocado pelo número real antes do push, junto com o do commit.

1. **Sintoma.** O motor media o custo do netting e não media o tempo. Como esperar
   mais sempre neta mais, a varredura com custo como métrica única aponta "espere o
   máximo possível" como configuração ótima — um ótimo que nenhum cliente aceita. A
   restrição que impede esse resultado degenerado é o prazo, e ela não saía no CSV.

2. **Causa.** O dado sempre existiu: `Alocacao.dia - Ordem.dia_conhecida` é o tempo
   que aquela parcela esperou. Ele só era consumido dentro do termo de custo de
   espera, que está zerado por decisão de produto (`custo_oportunidade_aa = 0`), e
   nunca era agregado nem emitido.

3. **O que foi feito.** Branch `gabriel/metrica-tempo`, dois commits, **não** mergeada
   e **não** pushada.
   - `motor/varredura.py`: `MetricasTempo`, `metricas_de_tempo()` e
     `_percentil_ponderado()`; quatro colunas novas em `PontoVarredura` —
     `dias_espera_p90_volume_casado`, `dias_espera_p90_volume_remetido`,
     `dias_espera_media_por_real`, `pct_volume_espera_truncada`.
   - `tests/test_tempo.py`: novo. Caso pequeno com a conta feita à mão antes de rodar,
     percentil ponderado por volume (e não por contagem), identidade contra o termo de
     espera de `custo.py` com `custo_oportunidade_aa=0.01` só dentro do teste, e a
     invariante de conservação.
   - `docs/dicionario-csv.md`: novo, cobrindo as duas saídas da CLI.
   - `scripts/varredura_janela.py` e `scripts/diagnostico_custo.py`: descartáveis.
   - `netting.py`, `custo.py` e a tabela de alíquotas **intocados**.

   A unidade de medida é a **alocação ponderada por volume**, não a ordem: uma ordem
   coberta em tranches esperou prazos diferentes, e cada real conta o tempo que ele
   ficou parado. É a mesma base do custo, e é isso que torna a identidade possível.

   Uma decisão foi revertida no caminho. A quarta coluna nasceu como
   `volume_censurado_pct` (volume sem alocação no fim do horizonte) e virou
   `pct_volume_espera_truncada`, porque a primeira é **estruturalmente zero em toda
   linha**: `executar_p0` drena o que sobrou no último dia e levanta exceção se alguma
   ordem ficar aberta. O viés que ela deveria denunciar entra por outra porta — ordens
   com `dia_limite` além do horizonte são drenadas artificialmente, e a espera delas
   sai truncada e é contada como observada. A invariante virou asserção de teste.

4. **O que isso invalida.**
   - **O eixo W da grade padrão, de seis níveis, é desperdício.** Medição pareada (mix
     `equilibrado`, N=12, horizonte 365, as MESMAS 30 sementes em todos os W):
     W=7, W=14 e W=30 dão resultado **decimalmente idêntico nas 30 sementes**;
     W=3 vs W=7 tem mediana de -0,049 bps com 4/30 sementes invertendo o sinal e 5/30
     empatando — indistinguível de ruído. Só W=1 se separa (mediana -0,921 bps,
     0/30 inversões). Conclusão: `VALORES_W_PADRAO` pode cair de `(1, 3, 7, 14, 30)`
     para três níveis. **Não alterado ainda** — decisão do Gabriel.
   - Qualquer leitura anterior que tenha atribuído diferença de economia à janela
     acima de W=7 estava lendo ruído de semente. Isso vale para a `varredura.csv` e a
     `grade.csv` já geradas.
   - `AGENTS.md` dizia "251 testes"; agora são 257.
   - Nada muda nos números de custo, netabilidade ou no número de aceitação da Amanda:
     nenhuma coluna existente foi renomeada ou recalculada.

---

## 2026-09-06 — `diagnostico_semantica.py` vira oráculo diferencial (e acha uma sutileza do P0)

**Sintoma.** O `diagnostico_semantica.py` estava solto na raiz, não versionado, e existia
para responder uma pergunta que já foi respondida: o ganho do "P1" vinha da política ou
da semântica de remessa? Rodado hoje, ele diz P0 real 75,3% vs. as duas sombras 75,2% —
*"hipótese não se sustenta neste código"*. A missão diagnóstica dele acabou quando o
MOT-11 foi corrigido.

**Causa.** O que sobrou no script tem valor maior que a pergunta original: ele contém uma
**reimplementação independente do P0**. Isso é um oráculo — o tipo de teste que pega
regressão que os testes de valor-previsto-à-mão não pegam, porque estes só cobrem os
casos que alguém pensou em escrever.

**O que foi feito.** Branch `test/oraculo-diferencial-p0`. O script virou
`tests/test_oraculo_p0.py` e foi apagado da raiz. Também apagados `scripts/timeline.json`
e `scripts/timeline_caso7.json`: são saída gerada pelo `exportar_timeline.py`, que está
preservado no PR #17 — dado gerado não entra no repo.

Escrever a sombra expôs **uma sutileza de política que não estava escrita em lugar
nenhum**: uma ordem totalmente coberta sai do lote na hora, e portanto o vencimento dela
NÃO dispara fechamento. Sem essa regra a sombra fechava lotes a mais e netava até 1,7 pp
menos que o motor. O motor sempre esteve certo — era a sombra que descrevia outra
política. Com a regra correta, a concordância é **exata**.

Duas decisões de desenho que valem registro, porque a primeira versão do teste era fraca
e passou por cima das duas:

1. **Compara a linha do tempo de alocações, não o volume total.** O volume casado de um
   ciclo é `min(soma_out, soma_in)`, que não depende de quem foi coberto nem de quando —
   um oráculo de volume é cego a EDF e a timing. Com volume, mutação de EDF e de gatilho
   de janela passavam batidas.
2. **Dois regimes de carteira.** Na densa, alguma ordem vence quase todo dia e é o
   vencimento que dispara; a janela nunca é exercitada (é o mesmo motivo pelo qual o eixo
   W sai degenerado). Foi preciso um regime **esparso** para a janela virar o gatilho e a
   troca de `>=` por `>` ser detectada.

Verificado por mutação: o oráculo pega as cinco — gatilho de janela alterado, EDF sem
desempate por `id`, FIFO no lugar de EDF, ordem quitada mantida no lote, e o bug
histórico de remessa do lote inteiro. Suíte: 249 → **251 testes**, verdes também sob
`python -O`. Número de aceitação inalterado.

**O que isso invalida.** Nada de resultado. Invalida a instrução de "rodar o
`diagnostico_semantica.py`" que aparece na memória exportada do Claude.ai: o script não
existe mais, e o que ele fazia agora roda no `pytest`. Registra também, pela primeira vez
por escrito, a regra de que ordem quitada sai do lote — quem for mexer no `executar_p0`
precisa saber que isso é comportamento, não detalhe de implementação.

---

## 2026-09-06 — Robustez: validação de carga, invariantes que sobrevivem ao `-O`, e dois bugs de CLI

**Sintoma.** Uma auditoria externa do repositório apontou onze lacunas. Sete se
confirmaram como defeito de verdade ao serem reproduzidas no código:

1. `carregar_cenario` não valida id duplicado — dois ids iguais colapsam no dict de
   pendentes do netting e uma das ordens some da conta.
2. `carregar_cenario` não valida ordem conhecida depois do horizonte — ela nunca entra
   no laço diário e nunca é alocada.
3. Os invariantes de conservação do `netting.py` eram `assert`. Sob `python -O` eles
   somem, e os dois casos acima passariam em silêncio com resultado errado.
4. `Alocacao` e `Arquetipo` validavam com `assert` pelo mesmo motivo.
5. `carregar_cenario` nunca lia `iof_por_finalidade` do YAML — o campo existe em
   `ParametrosCusto` desde o PR #9, mas um cenário que declarasse a tabela era
   carregado com ela vazia, caindo no `iof_out`/`iof_in` padrão sem avisar.
6. `_percentil` documentava "posto mais próximo" e implementava piso (`int(...)`).
7. `resumir()` agrupava por `(mix, N, W)` sem o horizonte: dois horizontes diferentes
   viravam uma célula só, reportando o horizonte do primeiro ponto.

Mais dois na CLI: `python -m motor --help` tentava abrir um arquivo chamado `--help` e
morria com `FileNotFoundError`; `python -m motor varredura --help` imprimia a ajuda mas
saía com código 1, porque o `except SystemExit` convertia o help em erro.

**Causa.** As validações nunca existiram (o loader assumia YAML bem-formado, escrito à
mão) e os invariantes foram escritos como `assert` na fase em que eram checagem de
desenvolvimento — antes de virarem a garantia de correção que são hoje. Os dois bugs de
CLI são caminhos que nenhum teste exercitava.

**O que foi feito.** Branch `fix/robustez-carga-invariantes-cli`, com teste antes da
correção em todos os casos (9 testes novos; a suíte vai de 240 para 249):

- `motor/dominio.py`: `_validar_ordens` recusa id duplicado, `dia_conhecida` negativo e
  `dia_conhecida` além do horizonte; `Alocacao`/`Arquetipo` levantam `ValueError` em vez
  de `assert`; o loader passa a ler `iof_por_finalidade` (lista de
  `{finalidade, direcao, aliquota}` no YAML, porque a chave é um par e YAML não tem
  chave composta). A tabela continua opt-in.
- `motor/netting.py`: os quatro `assert` viram `ValueError` com mensagem que diz qual
  ordem quebrou a conservação.
- `motor/varredura.py`: `_percentil` arredonda para o posto mais próximo, como sempre
  prometeu; `resumir()` inclui `horizonte_dias` na chave de agrupamento.
- `motor/__main__.py`: `--help`/`-h` tratados nos dois modos, com código de saída 0.

Verificado: `pytest -q` → 249 passed; `python -O -m pytest -q` → 249 passed (é isso que
prova que os invariantes não dependem mais do `assert`); a varredura roda ponta a ponta.

**O que isso invalida.**

- **`_percentil` muda as colunas `economia_pct_p25` e `economia_pct_p75`** de qualquer
  CSV de resumo gerado antes desta mudança, quando o número de seeds faz o posto cair no
  meio (com 4 seeds e q=0,25, antes vinha a pior seed; agora vem a vizinha). Os CSVs
  soltos na máquina (`grade*.csv`, `varredura*.csv`) foram gerados com o piso — rode de
  novo antes de comparar com saída nova. Nenhuma coluna de mediana (`p50`) muda.
- **Nada do número de aceitação muda**: reconferido ao vivo, baseline ≈ US$ 439 k,
  netado ≈ US$ 249 k, economia ≈ US$ 190 k, netabilidade 58,82%.
- Cenários YAML escritos à mão que tenham id duplicado ou ordem conhecida além do
  horizonte **agora falham na carga** em vez de rodar. Isso é intencional: antes eles
  rodavam e davam número errado. Nenhum cenário versionado no repo tem esse problema.
- **Não invalida** as conclusões da varredura: o eixo que mudou (p25/p75) não é o que
  sustenta nenhuma conclusão registrada até aqui — as leituras foram feitas na mediana e
  na faixa min–max, que não mudaram.

---

## 2026-09-06 — Auditoria de fechamento: o que está na `main` bate com o que validamos

**Sintoma.** Pedido direto: confirmar que tudo rodando no GitHub hoje é
literalmente o produto que testamos e validamos — sem branch presa, sem PR
pendente, sem lacuna escondida entre código e documentação — e, se estiver
tudo certo, deixar registrado aqui como o motor está hoje.

**Causa.** N/A — auditoria de rotina, não um bug relatado.

**O que foi feito.**
- Conferido no GitHub: 16 PRs, todas `MERGED`; nenhuma PR aberta; nenhuma
  branch remota à frente da `main`. Apagada a branch órfã `github.com/altoe2025/MOTOR-DE-FLUXO`
  (ver nota na tabela acima).
- Suíte completa: **240 testes, tudo verde**. Cenário da Amanda conferido ao
  vivo: baseline US$ 439 k, netado US$ 249 k, economia US$ 190 k — bate com o
  número de aceitação do `CLAUDE.md`.
- Escrevi e rodei **7 cenários de verificação manual** (previsão feita à mão,
  ciclo a ciclo, antes de rodar o motor — mesmo método do `cenario_temporal.yaml`),
  em `motor/cenarios/manuais/`, com o runner `scripts/rodar_casos_manuais.py`:
  netting total no mesmo dia; ordem sem contraparte (sai 100% remetida);
  cascata em cadeia (A+B num fechamento, resto de B com C num fechamento
  seguinte); a mesma ordem coberta em tranches ao longo de 3 dias diferentes;
  fechamento disparado só pela janela, incluindo os ciclos "vazios" que isso
  produz quando não há nada para casar nem ninguém vencendo; e um cenário de
  15 ordens com concorrência real — vários OUT ou vários IN abertos ao mesmo
  tempo, com um empate proposital de `dia_limite` — para conferir a prioridade
  EDF e o desempate por `id`. Todas as execuções bateram exatamente com a
  previsão escrita antes de rodar.
- `scripts/exportar_timeline.py`: exporta a saída de `executar_p0` em JSON
  (ordens, ciclos, alocações) — é o que alimenta um dashboard visual que fiz à
  parte (anima a timeline em tempo comprimido, mostra as filas por ordem de
  chegada vs. prioridade e os casamentos/remessas acontecendo). O dashboard em
  si é um Artifact publicado fora do repo, não entrou neste commit — avisem se
  quiserem que eu traga o HTML pra cá.
- Revisão código↔documentação: os 4 itens que a entrada de 2026-09-05 já
  listava como "menores, não consertadas" **continuam abertos hoje**,
  reconferidos linha a linha no código atual:
  1. `motor/geracao.py`: `if dia_conhecida >= horizonte_dias: continue` é
     código morto — `rng.integers(0, horizonte_dias)` já exclui o limite
     superior, a condição nunca é verdadeira.
  2. `motor/varredura.py:_percentil`: o docstring promete "posto mais
     próximo", mas a implementação trunca (`int(...)`, sem arredondar) — é
     piso, não o mais próximo.
  3. `motor/dominio.py:carregar_cenario` ainda não valida id duplicado nem
     `dia_limite` além do horizonte — cenário mal escrito quebra dentro do
     netting, não na carga.
  4. As invariantes de conservação em `netting.py` (linhas 102, 134, 149, 158)
     continuam como `assert` puro — somem em silêncio com `python -O`.
- Também confirmado: a pendência (a) de 2026-09-05 — cliente casando o
  próprio fluxo por causa de `p_out` sorteado ordem a ordem — segue **medida,
  não eliminada**. O CSV separa a taxa incremental desde a PR #14, mas o
  gerador continua sorteando direção por ordem, não por cliente; é decisão de
  produto em aberto, não bug pendente de conserto.
- E um gap novo, achado ao ler `geracao.py` com atenção: `visibilidade_dias_min/max`
  do `Arquetipo` é validado no construtor e testado em `test_dominio.py`, mas
  **não é usado** em `gerar_ordens` — já tem um TODO explícito no código
  (`motor/geracao.py:47`) dizendo isso. A antecedência de forecast declarada
  no arquétipo ainda não afeta o `dia_conhecida` gerado.

**O que isso invalida.** Nada dos números publicados — é o oposto: esta
entrada confirma que o que está na `main` hoje **é** o produto validado até
aqui, sem divergência entre código rodando e o que os testes/cenários
garantem. Todos os itens em aberto listados acima já eram conhecidos (a
maioria desde 2026-09-05) e continuam sem dono; nenhum é surpresa nova, e
nenhum bloqueia usar o motor como está.

---

## 2026-09-05 — Netting deixa de ser superlinear; a grade padrão volta a ser usável

**Sintoma.** A grade padrão não terminava. Deixei rodando 45 minutos e matei sem
resultado, apesar de o README prometer "~20 s" e o `__main__.py` "~2 min". O custo
por ordem crescia com o tamanho da pool: 9 µs em N=10, 30 µs em N=200, 101 µs em
N=1000.

**Causa.** Três fontes de custo quadrático em `executar_p0`, todas de estrutura de
dados e nenhuma de política:
1. `abertas.remove(ordem)` dentro de um laço sobre `abertas` — `list.remove` é
   O(n), o que dá O(n²) por ciclo fechado;
2. `sorted(abertas)` três vezes por dia de fechamento, sobre a lista inteira;
3. `any(o.dia_limite == dia for o in abertas)` todo dia, só para perguntar se
   alguma ordem vence hoje — O(n) por dia mesmo em dia sem fechamento.

**O que foi feito.**
- `abertas` passa a ser mantida sempre ordenada por `_prioridade`, com
  `bisect.insort` na entrada. Filtrar por direção preserva a ordem, então `out` e
  `entrada` já saem canônicas sem nenhum `sorted`.
- As ordens que sobram são acumuladas numa lista nova em vez de removidas uma a
  uma. Como a varredura já é na ordem canônica, a lista nova sai ordenada.
- Um dicionário `vencem_no_dia` conta quantas ordens abertas vencem em cada dia,
  substituindo a varredura diária.
- Antes de tocar no código, entrou
  `test_saida_do_p0_e_bit_a_bit_a_mesma_de_sempre`: um digest SHA-256 sobre a
  saída completa de 108 células da grade — dia, brutos, casado, resíduo, direção e
  cada `Alocacao` na ordem exata da tupla. Verificado verde ANTES da mudança, e
  segue verde depois. Suíte: 240 passando.
- README e `__main__.py` corrigidos: os dois anunciavam tempos que nunca foram
  verdade.

**O que isso invalida.**
- As duas afirmações de tempo na documentação estavam erradas por uma a duas
  ordens de grandeza. Agora o número está medido: **a grade padrão completa,
  400 células com até 1000 clientes em 365 dias, leva 7 min 42 s.**
- Custo por ordem passa de 9→101 µs para **8→13 µs** — praticamente plano, ou
  seja, o netting virou linear no tamanho da pool.
- Nada mais. O resultado é bit a bit idêntico, e é isso que o digest garante.
  **Se aquele teste falhar um dia, ou o refactor mudou o comportamento ou a
  política mudou de propósito — no segundo caso, recalcule o digest DE PROPÓSITO e
  explique no commit. Nunca atualize o valor só para ficar verde.**

---

## 2026-09-05 — Netting incremental: separar o que o cliente faria sozinho

**Sintoma.** Medindo a pendência (a), apareceu um número que muda a proposta do
produto: **entre 47% e 77% do netting que o motor reivindica seria feito pelo
próprio cliente**, só com o fluxo dele, sem contraparte externa nenhuma.

**Causa.** `geracao.py` sorteia a direção ordem a ordem, então todo cliente tem
fluxo nos dois sentidos — um cliente de remessa manda 90% e recebe 10%. Quando o
motor casa a entrada de um cliente com a saída **do mesmo cliente**, isso entra
como netting. Mas a tesouraria dele já faria esse encontro sozinha: usa o dólar
que entrou para bancar o dólar que sai. O valor do produto é casar clientes
**diferentes**, que não se conhecem — e era exatamente essa parte que o CSV não
isolava.

**O que foi feito.** `PontoVarredura` ganha `limite_intra_cliente_brl`
(`Σ 2 × min(manda, recebe)` por cliente — o teto do que fariam sozinhos),
`volume_casado_incremental_brl` e `taxa_netabilidade_incremental`; `ResumoCelula`
ganha a mediana da taxa. O incremental é um **piso**, não valor exato: o
casamento é agregado e não diz quem casou com quem, então subtrair o limite intra
dá o mínimo que só pode ter vindo de clientes diferentes. Chão em zero — quando o
tempo impede um cliente de casar o próprio fluxo, o motor casa menos que o limite
intra, e um negativo ali não significaria nada. A CLI passa a imprimir a linha.
Quatro testes novos, todos vistos falhar antes. Suíte: 239 passando.

**O que isso invalida.**
- **A ordenação das carteiras muda, e a inversão se sustenta nos três tamanhos.**

| carteira | net bruta (N=200) | incremental | perde para o intra |
|---|---|---|---|
| corporativo_pesado | 97,4% | **51%** | 46,4 pp |
| psp_dominante | **99,5%** | 45% | 54,5 pp |
| equilibrado | 87,3% | 40% | 47,3 pp |
| retail_pesado | 62,5% | 16% | 46,5 pp |

  Pela netabilidade bruta, `psp_dominante` é a melhor carteira. Pelo netting que o
  produto de fato cria, **`corporativo_pesado` é a melhor**, e o PSP é justamente
  quem mais perde para o intra-cliente (54 a 60 pontos), porque no modelo ele
  recebe arrecadação e paga merchant no mesmo volume.
- **Toda economia citada até hoje está inflada por esse efeito.** Os 80% do mix
  equilibrado viram 41% de netting incremental. Não usar a bruta em conversa
  comercial.
- Pergunta em aberto para a Amanda, agora com número: **na vida real, quanto do
  próprio fluxo um cliente desses já casa antes de procurar um serviço como o
  nosso?** Se casar tudo, o mercado endereçável é o incremental. Se não casar nada
  (porque as pontas caem em dias, moedas ou entidades diferentes), a bruta volta a
  valer. A verdade está no meio e só ela sabe onde.
- O gerador **não foi alterado**: a decisão entre direção por ordem e por cliente
  segue aberta, agora medida dos dois lados.

---

## 2026-09-05 — Teto da carteira e eficiência da política entram no CSV

**Sintoma.** Lendo a grade, não havia como responder à pergunta mais básica sobre
uma célula: uma netabilidade de 90% significa que a política é boa ou que a
carteira já era equilibrada? São conclusões opostas para o produto e o CSV não
distinguia as duas.

**Causa.** Faltava a referência. O melhor que qualquer política pode fazer numa
pool é `1 − |OUT−IN| / (OUT+IN)` — a soma dos resíduos nunca fica abaixo do
desbalanço total, então nem um ciclo único que enxergasse a pool inteira netaria
mais que isso. Sem esse teto no CSV, a netabilidade era um número sem denominador.

**O que foi feito.**
- `PontoVarredura` ganha `teto_netabilidade` e `eficiencia_vs_teto`; `ResumoCelula`
  ganha as medianas das duas. Calculados em `montar_ponto`, a partir da pool —
  nenhuma camada abaixo foi tocada.
- O resumo da CLI passa a imprimir uma segunda linha por mix dizendo quanto do
  possível a política extraiu.
- Cinco testes novos, todos escritos antes da implementação: o teto é a fórmula
  sobre a pool, a netabilidade nunca o ultrapassa, a eficiência é a razão entre os
  dois, uma pool perfeitamente equilibrada tem teto 1, e o resumo carrega as
  medianas. Suíte: 234 passando.
- Bug de portabilidade corrigido no mesmo commit: a seta `→` que eu tinha posto na
  linha nova da CLI derruba o processo inteiro com `UnicodeEncodeError` no console
  do Windows (cp1252). **A saída da CLI só pode usar caracteres do cp1252.** O
  código anterior escapava por usar travessão, que está na tabela.

**O que isso invalida.**
- A pendência (d) de 2026-09-05 está **fechada**: dá para separar carteira de
  política lendo o CSV.
- E a resposta que ela dá é forte, agora medida célula a célula: com 50 clientes
  ou mais a eficiência é **98% a 100%**, e com 200 é **100,0% em todas as quatro
  carteiras**. A política P0 não deixa nada na mesa em escala realista. Só com 10
  clientes sobra folga (92% a 97%), que é onde o timing ainda aperta.
- Consequência direta: **qualquer trabalho de política (P1, lookahead, teto de
  folga) tem ganho máximo de zero em N ≥ 50.** O que move o resultado é a carteira.
  O teto do `retail_pesado` é 62,5% mesmo com 200 clientes — nenhuma política vai
  consertar fluxo unidirecional.
- Todo CSV gerado antes deste commit não tem as duas colunas novas.

---

## 2026-09-05 — Colunas de volume do CSV fechando, e três medições que mudam a leitura da varredura

**Sintoma.** Auditoria antes de subir a `main`. Numa linha qualquer do CSV da
varredura, `volume_casado_brl / volume_bruto_brl` dava 45,30% enquanto a coluna
`taxa_netabilidade` da **mesma linha** dizia 90,60%. Além disso, três medições
novas mostraram que o número de netabilidade que a varredura reporta depende
muito mais de escolhas do gerador do que se supunha.

**Causa.** `montar_ponto` somava `ciclo.casado`, que é grandeza de **uma perna**
(o mínimo entre os dois lados), enquanto `volume_bruto_brl` conta as **duas**. O
que deixou de atravessar são as duas pernas — os reais que ficaram no Brasil e a
moeda que ficou lá fora. Faltava o fator 2. Nenhum teste cobria a relação entre
as colunas: os testes de conservação olham as alocações, não o CSV.

**O que foi feito.**
- `motor/varredura.py`: `volume_casado_brl` passa a contar as duas pernas. Agora
  `casado + residuo == bruto` exatamente, e `casado / bruto == taxa_netabilidade`.
- `tests/test_varredura.py`: teste novo travando as duas igualdades em toda célula
  da grade. Falhava antes do conserto.
- Suíte: 229 passando.

**O que isso invalida.**
- **Todo CSV de varredura gerado antes de hoje** tem a coluna `volume_casado_brl`
  pela metade. Os `.csv` na raiz do repo (`varredura_local.csv`, `varredura_nova.csv`,
  `grade.csv`, `grade_resumo.csv`) estão nessa condição — regerar antes de usar.
  As colunas de custo e economia **não** foram afetadas.
- **Felipe: isto atinge a MOT-14 diretamente.** A Sensibilidade (Etapa 4) roda em
  cima desse CSV. Regere a grade antes de tirar qualquer conclusão, e leia (c)
  abaixo antes de gastar uma rodada no eixo W.
- Três pendências **medidas, não consertadas** (ver a seção abaixo).

### Pendências medidas em 2026-09-05 — decidir antes de tratar a varredura como resultado

**(a) O gerador sorteia direção ordem a ordem, não por cliente.** Cada cliente
simulado é bidirecional: 22% a 40% do volume dele fica na direção contrária ao
próprio arquétipo, então o cliente neta contra si mesmo. Trocando para uma direção
por cliente, a netabilidade cai de **70–91% para 47–76%** (5 seeds, mix
equilibrado, 12 clientes, horizonte 90). Não é bug contra a especificação —
`Arquetipo.p_out` está documentado como probabilidade por *ordem*. Mas é a
diferença entre "o netting neta 90%" e "neta 60%", e a escolha nunca foi decidida
de propósito. Já havia um comentário em `varredura.py` prevendo corrigir isso,
tratando como detalhe de finalidade; ninguém tinha medido o efeito no número
principal.

**(b) Até 26% do resíduo é artefato do fim do horizonte.** `geracao.py` cria
ordens com `dia_limite` além do horizonte (com horizonte 90, vi prazo até o dia
114 — 10% do volume), e o netting liquida tudo à força no último dia. A fatia do
resíduo que vem só disso varia por seed: 10,2% / 26,1% / 0,6% nas seeds 1/2/3.
Contamina o número principal de forma imprevisível. Opções: limitar `dia_limite`
ao horizonte, descartar os últimos dias, ou excluir o ciclo final da estatística.

**(c) O eixo W da varredura está degenerado.** Em N=50, horizonte 365, 5 seeds, a
netabilidade mediana é **idêntica até a 6ª casa decimal** para W ∈ {1, 3, 7, 14,
30}; a economia difere na 6ª casa, que é ruído de arredondamento. É consequência
esperada da correção do MOT-11 — o fechamento passou a ser dirigido por
vencimento, não pela janela. Dois efeitos: a grade padrão gasta 5× o tempo num
eixo sem sinal, e o resumo da CLI faz `max()` sobre esses empates, escolhendo W=1
por uma diferença de 0,000001 e imprimindo como se a janela importasse.
**Reportar, não deletar ainda** — o eixo pode voltar a ter sinal se a política
mudar.

**(d) A política já extrai quase tudo que a pool permite — o que a varredura mede
é composição, não política.** Definindo `teto = 1 − |OUT−IN| / (OUT+IN)` (o melhor
que um ciclo único poderia fazer, já que a soma dos resíduos nunca fica abaixo do
desbalanço total), a eficiência `netabilidade / teto` medida na grade é:

| mix | N=10 | N=50 |
|---|---|---|
| equilibrado | 93,1% | 98,8% |
| retail_pesado | 92,1% | 100,0% |
| corporativo_pesado | 96,1% | 99,1% |
| psp_dominante | 93,5% | 98,2% |

Média 96,4%. Ou seja: **a netabilidade que o CSV reporta é essencialmente uma
propriedade do desbalanço OUT/IN da pool gerada, não do algoritmo.** Isso explica
de uma vez o eixo W degenerado e o P1 dominado — não sobra folga para política
nenhuma capturar. O que move o resultado é o mix (teto de 63% no `retail_pesado`
contra 97% no `psp_dominante`), que é exatamente a pergunta do projeto. **O CSV
não tem coluna de teto nem de eficiência**, então hoje não dá para separar as duas
coisas ao ler a grade. Acrescentar essas duas colunas é o próximo passo óbvio, e é
insumo direto da MOT-14.

**(e) O netting é superlinear, e a grade padrão leva ~25 min, não os "~20 s" do
README nem os "~2 min" do `__main__.py`.** Custo por ordem medido: 9 µs em N=10,
30 µs em N=200, 101 µs em N=1000 (132.771 ordens, 13,4 s por chamada). Três fontes,
todas em `netting.py`: `abertas.remove(ordem)` dentro de um laço sobre `abertas`
(O(n²)); `sorted(abertas)` três vezes por dia de fechamento; e
`any(o.dia_limite == dia for o in abertas)` todo dia. Prototipei a correção
(manter `abertas` ordenada com `bisect.insort`, reconstruir a lista em vez de
remover item a item, e contar vencimentos por dia num dicionário): **11× mais
rápido em N=1000, com saída bit a bit idêntica em 72 cenários conferidos.** A
grade padrão cairia de ~25 min para ~3 min. Não apliquei — `netting.py` é coluna
do Felipe.

**Menores, não consertadas:** as invariantes de conservação são `assert` e somem
com `python -O` (testado: uma ordem some em silêncio em vez de estourar);
`carregar_cenario` não valida id duplicado nem dia fora do horizonte, então o erro
sai apontando para as tripas do netting; há um `if` morto em `geracao.py:52`;
`_percentil` é piso e não "posto mais próximo" como o docstring diz; `resumir`
ignora o horizonte ao agrupar.

---

## 2026-09-05 — Previsão do `cenario_temporal.yaml` refeita à mão

**Sintoma.** O teste `test_cenario_temporal_bate_com_a_previsao_escrita_no_yaml`
estava `xfail(strict=True)` desde a correção do MOT-11. Além disso, chegou uma
tarefa pedindo para "corrigir a falta de carry-over no P0" descrevendo um
`netting.py` que não existe mais no repo desde 2026-09-04.

**Causa.** Duas coisas, com a mesma raiz. A previsão no topo do YAML foi escrita
à mão sob a semântica antiga (o vencimento de uma ordem fechava o lote inteiro),
e ninguém a refez depois que a semântica mudou. E a tarefa foi escrita a partir
do estado da **`main`** em `ade537c`: os commits do MOT-11 existem no GitHub, mas
na branch `fix/semantica-remessa-p0`, dentro do PR #11, que segue **aberto e não
mergeado**. Quem leu a `main` leu o código antigo sem ter como saber disso.

**O que foi feito.**
- Previsão do topo de `motor/cenarios/cenario_temporal.yaml` recalculada à mão,
  ciclo a ciclo, antes de rodar o motor. Só os dias 4 e 5 mudaram: a1 não é mais
  remetida no dia 4, fica aberta e casa integralmente com f1 no dia 5. Os outros
  dez ciclos já batiam.
- `tests/test_netting.py`: `xfail` removido, previsão atualizada, e a tupla
  esperada passou a incluir `bruto_out`/`bruto_in` — é onde a semântica nova
  aparece (o bruto é saldo pendente, não valor original: no dia 5 o lado OUT vale
  40, não os 100 com que a1 foi criada).
- Suíte: 228 passando, nenhum `xfail`.
- A tarefa do "carry-over" **não foi implementada**: o defeito que ela descreve já
  estava corrigido, e o algoritmo que ela propõe seria uma regressão (ver abaixo).

**O que isso invalida.**
- A pendência "`cenario_temporal.yaml` está `xfail`, previsão precisa ser refeita"
  está **fechada**.
- Os números de aceitação daquela tarefa estão **errados** em duas das três
  linhas. Medido na `main` de hoje: contraexemplo P/Q/R/S dá **100,0% de
  netabilidade e IOF 0** (a tarefa dizia que a `main` dava 50% e que 100% era a
  meta — já é a meta); `cenario_temporal` dá **60,27% e IOF 5,1580** (a tarefa
  previa 32,88% e IOF 9,0380 como resultado desejado, o que seria pior que hoje).
  Só `exemplo_amanda` bate: economia de US$ 190 k.
- O algoritmo proposto por aquela tarefa exigiria devolver `Ciclo.ordens` no lugar
  de `Ciclo.alocacoes` (edita `dominio.py`) e desfazer a cobertura parcial, que a
  `main` adota deliberadamente e argumenta não ser fracionamento do art. 22 — ver
  o docstring de `motor/netting.py`. Continua sendo uma pergunta aberta para a
  Amanda **qual leitura do art. 22 vale**, mas o código já escolheu uma, e trocar
  não é refatoração.

---

## 2026-09-04 — Resíduo sai no vencimento da ordem, não no fechamento do lote (MOT-11)

**Sintoma.** O P0 netava 42,1% num diagnóstico com pools sintéticas. Duas políticas
alternativas mediam 75,2% — uma delas idêntica ao P0 exceto pelo momento da
remessa. O ganho todo vinha da semântica, nenhum vinha da política.

**Causa.** `executar_p0` fechava o lote inteiro quando **qualquer** ordem aberta
vencia, e mandava para o exterior todo o excedente — inclusive ordens que ainda
tinham dias de folga e teriam encontrado contraparte depois. Contraparte com folga
é o ativo mais escasso do motor, e o fechamento queimava toda ela.

**O que foi feito.** Branch `fix/semantica-remessa-p0`, dois commits, hoje na
`main` (ainda não em `origin/main`).
- O vencimento de uma ordem força a saída **apenas daquela ordem**. O saldo de quem
  tem folga permanece aberto para os ciclos seguintes.
- Entrou `Alocacao` em `dominio.py`: como uma ordem passa a ser coberta em tranches,
  não existe mais um `dia_executada` único. `Ciclo.ordens` virou `Ciclo.alocacoes`,
  e a conservação passou a viver nas alocações (a soma das alocações de um
  `ordem_id` é o `valor_brl` da ordem).
- Cobertura em ordem EDF (`dia_limite`, `id`). P0 subiu para 75,3%.
- Bug de reprodutibilidade junto: as alocações `REMETIDO` saíam na ordem de entrada
  da tupla, não na canônica — embaralhar a entrada mudava o resultado em 15 de 20
  cenários.
- `custo.py` passou a cobrar IOF pela alíquota da ordem que de fato atravessou. O
  pro-rata `_aliquota_media_do_lado` existia só porque o motor não sabia quem
  cruzava; agora sabe, e ele saiu.

**O que isso invalida.**
- Qualquer número de netabilidade medido antes desta data. A base mudou de 42%
  para 75%.
- A previsão à mão de `cenario_temporal.yaml` (resolvido em 2026-09-05).
- O critério de aceitação da MOT-11 ("teste mostrando P1 com netabilidade ≥ P0")
  **não é satisfazível** e precisa ser reescrito: contra o P0 corrigido, o P1 com
  casamento *eager* neta **menos** (−0,45 pp em média, −2,6 pp no pior caso).
  Casamento guloso é míope — gasta contraparte com ordens folgadas sem saber que
  ordens urgentes vão chegar. Decisão do Gabriel: não entregar o P1; o spike fica
  na branch `netting/p1`, fora da `main`. Se voltar, o desenho a considerar tem
  lookahead, não casamento guloso.
