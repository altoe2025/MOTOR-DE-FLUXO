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

## Aplicação web — base herdada da Etapa 2 v2

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

A persistência passa somente por `ApplicationRepository`. A Etapa 2 criou oito
stores e CAS por `expectedRevision` + `operationId`; a Etapa 3 evolui esse mesmo
banco e a mesma porta para a versão 2 descrita abaixo. `BroadcastChannel` notifica
outras abas, mas não substitui CAS. Troca de conta fecha banco/canal, cancela
requests e troca o cache de queries.

Execuções são append-only. Novas execuções preservam os snapshots de origem,
premissas e período, além do request e do envelope. Na Etapa 2, a versão documental
era `2.0.0`; a migration da Etapa 3 preserva esses documentos e os converte para
`StudyDocument` 3.0.0 sem fabricar receita geradora ausente.

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

## Aplicação web — autoridade da Etapa 3

A Etapa 3 acrescenta Empresas, Perfil Operacional, diagnóstico robusto e comparação
temporal sem alterar o motor nem ampliar `PortfolioSource`. Há dois fluxos de
autoridade:

```text
casos confirmados
→ cálculo puro operational-profile-v1
→ validação + fingerprints
→ profile_versions append-only
→ snapshot integral no StudyDocument 3.0.0 por CAS

cenário + snapshots
→ DiagnosticRequest 1.0.0
→ reserva QUEUED por CAS
→ executor autenticado owner-scoped em memória
→ repetição no ProcessPoolExecutor
→ análise pura dos sete eixos
→ terminal append-only
→ IndexedDB
→ UI sobre DiagnosticEnvelope validado
```

### Perfil Operacional

`web/src/profiles/calculateOperationalProfile.ts` recebe casos já lidos pela porta,
ordena casos e ordens, calcula em `decimal.js` e produz
`OperationalProfileVersion` 1.0.0. Compatibilidade, ausência e cobertura são dados
do documento, não estados implícitos da tela. SHA-256 sobre JSON canônico separa o
fingerprint da seleção do fingerprint do documento.

O IndexedDB físico/lógico é 2. A store adicional `profile_versions` usa
`profile_version_id` e índices `by_owner`, `by_owner_company` e
`by_owner_company_version` único. O upgrade 1→2 migra estudos, execuções e resultados
idempotentes na mesma transação e só então grava o marcador. A porta continua sendo
o único acesso ao banco; não há uma segunda interface V3 em runtime.

`attachOperationalProfileEvidence` copia a versão completa para
`evidenceSnapshots`. Isso informa contexto e proveniência, mas não transforma perfil
em origem executável, não materializa ordens e não habilita uma execução.

### Diagnóstico robusto

`web/src/diagnostics/buildDiagnosticRequest.ts` distingue entrada fixa de receita
geradora preservada. Entrada fixa tem uma execução; entrada gerada aceita exatamente
10, 30 ou 100 repetições e registra todos os IDs e seeds. O servidor valida os
contratos em `servidor/contracts/diagnostics.py`, mantém uma fila FIFO owner-scoped
em `servidor/diagnostics/executor.py` e executa funções puras em processos.

O registry é local ao processo: dois workers por padrão, configuráveis de um a
quatro, limite de três jobs ativos por usuário, 32 globais e retenção terminal de 24
horas. Cancelamento é cooperativo entre repetições. Retry cria job/tentativa novos.
Reinício perde a fila; uma reserva local cujo job desapareceu vira `INTERRUPTED`, sem
reenvio automático.

`servidor/diagnostics/analysis.py` deriva os sete eixos do request e dos envelopes
canônicos. Consequências e limitações têm referências verificadas. A UI separa
distribuição e execução selecionada, usa o envelope validado e mantém tabela
equivalente para cada gráfico; não recalcula números do motor.

### Fronteiras que permanecem abertas

- A produção/importação de Caso Observado continua a montante; Empresas apenas
  consome registros existentes.
- Perfil Operacional continua evidência. Receita geradora e quarta origem pertencem
  à Etapa 4 e ainda não foram implementadas.
- Jobs não são duráveis nem coordenados entre instâncias.
- Purge integral e recuperação administrativa não ganharam novos controles de
  produto.
