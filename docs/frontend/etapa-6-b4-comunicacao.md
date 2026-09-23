# Documento de Comunicação V1 — B4 / MOT-92

Implementação local sobre `4708a71`, HEAD integrado de
`codex/frontend-etapa-6-planejamento` em 2026-09-23. Escopo: somente B4;
catálogo de ajuda (B5), aceite integrado (B6), chat (C3) e telas de apresentação
continuam fora desta entrega.

## Contrato e consumo

`servidor/contracts/communication.py` define o modelo Pydantic. Seu
`model_json_schema()` gera `web/src/communication/communicationDocument.schema.json`;
o teste Python confere igualdade estrutural. Tipos espelhados vivem em `domain.ts`.
Nenhuma rota foi criada para fazer o tipo aparecer artificialmente no OpenAPI.

`buildCommunicationDocument(input)` retorna `Promise<CommunicationDocumentV1>`.
Recebe os campos da B4 e duas entradas transitórias opcionais:

- `generatedAt`: instante UTC explícito; quando ausente usa `study.updatedAt`.
- `comparison`: `{ baseExecutionId, hypothesisExecutionId, value: MvpComparison }`
  já calculado pela comparação vigente. É obrigatório se
  `comparisonExecutionId` não for nulo; esse ID identifica **a outra execução
  diagnóstica**, diferente da execução selecionada.

Esses ajustes resolvem duas incompatibilidades do esboço do plano: SHA-256 via
WebCrypto e validação de Estudo são assíncronos; `StudyDocumentV3` não persiste
uma entidade de comparação. Criar tal entidade ou chamar novamente o cálculo de
deltas violaria o escopo. Não há alteração de storage nem de
`ApplicationRepository`.

O construtor clona a entrada antes do primeiro `await`, valida o Estudo, seleciona
os snapshots históricos da execução e congela profundamente a saída. Não lê
relógio, disco ou rede. Retornar ao mesmo dia e recarregar o JSON produz o mesmo
documento; somente `generatedAt` pode mudar sem alterar `contextFingerprint`.
Reordenar chaves dos objetos de entrada também não altera a projeção.

## Valores e evidências

As seções possuem `title`, `metrics` e `facts`. O snapshot do Replay possui `day`,
`metrics` e `facts`, copiando o estado diário publicado. Não reconstrói saldos,
alocações ou deltas. Contagens recebem `COUNT`; HHI e duração em milissegundos
recebem `TEXT` com a unidade explícita no rótulo, pois o V1 não oferece uma unidade
genérica de índice ou `MS`.

Valores financeiros conservam os bytes das strings decimais de origem, sem
arredondamento. A igualdade entre totais de diagnóstico e Replay aceita apenas
diferença representacional de zeros finais; essa normalização não é aplicada à
saída. Formatação permanece responsabilidade do contrato de apresentação
existente (`pt-BR`, `BRL`, `HALF_UP`). Indisponíveis permanecem `null` com motivo.

Cada evidência identifica fonte (`STUDY`, `DIAGNOSTIC`, `COMPARISON`, `REPLAY`),
ID da fonte, Estudo, cenário/revisão, diagnóstico, repetição, JSON Pointer e valor
publicado. Objetos usados como fatos são serializados em JSON canônico. O
construtor resolve cada caminho na fonte efetiva; os validadores rejeitam
referências ausentes, duplicadas, valores divergentes e identidades de outro
contexto. Referências diagnósticas com wildcard de repetições e caminhos de
proveniência têm resolução explícita conforme os contratos existentes.

O fingerprint é SHA-256 do JSON canônico, excluindo `generatedAt` e o próprio
`contextFingerprint`. Ele detecta mudança de conteúdo/contexto; **não autentica
dados enviados pelo cliente**. A comparação recebida é a publicação pré-calculada:
a B4 confere as identidades, compatibilidade e valores base/hipótese, mas não
recalcula seus deltas. Os futuros endpoints devem manter essa distinção.

## Evidências de desenvolvimento

- Fixtures observada/sintética e 64 mutações inválidas compartilhadas entre
  Pydantic e Ajv. O teste também protege contra divergência do schema gerado.
- Fixture de origem observada: duas ordens manuais, OUT `100.01` e IN `40.01`,
  custos zero, horizonte de três dias e janela de um dia. Produzida pelos contratos,
  adaptador e agregador diagnósticos vigentes; não representa carteira real.
- A fonte sintética usa o pacote demonstrativo integrado. Cada evidência resolve
  para o valor original do envelope/snapshot; comparação e Replay têm provas
  próprias de identidade.
- RED → GREEN observado para projeção, fixture observada, totais incompatíveis,
  escalas decimais equivalentes e independência da ordem das chaves.
- Revisão independente encontrou dois problemas: comparação apontando para a
  própria execução e seleção identificando outra repetição. Ambos tiveram testes
  RED, correção e re-revisão com as duas regressões verdes.

Gate final: **95 testes Python passaram em cada modalidade**, **678 testes
Vitest em 81 arquivos passaram** (93 específicos de comunicação), typecheck,
ESLint, build, Ruff, mypy do novo contrato e scanner passaram. Scanner: 507 textos
e 32 binários, incluindo arquivos novos ainda não commitados. A primeira execução
web com concorrência padrão teve um timeout de 5 segundos na rota de diagnóstico;
a suíte completa com dois workers passou sem alterar testes, produto ou timeout.

Comandos de verificação:

```powershell
.venv/Scripts/python.exe -m pytest tests/web_api/test_communication_contracts.py tests/web_api/test_openapi.py tests/web_api/test_diagnostics_contracts.py tests/web_api/test_replay_contracts.py -q -p no:cacheprovider
.venv/Scripts/python.exe -O -m pytest tests/web_api/test_communication_contracts.py tests/web_api/test_openapi.py tests/web_api/test_diagnostics_contracts.py tests/web_api/test_replay_contracts.py -q -p no:cacheprovider
npm --prefix web run test:unit -- --maxWorkers=2
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
.venv/Scripts/python.exe -m tests.web_api.scan_credentials
git diff --check
```

O mypy do contrato novo passa. `mypy servidor` encontra 13 erros no gerador
demonstrativo preexistente (`servidor/demo/generate_package.py`), não alterado nesta
task. O build conserva o aviso preexistente de chunks acima de 500 kB. O aviso de
pytest sob `-O` é esperado; os invariantes de produção usam exceções.
