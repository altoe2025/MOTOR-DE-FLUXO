# Importação XLSX de operações reais Implementation Plan

> **Plano histórico e anexo de implementação.** A sequência executável foi
> substituída em 2026-09-19 por
> [`2026-09-19-importacao-dados-reais-plano-tecnico-v2.md`](2026-09-19-importacao-dados-reais-plano-tecnico-v2.md).
> Não executar este plano diretamente. Seus detalhes de parser, validação, segurança
> e desempenho permanecem requisitos referenciados pela versão v2.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um fluxo local-first que importa até 1.000 operações reais de um `.xlsx`, preserva revisão e auditoria no navegador e executa o request canônico no motor sem transmitir o arquivo original.

**Architecture:** O importador vive em `web/src/importer` como domínio puro, parser isolado em Web Worker, repositório IndexedDB com CAS e camada de aplicação independente de React. O servidor ganha somente a evolução de proveniência e um catálogo autenticado/versionado; o motor permanece inalterado. A UI conduz upload, revisão, parâmetros, confirmação e usa o endpoint de prévia já existente.

**Tech Stack:** Python 3.11, FastAPI 0.141.1, Pydantic 2.13.5, React 19.3.0, TypeScript 5.9.3, Vite 8.3.0, Vitest 5.0.0, Playwright 1.63.0, IndexedDB nativo, Decimal.js 10.6.0, read-excel-file 9.3.10, fflate 0.8.3, saxen 11.1.1 e fake-indexeddb 6.2.5.

**Spec:** `docs/superpowers/specs/2026-09-17-importacao-xlsx-dados-reais-design.md`

## Global Constraints

- Ler integralmente `AGENTS.md`, o topo de `docs/DIARIO-DE-MUDANCAS.md`, `docs/MAPA.md`, a especificação e este plano antes de editar.
- Buscar a `origin/main` mais recente; `c2ad1755899ddeafdf30f70350b5025ca55ddbaa` é somente o SHA inspecionado em 2026-09-17.
- Não alterar nenhum arquivo em `motor/`, nenhuma regra P0 e nenhuma medição histórica.
- Não regenerar a grade de 27.000 rodadas.
- Não inventar finalidades, alíquotas regulatórias ou parâmetros calibrados.
- Não criar nem reescrever issues do Linear sem autorização explícita; verificar a issue antes de cada branch.
- Commits usam `tipo: descrição (MOT-N)` com identificador real e consultável; nunca usar identificador reservado mas inexistente.
- `DADO_OBSERVADO` identifica células importadas não editadas; `NAO_COLETADO` só pode acompanhar `eh_efx=false`.
- O arquivo original, seu nome e `cliente_nome` nunca atravessam a rede; o binário nunca é persistido.
- Cada linha válida continua uma ordem separada. Não agregar, deduplicar semanticamente nem pré-netar operações.
- Decimal financeiro não passa por `Number`; datas são dias civis ISO, sem fuso ou feriados.
- Limites: 5 MiB compactado, 25 MiB descompactado, 128 ZIP entries, 1.000 linhas por arquivo, 1.000 ordens por execução, recorte de até 730 dias e request menor que 1 MiB.
- Invariantes Python usam `raise`, nunca `assert`; a suíte precisa passar também sob `python -O`.
- Toda mudança publicada ganha entrada no topo de `docs/DIARIO-DE-MUDANCAS.md` no mesmo commit.
- Cada tarefa termina em PR pequeno, CI verde e merge antes da próxima, salvo se Felipe e Gabriel aprovarem explicitamente uma pilha de PRs.

---

## Resumo das 14 tarefas

Os rótulos MOT-100–MOT-113 refletem a faixa pedida pelo Gabriel, mas a consulta ao
Linear em 2026-09-17 retornou “issue não encontrada” para todos eles. A Tarefa 0 é um
gate: o número usado em branch, commit, Diário e PR será o identificador que existir
de fato no Linear, mesmo que o contador gere outra faixa.

| Ordem | Rótulo desejado | Entrega revisável |
|---:|---|---|
| 0 | MOT-100 | base, issues, worktree e baseline confirmados |
| 1 | MOT-101 | proveniência real e eFX não coletado no contrato HTTP |
| 2 | MOT-102 | domínio local, datas e decimais canônicos |
| 3 | MOT-103 | inspeção OOXML e parser em Web Worker |
| 4 | MOT-104 | validação de linhas e relatório de importação |
| 5 | MOT-105 | identidade de clientes e aliases explícitos |
| 6 | MOT-106 | lotes, duplicidades, conflitos e undo determinístico |
| 7 | MOT-107 | edições, exclusões, recorte e elegibilidade |
| 8 | MOT-108 | IndexedDB, CAS, isolamento e exclusão local |
| 9 | MOT-109 | catálogo central versionado no servidor |
| 10 | MOT-110 | cliente do catálogo e configuração do estudo |
| 11 | MOT-111 | adaptador `PreviaRequest` e orquestração da execução |
| 12 | MOT-112 | fluxo React completo até Diagnóstico |
| 13 | MOT-113 | aceitação, segurança, performance, documentação e handoff |

## Mapa de arquivos

### Novos no navegador

```text
web/src/importer/
  domain.ts                 tipos e estados persistidos
  errors.ts                 códigos estáveis de erro
  dates.ts                  parsing e aritmética de dia civil
  decimals.ts               decimal BRL canônico
  normalization.ts          normalização de células
  validation.ts             validação por linha
  clients.ts                chave mecânica e aliases
  portfolio.ts              replay de lotes/eventos e projeção vigente
  eligibility.ts            recorte, blockers e resumo parcial
  xlsxPreflight.ts          inspeção OOXML segura
  xlsxParser.ts             células -> linhas serializadas
  xlsx.worker.ts            fronteira do worker
  workerClient.ts           protocolo e cancelamento no thread principal
  repository.ts             porta de persistência
  indexedDbRepository.ts    implementação transacional
  catalogClient.ts          consumo do catálogo central
  previewAdapter.ts         projeção para PreviaRequest
  controller.ts             casos de uso e máquina de estado
  components/
    UploadStep.tsx
    ReviewStep.tsx
    ParametersStep.tsx
    ExecutionConfirmation.tsx
    ImportFlowPage.tsx
```

Testes ficam ao lado do módulo como `*.test.ts`/`*.test.tsx`. Fixtures ficam em
`web/src/importer/__fixtures__/` e são geradas deterministicamente por
`web/scripts/build-import-fixtures.mjs`.

### Novos no servidor

```text
servidor/catalogs/__init__.py
servidor/catalogs/importacao.py
servidor/catalogs/importacao.v1.json
servidor/contracts/catalog.py
servidor/routes/catalog.py
tests/web_api/test_import_catalog.py
```

### Existentes modificados

```text
servidor/contracts/primitives.py
servidor/contracts/input.py
servidor/app.py
servidor/routes/__init__.py
pyproject.toml
contracts/openapi.json
web/package.json
web/package-lock.json
web/src/api/client.ts
web/src/api/generated.ts
web/src/api/schemas.json
web/src/api/validators.ts
web/src/app/providers.tsx
web/src/app/router.tsx
web/src/pages/PortfolioPage.tsx
web/src/preview/PreviewProvider.tsx
web/src/styles/global.css
docs/MAPA.md
docs/architecture.md
docs/DIARIO-DE-MUDANCAS.md
docs/testing.md
```

---

### Task 0: Gate de início, issues, base e isolamento (rótulo desejado MOT-100)

**Files:**
- Read: `AGENTS.md`
- Read: `docs/DIARIO-DE-MUDANCAS.md`
- Read: `docs/MAPA.md`
- Read: `docs/superpowers/specs/2026-09-17-importacao-xlsx-dados-reais-design.md`
- Read: `docs/superpowers/plans/2026-09-17-importacao-xlsx-dados-reais-plano-tecnico.md`

**Interfaces:**
- Consumes: acesso read-only ao Linear “Felipe Bisca”, time “MOTOR DE FLUXO”; repositório Git limpo.
- Produces: mapa escrito de 14 títulos para 14 IDs reais, base SHA, worktree isolado e baseline verde.

- [ ] **Step 1: Confirmar as 14 issues sem criá-las implicitamente**

