# Etapa 2 v2 — operação e contratos efetivos

## Estado deste guia

Este guia descreve o comportamento presente em `b5a2d9a`. Ele não declara a Etapa 2
concluída: o aceite é **CONDITIONAL** e está detalhado em
[`etapa-2-v2-aceitacao.md`](etapa-2-v2-aceitacao.md).

A interface executa três origens de carteira pelo mesmo caminho: exemplo sintético,
autoria manual e Caso Observado já confirmado. A importação e confirmação do Caso
Observado pertencem ao importador a montante; esta etapa não entrega uma tela de
importação. Não use a ponte E2E para operação real.

## Pré-requisitos e versões

- Python `>=3.11`; o CI usa Python 3.11.
- Node `>=24 <25`, npm `>=11 <12`; `web/package.json` fixa npm `11.17.0`.
- Dependências Python travadas em `requirements/web-dev.lock` e web em
  `web/package-lock.json`.
- FastAPI `0.141.1`, Pydantic `2.13.5`, React `19.3.0`, TypeScript `5.9.3`, Vite
  `8.3.0`, Vitest `5.0.0` e Playwright `1.63.0`.
- Projeto Supabase real já provisionado, usuário convidado na allowlist e redirects
  locais configurados. Nenhum segredo deve ser commitado.

O servidor e o bundle precisam carregar o mesmo SHA de 40 caracteres. Para operar
um checkout local, use o resultado de `git rev-parse HEAD`; não use zeros ou um SHA
inventado.

## Preparar o ambiente

Em PowerShell, na raiz do repositório:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements\web-dev.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e .
npm --prefix web ci
Copy-Item .env.example .env
Copy-Item web\.env.example web\.env.local
```

Edite somente os arquivos locais ignorados pelo Git:

```dotenv
# .env
APP_ENV=development
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_JWT_ISSUER=https://PROJECT_REF.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_ALLOWED_USER_IDS=UUID_DO_USUARIO
MOTOR_BUILD_SHA=SHA_REAL_DE_40_CARACTERES
WEB_DIST_DIR=web/dist

# web/.env.local
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VALOR_REAL
VITE_MOTOR_BUILD_SHA=O_MESMO_SHA_REAL
```

`SUPABASE_JWT_ISSUER` deve ser exatamente `SUPABASE_URL + /auth/v1`; audience deve
ser `authenticated`; a allowlist não pode ser vazia. `VITE_SUPABASE_*` é configuração
pública do cliente, mas seus valores reais continuam fora do repositório.

## Iniciar e encerrar

Terminal 1:

```powershell
.\.venv\Scripts\python.exe -m servidor
```

Terminal 2:

```powershell
$env:VITE_MOTOR_BUILD_SHA=(git rev-parse HEAD).Trim()
npm --prefix web run dev -- --host localhost
```

Abra `http://localhost:5173`. O Vite encaminha `/api` para
`http://127.0.0.1:8000`; o servidor usa um único worker. Encerre os dois processos
com `Ctrl+C`. Em produção, gere `web/dist` com o mesmo `VITE_MOTOR_BUILD_SHA`, defina
`APP_ENV=production` e `WEB_DIST_DIR`, e sirva a aplicação pela origem do FastAPI.

A autenticação real depende do Supabase e de credenciais humanas. O gate automatizado
`real-auth` foi ignorado no fechamento por ausência dessas credenciais; este guia não
transforma essa ausência em aceite.

## Percurso operacional

### 1. Criar e reabrir um estudo

1. Entre com uma conta autorizada e abra `/estudos`.
2. Selecione **Novo estudo**. A aplicação solicita ao endpoint de preparação um
   exemplo sintético inicial, cria o cenário base e salva no IndexedDB da conta.
3. Renomeie, duplique ou abra o estudo pela lista. O estado **Alterações salvas**
   confirma o commit local; **Salvando…** e **Alterações não salvas** não confirmam.
