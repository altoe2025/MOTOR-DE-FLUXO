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

Atualizada em 2026-09-05, depois de mergear os PRs #11 a #15.

| Branch | Situação | Dono |
|---|---|---|
| `main` | **em dia**: PRs #11 a #15 mergeados, 240 testes passando, zero xfail | os dois |
| `netting/p1` | spike do P1, **NÃO MERGEAR** — dominado, e agora sabemos que a folga é zero em N ≥ 50 | Felipe |
| `fix/semantica-remessa-p0` | PR #11, mergeada | Felipe |
| `fix/previsao-temporal-e-colunas-csv` | PR #12, mergeada | Gabriel |
| `feat/teto-e-eficiencia-no-csv` | PR #13, mergeada | Gabriel |
| `feat/netting-incremental-no-csv` | PR #14, mergeada | Gabriel |
| `perf/netting-sem-custo-quadratico` | PR #15, mergeada | Gabriel |
| `geracao/arquetipos`, `modelo/*`, `varredura/grid-mix-janela` | mergeadas em 2026-09-04 | Gabriel |

**Nenhuma branch está à frente da `main`.** Toda a auditoria de 2026-09-05 está
integrada.

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
