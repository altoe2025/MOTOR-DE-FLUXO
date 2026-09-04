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
- `netting.py` — stub, responsabilidade de `felipe/netting`.
- `custo.py` — stub, responsabilidade de `gabriel/custo`.
- `simulacao.py` — stub, feito em conjunto na `main` depois que as duas camadas acima
  existirem.
