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

## Uso

```bash
make test      # pytest -q
make exemplo   # python -m motor motor/cenarios/exemplo_amanda.yaml
```

Veja [`CLAUDE.md`](CLAUDE.md) para as regras de arquitetura e [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
para o desenho das camadas.
