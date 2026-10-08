# Finalidade opcional na importação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir importar e executar carteiras observadas sem finalidade, usando IOF padrão por direção, preservando finalidades e regras específicas quando existirem.

**Architecture:** A ausência de finalidade será representada explicitamente como `null` em contratos, snapshots e domínio. O motor continuará consultando a tabela opcional por `(finalidade, direção)` e cairá em `iof_out`/`iof_in` quando a finalidade ou a regra específica não existir. O catálogo deixa de ser gate de execução; passa a ser metadado e fonte opcional de regras.

**Tech Stack:** Python 3.12, dataclasses, Decimal, FastAPI/Pydantic 2, React 19, TypeScript 5.9, Vite 8, Vitest 5, Playwright 1.63, SheetJS/OOXML parser do projeto.

**Spec:** `docs/superpowers/specs/2026-09-24-finalidade-opcional-importacao-design.md`

## Global Constraints

- `finalidade` é `string | null`; não usar string vazia nem código sentinela.
- A chave `finalidade` permanece presente nos payloads e snapshots; sua ausência é representada por `null`.
- Regra específica só vale para combinação exata `(finalidade, direção)`; todo o restante usa `iof_out` ou `iof_in`.
- `iof_por_finalidade` continua aceitando somente finalidades textuais não vazias.
- Catálogo vazio, `NAO_CONFIGURADO` ou indisponível não bloqueia execução com premissas persistidas.
- Não alterar EDF, netting, conservação, alíquotas padrão ou parâmetros de custo.
- Não inventar finalidade, regra regulatória ou alíquota.
- Preservar compatibilidade com Estudos existentes que armazenam finalidade textual.
- Alterações de comportamento seguem TDD: teste falha pelo motivo esperado antes do código de produção.
- Gerados de OpenAPI/TypeScript devem ser produzidos somente pelos comandos canônicos do repositório.
- Todo commit atualiza `docs/DIARIO-DE-MUDANCAS.md` e termina com `(MOT-90)`; o último commit de aceite pode usar `(MOT-99)`.
- Sem push, PR, merge, deploy ou criação de recurso externo.

## Mapa de arquivos e paralelização

| Frente | Responsabilidade | Arquivos principais | Dependência |
|---|---|---|---|
| Núcleo | domínio nullable, fallback e contratos gerados | `motor/dominio.py`, `motor/custo.py`, `servidor/contracts/input.py`, gerados | nenhuma |
| Importador | coluna opcional, validação e elegibilidade | `web/src/importer/xlsxPreflight.ts`, `xlsxParser.ts`, `validation.ts`, `eligibility.ts` | tipos gerados do Núcleo |
| Execução/UI | remover gate e ajustar mensagem | `executionGate.ts`, `study/executionService.ts`, `diagnostics/diagnosticExecutionService.ts`, `catalogClient.ts`, `ImportFlowPage.tsx` | tipos gerados do Núcleo |
| Comunicação | explicar fallback nas superfícies | `web/src/presentation/facts.ts` e testes | tipos gerados do Núcleo |
| Aceite | E2E ponta a ponta e documentação | `web/e2e/stage6-acceptance.spec.ts`, docs | três frentes anteriores |

Após a Task 1, Importador, Execução/UI e Comunicação não compartilham arquivos de produção e podem ser executados em worktrees/sessões paralelas. Cada frente deve partir do commit da Task 1 e entregar commits próprios para integração sequencial.

---

### Task 1: Tornar finalidade nullable no domínio e nos contratos

**Files:**
- Modify: `motor/dominio.py`
- Modify: `motor/custo.py`
- Modify: `servidor/contracts/input.py`
- Modify: `servidor/contracts/diagnostics.py`
- Modify: `servidor/diagnostics/analysis.py`
- Regenerate: `contracts/openapi.json`
- Regenerate: `web/src/api/generated.ts`
- Regenerate: `web/src/api/schemas.json`
- Regenerate: `web/src/api/validators.ts`
- Regenerate: `web/src/generated/validators/api.js`
- Regenerate: `web/src/generated/validators/api.d.ts`
- Regenerate: `web/src/generated/validators/study.js`
- Regenerate: `web/src/generated/validators/study.d.ts`
- Test: `tests/test_dominio.py`
- Test: `tests/test_custo_finalidade.py`
- Test: `tests/test_serializacao_canonica.py`
- Test: `tests/web_api/test_contracts.py`
- Test: `tests/web_api/test_adapter.py`
- Test: `tests/web_api/test_identity.py`
- Test: `tests/web_api/test_diagnostics_analysis.py`
- Test: `web/src/api/validators.test.ts`

