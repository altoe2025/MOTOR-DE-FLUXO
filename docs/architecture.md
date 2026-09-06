# Arquitetura — visão geral de módulos

Este documento é um mapa de leitura rápida de como o código está organizado. Para a
justificativa de cada corte de camada, o desenho do `Alocacao` e as costuras de
extensão previstas, ver o já existente [`docs/ARQUITETURA.md`](ARQUITETURA.md) — este
arquivo não repete aquele conteúdo, só situa onde cada peça mora.

## Contexto

Confirmado por inspeção de `motor/` (14 arquivos `.py`, 1613 linhas ao todo): o
simulador é organizado em módulos de responsabilidade única, com um contrato de
dados neutro (`dominio.py`) no centro.

## Decisão

Módulos, por ordem de dependência:

| Módulo | Responsabilidade | Importa de dentro do projeto |
|---|---|---|
| `motor/dominio.py` | Entidades imutáveis (`Direcao`, `Ordem`, `ParametrosCusto`, `Cenario`, `Alocacao`, `Ciclo`, `Arquetipo`) e `carregar_cenario(path)` | nada |
| `motor/netting.py` | Casamento OUT/IN dentro da janela P0 (`executar_p0`), produz `Ciclo` | só `dominio` |
| `motor/custo.py` | Precificação de cada `Ciclo`: IOF, carry de CNR, spread, custo de oportunidade, custo fixo (`custo_baseline`, `custo_netado`) | só `dominio` |
| `motor/simulacao.py` | Orquestra `netting` + `custo` (`simular`); função pura | `dominio`, `netting`, `custo` |
| `motor/geracao.py` + `motor/arquetipos.py` | Geração sintética de ordens por arquétipo de cliente | `dominio` |
| `motor/mixes.py` | Composição de carteira (peso de cada arquétipo) usada pela varredura | `dominio`, `arquetipos` |
| `motor/varredura.py` | Grade mix × N × W × seed; chama `simular()` num loop; `escrever_csv` é o único I/O do módulo | `dominio`, `simulacao`, `geracao`, `mixes` |
| `motor/__main__.py` | CLI (`python -m motor <cenario.yaml>` e `python -m motor varredura ...`); não é pura, faz I/O | todos os anteriores |

Testes em `tests/` espelham essa mesma divisão por módulo (ver
[`docs/testing.md`](testing.md)).

## Consequências

- Duas pessoas podem trabalhar em `netting.py` e `custo.py` ao mesmo tempo sem
  colidir, porque nenhum dos dois importa o outro — o único contrato compartilhado é
  o `Ciclo` (definido em `dominio.py`).
- `varredura.py` e `__main__.py` concentram o I/O do pacote; todo o resto
  (`geracao`, `netting`, `custo`, `simulacao`) é função pura, o que permite rodar a
  grade em paralelo sem efeitos colaterais entre células.
- Não existe hoje um módulo dedicado a ratear custo entre clientes (ex.:
  `rateio.py`) — `custo.py` calcula custo agregado por `Cenario`, não por
  `cliente_id`. Ver `docs/adr-model-b.md`.

Para contexto de negócio e proveniência, consultar o vault Obsidian.
