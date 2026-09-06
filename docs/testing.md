# Testes

## Contexto

Confirmado por inspeção em 2026-09-06: a suíte tem 14 arquivos em `tests/` e 249
testes coletados pelo `pytest`, todos passando — tanto em `pytest -q` quanto em
`python -O -m pytest -q`.

## Decisão

### Módulos testados

Um arquivo de teste por módulo (ou por aspecto do módulo), espelhando
`docs/architecture.md`:

- `test_dominio.py` — entidades e `carregar_cenario`.
- `test_netting.py` — `executar_p0`.
- `test_custo.py`, `test_custo_finalidade.py`, `test_finalidade_por_direcao.py` —
  `custo_baseline`/`custo_netado` e a tabela de alíquotas por finalidade/direção.
- `test_geracao.py`, `test_geracao_todos_arquetipos.py`, `test_arquetipos.py` —
  geração sintética de ordens.
- `test_mixes.py` — composição de carteira.
- `test_varredura.py`, `test_netabilidade.py`, `test_resumo.py` — a grade de
  varredura, incluindo `test_celula_do_grid_reproduz_o_numero_de_aceitacao_da_amanda`
  (o número de aceitação, ver `AGENTS.md`).
- `test_cli.py` — a CLI em `motor/__main__.py`.
- `test_integracao.py` — ponta a ponta, netting + custo juntos.

### Como rodar

```bash
make test              # suíte completa (pytest -q)
pytest tests/test_netting.py -q   # um arquivo
pytest -k nome_do_teste -q        # um teste isolado
python -O -m pytest -q            # sem asserts: ver a regra abaixo
```

### Invariante de correção não pode ser `assert`

`python -O` remove todo `assert` do bytecode. Um invariante que garante que o
*resultado* está certo — conservação de valor, validação de entrada de cenário — não
pode depender disso: sob `-O` ele sumiria e o motor devolveria número errado em
silêncio. Esses invariantes usam `raise ValueError`, e a suíte roda também com `-O`
justamente para provar que continuam valendo. `assert` segue válido em teste.

### Quando um teste quebra

1. Não ajustar o teste para o comportamento novo sem entender por que o
   comportamento mudou — o "Número de aceitação" e os testes de conservação
   (`Alocacao`) existem para pegar exatamente esse tipo de regressão silenciosa.
2. Ler a entrada do topo de `docs/DIARIO-DE-MUDANCAS.md` — pode já haver contexto
   sobre uma mudança recente que explica a quebra.
3. Se a mudança de comportamento for intencional, atualizar o teste **e** registrar
   o motivo na entrada do diário do mesmo commit.

### Pendência conhecida — cenários manuais presos no PR #17

Os **7 cenários de verificação manual** (previsão feita à mão, ciclo a ciclo, antes
de rodar o motor) e o runner `scripts/rodar_casos_manuais.py` existem apenas na
branch `docs/auditoria-2026-09-06` (commit `cbc900d`), aberta como **PR #17 e
deliberadamente não mergeada** — **não estão na `main`**. O mesmo vale para
`scripts/exportar_timeline.py`. `docs/DIARIO-DE-MUDANCAS.md` narra esses 7 cenários
como já escritos e rodados — o que é verdade naquela branch, não na `main`.

Enquanto o PR #17 não for mergeado, **não trate os 7 cenários manuais como regressão
disponível** — não há arquivo para rodar na `main`. Decidir o destino do PR #17 é do
Gabriel; até lá, a regressão efetiva do repo são os 249 testes do `pytest`.

Para contexto de negócio e proveniência, consultar o vault Obsidian.