No Linear, procurar os títulos da tabela abaixo. Se não existirem, parar e pedir ao
Gabriel que as crie ou autorize explicitamente a criação. O Linear escolhe o ID; não
é tecnicamente válido “reservar” MOT-100 digitando esse texto.

```text
Importação / T0 — Base, issues e baseline
Importação / T1 — Proveniência observada e eFX não coletado
Importação / T2 — Domínio local, datas e decimais
Importação / T3 — Parser XLSX seguro em Web Worker
Importação / T4 — Validação e relatório por linha
Importação / T5 — Identidade de clientes e aliases
Importação / T6 — Lotes, duplicidades e reversão
Importação / T7 — Edições, exclusões, recorte e elegibilidade
Importação / T8 — Persistência IndexedDB e concorrência
Importação / T9 — Catálogo central de importação
Importação / T10 — Cliente do catálogo e configuração
Importação / T11 — Adaptador e orquestração da prévia
Importação / T12 — Fluxo React completo
Importação / T13 — Aceitação, segurança e handoff
```

- [ ] **Step 2: Registrar o mapa real no comentário da issue T0**

O comentário deve conter os 14 IDs, títulos, dependências lineares e a frase:

```text
Os rótulos MOT-100–MOT-113 eram uma faixa desejada. Branches, commits, Diário e PRs usarão apenas os identificadores reais retornados pelo Linear.
```

- [ ] **Step 3: Atualizar a base sem tocar no checkout sujo do Gabriel**

```powershell
git fetch origin
git rev-parse origin/main
git status --short --branch
```

Expected: `origin/main` resolve; nenhum arquivo do usuário será apagado, movido ou
resetado. Se o checkout atual estiver sujo, criar worktree em vez de limpá-lo.

- [ ] **Step 4: Criar worktree pelo workflow obrigatório**

Usar `superpowers:using-git-worktrees`. Nome recomendado, substituindo o número pelo
ID real da T0:

```text
.worktrees/importacao-xlsx-base
feat/importacao-xlsx-base
```

- [ ] **Step 5: Instalar exatamente os locks existentes**

```powershell
python -m pip install -r requirements/web-dev.lock
python -m pip install --no-deps -e .
npm --prefix web ci
```

- [ ] **Step 6: Rodar baseline proporcional antes de editar**

```powershell
python -m pytest -q
python -O -m pytest -q
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run test:unit
npm --prefix web run build
```

Expected: tudo PASS. Registrar contagens, SHA e ambiente no comentário da T0. Se
falhar na base limpa, não começar a implementação; documentar o erro como baseline.

- [ ] **Step 7: Fechar o gate**

Critério: cada tarefa abaixo tem issue real, a base está identificada e o baseline
está verde. T0 não exige commit de código.

---

### Task 1: Proveniência observada e eFX não coletado (rótulo desejado MOT-101)

**Files:**
- Modify: `servidor/contracts/primitives.py`
- Modify: `servidor/contracts/input.py`
- Modify: `tests/web_api/test_contracts.py`
- Modify: `tests/web_api/conftest.py`
- Regenerate: `contracts/openapi.json`
- Regenerate: `web/src/api/generated.ts`
- Regenerate: `web/src/api/schemas.json`
- Regenerate: `web/src/api/validators.ts`

**Interfaces:**
- Consumes: `PreviaRequest`, `OrigemValor` e JSON Pointer existentes.
- Produces: `OrigemValor.tipo` com quatro valores e validação contextual
  `NAO_COLETADO -> somente /ordens/{i}/eh_efx == false`.

- [ ] **Step 1: Escrever testes de contrato que falham**

Adicionar casos explícitos:

```python
def test_observed_origin_is_accepted_for_imported_amount(reference_payload):
    reference_payload["proveniencia"]["/ordens/0/valor_brl"]["tipo"] = "DADO_OBSERVADO"
    assert PreviaRequest.model_validate(reference_payload)


def test_not_collected_is_accepted_only_for_false_efx(reference_payload):
    path = "/ordens/0/eh_efx"
    reference_payload["cenario"]["ordens"][0]["eh_efx"] = False
    reference_payload["proveniencia"][path]["tipo"] = "NAO_COLETADO"
    assert PreviaRequest.model_validate(reference_payload)


@pytest.mark.parametrize("path", ["/janela_dias", "/ordens/0/valor_brl"])
def test_not_collected_is_rejected_outside_efx(reference_payload, path):
    reference_payload["proveniencia"][path]["tipo"] = "NAO_COLETADO"
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)


def test_not_collected_rejects_true_efx(reference_payload):
    path = "/ordens/0/eh_efx"
    reference_payload["cenario"]["ordens"][0]["eh_efx"] = True
    reference_payload["proveniencia"][path]["tipo"] = "NAO_COLETADO"
    with pytest.raises(ValidationError):
        PreviaRequest.model_validate(reference_payload)
```

- [ ] **Step 2: Confirmar as falhas**

```powershell
python -m pytest tests/web_api/test_contracts.py -q
```

Expected: falhas por literal não aceito ou rejeição atual de `DADO_OBSERVADO`.

- [ ] **Step 3: Evoluir `OrigemValor` sem relaxar outros campos**

O tipo deve ser exatamente:

```python
tipo: Literal[
    "PADRAO_SINTETICO",
    "ESTIMATIVA_USUARIO",
    "DADO_OBSERVADO",
    "NAO_COLETADO",
]
```

Remover a rejeição reservada de `DADO_OBSERVADO`. Não aceitar strings livres.
Remover também `observed_origin` da lista de mutações que o teste legado espera
rejeitar; manter todos os outros casos da tabela.

- [ ] **Step 4: Adicionar validação cruzada em `PreviaRequest`**

Criar helper puro que reconhece apenas `^/ordens/[0-9]+/eh_efx$`. No
`validate_cross_fields`, para cada origem `NAO_COLETADO`, resolver o pointer no JSON e
exigir valor `False`. Qualquer outro caminho ou valor lança `ValueError`.

- [ ] **Step 5: Rodar testes Python normal e otimizado**

```powershell
python -m pytest tests/web_api/test_contracts.py -q
python -O -m pytest tests/web_api/test_contracts.py -q
python -m ruff check servidor/contracts tests/web_api/test_contracts.py
python -m mypy servidor
```

Expected: PASS.

- [ ] **Step 6: Regenerar contratos e provar determinismo**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff -- contracts/openapi.json web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --exit-code
```

Expected: a primeira geração mostra somente a evolução planejada; a segunda não
produz diff.

- [ ] **Step 7: Registrar Diário, revisar e publicar PR**

Adicionar entrada com sintoma, causa, mudança e invalidação. O commit usa o ID real
da issue e descrição `feat: aceita proveniência observada e eFX não coletado`.

---

### Task 2: Domínio local, datas e decimais (rótulo desejado MOT-102)

**Files:**
- Create: `web/src/importer/domain.ts`
- Create: `web/src/importer/errors.ts`
- Create: `web/src/importer/dates.ts`
- Create: `web/src/importer/dates.test.ts`
- Create: `web/src/importer/decimals.ts`
- Create: `web/src/importer/decimals.test.ts`
- Create: `web/src/importer/normalization.ts`
- Create: `web/src/importer/normalization.test.ts`

**Interfaces:**
- Consumes: `Decimal` de `decimal.js`.
- Produces: tipos persistidos `ImportStudy`, `ImportBatch`, `ImportedRow`,
  `ImportEvent`; `parseCivilDate`, `daysBetween`, `parseBrlDecimal`.

- [ ] **Step 1: Definir tipos discriminados, sem React ou contratos HTTP**

As interfaces públicas mínimas são:

```ts
export type ISODate = string & { readonly __isoDate: unique symbol };
export type ImportErrorCode =
  | 'REQUIRED' | 'INVALID_FORMAT' | 'VALUE_OUT_OF_RANGE'
  | 'DATE_ORDER_INVALID' | 'DIRECTION_INVALID'
  | 'DUPLICATE_ID_IN_BATCH' | 'CONFLICTING_ID_ACROSS_BATCHES'
  | 'PURPOSE_MISSING' | 'PURPOSE_UNKNOWN' | 'PURPOSE_DIRECTION_INVALID'
  | 'RECUT_TOO_LONG' | 'DEADLINE_OUT_OF_RANGE'
  | 'EXECUTION_LIMIT_EXCEEDED' | 'UNRESOLVED_CONFLICT';