**Interfaces:**
- Produces: `Ordem.finalidade: str | None`, `OrdemEntrada.finalidade: str | None`, TypeScript `finalidade: string | null`.
- Preserves: `RegraIOF.finalidade: str` e `ParametrosCusto.iof_por_finalidade: Mapping[tuple[str, Direcao], Decimal]`.

- [ ] **Step 1: Escrever testes Python vermelhos para domínio e custo**

Adicionar casos equivalentes a:

```python
def test_ordem_aceita_finalidade_ausente():
    ordem = _ordem_valida(finalidade=None)
    assert ordem.finalidade is None

def test_aliquota_iof_sem_finalidade_usa_fallback_da_direcao():
    custo = _custo(iof_out=Decimal("0.035"), iof_in=Decimal("0.0038"))
    assert aliquota_iof(custo, None, Direcao.OUT) == Decimal("0.035")
    assert aliquota_iof(custo, None, Direcao.IN) == Decimal("0.0038")
```

- [ ] **Step 2: Executar os testes e confirmar RED**

Run: `pytest tests/test_dominio.py tests/test_custo_finalidade.py -q`

Expected: FAIL porque `Ordem`/`aliquota_iof` ainda tipam e tratam finalidade como texto obrigatório.

- [ ] **Step 3: Implementar o mínimo no domínio e custo**

Alterar somente a finalidade da ordem:

```python
@dataclass(frozen=True)
class Ordem:
    # campos anteriores
    finalidade: str | None

def aliquota_iof(
    custo: ParametrosCusto,
    finalidade: str | None,
    direcao: Direcao,
) -> Decimal:
    padrao = custo.iof_out if direcao is Direcao.OUT else custo.iof_in
    if finalidade is None:
        return padrao
    return custo.iof_por_finalidade.get((finalidade, direcao), padrao)
```

Em `carregar_cenario`, preservar `None` em vez de aplicar `str(None)`.

- [ ] **Step 4: Escrever testes vermelhos para o contrato HTTP nullable**

Cobrir `finalidade: null` em `OrdemEntrada`, request de prévia/diagnóstico, round-trip e rejeição de `""`/espaços quando texto.

- [ ] **Step 5: Executar os testes de contrato e confirmar RED**

Run: `pytest tests/web_api/test_contracts.py tests/test_serializacao_canonica.py -q`

Expected: FAIL de validação em `finalidade: null`.

- [ ] **Step 6: Ampliar o contrato sem relaxar regras específicas**

Usar tipo nullable com validator condicional:

```python
finalidade: Annotated[str, Field(strict=True, min_length=1, max_length=128)] | None

@field_validator("finalidade")
@classmethod
def finalidade_is_exact(cls, value: str | None) -> str | None:
    if value is not None and value != value.strip():
        raise ValueError("finalidade não pode ter espaços externos")
    return value
```

Não tornar `RegraIOF.finalidade` nullable.

Permitir proveniência `NAO_COLETADO` em `/ordens/{i}/finalidade` somente quando o
valor correspondente for `null`; as demais exceções de proveniência continuam
inalteradas.

- [ ] **Step 7: Tornar somente a quebra residual por finalidade nullable**

Não ampliar `ResidualBreakdown.key`, pois `by_day` continua exigindo texto.
Criar um DTO dedicado:

```python
class PurposeResidualBreakdown(StrictModel):
    key: Annotated[str, Field(strict=True, min_length=1, max_length=128)] | None
    direction: Literal["OUT", "IN"]
    value_brl: DecimalText
```

Usar esse DTO apenas em `CrossBorderResidualAxis.by_purpose`. Em
`diagnostics/analysis.py`, agregar com chave `tuple[str | None, str]` e ordenar
por chave explícita, colocando `None` de forma determinística sem convertê-lo em
rótulo regulatório. Testar `key: null` e garantir que `by_day` continua textual.

