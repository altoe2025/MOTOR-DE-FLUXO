# Etapa 6A — auditoria de portabilidade (MOT-90)

Auditoria local em 2026-09-23, anterior a qualquer código de produto da Etapa 6.
Issue consultada somente para leitura: [MOT-90](https://linear.app/felipe-bisca/issue/MOT-90/etapa-6-t0-gate-base-e-reconciliacao-da-importacao).
MOT-49–MOT-61 continuam identificando a implementação dos módulos.

## Bases imutáveis e divergência

- Destino: `codex/frontend-etapa-6-planejamento`, HEAD inicial
  `7d72a2d86d1ebae313bb8f998134dc2a9a05fff8` (Etapa 5 mais planejamento).
- Origem: `origin/test/importacao-xlsx-aceitacao`,
  `3999ae660fd9b6fd163d53edf264a178e8146a13`.
- Base comum: `c2ad1755899ddeafdf30f70350b5025ca55ddbaa`.
- `git rev-list --left-right --count HEAD...origin/test/importacao-xlsx-aceitacao`:
  **101 / 16** antes dos commits A0.
- `git merge-base --is-ancestor origin/test/importacao-xlsx-aceitacao HEAD`:
  exit **1**. A origem não é ancestral do destino.
- `git diff --stat HEAD...origin/test/importacao-xlsx-aceitacao -- web/src/importer web/src/storage web/src/app servidor`:
  **69 arquivos, 7.460 inserções, 15 remoções**. Esse diff de três pontos descreve
  a origem desde a base comum; não autoriza substituir arquivos atuais.
- A árvore rastreada estava limpa. Nenhum fetch, checkout da origem, cherry-pick,
  merge, push, PR ou deploy foi feito. O vault não foi consultado.

## Decisão de portabilidade

PORTAR significa aproveitar algoritmo e testes, ajustando imports aos tipos mínimos
do parser; não significa copiar o domínio ou a infraestrutura antiga junto.
REESCREVER conserva requisitos úteis e usa as fronteiras vigentes.
DESCARTAR significa não trazer o arquivo/entidade da origem para esta integração.

Todos os blobs abaixo pertencem ao commit de origem acima; os SHA completos
permitem revisar exatamente o conteúdo auditado, independentemente do movimento
futuro da referência remota.

| Arquivo de origem | SHA do blob | Decisão | Motivo / condição |
|---|---|---|---|
| `servidor/catalogs/__init__.py` | `113077ac7f50fbc91df9fab158153ea4cb147e49` | REESCREVER | Integrar catálogo mínimo na API vigente; sem substituir contratos/app. |
| `servidor/catalogs/importacao.py` | `6616a737eb96d6890f5c78bf5c4563c5150ba466` | REESCREVER | Integrar catálogo mínimo na API vigente; sem substituir contratos/app. |
| `servidor/catalogs/importacao.v1.json` | `cc3dcc7dc070fcfe5f4d23bdc06b5f724f3c97ba` | REESCREVER | Integrar catálogo mínimo na API vigente; sem substituir contratos/app. |
| `servidor/contracts/catalog.py` | `7245e7ec2cf91a95983a38c975321fc2e0cc58e5` | REESCREVER | Integrar catálogo mínimo na API vigente; sem substituir contratos/app. |
| `servidor/routes/catalog.py` | `9422dbf2f3ff1652c27068f81b32a0b6c3905f74` | REESCREVER | Integrar catálogo mínimo na API vigente; sem substituir contratos/app. |
| `web/e2e/fixtures/conflicting-batch.xlsx` | `8775cef3fc2f0f84122aa0c4fccd6fa49234c79b` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/e2e/fixtures/import-catalog.json` | `615f21f2f2f790ee6b9bf8361080a62d70369cc9` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/e2e/fixtures/partial-invalid.xlsx` | `4753ad77ee7ae6baf2d26fb1e324943b0c330d4a` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/e2e/fixtures/valid-1000-rows.xlsx` | `2969ac40f68a54b21874366ef110bccc9316a945` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/e2e/fixtures/valid-balanced.xlsx` | `5acff2d128153d58382a76b946abb2ed73a9b7c4` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/e2e/import-xlsx.spec.ts` | `4c7c0c2504c41ea284383c84ff15c3bfd2579798` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/scripts/build-import-fixtures.mjs` | `db8e32249f3aa32c62c5f7fcfc9ba390527e2779` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/scripts/generate-import-fixtures.mjs` | `7bc0fa88321fe6888c4661e34e3254db6ad1b22f` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/encrypted-marker.xlsx` | `630d92eed277f5910f74a7e0f5eae028dbe7510d` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/external-link.xlsx` | `b819e9a95767bfa841c7f01a7479e2cf986b20c8` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/extra-sheet.xlsx` | `0b28d248589f0f09a37a72b2a6cb826544576207` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/formula.xlsx` | `63cea15f41049c91c246730e035a4ba601191e4d` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/hidden-only-sheet.xlsx` | `7e70df997adf7508079180d83f4db185a055d701` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/macro-marker.xlsx` | `55c2b9faa4a3c0cefde3074e5bf0bb552e479c15` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/merged-cell.xlsx` | `0e36c47633213bc8b38f8fdb4b651cd40b3f4c1e` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/row-limit-1001.xlsx` | `393717ae1907fc88f0658d4254b01c874d50443d` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/valid-1000-rows.xlsx` | `afc54ea1aec33144dc127bdb028c24a56bfb33f8` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/valid-minimal.xlsx` | `da65361c800fa44e0d25f39114fa03c6ef08185f` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/worksheet-external-link.xlsx` | `a7794179066c4eee046e40e840ef36b1b204f8a8` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/wrong-headers.xlsx` | `7dbd2b043afdfa3f9e5edafe2b1a7149caecb86e` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/wrong-sheet-name.xlsx` | `06ab1b677ac9aa4612d85b5a0e18968e73c8f2cd` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/zip-too-large-uncompressed.xlsx` | `c75c5a9f3b96f6746cee02eeb11d70444b9d2a4e` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/__fixtures__/zip-too-many-entries.xlsx` | `76d923be6312f8b0a7f317d780f04b99777960d9` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/catalogClient.test.ts` | `0ebb54c8503a2124562fba53fc046b8113e59526` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/catalogClient.ts` | `bcef5cf985ff757d2a255ce5ce7ff7f6c6d6f7e1` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/clients.test.ts` | `98ab459af15f8acb0bf1900e5da3213e39cecf1c` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/clients.ts` | `18a7e5d755ba2ad48c362061930ad5530ea41b89` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/components/ExecutionConfirmation.tsx` | `eedac41d84870a0c6562636d37cc7f9f932be788` | DESCARTAR | Persistência/execução de ImportStudy substituída pela aplicação atual. |
| `web/src/importer/components/ImportFlowContext.tsx` | `918c905c86cf0583bdadeb3e6f6b984246ca04ae` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/components/ImportFlowPage.tsx` | `27467b9fbddec8b46b7caab545f4f3bbf778fa14` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/components/ParametersStep.tsx` | `071f48468436e3c5a439c89a3987ddb0856a3544` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/components/ReviewStep.tsx` | `e187a03808b39142c7395c7f2ef2b417876093c9` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/components/UploadStep.tsx` | `b99931d12c90fabf0eca75f6caccbfa845dc68b8` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/components/importFlow.test.tsx` | `4265bd34c4543b758d5eb82d5e42d7813ae46455` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/controller.test.ts` | `9c0210a69826c164ef51ecfb7ba9864227745d55` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/controller.ts` | `c76e5efe900118519113338aff02943a803e16df` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/dates.test.ts` | `89f725f39f92fbdbb8afbe307ed4b53b6dab22f7` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/dates.ts` | `75ae21d1a3389894579291845a139086bc79712a` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/decimals.test.ts` | `ba92cb68661cecf134c3c192adfcd1bbebbfbcfa` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/decimals.ts` | `e8382fe755f82fa813a405f7779966471d1f326d` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/domain.ts` | `a679fa708fc8daaa62c326ea15220771c9917eb8` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/eligibility.test.ts` | `66d76e56e63fc0fc1fa3293e13de53f7fa1079b2` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/eligibility.ts` | `44f532c2ca1855ca60afbc914e6bbe0ed1cbdd9c` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/errors.ts` | `750b63afc45f9fbeed58834fb411b2ab32f71814` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/indexedDbConcurrency.test.ts` | `37a789f989662445e5e7a2ff7cf42b50499717b0` | DESCARTAR | Persistência/execução de ImportStudy substituída pela aplicação atual. |
| `web/src/importer/indexedDbRepository.test.ts` | `7d658ff12963a616d94447a83ea2dc6a7ec7cdb3` | DESCARTAR | Persistência/execução de ImportStudy substituída pela aplicação atual. |
| `web/src/importer/indexedDbRepository.ts` | `410518aaaa0198469cb2dbdc328bc136a7a4fed7` | DESCARTAR | Persistência/execução de ImportStudy substituída pela aplicação atual. |
| `web/src/importer/normalization.test.ts` | `d82af43bdf866ebfe43506642ece79419f771552` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/normalization.ts` | `20f7e53c0069418ab742dde95e7a976e1800b349` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/portfolio.test.ts` | `8f24ab8e9b438202a579fc275be7f3041e243185` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/portfolio.ts` | `66c376b99147b1cce49315ce525fcb742c3781c2` | REESCREVER | Adaptar ao Caso/Empresa e ao repositório vigente, sem execução. |
| `web/src/importer/previewAdapter.test.ts` | `b29f399987d1e0c401fbfa9b238566b6122a9e5c` | DESCARTAR | Persistência/execução de ImportStudy substituída pela aplicação atual. |
| `web/src/importer/previewAdapter.ts` | `e1e6156e4f935d4371cdb907dc22094344fb83d7` | DESCARTAR | Persistência/execução de ImportStudy substituída pela aplicação atual. |
| `web/src/importer/repository.ts` | `21cb63dcdb649404bbff4113bafbf2e661bdeadf` | DESCARTAR | Persistência/execução de ImportStudy substituída pela aplicação atual. |
| `web/src/importer/saxen.d.ts` | `e683755364649b01e56d2512908697d40f077406` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/validation.test.ts` | `18b8324d81b7c01199019798ce81a44217c04901` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/validation.ts` | `277b2f9b97ed9980ebef91d89710dbc97797b695` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/workerClient.test.ts` | `b61b3db0916b55429c3c21fc18af9ae2766cd263` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/workerClient.ts` | `4669846bd3819dc985e33ffeb0d8e2a906d5c9f4` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/xlsx.worker.ts` | `c3e4045c82ba83c0bb621a0167eabd1b425fbea9` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/xlsxParser.test.ts` | `7b2d3c3244eac04d9f5bcfe37453db62b345c0cd` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/xlsxParser.ts` | `c5e1c71f69240aa55ecd22a23028b70cbf0740b2` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/xlsxPreflight.test.ts` | `f7d974930fe164c342a53ee86c3fc3a8c9260d02` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |
| `web/src/importer/xlsxPreflight.ts` | `4f825b49e955edac815c31eac645cb25ecc132b6` | PORTAR | Utilitário puro/fixture sintética; preservar casos e adaptar imports. |

`publisher.ts` e `publisher.test.ts` **não existem na origem**: REESCREVER/criar
na A3 usando `ConfirmObservedCaseMutation`; não há SHA de arquivo para portar.
`ImportStudy` (dentro de `domain.ts`) e `ImportRepository` (em
`repository.ts`) são DESCARTAR mesmo onde tipos de parser do mesmo arquivo
tenham reaproveitamento. `ParametersStep` só pode sobreviver redesenhado para
metadados/revisão; custos, janela da simulação, reserva de tentativa e confirmação
de execução não pertencem ao importador.

### Razões verificadas no código

- `dates`, `decimals`, `normalization` e `validation` são funções puras:
  datas civis via UTC, decimal sem expoente, identificação exata e erros por linha.
  Finalidade ausente conserva a linha normalizada com aviso; a regra de publicação
  deve converter problemas em blockers/avisos do Caso sem descartar evidências.
- `xlsxPreflight` limita 5 MiB compactados, 25 MiB expandidos, 128 entradas,
  aba visível única `operacoes`, cabeçalho canônico e 1.000 operações; inspeciona
  fórmulas, macros, links externos, merges e criptografia antes do parser.
  `xlsxParser` mantém números como texto e calcula SHA-256.
- `xlsx.worker` e `workerClient` fazem transferência do buffer, correlação por
  requestId e cancelamento/terminate. A integração deve conservar limpeza de sessão;
  os módulos ainda não foram executados nem aprovados no destino.
- As fixtures possuem geradores determinísticos e dados inventados: Cliente Exemplo,
  Cliente Fictício e finalidades de teste. Macro usa marcador de três bytes;
  criptografia usa somente assinatura OLE; URL externa usa `example.invalid`.
  São fixtures de rejeição, não arquivos reais. Não copiar arquivos pessoais.
- `clients` mantém identidade/aliases próprios sem owner; `portfolio` projeta
  eventos ancorados em ImportStudy; `eligibility` seleciona operações executáveis
  e permite confirmação parcial. Precisam ser reescritos para Caso, owner e qualidade.
- `controller` chama preview e persiste execuções; `previewAdapter` cria request
  de motor. Ambos não podem transportar essas responsabilidades ao fluxo novo.
- O catálogo remoto contém custos/proveniência e finalidade/direção. A A4 deve
  incorporar apenas o contrato mínimo necessário ao importador atual, preservando
  autenticação e a aplicação vigente. Catálogo de teste não é calibração financeira.

### Arquivos compartilhados fora de importer

| Arquivo/grupo da origem | Decisão |
|---|---|
| `web/src/app/providers.tsx` | REESCREVER integração pontual; descartar provider de banco próprio |
| `web/src/app/router.tsx`, `router.test.tsx` | REESCREVER rota no shell/estudo atual; preservar rotas 2–5 |
| `servidor/app.py`, `servidor/routes/__init__.py` | REESCREVER somente registro do catálogo na A4 |
| `servidor/static.py` | REESCREVER eventual whitelist da rota atual; não portar URL antiga de carteira |
| `servidor/contracts/input.py`, `primitives.py` | DESCARTAR patch antigo: DADO_OBSERVADO/NAO_COLETADO e validação de eFX já existem no HEAD atual |
| `web/src/storage/*` | PRESERVAR destino: nenhum delta na origem desde a base; não introduzir segundo repository |
| `web/package.json`, lock e API gerada | REESCREVER alterações mínimas de dependências/contratos nas tasks próprias; não substituir pela origem |

A comparação direta de `input.py` entre os tips mostrou somente um helper
`_is_uncollected_efx_pointer` equivalente ao teste inline vigente; `primitives.py`
é idêntico. A comparação de três pontos isoladamente faria parecer necessário
reaplicar trabalho já incorporado.

## Fronteiras vigentes verificadas

| Fronteira | Evidência e obrigação para 6A |
|---|---|
| `ObservedCaseDraft` — `web/src/cases/domain.ts` | schema 2.0.0, status DRAFT, confirmedAt null; ordens, qualidade, correções, manifests e janela |
| `ObservedCase` — mesmo arquivo | CONFIRMED/ARCHIVED, confirmedAt texto, observedOutcome explícito ou null; nenhuma simulação vira observado |
| `CompanyRecord` — mesmo arquivo | id/ownerSub/revision, displayName/aliases, createdAt/updatedAt; uma Empresa é a unidade do Caso |
| `ConfirmObservedCaseMutation` — `web/src/storage/applicationRepository.ts` | expectedRevision + operationId + company + observedCase + batches + events |
| `calculateOperationalProfile` — `web/src/profiles/calculateOperationalProfile.ts` | recebe Casos compatíveis da mesma Empresa/owner; conserva fingerprints, cobertura e proveniência; não executa motor |
| `attachProfileToCurrentStudy` — `web/src/study/studyController.ts` | exige Estudo salvo, anexa evidência, verifica epochs de sessão/seleção, persiste com CAS e publica revisão |

Essas seis fronteiras atendem à saída e conexão previstas sem novo banco ou
executor do importador. O Perfil continua sendo salvo pelo
`ApplicationRepository.appendOperationalProfileVersion` existente; essa operação
da aplicação não deve ser reimplementada pelo importador.

Em `indexedDbApplicationRepository.confirmObservedCase`, a transação única inclui
`companies`, `observed_cases`, `import_batches`, `import_events` e
`operations`. Há validação do documento, rejeição de binários, owner, revisão
esperada, idempotência por intenção e imutabilidade dos lotes/eventos. Esses
contratos devem ser consumidos sem ampliar schema ou persistir File/Blob/buffer,
XML, células brutas ou nomes brutos. As linhas técnicas mínimas de lote/evento
existentes não autorizam persistir o conteúdo integral do tipo antigo.

A publicação não pré-neta OUT/IN, não cria Estudo nem execução. Metadados observados,
inferidos e corrigidos continuam distinguíveis, com eFX NOT_COLLECTED preservado.

## Baseline e reconciliação estática T0

Runtime local: Python 3.12.14 do `.venv-t5` do checkout principal,
Ruff 0.16.7, mypy 2.3.1, Node 24.19.0 e npm 11.17.0. CI declara Python 3.11;
nenhum runtime/config/lock foi alterado. Os comandos Python usam o executável
absoluto desse ambiente; `python` não está no PATH desta sessão.

Antes da correção, `python -m ruff check servidor tests/web_api` reproduziu
**10 achados**: I001 em app.py, replay.py e measure_replay.py; PLC0206 em replay.py;
cinco FURB157 em test_replay.py; F401 em test_replay_contracts.py.
O registro de **308** do planejamento **não foi reproduzido**. A versão está
travada no pyproject/lock, e `--verbose` confirmou defaults com target Py311
inferido do pyproject; não há evidência para atribuir a diferença a versão/config.
Uma sondagem `--isolated` apontou 11 (import adicional com outro target default);
não é o gate adotado e não substituiu a configuração.

`python -m mypy servidor` reproduziu **30 erros em replay.py**:
fila heterogênea inferida como object (min e acesso a ordem_id), gatilhos list[str],
dicts de eventos e textos decimais usados em construtores anotados com Decimal.
`DecimalSaida` exige texto em runtime por BeforeValidator; trocar esses textos
por Decimal violaria o contrato. A correção mínima usa `model_validate` nos
seis modelos afetados, mantendo os mesmos payloads/validadores, tuplas tipadas na
fila e ReplayTrigger. Não altera contrato público nem regra financeira.

O RED foi observado nos gates existentes antes do código; o GREEN exige Ruff e
mypy sem erros. Não se inventou teste de comportamento para tipagem/formatação:
a suíte de Replay existente verifica reconciliação, segmentos, parcial, drenagem,
ordenação, contrato e HTTP. Não foram adicionados ignores, excludes, baselines,
relaxamentos de regras ou dependências. A correção estática tem commit próprio
MOT-90, separado desta matriz documental.

Correção estática: commit local `02e5c0c531b94d73deeef7ae20642b005ab8c83b`.

| Comando (raiz do worktree) | Resultado |
|---|---|
| `npm --prefix web run test:unit -- src/cases src/storage src/profiles src/study` | 173 testes / 20 arquivos PASS |
| `npm --prefix web run typecheck` | PASS |
| `npm --prefix web run lint` | PASS |
| `python -m ruff check servidor tests/web_api` | RED 10 → GREEN 0 |
| `python -m mypy servidor` | RED 30 → GREEN, 36 arquivos |
| `python -m pytest tests/web_api/test_replay.py tests/web_api/test_replay_contracts.py tests/web_api/test_replay_http.py -q` | 18 PASS |
| `python -m pytest -q` | 794 PASS / 2 skipped |
| `python -O -m pytest -q` | 794 PASS / 2 skipped |
| `npm --prefix web run test:unit` | duas tentativas: 480 PASS / 1 timeout de 5 s em router.test.tsx |
| `npm --prefix web run test:unit -- src/app/router.test.tsx` | 25 PASS |
| `npm --prefix web run test:unit -- --maxWorkers=2` | 481 PASS / 67 arquivos; timeout padrão preservado |
| `npm --prefix web run build` | PASS; aviso existente de chunks acima de 500 kB |
| `python -m tests.web_api.scan_credentials` | PASS: credential_scan=ok |
| `npm --prefix web run test:e2e` (MOT_E2E_PYTHON aponta para o mesmo Python) | 22 PASS em 1,9 min; servidor/browser locais |

O teste de rota falhou sob concorrência padrão e passou isolado e no conjunto com
dois workers. A evidência é compatível com contenção de recursos; não demonstra
que toda execução futura com workers padrão passará. Nenhum teste, timeout ou
configuração foi alterado para contornar a ocorrência. Python emite deprecações
Starlette/httpx/anyio; `-O` emite também o aviso esperado sobre asserts. Os dois
skips são mantidos, sem alegação de autenticação externa testada nesta auditoria.

Tentativas de ambiente e detalhes da verificação browser estão no relatório A0
local. O gate desta auditoria não equivale ao aceite futuro do importador: portar,
adaptar e verificar os módulos é responsabilidade de A1–A6.