export type NormalizedOperation = {
  operationId: string;
  clientName: string;
  profileClassification: string | null;
  direction: 'OUT' | 'IN';
  knownDate: ISODate;
  deadlineDate: ISODate;
  valueBrl: string;
  purposeCode: string | null;
};

export type RawOperationCells = Record<
  'operacao_id' | 'cliente_nome' | 'classificacao_perfil' | 'direcao' |
  'data_conhecida' | 'data_limite' | 'valor_brl' | 'finalidade_codigo',
  string | null
>;
```

Definir também IDs UUID como `string`, revisão inteira, metadados do arquivo,
histórico de eventos e `schemaVersion: '1.0.0'`. Não copiar tipos de `PreviaRequest`.

- [ ] **Step 2: Escrever testes de data civil**

Cobrir 29/02 bissexto, 29/02 inválido, mudança de mês/ano, entrada Excel `Date` em
UTC, texto `DD/MM/AAAA`, ausência de timezone e `daysBetween` sem horário de verão.

```ts
expect(parseCivilDate('29/02/2028')).toBe('2028-02-29');
expect(() => parseCivilDate('29/02/2027')).toThrow('INVALID_FORMAT');
expect(daysBetween('2026-10-17' as ISODate, '2026-10-19' as ISODate)).toBe(2);
```

- [ ] **Step 3: Implementar data sem `new Date(texto)`**

Separar componentes, validar o round-trip de `Date.UTC` e guardar somente ISO. Para
datas Excel já convertidas em `Date`, ler componentes UTC. A função pública:

```ts
export function parseCivilDate(value: string | Date): ISODate;
export function daysBetween(start: ISODate, end: ISODate): number;
export function addCivilDays(start: ISODate, days: number): ISODate;
```

- [ ] **Step 4: Escrever testes de decimal BRL**

Aceitar `1500000,00`, `1500000.00` de célula numérica serializada e até 6 casas.
Recusar separador de milhar, expoente, zero, negativo, `NaN`, `Infinity`, mais de 6
casas e valor acima de `10^12`.

- [ ] **Step 5: Implementar decimal canônico com Decimal.js**

```ts
export function parseBrlDecimal(raw: string): string;
```

Converter vírgula única para ponto, validar por regex antes do `Decimal`, comparar
limites com `Decimal` e retornar texto sem expoente nem zeros finais desnecessários.
Nunca chamar `Number(raw)` ou `parseFloat`.

- [ ] **Step 6: Implementar normalização de campos**

`operacao_id` é exato e rejeita espaços externos. Direção aplica trim/uppercase e só
aceita OUT/IN. Finalidade vazia vira `null`; preenchida mantém conteúdo exato após
rejeitar espaços externos. Perfil é trim ou `null`. Nome mantém grafia de exibição
após trim/colapso, sem decidir alias.

- [ ] **Step 7: Rodar gate web focado**

```powershell
npm --prefix web run test:unit -- src/importer/dates.test.ts src/importer/decimals.test.ts src/importer/normalization.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 8: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: cria domínio canônico da importação`.

---

### Task 3: Parser XLSX seguro em Web Worker (rótulo desejado MOT-103)

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/src/importer/xlsxPreflight.ts`
- Create: `web/src/importer/xlsxPreflight.test.ts`
- Create: `web/src/importer/xlsxParser.ts`
- Create: `web/src/importer/xlsxParser.test.ts`
- Create: `web/src/importer/xlsx.worker.ts`
- Create: `web/src/importer/workerClient.ts`
- Create: `web/src/importer/workerClient.test.ts`
- Create: `web/scripts/build-import-fixtures.mjs`
- Create: `web/src/importer/__fixtures__/*.xlsx`

**Interfaces:**
- Consumes: `RawOperationCells` e limites da especificação.
- Produces: `parseWorkbook(buffer, metadata): Promise<ParsedWorkbook>` no worker e
  `ImporterWorkerClient.parse(file, signal)` no thread principal.

- [ ] **Step 1: Fixar dependências diretas verificadas**

```powershell
npm --prefix web install --save-exact read-excel-file@9.3.10 fflate@0.8.3 saxen@11.1.1
```

Expected: somente `package.json` e `package-lock.json` mudam; `npm ci` continua
reproduzível.

- [ ] **Step 2: Criar gerador determinístico de fixtures OOXML**

O script usa `zipSync` apenas em build/teste e produz:

```text
valid-minimal.xlsx
valid-1000-rows.xlsx
formula.xlsx
merged-cell.xlsx
extra-sheet.xlsx
hidden-only-sheet.xlsx
wrong-sheet-name.xlsx
wrong-headers.xlsx
macro-marker.xlsx
external-link.xlsx
encrypted-marker.xlsx
zip-too-many-entries.xlsx
```

Cada fixture deve ter conteúdo declarado num objeto no script e hash estável. Rodar
o gerador duas vezes e exigir `git diff --exit-code` na segunda.

- [ ] **Step 3: Escrever testes de preflight que falham**

Testar cada código estrutural e garantir que nenhum caso inválido retorna células.
O caso válido deve resolver exatamente uma worksheet visível `operacoes` e os oito
headers na ordem canônica. Workbook cuja única aba esteja oculta retorna
`SHEET_NAME_INVALID` sem ler células.

- [ ] **Step 4: Implementar descompactação incremental com limites**

Antes do ZIP, reconhecer os oito bytes `D0 CF 11 E0 A1 B1 1A E1` do contêiner OLE
usado por XLSX criptografado e retornar `ENCRYPTED_FILE_NOT_ALLOWED`. Usar API
streaming de `fflate` nos demais arquivos. Contar cada entry antes de extrair e somar bytes
produzidos; abortar acima de 128 entries ou 25 MiB. Validar 5 MiB antes de iniciar.
O SAX deve identificar `sheet`, relationships, `<f>`, `mergeCell`, external links,
content types de VBA/OLE e criptografia. Não usar regex como parser XML.

Interface:

```ts
export async function preflightXlsx(
  buffer: ArrayBuffer,
): Promise<{ sheetName: 'operacoes'; sheetPath: string }>;
```

- [ ] **Step 5: Escrever testes de parsing de valores**

O leitor deve retornar datas como ISO serializável ou célula textual e números como
texto decimal bruto por `parseNumber`. Confirmar que `1500000.00` não passa por
float e que exatamente 1.000 linhas são aceitas; a 1.001ª gera
`ROW_LIMIT_EXCEEDED`.

- [ ] **Step 6: Implementar parser dentro do worker**

Usar `read-excel-file/universal` após o preflight. O protocolo discriminado é:

```ts
type WorkerRequest = { kind: 'PARSE'; requestId: string; buffer: ArrayBuffer; fileName: string; fileSize: number };
type WorkerResponse =
  | { kind: 'SUCCESS'; requestId: string; workbook: ParsedWorkbook }
  | { kind: 'FAILURE'; requestId: string; error: ImportFileError };
```

Calcular SHA-256 no worker. Encerrar referências ao buffer após responder.

- [ ] **Step 7: Implementar cliente cancelável**

```ts
export interface ImporterWorkerClient {
  parse(file: File, signal?: AbortSignal): Promise<ParsedWorkbook>;
  dispose(): void;
}
```

Transferir o `ArrayBuffer`, não cloná-lo. `AbortSignal` termina o worker daquela
operação, rejeita com `AbortError` e não retorna lote parcial. Reiniciar um worker
novo na tentativa seguinte.

- [ ] **Step 8: Rodar gate do parser**

```powershell
node web/scripts/build-import-fixtures.mjs
npm --prefix web run test:unit -- src/importer/xlsxPreflight.test.ts src/importer/xlsxParser.test.ts src/importer/workerClient.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
node web/scripts/build-import-fixtures.mjs
git diff --exit-code -- web/src/importer/__fixtures__
```

Expected: PASS e fixtures determinísticas.