- [ ] **Step 8: Regenerar contratos e validators**

Run: `python -m servidor.export_openapi`

Run: `npm --prefix web run generate:api`

Confirmar no diff que somente a nulabilidade esperada e hashes derivados mudaram.

- [ ] **Step 9: Rodar gates focados**

Run: `pytest tests/test_dominio.py tests/test_custo_finalidade.py tests/test_serializacao_canonica.py tests/web_api/test_contracts.py tests/web_api/test_adapter.py tests/web_api/test_identity.py tests/web_api/test_diagnostics_analysis.py -q`

Run: `npm --prefix web test -- --run src/api/validators.test.ts`

Expected: PASS.

- [ ] **Step 10: Atualizar diário e commitar**

```bash
git add motor servidor contracts web/src/api tests docs/DIARIO-DE-MUDANCAS.md
git commit -m "feat: aceita finalidade ausente no motor (MOT-90)"
```

---

### Task 2: Aceitar XLSX sem coluna ou valor de finalidade

**Files:**
- Modify: `web/src/importer/domain.ts`
- Modify: `web/src/importer/xlsxPreflight.ts`
- Modify: `web/src/importer/xlsxParser.ts`
- Modify: `web/src/importer/validation.ts`
- Modify: `web/src/importer/eligibility.ts`
- Modify: `web/src/preparation/resolvePortfolioSource.ts`
- Modify: `web/src/study/components/PortfolioSourceSelector.tsx`
- Test: `web/src/importer/xlsxPreflight.test.ts`
- Test: `web/src/importer/xlsxParser.test.ts`
- Test: `web/src/importer/validation.test.ts`
- Test: `web/src/importer/eligibility.test.ts`
- Test: `web/src/preparation/resolvePortfolioSource.test.ts`
- Test: `web/src/study/components/studyEditor.test.tsx`

**Interfaces:**
- Consumes: `finalidade: string | null` produzido pela Task 1.
- Produces: `NormalizedOperation.purposeCode: string | null` sem blocker; parser preenche `finalidade_codigo: null` quando a coluna não existe.

- [ ] **Step 1: Escrever testes vermelhos do layout sem a coluna**

Criar fixture OOXML com os sete headers obrigatórios, sem `finalidade_codigo`, e afirmar:

```typescript
expect(result.rows[0]?.finalidade_codigo).toBeNull();
expect(validateImportedRows(result.rows).summary.invalid).toBe(0);
```

Adicionar caso com coluna presente e célula vazia, além do caso existente com finalidade textual.

- [ ] **Step 2: Confirmar RED no preflight/parser**

Run: `npm --prefix web test -- --run src/importer/xlsxPreflight.test.ts src/importer/xlsxParser.test.ts`

Expected: FAIL `HEADER_INVALID` ou divergência de headers.

- [ ] **Step 3: Separar headers obrigatórios e opcionais**

Implementar constantes explícitas:

```typescript
const REQUIRED_HEADERS = [
  'operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao',
  'data_conhecida', 'data_limite', 'valor_brl',
] as const;
const OPTIONAL_HEADERS = ['finalidade_codigo'] as const;
```

Validar ordem e unicidade dos obrigatórios, aceitar `finalidade_codigo` somente na posição canônica final quando presente e rejeitar colunas desconhecidas. O parser deve criar a chave com `null` quando ausente.

- [ ] **Step 4: Escrever testes vermelhos de elegibilidade**

Alterar as expectativas para que `purposeCode: null` não produza `PURPOSE_MISSING` em `errors`, `blockers` nem warning que torne o Caso inelegível. Preservar proveniência `NOT_COLLECTED`.

- [ ] **Step 5: Confirmar RED da validação/elegibilidade**

Run: `npm --prefix web test -- --run src/importer/validation.test.ts src/importer/eligibility.test.ts`

Expected: FAIL porque `validation.ts` ainda adiciona `PURPOSE_MISSING`.

- [ ] **Step 6: Remover a obrigatoriedade sem perder proveniência**

