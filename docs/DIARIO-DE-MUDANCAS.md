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

| Branch | Situação | Dono |
|---|---|---|
| `main` | atrás de `fix/semantica-remessa-p0` por 2 commits (o PR #11 ainda não foi mergeado) | os dois |
| `fix/semantica-remessa-p0` | **PR #11 aberto desde 2026-09-04**, aguardando revisão. É o MOT-11 | Felipe |
| `netting/p1` | spike do P1, **NÃO MERGEAR** — dominado em netabilidade, ver 2026-09-04 | Felipe |
| `geracao/arquetipos` | mergeada, 16 commits atrás da `main` | Gabriel |
| `modelo/iof-por-finalidade` | mergeada, 6 atrás | Gabriel |
| `modelo/seeds-e-finalidade-por-direcao` | mergeada, 3 atrás | Gabriel |
| `varredura/grid-mix-janela` | mergeada, 10 atrás | Gabriel |

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
