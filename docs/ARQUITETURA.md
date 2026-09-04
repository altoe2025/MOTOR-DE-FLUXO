# Arquitetura

## Camadas

```
motor/dominio.py      entidades imutáveis (Direcao, Ordem, ParametrosCusto, Cenario, Ciclo)
                       + carregar_cenario(path)
                       ↑              ↑
motor/netting.py ------+              +------ motor/custo.py
  (casamento OUT/IN                     (IOF, carry CNR, custo de
   dentro da janela P0,                  oportunidade sobre o resíduo
   produz Ciclo)                         de cada Ciclo)
                       \\             /
                        motor/simulacao.py
                    (orquestra netting + custo por
                     dia/janela; única camada com I/O —
                     a varredura de cenários escreve CSV)
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

Janela fixa de `janela_dias` dias: todas as ordens com `dia_conhecida` dentro da janela
são casadas de uma vez (`casado = min(bruto_out, bruto_in)`), e o resíduo
(`abs(bruto_out - bruto_in)`) segue como remessa única na direção que sobrou. Nesta
etapa o corredor é mono-moeda (USD).

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
| Varredura de cenários (grid de misturas de arquétipos) | Uma função nova, fora de `simulacao.py`, que chama `simular()` num loop e escreve o CSV. | `simular` precisa continuar pura (sem I/O) — é o que permite paralelizar a varredura depois. Se `simular` passar a escrever arquivo, a varredura vira sequencial por acidente. |
| Switches da Camada E (ex.: S13, art. 50 I) | Novos campos em `Cenario` (ou em `ParametrosCusto`), lidos do YAML como qualquer outro parâmetro. | Não usar variável global nem constante de módulo para isso — todo parâmetro do cenário entra pelo `Cenario`, senão duas simulações na mesma sessão Python passam a interferir uma na outra. |
| Multi-corredor (hoje só existe USD) | Uma camada que particiona as ordens por corredor **antes** de chamar `executar_p0`, e soma os `Resultado` de cada corredor depois. | `executar_p0` deve continuar recebendo ordens de um único corredor por chamada, mesmo hoje só existindo USD — se ele aprender a lidar com mais de uma moeda por dentro, o particionamento por fora vira redundante e ninguém mais confia em qual camada faz o quê. |