Normalizar `null` sem adicionar erro. Manter `purposeCode` nas correções e no conteúdo canônico de deduplicação. Em `eligibility.ts`, preservar `NOT_COLLECTED` para a finalidade ausente e remover a geração do warning bloqueante/obrigatório.

Em `resolvePortfolioSource.ts`, remover o `throw` para `purposeCode === null` e
propagar `finalidade: null` para `CanonicalAuthoredOrder`. Verificar que
persistência, clone e fingerprint distinguem `null` de texto sem coerção.

No editor de ordens explícitas, renderizar `order.finalidade ?? ''`; ao salvar,
converter texto vazio em `null` e texto não vazio no valor exato validado. Não
persistir string vazia.

- [ ] **Step 7: Rodar a suíte focada do importador**

Run: `npm --prefix web test -- --run src/importer src/preparation/resolvePortfolioSource.test.ts src/study/components/studyEditor.test.tsx`

Expected: PASS.

- [ ] **Step 8: Atualizar diário e commitar**

```bash
git add web/src/importer docs/DIARIO-DE-MUDANCAS.md
git commit -m "feat: importa xlsx sem finalidade (MOT-90)"
```

---

### Task 3: Remover o catálogo como gate de execução

**Files:**
- Delete: `web/src/importer/executionGate.ts`
- Delete: `web/src/importer/executionGate.test.ts`
- Modify: `web/src/importer/catalogClient.ts`
- Modify: `web/src/importer/catalogClient.test.ts`
- Modify: `web/src/importer/components/ImportFlowPage.tsx`
- Modify: tests do componente/rota que verificam a mensagem do catálogo
- Modify: `web/src/study/executionService.ts`
- Modify: `web/src/study/executionService.test.ts`
- Modify: `web/src/diagnostics/diagnosticExecutionService.ts`
- Modify: `web/src/diagnostics/diagnosticExecutionService.test.ts`
- Modify: `web/src/replay/ReplayPage.tsx`
- Modify: replay tests que mockam ou esperam o gate
- Modify: `web/src/presentation/PresentationRoute.tsx`
- Modify: presentation route tests que esperam o gate

**Interfaces:**
- Consumes: cenários com `finalidade: string | null` e premissas persistidas.
- Produces: execução de preview/diagnóstico sem consulta obrigatória ao catálogo.

- [ ] **Step 1: Escrever testes vermelhos de execução independente do catálogo**

Cobrir preview e diagnóstico de cenário descendente de XLSX nos três estados:

```typescript
it.each([
  ['sem cliente de catálogo', undefined],
  ['catálogo indisponível', async () => { throw new Error('offline'); }],
  ['catálogo não configurado', async () => UNCONFIGURED_CATALOG],
])('executa XLSX %s com premissas persistidas', async (_name, getImportCatalog) => {
  // executar cenário, esperar runPreview/runDiagnostic chamado uma vez e SUCCEEDED
});
```

- [ ] **Step 2: Confirmar RED nos serviços**

Run: `npm --prefix web test -- --run src/study/executionService.test.ts src/diagnostics/diagnosticExecutionService.test.ts`

Expected: FAIL com `ImportExecutionBlockedError`.

- [ ] **Step 3: Retirar a consulta de autorização**

Remover `assertImportExecutionAvailable` dos dois serviços, do Replay e da rota de
Apresentação. Retirar `getImportCatalog` das opções dos serviços e excluir
`executionGate.ts` e seu teste; não deixar função morta que sugira obrigação
inexistente.

- [ ] **Step 4: Escrever testes vermelhos da mensagem não bloqueante**

Para catálogo vazio/indisponível, esperar texto equivalente a:

```text
Sem regras específicas de finalidade; os Estudos usarão IOF padrão por direção.
```

O texto não pode conter `bloqueada` ou impedir confirmar Caso/Estudo.

- [ ] **Step 5: Confirmar RED de catálogo/UI**

Run: `npm --prefix web test -- --run src/importer/catalogClient.test.ts src/app/router.test.tsx`

- [ ] **Step 6: Tornar catálogo informativo**

Substituir `canConfirmExecution` por `hasPurposeRules`, calculado como
`catalog.finalidades.length > 0`. Catálogo indisponível e lista vazia exibem aviso
de fallback, nunca bloqueio.