- [ ] **Step 9: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: adiciona parser XLSX seguro no navegador`.

---

### Task 4: Validação e relatório por linha (rótulo desejado MOT-104)

**Files:**
- Create: `web/src/importer/validation.ts`
- Create: `web/src/importer/validation.test.ts`
- Modify: `web/src/importer/domain.ts`
- Modify: `web/src/importer/errors.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`, normalizadores de T2.
- Produces: `validateImportedRows(workbook, context): ImportBatchDraft`.

- [ ] **Step 1: Escrever matriz de testes por campo**

Criar um caso válido e uma tabela `it.each` para vazio, formato, limites, datas
invertidas, direção, finalidade ausente e ID repetido. Verificar código, campo,
linha, valor original preservado e ausência de exceção global.

```ts
expect(report.rows[1].errors).toContainEqual(expect.objectContaining({
  code: 'DATE_ORDER_INVALID', field: 'data_limite', rowNumber: 3,
}));
expect(report.summary).toEqual({ total: 3, valid: 2, invalid: 1 });
```

- [ ] **Step 2: Implementar validação acumulativa**

A função não para no primeiro campo inválido. Ela produz `normalized: null` quando a
linha não pode formar operação e mantém todos os erros alcançáveis. Finalidade vazia
gera `PURPOSE_MISSING`, mas não impede incorporar o lote.

```ts
export function validateImportedRows(
  workbook: ParsedWorkbook,
  nowUtc: string,
  idFactory: () => string,
): ImportBatchDraft;
```

- [ ] **Step 3: Implementar duplicidade dentro do lote**

Após validar IDs, agrupar por valor exato. Se houver mais de uma ocorrência, marcar
todas com `DUPLICATE_ID_IN_BATCH`; nenhuma vira versão vigente por ordem de linha.

- [ ] **Step 4: Provar carregamento parcial**

Teste com dez linhas, quatro inválidas e seis válidas. O draft contém dez linhas,
seis normalizadas e quatro não executáveis; não lança erro de arquivo.

- [ ] **Step 5: Rodar gate focado**

```powershell
npm --prefix web run test:unit -- src/importer/validation.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 6: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: valida operações importadas por linha`.

---

### Task 5: Identidade de clientes e aliases (rótulo desejado MOT-105)

**Files:**
- Create: `web/src/importer/clients.ts`
- Create: `web/src/importer/clients.test.ts`
- Modify: `web/src/importer/domain.ts`

**Interfaces:**
- Consumes: `cliente_nome` válido e aliases existentes da conta.
- Produces: `normalizeClientNameKey`, `resolveClient`, `mergeClientAlias`,
  `unmergeClientAlias` e UUID canônico persistível.

- [ ] **Step 1: Escrever testes da chave mecânica**

```ts
expect(normalizeClientNameKey('  Órbita   Comércio  ')).toBe('orbita comercio');
expect(normalizeClientNameKey('ORBITA COMERCIO')).toBe('orbita comercio');
expect(normalizeClientNameKey('Órbita Comércio Ltda.')).not.toBe(
  normalizeClientNameKey('Órbita Comércio'),
);
```

Cobrir NFKC, espaços, caixa e acentos. Não remover pontuação nem sufixos.

- [ ] **Step 2: Definir entidades e ações**

```ts
export type CanonicalClient = { id: string; displayName: string; createdAt: string };
export type ClientAlias = {
  normalizedName: string;
  canonicalClientId: string;
  displayVariant: string;
  confirmedByUser: boolean;
  createdAt: string;
  revokedAt: string | null;
};
```

- [ ] **Step 3: Implementar resolução sem fuzzy matching**

Igualdade da chave ativa reutiliza UUID. Chave inédita cria cliente novo por
`idFactory`. Nenhuma distância de edição, sugestão automática ou nome parecido pode
fundir clientes.

- [ ] **Step 4: Implementar merge e desfazer como eventos**

Merge exige ação explícita e produz evento referindo variante e UUID alvo. Unmerge
revoga o alias e cria um novo UUID canônico para a variante a partir daquela revisão;
operações afetadas são reprojetadas e resultados ficam stale.

- [ ] **Step 5: Testar estabilidade e isolamento lógico**

Mesmos aliases + mesmas linhas devem produzir mesmos UUIDs. Sem alias compartilhado,
duas variantes não triviais permanecem clientes diferentes. O módulo não lê storage
nem sessão diretamente.

- [ ] **Step 6: Rodar gate focado**

```powershell
npm --prefix web run test:unit -- src/importer/clients.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 7: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: resolve clientes por aliases explícitos`.

---

### Task 6: Lotes, duplicidades e reversão (rótulo desejado MOT-106)

**Files:**
- Create: `web/src/importer/portfolio.ts`
- Create: `web/src/importer/portfolio.test.ts`
- Modify: `web/src/importer/domain.ts`

**Interfaces:**
- Consumes: lotes imutáveis, aliases e eventos ordenados.
- Produces: `projectPortfolio(study): PortfolioProjection` e comandos puros para
  incorporar/reverter lote e resolver conflitos.

- [ ] **Step 1: Fixar ordem canônica de replay em testes**

Ordenar lotes por `batchSequence`, linhas por `rowNumber` e eventos por
`eventSequence`. UUID ou timestamp nunca decide precedência.

- [ ] **Step 2: Escrever os quatro cenários de duplicidade**

1. ID novo: adiciona versão vigente.
2. Mesmo ID e conteúdo canônico idêntico: registra as duas origens e mantém conteúdo.
3. Mesmo ID e conteúdo diferente: cria conflito sem escolher vencedor.
4. Mesmo ID duplicado dentro do lote: nenhuma ocorrência é candidata.

Comparação canônica inclui direção, datas, BRL, finalidade e UUID de cliente; ignora
perfil informativo, filename, timestamp e grafia de alias.

- [ ] **Step 3: Definir comandos e projeção**

```ts
export type ConflictResolution = {
  operationId: string;
  selectedVersionId: string;
};

export function incorporateBatch(study: ImportStudy, batch: ImportBatch): ImportStudy;
export function resolveVersionConflict(study: ImportStudy, resolution: ConflictResolution): ImportStudy;
export function revertBatch(study: ImportStudy, batchId: string): ImportStudy;
export function projectPortfolio(study: ImportStudy): PortfolioProjection;
```

Comandos retornam nova estrutura e evento; não mutam arrays recebidos.

- [ ] **Step 4: Implementar replay determinístico**

Projeção deriva operações vigentes, conflitos, contagens e versões por ID. Ela nunca
apaga lotes/eventos. Conflito resolvido aponta para `versionId` existente e ativo;
reversão que remove essa versão elimina a resolução inválida e volta à única versão
restante ou ao estado de conflito.

- [ ] **Step 5: Testar reversão completa**

Cobrir lote que só adiciona, lote que substitui e lote idêntico. Após revertê-lo, a
projeção deve ser byte a byte igual à projeção anterior ao lote, exceto metadados de
auditoria/revisão.

- [ ] **Step 6: Rodar gate focado**

```powershell
npm --prefix web run test:unit -- src/importer/portfolio.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 7: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: compõe lotes e conflitos de importação`.

---

### Task 7: Edições, exclusões, recorte e elegibilidade (rótulo desejado MOT-107)

**Files:**
- Create: `web/src/importer/eligibility.ts`
- Create: `web/src/importer/eligibility.test.ts`
- Modify: `web/src/importer/portfolio.ts`
- Modify: `web/src/importer/portfolio.test.ts`
- Modify: `web/src/importer/domain.ts`

**Interfaces:**
- Consumes: `PortfolioProjection`, catálogo opcional, recorte e eventos.
- Produces: comandos `editOperation`, `excludeOperation`, `restoreOperation`, além de
  `evaluateExecution(study, catalog): ExecutionAssessment`.

- [ ] **Step 1: Escrever testes do histórico de edição**

Editar cada campo operacional deve preservar valor originalmente importado, valor
anterior, valor novo, campo, instante e `eventId`. Segunda edição não sobrescreve a
primeira. Corrigir de volta ao original cria novo evento e restaura o conteúdo, não
apaga a trilha.

```ts
expect(projection.operations[0].audit.edits).toEqual([
  expect.objectContaining({
    field: 'valueBrl', originalValue: '100', previousValue: '100', nextValue: '120',
  }),
]);
```

- [ ] **Step 2: Implementar edição pela mesma validação do import**

```ts
export function editOperation(
  study: ImportStudy,
  command: { operationId: string; field: EditableField; rawValue: string; eventId: string; at: string },
): ImportStudy;
```

Normalizar e validar somente pelo módulo da T2/T4. Edição inválida é persistível como
rascunho de campo, torna a operação não executável e nunca injeta valor parcialmente
normalizado no request.

- [ ] **Step 3: Implementar exclusão e restauração sem justificativa**

Ambas geram evento append-only. Excluir operação conflitante não resolve o conflito;
uma decisão de versão continua necessária se o ID voltar a participar.

- [ ] **Step 4: Escrever testes de recorte inclusivo**

Cobrir limite inicial/final, default min/max, fevereiro bissexto, operação conhecida
fora mas com deadline dentro, operação conhecida dentro e deadline depois do fim.
Somente `knownDate` decide inclusão.

- [ ] **Step 5: Implementar assessment sem efeitos colaterais**

```ts
export type ExecutionAssessment = {
  selected: ExecutableOperation[];
  blockers: ImportIssue[];
  omitted: { outsideRecut: number; invalid: number; excluded: number; superseded: number };
  requiresPartialConfirmation: boolean;
  periodDays: number;
};

