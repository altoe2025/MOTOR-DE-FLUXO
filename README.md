# motor-de-fluxo

Simulador de **netting multilateral de fluxo cross-border** em contas de não residente
(CNR), no mercado brasileiro de câmbio.

## Mecanismo, em três linhas

- `OUT` = o cliente tem reais no Brasil e precisa de moeda no exterior.
- `IN` = o cliente tem moeda no exterior e precisa de reais no Brasil.
- Quando um `OUT` casa com um `IN`, os reais do `OUT` vão para a CNR do `IN` dentro do
  Brasil, e a moeda estrangeira do `IN` vai para o `OUT` fora do Brasil — ninguém remete
  nada, e o fato gerador do IOF de transferência ao exterior não ocorre. Só o
  **excedente** entre bruto `OUT` e bruto `IN` atravessa a fronteira de fato.

Fase atual: política **P0** (janela fixa) e **mono-corredor USD**. Sem UI, banco ou
framework — o objetivo é descobrir com que mistura de clientes o netting compensa.

Cada ordem recebida pelo motor representa a **posição líquida que o cliente decidiu
colocar na pool**. O baseline executa cada uma dessas posições sozinha; não há uma
segunda dedução de netting dentro do cliente.

## Uso

```bash
make test       # pytest -q
make exemplo    # python -m motor motor/cenarios/exemplo_amanda.yaml
make varredura  # python -m motor varredura --saida varredura.csv
```

A varredura roda a grade (mix de arquétipos × N de clientes × W de janela) e escreve um
CSV com a decomposição de custo de cada célula — é ela que responde "com que mistura de
cliente o netting compensa e qual parâmetro domina", não uma simulação solta. A grade
padrão (400 células, até 1000 clientes em 365 dias) sai em ~8 min. Para recortá-la — e
para a maioria das perguntas o recorte basta, já que o eixo W está degenerado:

```bash
python -m motor varredura --saida g.csv --mixes psp_dominante --n 50,200 --w 1,7
```

A análise de sensibilidade de custo reaproveita a grade publicada e abre as bases de
IOF por finalidade/direção na faixa de lançamento N=8/12:

```bash
python -m scripts.sensibilidade_custo --saida resultados/sensibilidade --n 8,12 --w 1,7 --sementes 1:300
```

Ver `docs/RELATORIO-SENSIBILIDADE-CUSTO.md` para método, resultados e ressalvas.

Os pesos dos mixes (`motor/mixes.py`) e os parâmetros de custo da varredura
(`PARAMETROS_VARREDURA`, em `motor/varredura.py`) são **placeholders explícitos** — o
alvo é medir sensibilidade, não acertar o mercado hoje.

Veja [`CLAUDE.md`](CLAUDE.md) para as regras de arquitetura e [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
para o desenho das camadas.