- [ ] **Step 7: Rodar gates focados**

Run: `npm --prefix web test -- --run src/importer/catalogClient.test.ts src/study/executionService.test.ts src/diagnostics/diagnosticExecutionService.test.ts src/replay src/presentation src/app/router.test.tsx`

Expected: PASS; a ausência do teste direto do gate é coberta pelos testes dos
quatro consumidores e pela busca sem referências ao módulo removido.

- [ ] **Step 8: Atualizar diário e commitar**

```bash
git add web/src/importer web/src/study web/src/diagnostics web/src/app docs/DIARIO-DE-MUDANCAS.md
git commit -m "feat: usa catálogo de finalidade sem bloquear execução (MOT-90)"
```

---

### Task 4: Expor claramente regra específica versus fallback

**Files:**
- Modify: `web/src/communication/buildCommunicationDocument.ts`
- Test: `web/src/communication/buildCommunicationDocument.test.ts`
- Modify: `web/src/presentation/facts.ts`
- Test: `web/src/presentation/facts.test.ts`
- Modify: `web/src/diagnostics/components/DiagnosticAxesView.tsx`
- Test: `web/src/diagnostics/components/DiagnosticResult.test.tsx`

**Interfaces:**
- Consumes: `sourceSnapshot.orders` e `premisesSnapshot.costs.iof_por_finalidade` da execução selecionada.
- Produces: fato `IOF_APPLICATION_MODE` com valor `FALLBACK_ONLY`, `SPECIFIC_ONLY` ou `MIXED`, sustentado por evidências do snapshot.

- [ ] **Step 1: Escrever testes vermelhos da classificação de uso**

```typescript
expect(document.assumptions).toContainEqual(expect.objectContaining({
  code: 'IOF_APPLICATION_MODE', value: 'FALLBACK_ONLY',
}));
```

Adicionar casos para todas as ordens com regra exata (`SPECIFIC_ONLY`) e carteira
mista (`MIXED`). Uma regra de mesma finalidade na direção oposta não conta como
match. Cada fato precisa referenciar a tabela de regras e os campos
`finalidade`/`direcao` das ordens avaliadas.

- [ ] **Step 2: Confirmar RED**

Run: `npm --prefix web test -- --run src/communication/buildCommunicationDocument.test.ts src/presentation/facts.test.ts`

- [ ] **Step 3: Implementar projeção estrita sem aritmética financeira**

Criar um `Set` das combinações exatas publicadas e classificar cada ordem pelo par
`(finalidade, direção)`. `null` sempre usa fallback. Publicar somente o modo, sem
recalcular IOF nem alterar resultado. Em `presentFact`, mapear os três valores para:

```text
FALLBACK_ONLY → IOF padrão por direção
SPECIFIC_ONLY → IOF específico por finalidade
MIXED → IOF misto: específico e padrão por direção
```

A explicação deve dizer que são premissas da simulação e não cotação.

- [ ] **Step 4: Renderizar finalidade não coletada no diagnóstico**

Tipar `BreakdownTable` para aceitar as linhas de `by_day` e `by_purpose` e
renderizar `row.key ?? 'Finalidade não coletada'`. A key React deve usar um token
de UI estável, sem introduzir esse rótulo nos dados canônicos.

- [ ] **Step 5: Rodar testes de comunicação, diagnóstico e apresentação**

Run: `npm --prefix web test -- --run src/communication src/diagnostics src/presentation`

Expected: PASS.

- [ ] **Step 6: Atualizar diário e commitar**

```bash
git add web/src/communication web/src/diagnostics web/src/presentation docs/DIARIO-DE-MUDANCAS.md
git commit -m "feat: explicita fallback de iof por direção (MOT-90)"
```

---

### Task 5: Atualizar aceite ponta a ponta e documentação normativa

