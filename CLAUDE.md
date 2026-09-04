# CLAUDE.md — motor-de-fluxo

Este arquivo é lido por sessões futuras de Claude Code trabalhando neste repositório.

## O mecanismo

- `OUT` = cliente tem reais no Brasil, precisa de moeda no exterior.
- `IN` = cliente tem moeda no exterior, precisa de reais no Brasil.
- Quando um `OUT` casa com um `IN`: os reais do `OUT` vão para a CNR do `IN` dentro do
  Brasil, e a moeda do `IN` vai para o `OUT` fora do Brasil. Ninguém remete nada, e o
  fato gerador do IOF de transferência ao exterior não ocorre. Só o **excedente** entre
  bruto `OUT` e bruto `IN` atravessa a fronteira e paga IOF.

## Regra de importação

`netting.py` não importa `custo.py`; `custo.py` não importa `netting.py`; ambos
importam só `dominio.py`. `dominio.py` não importa nenhum outro módulo do projeto.

Se uma tarefa parecer exigir quebrar essa regra, **a fronteira entre as camadas está
errada** — pare e pergunte, não contorne.

## Pureza

`geracao`, `netting`, `custo`, `simulacao` e `rateio` são funções puras: sem estado
global, sem I/O, sem `random` sem seed explícita. Dentro do pacote só três funções
tocam disco: `carregar_cenario` (lê YAML), `varredura.escrever_csv` (escreve o CSV da
grade) e a CLI em `__main__.py`.

## Restrição regulatória gravada no código

O motor pode **agregar** ordens numa remessa maior, mas nunca **quebrar** uma ordem em
remessas menores — é o art. 22 da Res. BCB 277 (vedado fracionar operação para
aproveitar prerrogativa de limite). Não "otimize" isso, mesmo que pareça reduzir custo.

## Número de aceitação

Cenário da Amanda (`motor/cenarios/exemplo_amanda.yaml`): baseline ≈ US$ 439 k, netado
≈ US$ 249 k, economia ≈ US$ 190 k. Se o código de `netting.py`/`custo.py` não bater
nesse número quando implementado, **o código está errado**, não o número.

## Convenção de branch e commit

- Toda mensagem de commit termina com o identificador da issue do Linear que fecha,
  ex.: `feat: dominio.py com Ordem, Cenario e Ciclo (GAB-6)`.
- Branches de trabalho usam o `gitBranchName` gerado pelo Linear para a issue, quando
  disponível, para que o Linear associe o PR automaticamente.

## Divisão de arquivos por branch

| Branch | Arquivos que pode tocar |
|---|---|
| `felipe/netting` | `motor/netting.py`, `tests/test_netting.py`, `motor/cenarios/cenario_temporal.yaml` |
| `gabriel/custo` | `motor/custo.py`, `tests/test_custo.py`, `docs/ARQUITETURA.md` |
| `geracao/arquetipos` | `motor/geracao.py`, `motor/arquetipos.py`, `tests/test_geracao*.py` |
| `varredura/grid-mix-janela` | `motor/mixes.py`, `motor/varredura.py`, `motor/__main__.py`, `tests/test_mixes.py`, `tests/test_varredura.py`, `tests/test_cli.py` |
| `main` (os dois juntos) | `motor/dominio.py`, `motor/simulacao.py`, `tests/test_integracao.py`, config |

Se uma tarefa exigir editar arquivo fora da coluna da branch atual, **pare e avise** —
é sinal de que o contrato em `dominio.py` está errado, e o conserto é feito na `main`,
com os dois presentes.
