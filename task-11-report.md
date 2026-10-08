# Task 11 / MOT-32 — aceitação integrada da Etapa 2

## Entrega

- `study-observed.spec.ts` confirma e materializa um caso anonimizado, executa o
  motor/API reais, apresenta Observado × Motor, recarrega, converte a origem para
  autoria e preserva a execução anterior. A mesma página é capturada pelo Chromium
  com zoom 200%.
- `study-synthetic.spec.ts` executa exemplo sintético e carteira manual pelo mesmo
  serviço, prova os dois resultados no histórico e valida o envelope persistido após
  reload.
- `study-concurrency.spec.ts` cobre conflito CAS visível em duas abas, isolamento e
  retorno entre contas A/B, as três fixtures legadas, reserva interrompida,
  `blocked`, corrupção e quota injetada no Chromium.
- O bundle E2E recebe o SHA real de `git rev-parse HEAD`; não existe SHA placeholder.
  Rotas SPA `/estudos` e `/estudos/<uuid>` funcionam no servidor local.
- A execução do estudo foi ligada ao editor e ao resultado. Instantes ISO
  semanticamente iguais (`.802Z` / `.802000Z`) são normalizados antes das duas
  validações de compatibilidade, sem relaxar identidades, snapshot ou contrato.
- O scanner detecta access/refresh/id token, token genérico e API key em query
  string. Os E2E inspecionam requests e não observam arquivo bruto, nome local de
  grupo, token em URL ou histórico de edição.

## TDD e falhas reais encontradas

- RED de rota profunda: `/estudos/<uuid>` devolvia JSON 404; GREEN com a allowlist
  estrita de UUID no fallback SPA.
- RED de preparação: fontes agregadas `/orders` eram rejeitadas pelo contrato;
  GREEN com proveniência por campo canônico.
- RED de reload: o controller ainda não tinha concluído `switchSession`; GREEN com o
  gate de prontidão do provider.
- RED de CAS: o conflito era real, mas não causava render; GREEN com assinatura do
  status do controller.
- RED de execução real: Pydantic devolve fração de segundo com seis casas e o
  cliente comparava texto ISO byte a byte; GREEN normaliza apenas o instante antes
  da comparação canônica, inclusive na validação persistida.
- RED de conta B: o auth E2E tinha uma identidade única; GREEN com duas identidades
  locais controladas e allowlist correspondente no servidor E2E.
- A prova de quota inicialmente podia aceitar um `AbortError` ocorrido ao abrir o
  schema, antes da escrita-alvo. O teste final usa um banco-probe novo: a mesma
  transação `versionchange` completa sem override; sob `quotaSize: 1`, o `put` de
  chave única emite `success` e a própria transação aborta com `AbortError`.

## Limites honestos

- Quota é um teste controlado de limite/transação em banco-probe isolado, não
  esgotamento físico de disco nem exercício do schema de produção. No Chromium 153
  observado, o override não foi aplicado a writes em um banco já inicializado; por
  isso a prova cria o banco-probe somente depois de ativar o limite. Nenhuma alegação
  de falha física ou cobertura do schema de produção é feita.
- O gate `real-auth` exige `MOT_REAL_AUTH_BASE_URL`, `MOT_REAL_AUTH_EMAIL` e
  `MOT_REAL_AUTH_PASSWORD`. Essas credenciais não estavam no ambiente e não foram
  inventadas nem solicitadas.
- Nenhuma publicação, push, PR, merge ou alteração no Linear foi feita.

## Gates finais

| Gate | Resultado |
|---|---|
| contratos: `export_openapi` + `generate:api` + diff | aprovado, sem drift |
| `python -m pytest -q` | 715 aprovados, 2 ignorados |
| `python -O -m pytest -q` | 715 aprovados, 2 ignorados |
| `python -m ruff check servidor tests/web_api` | aprovado; escopo CI vigente e arquivos Python da T11 limpos |
| `python -m mypy servidor` | aprovado, 26 arquivos |
| `npm --prefix web run test:unit` | 200 aprovados em 30 arquivos |
| typecheck / lint / build de produção | aprovados; permanece apenas o aviso conhecido de chunk > 500 kB |
| `npm --prefix web run test:e2e` | 9 aprovados em Chromium local |
| scanner no bundle E2E e no bundle de produção | aprovado, 292 e 291 arquivos respectivamente |
| `measure_reference --max-p95-ms 5000` | 5 rodadas, p95 em torno de 11 ms, envelope 8.012 bytes; aprovado contra 5.000 ms |
| wheel instalado fora do checkout | aprovado; cenário Amanda presente via `importlib.resources` |
| `npm --prefix web run test:e2e:real` | 1 ignorado: ambiente sem as três variáveis/credenciais reais |
| `git diff --check` | aprovado |

### Exceção global de Ruff a carregar para T12

O comando literal do brief, `python -m ruff check servidor tests`, foi executado e
**não passou**: encontrou 296 violações preexistentes nos testes legados fora de
`tests/web_api` (273 `FURB157`, 12 `I001`, 5 `C408`, 3 `UP017`, e uma de cada
`B023`, `PLR0402` e `RUF100`). Exemplos representativos são construtores `Decimal`
verbosos em `tests/test_custo.py` e imports antigos em `tests/test_dominio.py`.

A base já limitava o CI a `servidor tests/web_api`; esse escopo foi preservado e
passou. Expandir o lint exigiria alterar centenas de linhas legadas sem relação com
a MOT-32 ou introduzir um CI garantidamente vermelho. A exceção deve permanecer
explícita no fechamento T12; este relatório não declara o gate global aprovado.