export function evaluateExecution(
  projection: PortfolioProjection,
  recut: { start: ISODate; end: ISODate },
  catalog: ImportCatalog | null,
): ExecutionAssessment;
```

Blockers globais: recorte invertido/acima de 730, conflito selecionado não resolvido,
zero selecionadas e mais de 1.000 selecionadas. Erros de finalidade e deadline
inviabilizam a linha, mas permitem as demais com confirmação parcial.

- [ ] **Step 6: Provar regras de finalidade**

Catálogo `NAO_CONFIGURADO` torna todas as linhas não executáveis, sem impedir edição.
Catálogo configurado exige código e direção presentes. Não usar fallback de IOF para
contornar finalidade desconhecida.

- [ ] **Step 7: Rodar gate focado**

```powershell
npm --prefix web run test:unit -- src/importer/portfolio.test.ts src/importer/eligibility.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 8: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: calcula recorte e elegibilidade da importação`.

---

### Task 8: IndexedDB, CAS, isolamento e exclusão local (rótulo desejado MOT-108)

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/src/importer/repository.ts`
- Create: `web/src/importer/indexedDbRepository.ts`
- Create: `web/src/importer/indexedDbRepository.test.ts`
- Create: `web/src/importer/indexedDbConcurrency.test.ts`

**Interfaces:**
- Consumes: entidades e comandos puros das T2–T7, `ownerSub` e `projectRef`.
- Produces: `ImportRepository` transacional, CAS por revisão e banco isolado por conta.

- [ ] **Step 1: Fixar dependência de teste**

```powershell
npm --prefix web install --save-dev --save-exact fake-indexeddb@6.2.5
```

- [ ] **Step 2: Definir a porta sem expor `IDBDatabase`**

```ts
export class RevisionConflictError extends Error {}

export interface ImportRepository {
  listStudies(): Promise<ImportStudyHeader[]>;
  loadStudy(studyId: string): Promise<ImportStudy | null>;
  createStudy(study: ImportStudy): Promise<void>;
  mutateStudy(input: {
    studyId: string;
    expectedRevision: number;
    operationId: string;
    mutation: StudyMutation;
  }): Promise<ImportStudy>;
  saveExecution(record: ImportExecutionRecord, expectedRevision: number): Promise<void>;
  deleteStudy(studyId: string): Promise<void>;
  deleteAllLocalData(): Promise<void>;
  close(): void;
}
```

`StudyMutation` é união discriminada dos comandos existentes; não aceita callback,
pois callback não é serializável nem idempotente.

- [ ] **Step 3: Escrever testes de schema e round-trip**

Verificar as sete stores da especificação, índices por `study_id`, persistência de
linhas inválidas, aliases e execuções, e ausência de qualquer `Blob`, `File` ou
`ArrayBuffer` no storage.

- [ ] **Step 4: Implementar abertura por escopo autenticado**

```ts
export function databaseName(projectRef: string, ownerSub: string): string {
  return `motor-fluxo:imports:v1:${projectRef}:${ownerSub}`;
}
```

Validar ambos como segmentos não vazios sem `:`. O repositório recebe o escopo no
construtor e rejeita qualquer registro cujo `ownerSub` divergir.

- [ ] **Step 5: Implementar transações e CAS**

Em uma única transação `readwrite`, ler estudo, comparar `expectedRevision`, verificar
se `operationId` já foi aplicado, gravar lotes/versões/eventos/aliases e atualizar
revisão. Resolver somente em `transaction.oncomplete`. Não fazer hash, fetch, timer
ou await externo dentro da transação.

- [ ] **Step 6: Escrever e passar testes de corrida**

Duas instâncias abrem a mesma DB na revisão 3. A primeira confirma revisão 4; a
segunda, ainda esperando 3, recebe `RevisionConflictError` e não escreve nenhuma
store. Repetir a primeira operação com mesmo `operationId` retorna o estado já
confirmado sem duplicar evento.

- [ ] **Step 7: Implementar avisos entre abas**

Canal `motor-fluxo:imports:<projectRef>:<ownerSub>` transmite somente
`{studyId, revision, operationId}`. Aba limpa recarrega; aba com mutação pendente
mostra conflito e não sobrescreve. `BroadcastChannel` indisponível não altera CAS.

- [ ] **Step 8: Implementar versionchange, logout e exclusão**

`versionchange` fecha a conexão. Logout chama `close`, mas não apaga dados. Excluir
estudo remove todas as chaves daquele estudo numa transação. “Apagar todos” fecha a
DB, chama `indexedDB.deleteDatabase(nomeExato)` e trata `blocked` com mensagem para
fechar outras abas; nunca apaga banco de outra conta.

- [ ] **Step 9: Rodar gate de persistência**

```powershell
npm --prefix web run test:unit -- src/importer/indexedDbRepository.test.ts src/importer/indexedDbConcurrency.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Expected: PASS.

- [ ] **Step 10: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: persiste importações com CAS no IndexedDB`.

---

### Task 9: Catálogo central versionado no servidor (rótulo desejado MOT-109)

**Files:**
- Create: `servidor/catalogs/__init__.py`
- Create: `servidor/catalogs/importacao.py`
- Create: `servidor/catalogs/importacao.v1.json`
- Create: `servidor/contracts/catalog.py`
- Create: `servidor/routes/catalog.py`
- Create: `tests/web_api/test_import_catalog.py`
- Modify: `servidor/app.py`
- Modify: `servidor/routes/__init__.py`
- Modify: `pyproject.toml`
- Modify: `tests/web_api/test_openapi.py`
- Regenerate: `contracts/openapi.json`
- Regenerate: `web/src/api/generated.ts`
- Regenerate: `web/src/api/schemas.json`
- Regenerate: `web/src/api/validators.ts`

**Interfaces:**
- Consumes: autenticação existente, `CustoEntrada`, pacote instalado.
- Produces: `GET /api/v1/catalogos/importacao` autenticado, estável e `no-store`.

- [ ] **Step 1: Escrever contrato Pydantic estrito**

```python
class AliquotaFinalidade(StrictModel):
    direcao: Literal["OUT", "IN"]
    aliquota: DecimalText


class FinalidadeCatalogo(StrictModel):
    codigo: Annotated[str, Field(strict=True, min_length=1, max_length=128)]
    descricao: Annotated[str, Field(strict=True, min_length=1, max_length=240)]
    aliquotas: Annotated[list[AliquotaFinalidade], Field(min_length=1, max_length=2)]


class CatalogoImportacao(StrictModel):
    schema_version: Literal["1.0.0"]
    catalog_version: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    status: Literal["CONFIGURADO", "NAO_CONFIGURADO"]
    publicado_em_utc: DateTimeValue
    finalidades: Annotated[list[FinalidadeCatalogo], Field(max_length=100)]
    custos_padrao: CustoEntrada
    custos_origem: OrigemValor
    custos_calibrados: Literal[False]
```

Validar códigos únicos, pares direção únicos e coerência: `NAO_CONFIGURADO` exige
lista vazia; `CONFIGURADO` exige pelo menos uma finalidade.

