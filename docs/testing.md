# Testes

## Contexto

Confirmado por inspeção em 2026-09-06: a suíte tem 14 arquivos em `tests/` e 240
testes coletados pelo `pytest`, todos passando (`pytest -q` → `240 passed`).

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
```

### Quando um teste quebra

1. Não ajustar o teste para o comportamento novo sem entender por que o
   comportamento mudou — o "Número de aceitação" e os testes de conservação
   (`Alocacao`) existem para pegar exatamente esse tipo de regressão silenciosa.
2. Ler a entrada do topo de `docs/DIARIO-DE-MUDANCAS.md` — pode já haver contexto
   sobre uma mudança recente que explica a quebra.
3. Se a mudança de comportamento for intencional, atualizar o teste **e** registrar
   o motivo na entrada do diário do mesmo commit.

### Pendência conhecida — cenários manuais não commitados

Os **7 cenários de verificação manual** (previsão feita à mão, ciclo a ciclo, antes
de rodar o motor) e o runner `scripts/rodar_casos_manuais.py` existem apenas na
branch local/remota `docs/auditoria-2026-09-06` (commit `cbc900d`), **não na
`main`**. O mesmo vale para `scripts/exportar_timeline.py`. `docs/DIARIO-DE-MUDANCAS.md`
narra esses 7 cenários como já escritos e rodados — o que é verdade só naquela
branch, não no estado atual da `main`.

Enquanto essa branch não for mergeada, **não trate os 7 cenários manuais como
regressão disponível** — não há arquivo para rodar. Isso é uma pendência do Gabriel
(mergear ou commitar os artefatos), não uma tarefa do Codex.

Para contexto de negócio e proveniência, consultar o vault Obsidian.