**Files:**
- Modify: `web/e2e/stage6-acceptance.spec.ts`
- Modify: `web/e2e/import-observed-case.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/specs/2026-09-17-importacao-xlsx-dados-reais-design.md`
- Modify: `docs/superpowers/specs/2026-09-23-frontend-etapa-6-comunicacao-publicacao-design.md`
- Modify: `docs/frontend/etapa-6-aceitacao.md`
- Modify: `docs/frontend/etapa-6a-aceitacao.md`
- Modify: `docs/frontend/etapa-6-operacao.md`
- Modify: `docs/frontend/evidencias/etapa-6/README.md`
- Modify: `docs/testing.md`
- Modify: `docs/MAPA.md`
- Modify: `AGENTS.md`
- Modify: `servidor/catalogs/product_help.v1.json`
- Test: `tests/web_api/test_product_help.py`
- Test: `web/src/help/catalog.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 integradas.
- Produces: evidência de que XLSX sem finalidade percorre Diagnóstico, Replay, apresentação e PDF.

- [ ] **Step 1: Atualizar o E2E transversal para o layout sem finalidade**

Alterar os helpers `workbook()` existentes nos dois arquivos para que o caso de
aceite contenha OUT e IN e omita completamente o header/células de finalidade. O
teste deve confirmar Caso e Estudo, executar diagnóstico, abrir Replay e Painel A,
gerar PDF e verificar a explicação “IOF padrão por direção”.

- [ ] **Step 2: Executar o E2E transversal integrado**

Run: `npm --prefix web run test:e2e -- --grep "finalidade opcional"`

Expected: PASS. O comportamento já terá sido guiado por testes vermelhos nas
Tasks 1–4; este passo comprova a composição ponta a ponta.

- [ ] **Step 3: Atualizar afirmações normativas e operacionais**

Substituir toda afirmação de que `NAO_CONFIGURADO` bloqueia a execução por:

```text
Finalidade é opcional. Regra específica é aplicada quando existir combinação
exata de finalidade e direção; sem ela, o cenário usa IOF padrão da direção.
```

Preservar histórico: entradas antigas do diário não são reescritas; adicionar nova entrada que declare a decisão superada.

- [ ] **Step 4: Rodar E2Es afetados**

Run: `npm --prefix web run test:e2e -- --grep "Etapa 6|Caso observado|finalidade opcional"`

Expected: PASS.

- [ ] **Step 5: Atualizar diário e commitar**

```bash
git add web/e2e docs AGENTS.md
git commit -m "test: aceita estudo observado sem finalidade (MOT-99)"
```

---

### Task 6: Regressão completa, revisão e estado da Etapa 6

**Files:**
- Modify only for evidence: `docs/testing.md`
- Modify only for state: `docs/frontend/etapa-6-aceitacao.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: branch integrada das Tasks 1–5.
- Produces: decisão de aceite local baseada em evidência fresca.

- [ ] **Step 1: Rodar Python normal e otimizado**

Run: `pytest -q`

Run: `python -O -m pytest -q`

Expected: todas as suítes passam; skips apenas os já documentados de plataforma.

- [ ] **Step 2: Rodar gates estáticos e unitários do front-end**

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Run: `npm --prefix web test -- --run`

Run: `npm --prefix web run build`

Expected: PASS.

- [ ] **Step 3: Rodar Playwright local completo e orçamento**

Run: `npm --prefix web run test:e2e`

Run: comando canônico documentado em `docs/testing.md` para o orçamento D3.

Expected: PASS no Windows/Chromium; Linux/Docker permanece estado separado se o ambiente continuar indisponível.

- [ ] **Step 4: Fazer revisão independente da branch**

Gerar pacote de diff desde `6dce838` e revisar conformidade com a spec, nulabilidade, fallback, privacidade, compatibilidade e ausência de gate morto. Corrigir achados Critical/Important com teste de regressão e re-revisar o diff da correção.

- [ ] **Step 5: Atualizar o estado formal**

Se XLSX sem finalidade chegar localmente ao PDF com todas as suítes verdes, remover esse item dos bloqueios de `LOCAL_ACCEPTANCE`. Não converter `PUBLISHED_ACCEPTANCE=NOT_RUN` em PASS sem Render autorizado; não converter Docker/Linux em PASS sem execução real.

- [ ] **Step 6: Commitar evidência final**

```bash
git add docs/testing.md docs/frontend/etapa-6-aceitacao.md docs/DIARIO-DE-MUDANCAS.md
git commit -m "test: registra aceite local sem gate de finalidade (MOT-99)"
```