- [ ] **Step 2: Criar catálogo de produção intencionalmente não configurado**

O JSON contém lista vazia e defaults sintéticos claramente rotulados:

```json
{
  "schema_version": "1.0.0",
  "status": "NAO_CONFIGURADO",
  "publicado_em_utc": "2026-09-17T00:00:00Z",
  "finalidades": [],
  "custos_padrao": {
    "iof_out": "0.035",
    "iof_in": "0.0038",
    "carry_cnr": "0.0004",
    "spread_rail_bps": "25",
    "custo_fixo_remessa": "40",
    "custo_oportunidade_aa": "0",
    "ptax": "5.4",
    "iof_por_finalidade": []
  },
  "custos_origem": {
    "tipo": "PADRAO_SINTETICO",
    "fonte": "Parâmetros técnicos não calibrados do simulador",
    "registrado_em_utc": "2026-09-17T00:00:00Z"
  },
  "custos_calibrados": false
}
```

`catalog_version` não fica no arquivo: o loader calcula SHA-256 do JSON canônico e
injeta na resposta.

- [ ] **Step 3: Escrever testes do loader**

Cobrir hash determinístico, decimal preservado, duplicidade de código/par, status
incoerente e arquivo ausente/corrompido. Falha de configuração deve impedir startup,
não retornar catálogo parcial.

- [ ] **Step 4: Escrever testes HTTP antes da rota**

Testar 401 sem token, 403 fora da allowlist, 200 autenticado, `Cache-Control:
no-store`, schema exato e ausência de dados do usuário. Injetar catálogo fictício
configurado apenas no teste para validar duas direções.

- [ ] **Step 5: Implementar loader e rota**

`create_app` recebe dependência opcional `import_catalog` para testes; produção
carrega o recurso empacotado uma vez no lifespan. A rota só devolve o objeto
imutável. Não lê `motor/varredura.py` e não oferece POST/PUT de catálogo.

- [ ] **Step 6: Empacotar o JSON e testar wheel**

Adicionar:

```toml
[tool.setuptools.package-data]
motor = ["cenarios/*.yaml"]
servidor = ["catalogs/*.json"]
```

Preservar a entrada já existente de `motor`.

- [ ] **Step 7: Publicar rota no schema canônico e regenerar**

Adicionar a mesma assinatura em `create_schema_app`; então:

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --exit-code -- contracts web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts
```

- [ ] **Step 8: Rodar gate servidor**

```powershell
python -m pytest tests/web_api/test_import_catalog.py tests/web_api/test_openapi.py tests/web_api/test_http.py -q
python -O -m pytest tests/web_api/test_import_catalog.py tests/web_api/test_openapi.py tests/web_api/test_http.py -q
python -m ruff check servidor tests/web_api/test_import_catalog.py
python -m mypy servidor
python -m build --wheel
```

Expected: PASS; inspecionar o wheel e confirmar `servidor/catalogs/importacao.v1.json`.

- [ ] **Step 9: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: publica catálogo central de importação`.

---

### Task 10: Cliente do catálogo e configuração do estudo (rótulo desejado MOT-110)

**Files:**
- Create: `web/src/importer/catalogClient.ts`
- Create: `web/src/importer/catalogClient.test.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.test.ts`
- Modify: `web/src/importer/domain.ts`
- Modify: `web/src/importer/eligibility.ts`
- Modify: `web/src/importer/eligibility.test.ts`

**Interfaces:**
- Consumes: tipos OpenAPI gerados e transporte autenticado já existente.
- Produces: `api.getImportCatalog(signal)`, cache de sessão e configuração editável
  validada do estudo.

- [ ] **Step 1: Adicionar validator gerado ao cliente, sem cast cego**

O gerador deve expor `validateCatalogoImportacao`. Se não expuser, corrigir
`web/scripts/generate-api.mjs`; não escrever cópia manual do schema.

- [ ] **Step 2: Escrever testes do método HTTP**

Cobrir bearer token, 200 válido, JSON inválido, versão diferente, 401, timeout e
cancelamento. A resposta deve ser deep-frozen como as demais.

- [ ] **Step 3: Implementar `getImportCatalog`**

```ts
export interface ApiClient {
  getReferenceExample(signal?: AbortSignal): Promise<ReferenceExample>;
  getImportCatalog(signal?: AbortSignal): Promise<ImportCatalog>;
  runPreview(input: PreviaRequest, signal?: AbortSignal): Promise<PreviewEnvelope>;
}
```

GET usa `/api/v1/catalogos/importacao`; erro de schema gera
`RESPOSTA_INVALIDA`, não fallback silencioso.

- [ ] **Step 4: Definir configuração editável**

```ts
export type ImportStudyParameters = {
  windowDays: number;
  costs: components['schemas']['CustoEntrada'];
  fieldOrigins: Record<ParameterField, ParameterOrigin>;
  catalogVersion: string | null;
};
```

Ao criar estudo, copiar defaults do catálogo, janela 7 e origem publicada. Edição
local marca somente o campo alterado como `ESTIMATIVA_USUARIO`; não modifica o
catálogo em cache.

- [ ] **Step 5: Implementar cache e estado indisponível**

Usar TanStack Query com chave `['import-catalog', ownerSub]`, `staleTime` da sessão e
sem persistência remota. Cache local pode permitir revisão offline; executar exige
catálogo já carregado, versão registrada e regras suficientes.

- [ ] **Step 6: Testar mudança de catálogo**

Versão diferente da versão gravada no último resultado torna resultado stale e
reavalia finalidades. Não reescrever eventos históricos nem request antigo.

- [ ] **Step 7: Rodar gate web**

```powershell
npm --prefix web run test:unit -- src/api/client.test.ts src/importer/catalogClient.test.ts src/importer/eligibility.test.ts
npm --prefix web run typecheck
npm --prefix web run lint
```

Expected: PASS.

- [ ] **Step 8: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: integra catálogo e parâmetros da importação`.

---

### Task 11: Adaptador `PreviaRequest` e orquestração (rótulo desejado MOT-111)

**Files:**
- Create: `web/src/importer/previewAdapter.ts`
- Create: `web/src/importer/previewAdapter.test.ts`
- Create: `web/src/importer/controller.ts`
- Create: `web/src/importer/controller.test.ts`
- Modify: `web/src/preview/PreviewProvider.tsx`
- Modify: `web/src/preview/PreviewProvider.test.tsx`

**Interfaces:**
- Consumes: assessment executável, parâmetros, catálogo, study/scenario IDs e API.
- Produces: `buildImportedPreviewRequest`, controlador de execução idempotente e
  método genérico do `PreviewProvider`.

- [ ] **Step 1: Escrever teste dourado do request**

Usar duas operações do mesmo cliente, OUT e IN, datas conhecidas dentro de um
recorte, deadline de uma depois do fim. Verificar:

```ts
expect(request.cenario.ordens).toHaveLength(2);
expect(request.cenario.ordens[0].cliente_id).toBe(request.cenario.ordens[1].cliente_id);
expect(request.cenario.ordens.map((order) => order.direcao)).toEqual(['IN', 'OUT']);
expect(request.periodo).toEqual({ modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 31 });
expect(request.cenario.horizonte_dias).toBe(31);
```

Ordenação canônica: `operationId` ordinal. JSON Pointer de proveniência é construído
depois dessa ordenação.

- [ ] **Step 2: Implementar adaptador puro**

```ts
export function buildImportedPreviewRequest(input: {
  study: ImportStudy;
  assessment: ExecutionAssessment;
  catalog: ImportCatalog;
  requestId: string;
  scenarioId: string;
  nowUtc: string;
}): PreviaRequest;
```

Mapeamentos exatos:

- `id = operationId`;
- `cliente_id = canonicalClientId`;
- `dia_conhecida/dia_limite = daysBetween(recut.start, date)`;
- `valor_brl = texto decimal canônico`;
- `eh_efx = false` com origem `NAO_COLETADO`;
- `finalidade = purposeCode`;
- `janela_dias = windowDays`;
- `horizonte_dias = assessment.periodDays`;
- `periodo` NATURAL, aquecimento zero;
- `iof_por_finalidade` contém apenas pares usados, ordenados por código/direção;
- células sem edição usam `DADO_OBSERVADO`; editadas usam `ESTIMATIVA_USUARIO`;
- defaults usam `PADRAO_SINTETICO`; regras do catálogo usam `DADO_OBSERVADO`.

- [ ] **Step 3: Validar localmente com schema gerado**

Após construir, chamar `validatePreviaRequest`. Falha é erro interno de adaptação e
impede POST. Serializar uma vez e medir `TextEncoder().encode(json).byteLength`; se
acima de 1 MiB, retornar `REQUEST_TOO_LARGE` antes da rede.

- [ ] **Step 4: Testar limite de 1.000 operações**

Gerar estudo determinístico com 1.000 operações, construir request, validar schema e
exigir tamanho abaixo de `1_048_576`. Também provar que nome do arquivo,
`clientName` e `profileClassification` não aparecem no JSON.

- [ ] **Step 5: Generalizar o PreviewProvider**

Preservar `executeReference()` e adicionar:

```ts
executeRequest(input: PreviaRequest): Promise<PreviewEnvelope>;
restoreEnvelope(envelope: PreviewEnvelope): void;
```

Não repetir POST automaticamente. Erro preserva envelope anterior. Resposta só é
aceita se request, estudo, cenário e revisão coincidirem com a tentativa ativa.
`restoreEnvelope` valida o envelope gerado e só reidrata resultado já lido do
repositório autenticado; nunca executa request.

- [ ] **Step 6: Implementar controlador de casos de uso**

Estados:

```ts
type ImportControllerState =
  | { status: 'IDLE' }
  | { status: 'PARSING'; fileName: string }
  | { status: 'REVIEW'; studyId: string }
  | { status: 'SAVING'; studyId: string }
  | { status: 'EXECUTING'; studyId: string; attemptId: string }
  | { status: 'FAILURE'; phase: 'PARSE' | 'SAVE' | 'EXECUTE'; message: string };
