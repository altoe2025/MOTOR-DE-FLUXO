# Arquitetura

## Camadas

```
motor/dominio.py      entidades imutáveis (Direcao, Ordem, ParametrosCusto,
                       Cenario, Alocacao, Ciclo, Arquetipo) + carregar_cenario(path)
                       ↑              ↑
motor/netting.py ------+              +------ motor/custo.py
  (casamento OUT/IN                     (IOF, carry CNR, custo de
   dentro da janela P0,                  oportunidade sobre o resíduo
   produz Ciclo)                         de cada Ciclo)
                       \\             /
                        motor/simulacao.py
                    (orquestra netting + custo; PURA)
                                ↑
                        motor/varredura.py
                    (grade mix × N × W; chama simular()
                     num loop — escrever_csv é o único I/O)
                                ↑
        motor/mixes.py (β: composição de carteira)
        motor/geracao.py + motor/arquetipos.py (Camada A: ordens sintéticas)
```

`dominio.py` não importa nada do projeto. `netting.py` e `custo.py` importam apenas
`dominio.py` e nunca um ao outro — ver regra de importação em [`CLAUDE.md`](../CLAUDE.md).
Isso existe para que as branches `felipe/netting` e `gabriel/custo` avancem em paralelo
sem colidir: o único contrato compartilhado é o `Ciclo`.

## Por que `Ciclo` mora em `dominio.py`

`Ciclo` é o valor que `netting.py` produz e `custo.py` consome. Se ele morasse em
`netting.py`, `custo.py` teria que importar `netting.py` para tipar sua própria
entrada — quebrando o isolamento entre as duas branches. Colocá-lo em `dominio.py`
faz dele um contrato neutro que as duas camadas leem.

## Política P0 (etapa atual)

Janela fixa de `janela_dias` dias: o lote fecha a cada `janela_dias`, ou quando alguma
ordem aberta vence, ou no fim do horizonte. Ao fechar, casa `min(pendente_out,
pendente_in)` cobrindo cada lado em ordem **EDF** (`(dia_limite, id)`).

O que sobra **permanece aberto** e só é remetido quando a ordem atinge o próprio
`dia_limite`. O vencimento de uma ordem força a saída apenas daquela ordem, nunca do
lote inteiro. Nesta etapa o corredor é mono-moeda (USD).

> Remeter o lote inteiro no vencimento de uma ordem qualquer era um artefato do
> modelo, não uma escolha de política: arrastava para a remessa ordens que ainda
> tinham dias de folga. Custava ~33 pontos de netabilidade (42,1% → 75,3% num
> diagnóstico de 200 cenários com buffers heterogêneos). Não reintroduza.

## `Alocacao`: a granularidade em que a conservação vive

Cobertura parcial existe: uma ordem de 10 pode ser coberta em 6 no dia 5 e 4 no dia 8.
Isso quebra dois pressupostos do desenho original — não há `dia_executada` único (a
espera fica indefinida), e a mesma ordem aparece em vários `Ciclo`.

`Alocacao(ordem_id, dia, valor_brl, tipo)` é a parcela de uma ordem resolvida num dia,
com `tipo ∈ {CASADO, REMETIDO}`. O invariante é:

    Σ alocações de um ordem_id, em todos os ciclos  ==  valor_brl da ordem

Isso **substitui** "nenhuma ordem aparece em dois ciclos", que deixou de ser verdadeiro.
Toda métrica de volume (netabilidade inclusive) se soma pelas alocações, nunca pelos
`bruto_out`/`bruto_in` dos ciclos — somar os brutos conta o mesmo saldo pendente uma vez
por ciclo e infla o denominador.

## Status de implementação

- `dominio.py` — implementado (entidades + `carregar_cenario`).
- `netting.py` — implementado (`executar_p0`, política P0).
- `custo.py` — implementado (`custo_baseline`, `custo_netado`).
- `simulacao.py` — implementado (`simular`, junta netting + custo).

## Costuras de extensão

Esta etapa entrega P0 + mono-corredor USD. As linhas abaixo não são trabalho
futuro implementado — são o desenho de **onde** cada peça futura vai entrar,
para que ninguém feche uma dessas costuras sem querer nas próximas semanas.

| Peça futura | Onde entra | O que não pode ser quebrado agora |
| --- | --- | --- |
| Camada A (geradores por arquétipo de cliente) | Passa a produzir `tuple[Ordem, ...]` diretamente, substituindo `carregar_cenario` como fonte de ordens. | `Cenario` recebe ordens já prontas — ele não sabe (nem deve saber) se vieram de um YAML ou de um gerador. Nada além da fonte de dados muda. |
| P1 (política oportunista, além da janela fixa) | Outra função com a **mesma assinatura** de `executar_p0`: `Cenario -> tuple[Ciclo, ...]`. | A política não pode virar um `if` dentro de `executar_p0` — cada política é uma função própria, senão `netting.py` vira um emaranhado de casos especiais que ninguém revisa de novo. |
| ~~Varredura de cenários (grid de misturas de arquétipos)~~ — **entregue** em `motor/varredura.py` | `rodar_varredura` (pura) chama `simular()` num loop; `escrever_csv` é a única função com I/O. | `simular` continua pura (sem I/O) — é o que permite paralelizar a varredura depois. E a pool de cada (mix, N) é gerada **uma vez só**, fora do laço de W: regerar por W misturaria ruído de seed com efeito de janela. |
| Switches da Camada E (ex.: S13, art. 50 I) | Novos campos em `Cenario` (ou em `ParametrosCusto`), lidos do YAML como qualquer outro parâmetro. | Não usar variável global nem constante de módulo para isso — todo parâmetro do cenário entra pelo `Cenario`, senão duas simulações na mesma sessão Python passam a interferir uma na outra. |
| Multi-corredor (hoje só existe USD) | Uma camada que particiona as ordens por corredor **antes** de chamar `executar_p0`, e soma os `Resultado` de cada corredor depois. | `executar_p0` deve continuar recebendo ordens de um único corredor por chamada, mesmo hoje só existindo USD — se ele aprender a lidar com mais de uma moeda por dentro, o particionamento por fora vira redundante e ninguém mais confia em qual camada faz o quê. |