4. Recarregue a página ou abra `/estudos/<uuid>` diretamente. O estudo, cenário,
   histórico e execução selecionável devem reaparecer.

### 2. Escolher a origem

Todas as opções ficam em **Origem da carteira**:

- **Exemplo sintético:** escolha um dos cinco exemplos e clique **Preparar exemplo**.
  O navegador envia parâmetros e seeds ao endpoint `/api/v1/preparacoes`; o servidor
  materializa as ordens.
- **Autoria manual:** configure grupos e participantes, herança e overrides, e clique
  **Preparar carteira manual**. Uma carteira convertida de Caso Observado usa
  operações explícitas; salvar uma correção marca somente os campos editados como
  `USER_CORRECTED`.
- **Caso observado:** escolha um caso `CONFIRMED` e clique **Usar caso confirmado**.
  A revisão é copiada para snapshot; a fonte não é editada. Um `DRAFT` nunca aparece
  no seletor e também é rejeitado pela resolução de origem.

Não há upload/importação de arquivo na UI desta etapa. Um importador compatível deve
validar e confirmar `CompanyRecord` + `ObservedCase` por `ApplicationRepository` antes
da seleção. O bootstrap apenas descobre o rascunho v1 e a base experimental antiga do
importador para migração/arquivamento; ele não converte esse arquivo bruto em Caso
Observado confirmado.

### 3. Editar premissas e executar

1. Ajuste custos, janela e período em **Premissas e período** e salve.
2. Clique **Executar cenário atual**. O serviço força o flush do autosave, reserva uma
   tentativa por CAS, constrói `PreviaRequest`, faz um único POST e anexa um terminal.
3. Confira volumes, mecanismos, custos, identidade técnica e histórico. Para origem
   observada, a tabela **Observado × Motor** é independente do resumo do motor.
4. Edite a origem ou premissas e execute de novo. O registro anterior permanece
   append-only; nenhuma execução é reescrita.

Cada tentativa nova persiste uma reserva `RUNNING` interna e exatamente um terminal
`SUCCEEDED`, `FAILED` ou `INTERRUPTED` correlacionado por `attemptId` e `request_id`.
A UI oculta a reserva quando o terminal correlato existe.

### 4. Conflito entre abas

CAS, não `BroadcastChannel`, é a autoridade. Se duas abas editarem a mesma revisão:

1. a primeira que fizer commit avança a revisão;
2. a outra mostra **Este estudo foi alterado em outra aba** e não sobrescreve o salvo;
3. copie manualmente qualquer valor ainda necessário e recarregue a aba em conflito
   para aceitar o documento persistido;
4. reaplique a mudança sobre a nova revisão.

A UI atual não faz merge automático nem oferece um botão específico **Salvar cópia**.
Para preservar uma alternativa antes de editar, use **Duplicar estudo**.

### 5. Falhas e recuperação de storage

- `STORAGE_FAILURE` mostra **Não foi possível salvar. As alterações continuam nesta
  aba.** Não feche a aba até copiar os dados ou o storage voltar; o estado em memória
  não é uma promessa de persistência.
- Reabrir a sessão abre o banco da conta, valida `schema_version=1` e roda migrations
  determinísticas. Originais legados e seus SHA-256 ficam preservados em `meta`.
- JSON corrompido, schema futuro e marcador divergente são recusados; nada é apagado
  silenciosamente.
- `versionchange` fecha o banco. Faça reload após a outra aba terminar o upgrade.
- A função de recuperação de tentativa interrompida existe e é coberta por teste,
  mas não há controle de recuperação exposto na UI de produção desta etapa.
- O teste de quota é uma injeção em banco-probe criado após o override. Não prova
  disco fisicamente cheio nem o schema de produção sob esgotamento real.

### 6. Lixeira e limpeza

