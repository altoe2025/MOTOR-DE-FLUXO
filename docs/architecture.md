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
| `motor/netting.py` | P0 em duas fases por fechamento: autonetting intracliente e saldo multilateral (`executar_p0`), produz `Ciclo` | só `dominio` |
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

## Fronteira de entrada e importadores

`servidor/contracts/input.py` recebe operações explícitas. O adaptador converte cada
`OrdemEntrada` em uma `Ordem` sem compensar, eliminar ou fundir as pontas: um `OUT` e
um `IN` do mesmo `cliente_id` chegam separados à P0, que decide o autonetting no
fechamento correspondente.

Planilhas e PDFs pertencem a uma camada anterior, ainda não implementada. Essa camada
pode sanitizar formatos, mas não pode fazer pré-netting silencioso. Uma agregação de
linhas só preserva o comportamento atual quando todos estes campos forem idênticos:

- `cliente_id`;
- direção;
- `dia_conhecida`;
- `dia_limite`;
- finalidade;
- `eh_efx`;
- corredor e moeda, quando esses campos forem adicionados ao domínio.

Diferença em qualquer componente mantém operações separadas, pois pode alterar a
prioridade, o custo ou a origem do casamento.

## Aplicação web — fluxo persistente da Etapa 2 v2

O navegador não reimplementa geração, netting ou custo. As três origens vigentes
convergem antes da API:

```text
Caso Observado confirmado ─┐
Autoria manual ────────────┼─→ PortfolioSourceSnapshot
Exemplo sintético ─────────┘        │
                                    ▼
                    sourceFingerprint + ScenarioDocument
                                    │
                                    ▼
                   inputFingerprint + PreviaRequest
                                    │
                                    ▼
                  FastAPI → adaptador → motor → envelope
                                    │
                                    ▼
                ExecutionRecord imutável + IndexedDB local
                                    │
                                    ▼
             resultado canônico + Observado × Motor separado
```

`web/src/preparation/resolvePortfolioSource.ts` é a costura de origem; sintético e
manual paramétrico usam a preparação oficial do servidor, enquanto observado e manual
explícito preservam ordens. `buildPreviewRequest.ts` projeta snapshot, premissas,
período e proveniência para o contrato público. `executionService.ts` força o flush,
reserva a tentativa por CAS, executa um único POST e anexa um terminal correlacionado.

A persistência passa somente por `ApplicationRepository`. A implementação IndexedDB
usa um banco por projeto e `owner_sub`, oito stores (`companies`, `observed_cases`,
`import_batches`, `import_events`, `studies`, `executions`, `operations`, `meta`) e
CAS por `expectedRevision` + `operationId`. `BroadcastChannel` notifica outras abas,
mas não substitui CAS. Troca de conta fecha banco/canal, cancela requests e troca o
cache de queries.

Execuções são append-only. Novas execuções preservam os snapshots de origem,
premissas e período, além do request e do envelope. A versão documental permanece
`2.0.0`; os snapshots foram mantidos opcionais no schema para ler documentos 2.0.0
anteriores, e a UI só usa o cenário atual como fallback histórico quando cenário,
revisão e `inputFingerprint` continuam iguais.

Fingerprints têm responsabilidades separadas:

- `sourceFingerprint`: identidade canônica da origem, ordens e proveniência;
- `inputFingerprint`: origem + premissas + período;
- `generation_fingerprint`: determinantes da geração no servidor;
- `execution_fingerprint`: entrada numérica executada e versões;
- `provenance_fingerprint`: proveniência HTTP canônica.

Detalhes de operação, migrations, erros, limites e versões estão em
[`docs/frontend/etapa-2-v2-operacao.md`](frontend/etapa-2-v2-operacao.md). O estado de
aceite e a matriz S15 estão em
[`docs/frontend/etapa-2-v2-aceitacao.md`](frontend/etapa-2-v2-aceitacao.md).

### Fronteiras que permanecem abertas

- A UI da Etapa 2 seleciona Casos Observados `CONFIRMED`, mas não importa arquivos nem
  confirma casos; essa produção fica a montante.
- Limpeza integral de conta, purge definitivo e recuperação de tentativa interrompida
  não têm controles de produto expostos nesta etapa.
- Perfil Operacional, telas completas de Empresa e diagnóstico de múltiplas
  repetições pertencem à Etapa 3 e não foram iniciados.