```

Antes do POST: confirmar assessment, persistir mutações pendentes, reservar tentativa
por CAS, montar request. Depois da resposta: salvar request, versão do catálogo e
envelope imutável. Falha de salvar resultado mantém resposta em memória e oferece
“Tentar salvar”; não repete execução.

- [ ] **Step 7: Testar edição concorrente e resposta atrasada**

Se estudo muda após POST, guardar resultado como histórico da revisão enviada e não
como atual. Se conta/sessão muda, descartar resposta. Duplo clique gera um POST.

- [ ] **Step 8: Rodar gate do adaptador**

```powershell
npm --prefix web run test:unit -- src/importer/previewAdapter.test.ts src/importer/controller.test.ts src/preview/PreviewProvider.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Expected: PASS e request de 1.000 ordens abaixo de 1 MiB.

- [ ] **Step 9: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: adapta importação para a prévia canônica`.

---

### Task 12: Fluxo React completo até Diagnóstico (rótulo desejado MOT-112)

**Files:**
- Create: `web/src/importer/components/UploadStep.tsx`
- Create: `web/src/importer/components/ReviewStep.tsx`
- Create: `web/src/importer/components/ParametersStep.tsx`
- Create: `web/src/importer/components/ExecutionConfirmation.tsx`
- Create: `web/src/importer/components/ImportFlowPage.tsx`
- Create: `web/src/importer/components/importFlow.test.tsx`
- Modify: `web/src/app/providers.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/router.test.tsx`
- Modify: `web/src/pages/PortfolioPage.tsx`
- Modify: `web/src/pages/previewFlow.test.tsx`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: controlador, repositório, catálogo, auth e PreviewProvider.
- Produces: rotas e fluxo acessível de upload até `/diagnostico`.

- [ ] **Step 1: Montar providers por sessão**

Criar repositório somente quando `userId` e project ref forem válidos. Em troca de
conta/logout, desmontar controlador, cancelar worker/fetch e fechar banco. Nenhum
singleton global conserva estudo da conta anterior.

- [ ] **Step 2: Adicionar rotas protegidas**

```tsx
<Route path="/carteira/importar" element={<ImportFlowPage mode="new" />} />
<Route path="/carteira/:studyId/importar" element={<ImportFlowPage mode="existing" />} />
```

Manter `/carteira` e `/diagnostico`. Study inexistente/da outra conta volta à lista
com aviso genérico, sem revelar existência.

Preservar o rascunho localStorage e o percurso de referência da Etapa 1. Esta tarefa
adiciona estudos importados à página Carteira; não migra, apaga ou transforma o
rascunho antigo sem uma decisão separada.

- [ ] **Step 3: Implementar Upload**

Input nativo `accept=.xlsx`, label explícita, limites visíveis, progresso em
`role=status`, cancelar parsing e erros de arquivo em `role=alert`. Nenhum upload
começa ao selecionar; o botão “Ler planilha” aciona o worker.

- [ ] **Step 4: Implementar Revisão**

Tabela semântica com cabeçalho fixo, caption e paginação/virtualização que preserve
acessibilidade. Filtros: todas, válidas, inválidas, excluídas e conflitos. Cada erro
mostra linha, campo e mensagem. Edição inline tem salvar/cancelar. Ações de alias,
resolver versão, excluir/restaurar e desfazer lote exigem confirmação proporcional.

- [ ] **Step 5: Implementar Recorte e parâmetros**

Inputs de data exibem min/max conhecido e seleção inclusiva. Custos são textos
decimais; janela é inteiro. Cada campo mostra origem e “não calibrado”. Catálogo não
configurado aparece como bloqueio de execução, não como falha de importação.

- [ ] **Step 6: Implementar confirmação explícita**

Mostrar total, executáveis, inválidas, excluídas, fora do recorte, substituídas e
conflitos. Se qualquer operação não for enviada, o botão deve dizer exatamente
`Executar apenas N operações`; sem clique nesse botão não há POST. Com conjunto
integral, usar `Executar N operações`.

- [ ] **Step 7: Implementar execução e navegação**

Desabilitar novo disparo durante tentativa. Mostrar fase salvar/executar. Em sucesso,
navegar com `URLSearchParams({study: study.id, execution: envelope.execution_id})`
para `/diagnostico` e manter o estudo. O query string contém somente UUIDs. Ao recarregar essa URL, buscar a execução
no repositório da conta, validá-la e chamar `restoreEnvelope`; `/diagnostico` sem
query continua atendendo o percurso de referência em memória. Em falha, permanecer
na tela com dados intactos. Falha de salvar envelope oferece retry de storage, não
do POST.

- [ ] **Step 8: Implementar gestão local**

Na carteira, listar estudos da conta, criar/abrir/excluir. Em configurações do fluxo,
oferecer “Apagar todos os dados locais desta conta” com confirmação pelo nome da
ação. Logout não chama exclusão.

- [ ] **Step 9: Escrever testes de interação**

Cobrir teclado e foco, arquivo inválido, import parcial, correção, alias, conflito,
undo, recorte, catálogo bloqueado, confirmação parcial, duplo clique, erro HTTP,
sucesso e ida ao diagnóstico. Usar `user-event`; não testar detalhes internos.

- [ ] **Step 10: Verificar layout acessível**

Executar testes manuais em 1280×800, 1440×900 e zoom 200%. Sem scroll horizontal da
página; tabela pode ter região horizontal identificada. Foco não fica preso e
mensagens não dependem só de cor.

- [ ] **Step 11: Rodar gate UI**

```powershell
npm --prefix web run test:unit -- src/importer/components/importFlow.test.tsx src/app/router.test.tsx src/pages/previewFlow.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Expected: PASS.

- [ ] **Step 12: Registrar Diário e publicar PR**

Commit com ID real e descrição `feat: entrega fluxo visual de importação XLSX`.

---

### Task 13: Aceitação, segurança, performance e handoff (rótulo desejado MOT-113)