**Excluir** move um estudo para a lixeira local; **Restaurar** usa CAS. A interface
não expõe purge definitivo nem limpeza integral da conta. `ApplicationRepository`
possui `purgeStudy(id)`, que remove atomicamente estudo, execuções e conteúdo sensível
das operações relacionadas, mas chamá-lo exige uma superfície administrativa ainda
não entregue.

Para limpar apenas um ambiente local de teste, termine a sessão e remova, pelas
ferramentas de armazenamento do navegador, os dados do site escolhido. Isso apaga
também sessão, rascunhos e todos os bancos locais daquela origem e não é recuperável.
O banco de produto tem nome:

```text
motor-fluxo:app:v2:<project-ref-percent-encoded>:<owner-sub-percent-encoded>
```

Não trate a limpeza manual do navegador como fluxo de produto ou retenção aprovada.

## Contratos efetivos

### Tipos públicos e schemas locais

- `ObservedCase` e `StudyDocument` usam `schemaVersion: "2.0.0"`;
  `ObservedOutcome` usa `"1.0.0"`.
- `StudyDocument` contém um cenário base, cenários, revisão e metadados; execuções são
  armazenadas separadamente e remontadas pelo repositório.
- `PortfolioSource` é a união `OBSERVED_CASE | AUTHORED | SYNTHETIC`.
- `AUTHORED` guarda definição `PARAMETRIC` ou `EXPLICIT_ORDERS`; a segunda preserva
  `provenanceByOrder` por campo.
- `ExecutionRecord` preserva request, origem, premissas, período, versão do motor,
  versão do contrato, envelope e conciliação. Os três snapshots novos são opcionais
  no schema 2.0.0 para ler documentos anteriores, mas toda execução nova os grava.
- Schemas de runtime locais: `web/src/cases/observedCase.schema.json` e
  `web/src/study/study.schema.json`; validações semânticas adicionais vivem em
  `validation.ts`.

### IndexedDB

Versão física e marcador lógico são `1`. Stores:

| Store | Chave | Conteúdo |
|---|---|---|
| `companies` | `company_id` | empresa leve e aliases |
| `observed_cases` | `case_id` | casos confirmados/arquivados |
| `import_batches` | `[case_id, batch_sequence]` | lotes imutáveis |
| `import_events` | `[case_id, event_sequence]` | correções e decisões |
| `studies` | `study_id` | estudo sem a coleção de execuções |
| `executions` | `[study_id, execution_id]` | histórico append-only |
| `operations` | `operation_id` | idempotência e resultado da mutação |
| `meta` | `key` | schema, originais, arquivos e marcadores de migration |

Mutações recebem `expectedRevision` e `operationId`. Reutilizar o mesmo operation ID
com o mesmo intent devolve o resultado anterior; reutilizá-lo com outro intent falha.
Binários (`Blob`, `File`, `ArrayBuffer` e views, inclusive aninhados em Map/Set) não
podem ser persistidos.

### Migrations reais

`migrateDatabase` reconhece três origens:

| Origem | Versão | Disposição |
|---|---:|---|
| `motor-fluxo:draft:v1:<owner-sub>` em localStorage | 1 | `RECOVERABLE_DRAFT` |
| `StudyDocument` legado fornecido ao migrador | `1.0.0` | `MIGRATED_STUDY` para 2.0.0 |
| `motor-fluxo:imports:v1:<project-ref>:<owner-sub>` | 1 | `ARCHIVED_IMPORTER` |

Cada origem recebe digest SHA-256, cópia `original:*` e marcador `migration:*` na
mesma transação. Repetição é idempotente; digest ou disposição divergente falha.
Study legado migra resultados válidos para `ExecutionRecord SUCCEEDED` com snapshots.

### Fingerprints

Todos usam SHA-256 hexadecimal de 64 caracteres sobre JSON canônico com chaves
ordenadas e `undefined` removido:

- `sourceFingerprint`: origem + ordens ordenadas por ID + proveniência ordenada;
  normaliza decimais e, em sintético, seeds e composição. `capturedAt` e resultado
  observado não participam.
- `inputFingerprint`: conteúdo do `sourceFingerprint` + carteira normalizada + custos,
  janela e período. Nome do estudo/cenário e timestamps de UI não participam.
- `generation_fingerprint`: servidor; determinantes da geração, versão do gerador e
  build do motor. Identidade do estudo, custos e metadados não o transformam em
  fingerprint integral da execução.
- `execution_fingerprint`: servidor; identidade da entrada numérica executada,
  `api_version`, build e schema do motor.
- `provenance_fingerprint`: servidor; proveniência canônica separada da identidade
  numérica.

Instantes ISO semanticamente iguais são normalizados antes da comparação entre request
e `input_snapshot`; identidades, revisão, fingerprint e demais campos permanecem
estritos.

### HTTP, versões e limites

| Contrato | Versão/campo | Limites principais |
|---|---|---|
| `POST /api/v1/preparacoes` | `preparation_version=1.0.0`, `generator_version=dimensionamento-v1` | corpo 1 MiB; 100 participantes; período total 730 dias; até 500 ordens esperadas e 1.000 no envelope |
| `POST /api/v1/previas` | `api_version=1.0.0`, `presentation_version=1.0.0` | corpo 1 MiB; até 1.000 ordens; horizonte 730; resposta 8 MiB; uma prévia simultânea por processo |
| resultado canônico | `schema_version=2.0.0` | modo `AGREGADO`; três mecanismos canônicos |
| aplicação local | `StudyDocument/ObservedCase=2.0.0`, DB=1 | nomes até 120 na UI; UUIDs e revisões estritos |

Ordens usam valor positivo até `10^12`, no máximo seis casas, dias relativos de 0 a
1095 e finalidade de até 128 caracteres. O cenário limita janela a 730 dias, horizonte
a 730 e até 100 regras de IOF. Decimais via HTTP são texto ASCII, sem expoente.

### Erros observáveis

HTTP responde envelope seguro `{error: {code, message, request_id, fields}}` com
`Cache-Control: no-store`. Códigos relevantes: `JSON_INVALIDO`, `ENTRADA_INVALIDA`,
`VERSAO_INCOMPATIVEL`, `LIMITE_EXCEDIDO`, `CAPACIDADE_OCUPADA`,
`RESULTADO_EXCEDE_LIMITE` e `RESULTADO_INVALIDO`; autenticação mantém os erros da
fronteira da Etapa 1. POST não recebe retry automático.

O repositório local tipa: `BINARY_DATA_NOT_ALLOWED`, `DOCUMENT_CORRUPT`,
`INVALID_DOCUMENT`, `NOT_FOUND`, `OPERATION_CONFLICT`, `OWNER_MISMATCH`,
`REVISION_CONFLICT`, `SCHEMA_UNSUPPORTED` e `STORAGE_CLOSED`. O controlador projeta
esses casos nos estados `CONFLICT` ou `STORAGE_FAILURE` quando cabível.

## Fluxo de autoridade

```text
origem confirmada/manual/sintética
→ PortfolioSourceSnapshot + sourceFingerprint
→ ScenarioDocument + inputFingerprint
→ flush/CAS e reserva de tentativa
→ PreparationRequest, quando houver geração
→ PreviaRequest canônico
→ FastAPI autenticada → adaptador → motor
→ PreviewEnvelope validado
→ ExecutionRecord terminal e snapshots imutáveis
→ IndexedDB transacional
→ resumo do motor + Observado × Motor independente
```

Uma resposta só é aceita quando usuário/sessão, estudo, cenário, revisão, request,
fingerprint e tentativa continuam compatíveis. Trocar de estudo durante o POST não
faz a resposta selecionar o estudo antigo; o terminal é concluído por CAS no estudo
de origem e pode ser visto quando ele for reaberto.
