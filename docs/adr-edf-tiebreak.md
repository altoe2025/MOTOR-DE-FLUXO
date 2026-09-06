# ADR: EDF com desempate por order ID

## Contexto

Ao fechar um lote, o P0 precisa decidir em que ordem cobrir cada lado (`OUT`/`IN`)
quando `pendente_out ≠ pendente_in`: alguém vai ficar coberto e alguém vai ficar de
fora (ou parcialmente coberto). A ordem de cobertura importa porque decide quem fica
com folga para casar depois e quem é forçado a sair.

## Decisão

O motor usa **EDF** (earliest deadline first) — `(dia_limite, id)` — em vez de FIFO
(ordem de chegada). Confirmado no docstring de `motor/netting.py`:

> "Cobrir primeiro quem tem menos folga libera a restrição mais apertada e deixa as
> ordens folgadas abertas para casar depois. FIFO seria errado: com buffers
> heterogêneos, 'mais antiga' não é sinônimo de 'mais urgente'."

O desempate por `id` (`_prioridade`) não é decorativo: sem um critério determinístico
para ordens com o mesmo `dia_limite`, duas execuções com a mesma seed podem divergir
e a reprodutibilidade quebra silenciosamente — o que invalidaria qualquer comparação
entre células da grade de varredura.

Sobre o papel de N (número de clientes na pool): a grade de varredura roda o mesmo
ponto (mix, N, W) sob várias seeds e resume o eixo de seeds em mediana e faixa. A
dispersão entre seeds só é exposta para **`economia_pct`**, que tem
`min`/`p25`/`p50`/`p75`/`max` em `ResumoCelula`; as demais métricas
(`taxa_netabilidade`, `teto_netabilidade`, `eficiencia_vs_teto`,
`taxa_netabilidade_incremental`) saem só como mediana `p50`. O
`motor/__main__.py` observa, no cabeçalho da CLI de varredura, que "a dispersão entre
seeds é maior que a diferença entre mixes" em algumas regiões da grade — ou seja, o
resultado de uma única execução pode não ser representativo, e a faixa entre
percentis é o que separa um efeito real de ruído de amostragem.

**Ressalva**: a formulação "N reduz variância/risco em vez de aumentar retorno
esperado" e o uso específico do percentil **p10** fazem parte de uma análise anterior
do projeto (contexto de conversa/memória), não estão gravados como tal no código ou
nos comentários deste repositório — o que a varredura de fato calcula e expõe no CSV
são `min`/`p25`/`p50`/`p75`/`max` de `economia_pct`, nunca `p10`, e para as demais
métricas só a mediana. Se a intenção é formalizar esse racional (p10 como o percentil
relevante para decisão sob risco), isso é uma mudança de código
(`motor/varredura.py:_percentil`, chamado com `Decimal("0.10")`, mais a coluna nova em
`ResumoCelula`) a ser proposta como tarefa própria, não uma decisão já tomada.

## Consequências

- Qualquer política de netting alternativa a P0 (ex.: um futuro P1 revisitado) que
  mude o critério de prioridade de cobertura precisa justificar por que EDF deixou de
  ser o critério certo — e não pode reintroduzir FIFO sem entender por que ele foi
  descartado.
- Testes que dependem de reprodutibilidade entre seeds (toda a suíte de varredura)
  quebram silenciosamente se o desempate por `id` for removido ou tornado
  não-determinístico.
- Antes de reportar qualquer conclusão do tipo "N reduz risco", confirmar contra o
  CSV de saída real (`economia_pct_min`/`p25`/`p50`/`p75`/`max` — não existe coluna
  `p10` hoje) em vez de assumir um percentil que o código não calcula.
- `_percentil` arredonda para o posto mais próximo desde 2026-09-06; antes disso
  truncava (piso). CSVs de resumo gerados antes dessa data têm `p25`/`p75`
  calculados pelo piso e não são comparáveis com os novos.

Para contexto de negócio e proveniência, consultar o vault Obsidian.