**Files:**
- Create: `web/e2e/import-xlsx.spec.ts`
- Create: `web/e2e/fixtures/import-catalog.json`
- Create: `tests/web_api/test_import_acceptance.py`
- Modify: `tests/web_api/scan_credentials.py`
- Modify: `.github/workflows/test.yml`
- Modify: `docs/MAPA.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: solução completa das T1–T12.
- Produces: evidência reproduzível de aceite, CI protegido e instruções de operação.

- [ ] **Step 1: Criar catálogo fictício somente para aceite**

O fixture E2E deve declarar claramente `TESTE_FICTICIO`, dois códigos e taxas
artificiais. O servidor de E2E recebe esse catálogo por injeção; o JSON de produção
continua `NAO_CONFIGURADO`.

- [ ] **Step 2: Escrever percurso E2E principal**

No Chromium local autenticado de teste:

1. criar estudo;
2. importar fixture válida com OUT 100 e IN 100 do mesmo cliente;
3. revisar e escolher recorte;
4. confirmar parâmetros não calibrados;
5. executar;
6. chegar ao diagnóstico;
7. comprovar volume intracliente no resultado;
8. recarregar e comprovar persistência do estudo/execução.

- [ ] **Step 3: Escrever percurso E2E parcial e de conflito**

Importar lote com uma linha inválida e duas válidas, exigir texto “Executar apenas
2 operações”. Em seguida importar lote conflitante, provar bloqueio até escolher
versão e provar rollback ao desfazer o lote.

- [ ] **Step 4: Instrumentar fronteira de privacidade**

No Playwright, capturar toda request. Para POST `/api/v1/previas`, parsear JSON e
provar ausência de filename, `cliente_nome`, nome exibido e perfil. Recusar qualquer
request com content type de XLSX ou bytes do ZIP. Inspecionar IndexedDB e provar que
nenhum valor é `Blob`, `File`, `ArrayBuffer` ou começa pela assinatura ZIP `PK`.

- [ ] **Step 5: Medir 1.000 linhas**

Com `valid-1000-rows.xlsx`, medir seleção até relatório pronto no Chromium da CI.
Exigir até 5.000 ms. Usar `PerformanceObserver` para falhar se tarefa atribuída ao
parser no thread principal exceder 100 ms. Medir request final abaixo de 1 MiB.

- [ ] **Step 6: Testar isolamento e concorrência no navegador real**

Duas páginas na mesma conta editam mesma revisão: uma vence, outra vê conflito.
Depois autenticar usuário B e confirmar lista vazia; voltar a A e confirmar dados.
Logout não apaga A. Exclusão total em A não apaga banco B.

- [ ] **Step 7: Adicionar regressão servidor-motor sem alterar `motor/`**

Montar `PreviaRequest` com duas pontas do mesmo cliente, catálogo fictício e origem
observada. Executar pelo adaptador e afirmar conservação, schema 2.0.0 e volume
`INTRA_CLIENTE` esperado. Rodar também sob `python -O`.

- [ ] **Step 8: Integrar gates na CI**

Preservar todos os jobs atuais. `npm --prefix web run test:e2e` passa a incluir
`import-xlsx.spec.ts`. A regeneração de OpenAPI continua com `git diff --exit-code`.
Não instalar LibreOffice, Excel ou serviço externo.

- [ ] **Step 9: Atualizar documentação operacional**

`docs/architecture.md`: inserir a fronteira local-first e afirmar que planilhas não
entram no motor/servidor. `docs/MAPA.md`: adicionar caminhos do importador, catálogo,
testes e limitações. `docs/testing.md`: comandos focados e E2E. Diário: registrar
sintoma, causa, feito e invalidações; declarar que a grade não foi regenerada e o
catálogo regulatório segue não configurado.

- [ ] **Step 10: Rodar verificação completa antes de alegar conclusão**

Usar `superpowers:verification-before-completion` e executar:

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
git diff --exit-code -- contracts web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts
python -m pytest -q
python -O -m pytest -q
python -m ruff check servidor tests/web_api
python -m mypy servidor
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run test:unit
npm --prefix web run build
npm --prefix web run test:e2e
python -m tests.web_api.scan_credentials
```

Expected: tudo PASS; registrar contagens, tempos, tamanho do request de 1.000 linhas
e SHA das fixtures.

- [ ] **Step 11: Revisão de código e auditoria sistêmica**

Usar `superpowers:requesting-code-review` e `project-auditor`. O auditor deve traçar:
arquivo → worker → validação → IndexedDB → assessment → request → API → motor →
resultado, além de conta A/B, duas abas, undo e falhas de storage/rede. Todo finding
P0/P1 precisa ser resolvido ou aceito explicitamente pelo Gabriel antes do merge.

- [ ] **Step 12: Publicar PR final e preparar handoff**

O PR referencia todas as issues reais, lista PRs predecessores, mostra comandos e
evidências, declara o catálogo de produção não configurado e informa que isso bloqueia
execução real até publicação do catálogo. Commit com ID real e descrição
`test: fecha aceitação da importação XLSX`.

- [ ] **Step 13: Merge e implantação somente depois da aprovação**

Usar `superpowers:finishing-a-development-branch`. Fazer merge apenas com CI verde e
aprovação do Gabriel. Após deploy, smoke test autenticado deve provar: catálogo
responde, upload permanece local, estudo sobrevive a reload e uma prévia fictícia de
ambiente autorizado chega ao diagnóstico. Não usar operação real enquanto o catálogo
estiver `NAO_CONFIGURADO`.

---

## Matriz de rastreabilidade

| Requisito da especificação | Implementação | Prova principal |
|---|---|---|
| arquivo/aba/header e limites OOXML | T3 | fixtures estruturais + unitários do preflight |
| campos, BRL e datas civis | T2, T4 | tabelas de normalização/validação |
| erros por linha sem bloquear válidas | T4, T7, T12 | unitário 6/10 + fluxo parcial |
| nomes, UUIDs e aliases explícitos | T5, T8 | unitários de chave + reload IndexedDB |
| múltiplos lotes, duplicidade e undo | T6, T8 | replay determinístico + E2E conflito |
| edição, exclusão e auditoria | T7, T8, T12 | event log + reload |
| recorte pela data conhecida | T7, T11 | limites inclusivos + request dourado |
| catálogo central sem inventar conteúdo | T9, T10 | testes HTTP + produção não configurada |
| custos/janela separados e versionados | T9, T10 | cópia de defaults e origem por campo |
| `DADO_OBSERVADO` e eFX não coletado | T1, T11 | contrato Python + request dourado |
| arquivo não enviado/persistido | T3, T8, T13 | inspeção de rede e IndexedDB |
| isolamento por conta e concorrência | T8, T12, T13 | CAS unitário + duas abas/contas E2E |
| adapter sem pré-netting | T11, T13 | request com duas pontas + integração motor |
| confirmação de execução parcial | T7, T12, T13 | assessment + CTA exato + E2E |
| execução e diagnóstico após reload | T11, T12, T13 | envelope persistido + query de UUIDs |
| limites de 1.000 operações/1 MiB/5 s | T3, T11, T13 | fixture, medição de request e Playwright |
| acessibilidade | T12 | testes de interação + zoom 200% |
| CI, docs e handoff | T13 | gate completo e auditoria |

---

## Critério de conclusão da etapa

A etapa está concluída somente quando:

- as 14 issues reais estão fechadas com PRs rastreáveis;
- o parser rejeita toda estrutura proibida e nunca persiste binário;
- estudos, aliases, lotes, eventos e resultados sobrevivem a reload e são isolados
  por conta;
- conflitos/erros não são resolvidos silenciosamente;
- execução parcial sempre é confirmada;
- request de 1.000 operações é válido e menor que 1 MiB;
- OUT/IN do mesmo cliente chegam separados com mesmo `cliente_id` e o resultado
  comprova autonetting intracliente;
- catálogo de produção permanece honestamente não configurado até receber conteúdo
  aprovado;
- todas as suítes, inclusive `python -O` e E2E, passam;
- documentação e Diário descrevem o estado realmente implantado.

## Handoff para o Felipe

1. Comece pela Tarefa 0; não pule o gate de IDs reais.
2. Leia a especificação inteira antes de abrir a primeira branch.
3. Execute uma tarefa por vez, com teste falhando antes da implementação e PR pequeno.
4. Não altere o motor para facilitar o importador; o adaptador deve obedecer ao
   contrato existente.
5. Se o request de 1.000 operações ultrapassar 1 MiB, se o catálogo exigir conteúdo
   regulatório ou se uma regra pedir pré-netting/agregação, pare e leve a decisão ao
   Gabriel. Esses três casos mudam escopo ou contrato e não podem ser inferidos.