- A página do diagnóstico robusto possui prova browser de teclado e zoom a 200%; as
  tabelas horizontalmente roláveis são regiões nomeadas e focáveis.

Operação e contratos detalhados estão em
[`docs/frontend/etapa-3-operacao.md`](frontend/etapa-3-operacao.md); a matriz de
aceite está em
[`docs/frontend/etapa-3-aceitacao.md`](frontend/etapa-3-aceitacao.md).

## Importação integrada — Etapa 6A (MOT-61)

Esta seção atualiza a fronteira histórica de produção do Caso citada acima.
`/importar` e `/empresas/:companyId/importar` leem o layout
`xlsx-operacoes/1.0.0` por ação explícita. Selecionar o arquivo não executa leitura.
`workerClient` valida extensão e tamanho antes de obter o buffer; o worker faz
preflight ZIP/OOXML limitado, rejeita fórmulas e estruturas proibidas e devolve
somente linhas serializáveis e metadados. O layout admite até 1.000 operações.

`ImportFlowController` mantém arquivo, células e nomes de origem apenas na sessão
volátil. Comandos puros produzem revisão, identidade canônica, correções e
conflitos explícitos. `publisher.confirmImport` revalida o Caso, projeta um nome
fixo de fonte e auditoria canônica, redige células inválidas e chama uma única
transação em `ApplicationRepository.confirmObservedCase`: Empresa, Caso, lotes,
eventos e operação idempotente são gravados juntos ou não são gravados.
CAS impede duas confirmações concorrentes do mesmo Caso. Banco e consultas são
isolados por `projectRef` e `ownerSub`; a conta B pode conter sua própria
demonstração sintética, mas não importações da conta A.

Confirmar o Caso não cria Perfil, Estudo, prévia ou diagnóstico. Depois da recarga,
o usuário confirma manualmente uma versão do Perfil, cria um Estudo e anexa o
snapshot do Perfil como evidência. Selecionar o Caso como origem do Estudo preserva
cada operação explícita: duas pontas do mesmo cliente não são pré-netadas pelo
importador. Antes de executar prévia, diagnóstico, retry ou reconstruir Replay,
`importer/executionGate.ts` identifica a proveniência `xlsx-operacoes` ou a
ancestralidade `derivedFromObservedCase.importedFromXlsx` e consulta
o catálogo via `ApiClient`, com timeout/auth/schema existentes. Estado indisponível
ou `NAO_CONFIGURADO` bloqueia antes da reserva/POST. A derivação para autoria
preserva o marcador de ancestralidade mesmo quando todos os campos ganham nova
proveniência manual. Esse marcador opcional participa do source fingerprint e do
schema persistido, sem invalidar documentos antigos. Sintético/demo não exige
catálogo de importação. `CONFIGURADO` sozinho não libera a carteira: cada ordem
precisa de um par `(finalidade, direcao)` presente nas alíquotas do catálogo antes
da reserva/POST. Finalidade ou direção ausente falha fechado, sem citar dados da
operação na mensagem pública.
Revisão e confirmação local continuam livres. Cancelar ou acompanhar um job já
iniciado permanece possível. Diagnóstico e Replay usam contratos e motor atuais,
mas o percurso importado só pode avançar até eles com catálogo configurado.

O arquivo XLSX nunca é enviado ao FastAPI. Requests e todas as stores do IndexedDB
são inspecionados no aceite Chromium em `web/e2e/import-observed-case.spec.ts`;
`File`, `Blob`, `ArrayBuffer`, XML, assinatura ZIP, nome original, nomes/perfis
brutos e célula inválida de correção são proibidos nessas fronteiras. Ordens
canônicas e proveniência permitida são os dados que podem alimentar a execução.
O scanner também examina conteúdo descomprimido das fixtures XLSX, em memória e
com limite agregado de 64 MiB/4.096 entradas, sem extração para disco.

Importar 1.000 linhas não promete executar 1.000 ordens no Replay. A Etapa 5
registrou o limite efetivo de 98 ordens × 365 dias sob o teto de 500 entradas de
proveniência do diagnóstico. O Caso de 1.000 linhas também ultrapassa 1 MiB de JSON;
isso é armazenamento local, não autorização para aumentar limite de request.
