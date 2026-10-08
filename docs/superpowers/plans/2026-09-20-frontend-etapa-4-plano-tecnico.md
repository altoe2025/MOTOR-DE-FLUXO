# Front-end Etapa 4 — plano completo substituído

> **Status:** substituído como plano de entrega imediata pelo MVP de quatro dias.
> Permanece somente como referência detalhada da evolução posterior. Não executar
> T0–T14 sem nova autorização explícita.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Data:** 2026-09-20

**Status:** revisado independentemente; aguardando aprovação do plano; não autoriza implementação, Linear, push, PR ou merge

**Goal:** Entregar geração sintética auditável a partir de Perfil Operacional, variantes imutáveis, comparação compatível nos sete eixos e análise marginal exclusivamente agregada, preservando as Etapas 1–3.

**Architecture:** Perfil, Receita, materialização, cenário, variante, execução e comparação permanecem autoridades separadas com fingerprints acíclicos. O servidor compila Receitas e calcula comparações puras; o executor da Etapa 3 continua responsável pelas execuções, enquanto `ApplicationRepository` é a única porta de persistência local e monta Estudos V4 a partir de stores normalizadas.

**Tech Stack:** Python 3.13, FastAPI 0.141, Pydantic 2.13, pacote Python `motor`, React 19.3, TypeScript 5.9, React Router 7.18, TanStack Query 5.102, Decimal.js 10.6, ECharts 6.1.0, IndexedDB, Vitest 5 e Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-20-frontend-etapa-4-design.md`

## Global Constraints

- Começar em worktree isolado criado de `origin/main` em `a9a633ca9acb2228af7b775edf993d9b818ab8d4` ou sucessor explicitamente aprovado; não usar o checkout sujo atual.
- Antes de editar, usar `superpowers:using-git-worktrees`; durante implementação, usar TDD e os gates deste plano.
- Não alterar `motor/`, P0, netting, custo, IOF, política tributária ou regra regulatória.
- O Perfil é evidência; a Receita é projeção; ordens materializadas continuam sintéticas.
- Janela e custos pertencem ao cenário, não à Receita.
- `ApplicationRepository` permanece a única porta de persistência; componentes não acessam IndexedDB.
- Versões de Perfil, Receitas, variantes, execuções e comparações são imutáveis; coleções históricas são append-only.
- Ausência, incompatibilidade ou cobertura insuficiente nunca viram zero ou default silencioso.
- Mudança por participante nunca produz efeito marginal nem benefício individual.
- O executor continua em memória; reinício continua resultando em `INTERRUPTED`, sem retry automático.
- Contratos públicos são definidos em Pydantic e propagados por OpenAPI para TypeScript/Ajv; arquivos gerados não são editados manualmente.
- Invariantes Python usam `raise`, não `assert`, e devem passar sob `python -O`.
- Limites de fio: compilação 1 MiB/8 MiB e comparação 16 MiB/8 MiB; participantes ≤100, ordens ≤1.000, repetições 1/10/30/100.
- Não iniciar Replay, Etapa 5, chat, PDF, publicação, fila distribuída ou persistência remota.
- Não criar/editar issues no Linear, implementar, fazer push, abrir PR ou merge sem as autorizações subsequentes previstas pelo usuário.
- Cada commit publicável atualiza `docs/DIARIO-DE-MUDANCAS.md` no mesmo commit.
- Exceção comum à lista `Files`: T0–T14 podem modificar `docs/DIARIO-DE-MUDANCAS.md` somente no fechamento do próprio commit. A task que fecha o commit é o único writer naquele momento; T14 também consolida a entrada final.

---

## Task T0: Congelar contratos públicos e fixtures cruzadas

**Objetivo:** estabelecer a linguagem pública e os envelopes versionados que todas as tasks seguintes consumirão.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `servidor/contracts/profile_recipe.py`
- Create: `servidor/contracts/comparison.py`
- Create: `tests/web_api/fixtures/profile-recipe-request-v1.json`
- Create: `tests/web_api/fixtures/profile-recipe-response-v1.json`
- Create: `tests/web_api/fixtures/comparison-request-v1.json`
- Create: `tests/web_api/fixtures/comparison-response-v1.json`
- Create: `tests/web_api/fixtures/comparison-error-422-v1.json`
- Create: `tests/web_api/fixtures/operational-profile-v1.json`
- Create: `tests/web_api/fixtures/operational-profile-v1.sha256`
- Create: `tests/web_api/test_stage4_contracts.py`
- Modify: `servidor/contracts/primitives.py`
- Modify: `servidor/contracts/input.py`
- Modify: `servidor/contracts/preview.py`
- Modify: `servidor/contracts/preparation.py`
- Modify: `servidor/contracts/diagnostics.py`
- Modify: `servidor/identity.py`
- Modify: `tests/web_api/test_identity.py`

**Interfaces:**
- Consumes: `OperationalProfileVersion` 1.0.0, `EffectiveInput`, `PreparationResponse`, `DiagnosticRequest` 1.0.0 e sete `AxisCode` existentes.
- Produces: `ProfileRecipeCompilationRequest/Response`, `ComparisonRequest/Envelope`, `DiagnosticRequestV2`, `EffectiveSource.PERFIL_OPERACIONAL`, `OrigemValor.DERIVADO_PERFIL_OPERACIONAL` e fixtures de fio canônicas.

**Dependências:** nenhuma task; requer baseline verde.

**Riscos:** autorreferência de fingerprint, casing divergente e união pública que aceite campos extras.

- [ ] **Step 1: Registrar o baseline antes do RED**

```powershell
pytest -q
python -O -m pytest -q
npm --prefix web run test:unit
```

Esperado: todos passam no SHA-base; registrar contagens no relatório da task.

- [ ] **Step 2: Escrever testes RED para versões, strictness e proveniência**

```python
def test_profile_recipe_request_rejects_missing_confirmation():
    payload = load_fixture("profile-recipe-request-v1.json")
    payload["draft"]["confirmations"].pop()
    with pytest.raises(ValidationError):
        ProfileRecipeCompilationRequest.model_validate(payload)

def test_profile_origin_keeps_derivation_evidence():
    origin = OrigemValorDerivadoPerfil.model_validate({
        "tipo": "DERIVADO_PERFIL_OPERACIONAL",
        "fonte": "receita-perfil",
        "registrado_em_utc": "2026-09-20T12:00:00Z",
        "profile_id": UUID_A,
        "profile_fingerprint": "a" * 64,
        "recipe_fingerprint": "b" * 64,
        "rule": "profile-recipe-v1",
        "metric_paths": ["metrics.volume.totalBrl"],
        "input_paths": ["/participants/p/monthly_volume_brl"],
    })
    assert origin.tipo == "DERIVADO_PERFIL_OPERACIONAL"

def test_diagnostic_v2_requires_pairing():
    payload = diagnostic_v1_fixture() | {"api_version": "2.0.0"}
    with pytest.raises(ValidationError):
        DiagnosticRequestV2.model_validate(payload)

def test_diagnostic_v1_class_remains_backward_compatible():
    assert DiagnosticRequest.model_validate(diagnostic_v1_fixture()).api_version == "1.0.0"
```

- [ ] **Step 3: Rodar o RED focado**

```powershell
pytest tests/web_api/test_stage4_contracts.py -q
```

Esperado: FAIL por imports/modelos inexistentes, nunca por fixture inválida não relacionada.

- [ ] **Step 4: Implementar os DTOs estritos mínimos**

```python
class ProfileRecipeCompilationRequest(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    expected_build_sha: BuildSha
    owner_sub: str
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: Annotated[StrictInt, Field(ge=1)]
    profile_snapshot: OperationalProfileSnapshot
    draft: ProfileRecipeDraft
    scenario_context: ProfileRecipeScenarioContext

class DiagnosticRequestV2(DiagnosticRequest):
    api_version: Literal["2.0.0"]
    pairing: DiagnosticPairing

DiagnosticRequestDocument = Annotated[
    DiagnosticRequest | DiagnosticRequestV2,
    Field(discriminator="api_version"),
]

OrigemValorDocument = Annotated[
    OrigemValor | OrigemValorDerivadoPerfil,
    Field(discriminator="tipo"),
]
```

`DiagnosticRequest` permanece a classe V1 para preservar os consumidores e chamadas `.model_validate`; `DiagnosticRequestDocument` é usado com `TypeAdapter` quando o fio aceita V1/V2. Do mesmo modo, `OrigemValor` permanece a classe legada instanciável, `OrigemValorDerivadoPerfil` é o novo braço e `OrigemValorDocument` passa a anotar todos os campos públicos de `input.py`, `preview.py` e `diagnostics.py`; parsing da união usa `TypeAdapter`, e `identity.py` aceita ambos. Assim os construtores antigos continuam válidos sem enfraquecer o discriminador no fio. Definir todas as uniões fechadas de S06.4 e S12, máximos de cardinalidade/texto, decimais, owners e invariantes de pareamento. Nenhum modelo aceita `extra`.

- [ ] **Step 5: Completar GREEN, normal e otimizado**

```powershell
pytest tests/web_api/test_stage4_contracts.py tests/web_api/test_contracts.py tests/web_api/test_preparation_contracts.py tests/web_api/test_diagnostics_contracts.py tests/web_api/test_identity.py -q
python -O -m pytest tests/web_api/test_stage4_contracts.py tests/web_api/test_contracts.py tests/web_api/test_preparation_contracts.py tests/web_api/test_diagnostics_contracts.py tests/web_api/test_identity.py -q
```

Esperado: PASS; V1 continua validando; V2 rejeita cohort, repetition IDs ou seeds incoerentes.

- [ ] **Step 6: Refactor permitido e gate focado**

Refactor permitido: extrair bases Pydantic e validadores puros dentro de `servidor/contracts/`; proibido alterar semântica de DTO V1 ou gerar OpenAPI nesta task.

Critérios: fixtures validam; versão futura falha; NaN/infinito/campo extra falham; nenhum DTO contém ganho individual.

- [ ] **Step 7: Revisar e preparar commit**

```powershell
git diff --check
git diff -- servidor/contracts tests/web_api/test_stage4_contracts.py tests/web_api/fixtures
```

Commit: `feat: define contratos públicos da etapa 4 (MOT-N)` após substituir `MOT-N` pelo ID real autorizado.

## Task T1: Compilador determinístico de Receita de Perfil

**Objetivo:** converter um Perfil imutável mais confirmações e lacunas explícitas em Receita e entrada efetiva reproduzíveis.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `servidor/profile_recipe.py`
- Create: `tests/web_api/test_profile_recipe_compiler.py`
- Create: `web/src/profiles/fingerprints.test.ts`

**Interfaces:**
- Consumes: contratos T0 e `servidor.preparation.preparar_carteira`.
- Produces: `ProfileRecipeCompilerRegistry`, `compile_profile_recipe(request, authenticated_owner_sub, build_sha)` e fingerprints `recipe`, `effective_input`, `generation` e `materialization`.

**Dependências:** T0.

**Riscos:** derivar campo indisponível, misturar custos à Receita ou permitir timestamps/IDs no hash semântico.

- [ ] **Step 1: Escrever RED para fórmula, confirmação e determinismo**

```python
def test_compiler_derives_only_approved_metrics():
    request = compilation_request(
        total_brl="10000000", covered_days=20,
        ticket_p50="100000", out_fraction="0.7",
        portfolio_scale="1.2", participant_multiplier="0.5",
    )
    response = compile_profile_recipe(
        request, authenticated_owner_sub=OWNER, build_sha=BUILD,
    )
    participant = response.effective_input.participants[0]
    assert response.recipe.derived_reference.monthly_volume_brl == "15000000"
    assert participant.monthly_volume_brl == "9000000"
    assert participant.ticket_median_brl == "100000"
    assert participant.out_fraction == "0.7"

def test_same_semantics_ignore_transport_time():
    left = compile_at("2026-09-20T10:00:00Z")
    right = compile_at("2026-09-20T11:00:00Z")
    assert left.recipe_fingerprint == right.recipe_fingerprint
    assert left.materialization_fingerprint == right.materialization_fingerprint
    assert left.preparation.orders == right.preparation.orders
```

Adicionar casos RED para métrica não `AVAILABLE`, `coveredDays=0`, confirmação divergente, owner divergente, finalidade ausente, seed fora do intervalo e build divergente. A fixture `operational-profile-v1.json` precisa produzir em Python e em `fingerprintOperationalProfile` TypeScript o digest de `operational-profile-v1.sha256`; alterar uma métrica mantendo o fingerprint antigo falha com `FINGERPRINT_PERFIL_DIVERGENTE`.

- [ ] **Step 2: Confirmar RED**

```powershell
pytest tests/web_api/test_profile_recipe_compiler.py -q
```

Esperado: FAIL por `compile_profile_recipe` inexistente.

- [ ] **Step 3: Implementar projeções canônicas e DAG de hashes**

```python
def derive_reference(profile: OperationalProfileSnapshot) -> DerivedReference:
    total = require_available(profile.metrics.volume.total_brl)
    ticket = require_available(profile.metrics.tickets_brl.p50)
    direction = require_available(profile.metrics.direction)
    if profile.coverage.covered_days <= 0:
        raise ProfileRecipeError("METRICA_PERFIL_INDISPONIVEL")
    monthly = canon_decimal(total / Decimal(profile.coverage.covered_days) * Decimal(30))
    return DerivedReference(
        monthly_volume_brl=monthly,
        ticket_median_brl=canon_decimal(ticket),
        out_fraction=canon_decimal(direction.out.fraction),
    )
```

`compile_profile_recipe` consulta `ProfileRecipeCompilerRegistry` pela `api_version` do request, sem acrescentar campos ao wire aprovado. O binding V1 é imutável e declara a saída `compiler={id:'profile-recipe-v1', version:'1.0.0'}` + `generatorVersion='dimensionamento-v1'`. O teste registra um fake binding B no registry, sem inventar contrato público B, e prova que compilar novamente um request V1 continua produzindo A. No cliente, `compileExistingRecipeVariant` despacha pelo trio já congelado na Receita e escolhe o serializer/request version correspondente; versão retirada retorna `VERSAO_GERADOR_NAO_SUPORTADA`, nunca usa o binding atual por default.

Calcular `recipeFingerprint` antes do UUID determinístico; excluir IDs e timestamps; converter `GENERATOR_PROFILE` para `PROFILE` somente no `EffectiveInput`; chamar `preparar_carteira`; calcular materialização sem janela/custos.

- [ ] **Step 4: Rodar GREEN e regressão da preparação**

```powershell
pytest tests/web_api/test_profile_recipe_compiler.py tests/web_api/test_preparation_contracts.py tests/web_api/test_preparation_http.py -q
python -O -m pytest tests/web_api/test_profile_recipe_compiler.py -q
npm --prefix web run test:unit -- src/profiles/fingerprints.test.ts
```

Esperado: PASS e mesmos fingerprints para recompilações semanticamente iguais.

- [ ] **Step 5: Refactor permitido e critérios de aceite**

Refactor permitido: funções puras para JSON canônico, confirmação e montagem do `EffectiveInput`; proibido alterar `servidor/preparation.py` ou `motor/`.

Critérios: apenas três métricas derivadas; ausência bloqueia; Receita não contém janela/custos; Perfil novo não altera Receita antiga; A permanece despachável por versão.

- [ ] **Step 6: Revisar e preparar commit**

```powershell
git diff --check
pytest tests/web_api/test_profile_recipe_compiler.py -q
npm --prefix web run test:unit -- src/profiles/fingerprints.test.ts
```

Commit: `feat: compila receita a partir de perfil (MOT-N)` após substituir `MOT-N` pelo ID real autorizado.

## Task T2: Comparação pura, compatibilidade e marginal agregado

**Objetivo:** calcular compatibilidade, diferenças, distribuição pareada, sete eixos e marginal agregado sem estado nem UI.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `servidor/comparison.py`
- Create: `tests/web_api/test_stage4_comparison.py`

**Interfaces:**
- Consumes: `ComparisonRequest`, `DiagnosticEnvelope`, `RepetitionSummary`, `ScenarioVariantSnapshot` de T0.
- Produces: `compare_scenarios(request) -> ComparisonEnvelope` e `ComparisonIncompatible(report)`.

**Dependências:** T0; pode executar em paralelo com T1.

**Riscos:** subtrair percentis, comparar repetições não pareadas ou atribuir efeito a participante.

- [ ] **Step 1: Escrever RED da matriz de compatibilidade**

```python
@pytest.mark.parametrize("mutation,code", [
    (change_owner_or_study, "OWNER_OR_STUDY_MISMATCH"),
    (make_execution_non_terminal, "EXECUTION_NOT_SUCCEEDED"),
    (lambda r: replace_build(r, "f" * 40), "MOTOR_BUILD_MISMATCH"),
    (change_policy, "POLICY_MISMATCH"),
    (change_output_schema, "OUTPUT_SCHEMA_MISMATCH"),
    (change_generator_version, "GENERATOR_VERSION_MISMATCH"),
    (change_compiler_version, "COMPILER_VERSION_MISMATCH"),
    (change_unit, "UNIT_MISMATCH"),
    (change_metric_definition, "METRIC_DEFINITION_MISMATCH"),
    (change_period_mode, "PERIOD_MODE_MISMATCH"),
    (change_horizon, "HORIZON_MISMATCH"),
    (change_statistical_config, "STATISTICAL_CONFIG_MISMATCH"),
    (change_sampling_mode, "SAMPLING_MODE_MISMATCH"),
    (drop_common_seed, "UNPAIRED_REPETITION"),
    (select_other_repetition, "SELECTED_REPETITION_MISMATCH"),
    (break_fingerprint_chain, "FINGERPRINT_INCONSISTENCY"),
    (change_undeclared_input, "UNDECLARED_INPUT_DIFFERENCE"),
    (change_forbidden_field, "FORBIDDEN_DELTA"),
])
def test_each_structural_difference_blocks(mutation, code):
    report = compatibility_report(mutation(comparison_request()))
    assert code in {item.code for item in report.blockers}
```

Cada mutação altera somente a dimensão nomeada. Acrescentar baseline compatível sem blockers e testes dos warnings `PARTIAL_METRIC_AVAILABILITY` e `FIXED_INPUT_NO_DISTRIBUTION`.

- [ ] **Step 2: Escrever RED estatístico e marginal**

```python
def test_paired_distribution_uses_deltas_not_difference_of_percentiles():
    result = compare_scenarios(request_with_savings(base=["10", "100"], hypothesis=["20", "90"]))
    savings = metric(result.statistical_difference.value, "SAVINGS")
    assert [pair.delta for pair in savings.pairs] == ["10", "-10"]
    assert savings.summary.p50 == "-10"

def test_participant_change_is_never_marginal():
    result = compare_scenarios(request_with_change("REMOVE_PARTICIPANT"))
    assert result.marginal == {
        "state": "UNAVAILABLE", "reason": "PARTICIPANT_SPECIFIC_CHANGE",
    }
```

Cobrir também multi-change, base zero, fixed input, métrica ausente e escopo estatístico restrito a `RepetitionSummary`.

- [ ] **Step 3: Confirmar RED**

```powershell
pytest tests/web_api/test_stage4_comparison.py -q
```

Esperado: FAIL por serviço inexistente.

- [ ] **Step 4: Implementar pipeline puro na ordem normativa**

```python
def compare_scenarios(request: ComparisonRequest) -> ComparisonEnvelope:
    report = compatibility_report(request)
    if not report.compatible:
        raise ComparisonIncompatible(report)
    input_difference = compare_inputs(request)
    selected = compare_selected_pair(request)
    statistical = compare_repetition_summaries(request)
    axes = compare_axes(selected, statistical)
    marginal = assess_marginal(request.variant.delta.changes, axes)
    return build_envelope(request, report, input_difference, selected, statistical, axes, marginal)
```

Ordenar métricas por `(axis, metric_code)`; calcular percentis sobre deltas pareados; retornar indisponibilidade por métrica; nunca importar `motor.analise.marginal`.

- [ ] **Step 5: GREEN, `-O` e regressão analítica**

```powershell
pytest tests/web_api/test_stage4_comparison.py tests/web_api/test_diagnostics_analysis.py -q
python -O -m pytest tests/web_api/test_stage4_comparison.py -q
```

Esperado: PASS; nenhum campo de resposta associa delta econômico a `cliente_id`.

- [ ] **Step 6: Refactor permitido e gate**

Refactor permitido: funções puras por fase e registry fechado de métricas; proibido recalcular motor, eixos ausentes ou usar UI como autoridade.

Critérios: blockers completos; selected pair igual; pares integrais; sete eixos preservam definição/unidade; marginal somente para change agregado elegível.

- [ ] **Step 7: Revisar e preparar commit**

```powershell
git diff --check
pytest tests/web_api/test_stage4_comparison.py -q
```

Commit: `feat: compara cenários compatíveis (MOT-N)` após substituir `MOT-N` pelo ID real autorizado.

## Task T3: Endpoints autenticados, OpenAPI e cliente gerado

**Objetivo:** publicar os serviços T1/T2 com autenticação, limites, erros estáveis e tipos gerados de uma única fonte.

**Modelo:** implementação `gpt-5.6-sol/high`; revisão `gpt-6-astra/high`.

**Files:**
- Create: `servidor/routes/profile_recipe.py`
- Create: `servidor/routes/comparison.py`
- Create: `tests/web_api/test_profile_recipe_http.py`
- Create: `tests/web_api/test_comparison_http.py`
- Modify: `servidor/app.py`
- Modify: `servidor/errors.py`
- Modify: `servidor/routes/diagnostics.py`
- Modify: `tests/web_api/test_diagnostics_http.py`
- Modify: `contracts/openapi.json`
- Modify: `web/scripts/generate-api.mjs`
- Modify: `web/src/api/generated.ts`
- Modify: `web/src/api/schemas.json`
- Modify: `web/src/api/validators.ts`
- Modify: `web/src/api/validators.test.ts`
- Modify: `web/src/api/errors.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.test.ts`

**Interfaces:**
- Consumes: serviços T1/T2 e DTOs T0.
- Produces: `POST /api/v1/receitas-perfil/compilacoes`, `POST /api/v1/comparacoes`, `ApiClient.compileProfileRecipe` e `ApiClient.compareScenarios`.

**Dependências:** T0, T1 e T2.

**Riscos:** body excessivo, erro 422 sem detalhes, schema gerado divergente e log de valor financeiro.

- [ ] **Step 1: Escrever RED HTTP e cliente**

```python
def test_comparison_incompatibility_returns_typed_422(client, token):
    response = client.post("/api/v1/comparacoes", headers=auth(token), json=incompatible_request())
    assert response.status_code == 422
    assert response.json()["error"]["details"]["compatibility"]["compatible"] is False

def test_comparison_rejects_body_above_16_mib(client, token):
    response = client.post("/api/v1/comparacoes", headers=auth(token), content=b"x" * (16 * 1024 * 1024 + 1))
    assert response.status_code == 413

def test_profile_compilation_rejects_body_above_1_mib(client, token):
    response = client.post("/api/v1/receitas-perfil/compilacoes", headers=auth(token), content=b"x" * (MIB + 1))
    assert response.status_code == 413

@pytest.mark.parametrize("endpoint,service", PROFILE_AND_COMPARISON_ENDPOINTS)
def test_stage4_response_accepts_8_mib_and_rejects_8_mib_plus_one(endpoint, service, client, token):
    assert response_size_case(endpoint, service, 8 * MIB, client, token).status_code == 200
    assert response_size_case(endpoint, service, 8 * MIB + 1, client, token).status_code == 413

def test_diagnostic_http_accepts_v2_and_keeps_v1(client, token):
    assert client.post('/api/v1/diagnosticos', headers=auth(token), json=diagnostic_v2_fixture()).status_code == 202
    assert client.post('/api/v1/diagnosticos', headers=auth(token), json=diagnostic_v1_fixture()).status_code == 202

def test_openapi_diagnostic_request_is_v1_v2_discriminated_union(schema):
    request_schema = request_body_schema(schema, '/api/v1/diagnosticos', 'post')
    assert discriminator_versions(request_schema) == {'1.0.0', '2.0.0'}
```

Capturar logs nos dois endpoints e afirmar que marcador financeiro, ordens, token e corpo não aparecem. Validar as cinco fixtures douradas T0 em Pydantic e Ajv, incluindo `details.compatibility` do 422.

```ts
it('rejects an invalid comparison response before returning it', async () => {
  const api = createApiClient({ getAccessToken, fetch: fakeJson(200, { api_version: '9.0.0' }) });
  await expect(api.compareScenarios(validRequest)).rejects.toMatchObject({ code: 'VERSAO_INCOMPATIVEL' });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
pytest tests/web_api/test_profile_recipe_http.py tests/web_api/test_comparison_http.py -q
npm --prefix web run test:unit -- src/api/client.test.ts src/api/validators.test.ts
```

Esperado: FAIL por rotas/métodos ausentes.

- [ ] **Step 3: Implementar leitura limitada, auth e erro tipado**

```python
@router.post("/comparacoes", response_model=ComparisonEnvelope)
async def compare(request: Request, user: CurrentUser) -> Response:
    command = parse_comparison(await read_limited_body(request, 16 * MIB))
    if command.owner_sub != str(user.user_id):
        raise ComparisonIncompatible(owner_mismatch_report(command))
    try:
        result = await run_in_threadpool(compare_scenarios, command)
        return bounded_json_response(result, max_bytes=8 * MIB)
    except ComparisonIncompatible as error:
        raise ApiFailure.compatibility(error.report) from error
```

Na compilação, owner divergente retorna `409 PERFIL_INCOMPATIVEL`; na comparação, entra no `CompatibilityReport` e retorna `422 COMPARACAO_INCOMPATIVEL`. A rota de diagnóstico passa a aceitar `1.0.0/2.0.0` via `TypeAdapter(DiagnosticRequestDocument)` e mantém versão futura como 409. `create_schema_app` publica a união discriminada no POST diagnóstico; OpenAPI, generated.ts, Ajv e `ApiClient.submitDiagnostic` aceitam ambos os braços. Registrar rotas na aplicação real e no schema app; manter `Cache-Control: no-store`; serializar antes de enviar e rejeitar resposta acima de 8 MiB; ampliar `web/src/api/errors.ts` apenas com `details` estritamente tipado.

- [ ] **Step 4: Regenerar contratos uma única vez**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
```

Adicionar validators Ajv para pairing, fingerprints e resposta 422; nunca editar manualmente blocos gerados.

- [ ] **Step 5: Implementar cliente mínimo e GREEN**

```ts
export type ApiClient = {
  compileProfileRecipe(input: ProfileRecipeCompilationRequest, signal?: AbortSignal): Promise<ProfileRecipeCompilationResponse>;
  compareScenarios(input: ComparisonRequest, signal?: AbortSignal): Promise<ComparisonEnvelope>;
};
```

```powershell
pytest tests/web_api/test_profile_recipe_http.py tests/web_api/test_comparison_http.py tests/web_api/test_diagnostics_http.py tests/web_api/test_openapi.py -q
npm --prefix web run test:unit -- src/api/client.test.ts src/api/validators.test.ts
npm --prefix web run typecheck
```

- [ ] **Step 6: Refactor permitido e critérios**

Refactor permitido: extrair leitores/writers limitados comuns sem alterar rotas antigas. Critérios: requests de 1/16 MiB e responses de 8 MiB testados no limite e limite+1; owner e token; 400/401/409/413/422; OpenAPI sem diff após segunda geração; cinco fixtures cruzadas; nenhum payload sensível em log.

- [ ] **Step 7: Revisar e preparar commit**

```powershell
python -m servidor.export_openapi
npm --prefix web run generate:api
$stage4Generated = @('contracts/openapi.json', 'web/src/api/generated.ts', 'web/src/api/schemas.json')
$firstHashes = $stage4Generated | ForEach-Object { "$_=$((Get-FileHash -LiteralPath $_).Hash)" }
python -m servidor.export_openapi
npm --prefix web run generate:api
$secondHashes = $stage4Generated | ForEach-Object { "$_=$((Get-FileHash -LiteralPath $_).Hash)" }
if (Compare-Object $firstHashes $secondHashes) { throw 'Generated API artifacts are not deterministic.' }
git diff --check
```

A segunda geração deve preservar todos os hashes. Commit: `feat: publica APIs de receita e comparação (MOT-N)`.

## Task T4: StudyDocument V4, fingerprints e cenários variantes executáveis

**Objetivo:** representar variantes executáveis e identidades acíclicas sem perder snapshots ou reinterpretar documentos antigos.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `web/src/storage/__fixtures__/study-document-v3-stage4.json`
- Create: `web/src/study/stage4Contract.test.ts`
- Modify: `web/src/study/model.ts`
- Modify: `web/src/study/domain.ts`
- Modify: `web/src/study/validation.ts`
- Modify: `web/src/study/fingerprints.ts`
- Modify: `web/src/study/study.schema.json`
- Modify: `web/src/study/executionService.ts`
- Modify: `web/src/study/executionService.test.ts`
- Modify: `web/src/study/domain.test.ts`
- Modify: `web/src/study/validation.test.ts`
- Modify: `web/src/study/fingerprints.test.ts`
- Modify: `web/src/pages/StudyResultPage.tsx`
- Create: `web/src/pages/StudyResultPage.test.tsx`

**Interfaces:**
- Consumes: tipos gerados T3 e `StudyDocumentV3` atual.
- Produces: `StudyDocumentV4`, `OperationalProfileSourceSnapshot`, `ScenarioVariant`, DAG de fingerprints, `resolveExecutableScenario` e migration lógica V2/V3→V4.

**Dependências:** T0 e T3.

**Riscos:** cenário variante invisível ao executor, hash cíclico, mudança de custo regenerar carteira e V1 legado reativado.

- [ ] **Step 1: Escrever RED do V4 e resolvedor**

```ts
it('resolves a materialized variant without duplicating it in scenarios', () => {
  const study = studyV4({ scenarios: [base], variants: [variantOf(base)] });
  expect(resolveExecutableScenario(study, variant.materializedScenario.id))
    .toEqual(variant.materializedScenario);
  expect(study.scenarios).toHaveLength(1);
});

it('migrates V3 without inventing variants or comparisons', () => {
  expect(migrateStudyDocumentV3(v3Fixture)).toMatchObject({
    schemaVersion: '4.0.0', variants: [], comparisons: [],
  });
});
```

Adicionar RED para colisão de IDs, base snapshot divergente, delta que não reproduz materialização, Recipe fingerprint recursivo e `generationInputSnapshot` incluído no source hash.

- [ ] **Step 2: Confirmar RED**

```powershell
npm --prefix web run test:unit -- src/study/stage4Contract.test.ts src/study/domain.test.ts src/study/validation.test.ts src/study/fingerprints.test.ts
```

Esperado: FAIL por tipos/funções inexistentes.

- [ ] **Step 3: Implementar V4, catálogo único e hashes acíclicos**

```ts
export function resolveExecutableScenario(study: StudyDocumentV4, scenarioId: string) {
  const matches = [
    ...study.scenarios.filter((item) => item.id === scenarioId),
    ...study.variants.map((item) => item.materializedScenario).filter((item) => item.id === scenarioId),
  ];
  if (matches.length !== 1) throw new Error('Cenário executável ausente ou duplicado.');
  return matches[0]!;
}
```

Criar projeções explícitas `fingerprintRecipe`, `fingerprintMaterialization`, `fingerprintHypothesis`, `fingerprintVariant`; excluir o próprio hash e campos voláteis. Atualizar domínio, validação e execution service para usar o resolvedor.

- [ ] **Step 4: Implementar migration lógica realista**

```ts
export function migrateStudyDocumentV3(document: StudyDocumentV3): StudyDocumentV4 {
  return { ...structuredClone(document), schemaVersion: '4.0.0', variants: [], comparisons: [] };
}
```

Manter a rota legada V1 separada: V1 com `variants: []` pode ser importado; V1 com variantes continua rejeitado/preservado.

- [ ] **Step 5: GREEN e regressão de estudo**

```powershell
npm --prefix web run test:unit -- src/study src/pages/StudyResultPage.test.tsx
npm --prefix web run typecheck
```

Esperado: PASS; validação, execução de estudo e resultado usam o mesmo resolvedor para base e variante. O consumidor diagnóstico é fechado em T7.

- [ ] **Step 6: Refactor permitido e critérios**

Refactor permitido: helpers puros e aliases V3/V4; proibido duplicar materialized scenario em `scenarios` ou editar source snapshot por mudança de custo/janela.

Critérios: fingerprints distintos/reconciliados; variante imutável; source inclui Receita/input/materialização; cenário variante executável e visível no resultado; V3 migra sem dados inventados.

- [ ] **Step 7: Revisar e preparar commit**

```powershell
git diff --check
npm --prefix web run test:unit -- src/study src/pages/StudyResultPage.test.tsx
```

Commit: `feat: evolui estudo para variantes v4 (MOT-N)`.

## Task T5: IndexedDB físico 3, CAS e comparações normalizadas

**Objetivo:** persistir V4, variantes e comparações de forma normalizada, migrável, idempotente e segura entre abas.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `web/src/storage/__fixtures__/application-database-v2-stage3.json`
- Create: `web/src/storage/stage4Contract.test.ts`
- Modify: `web/src/storage/applicationRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.ts`
- Modify: `web/src/storage/migrations.ts`
- Modify: `web/src/storage/productionRepository.ts`
- Modify: `web/src/storage/indexedDbApplicationRepository.test.ts`
- Modify: `web/src/storage/migrations.test.ts`
- Modify: `web/src/storage/productionRepository.test.ts`
- Modify: `web/src/storage/recovery.test.ts`

**Interfaces:**
- Consumes: `StudyDocumentV4`, `ScenarioVariant` e `ComparisonRecord` de T4.
- Produces: DB físico/lógico 3, store `comparisons`, `RepositoryLimits`, `appendVariant`, `appendComparison`, replay idempotente e montagem do read model V4.

**Dependências:** T4.

**Riscos:** duas autoridades de comparação, `operations.intent` V3 incompatível e perda transacional em duas abas.

- [ ] **Step 1: Capturar fixture V2 real antes de mudar o schema**

Exportar estrutura anonimizada contendo `meta`, `studies`, `executions`, `operations` e `profile_versions`, incluindo operation antiga reexecutável. A fixture não usa builders V4.

- [ ] **Step 2: Escrever RED de migration, autoridade e CAS**

```ts
it('upgrades physical v2 and replays a pre-upgrade operation', async () => {
  const repository = await openFixture('application-database-v2-stage3.json');
  const migrated = await repository.getStudy(STUDY_ID);
  expect(migrated).toMatchObject({ schemaVersion: '4.0.0', variants: [], comparisons: [] });
  await expect(repository.saveStudy(preUpgradeMutation)).resolves.toEqual(migrated);
});

it('stores one authoritative comparison row and only its id in studies', async () => {
  const saved = await repository.appendComparison(comparisonMutation());
  expect(saved.comparisons).toEqual([comparison]);
  expect(await rawStudyRow(STUDY_ID)).toHaveProperty('comparison_ids', [comparison.id]);
  expect(await rawComparisonRows(STUDY_ID)).toHaveLength(1);
});

it('prevents generic saveStudy from changing append-only collections', async () => {
  await expect(repository.saveStudy(removingExistingVariant())).rejects.toThrow('APPEND_ONLY_VIOLATION');
  await expect(repository.saveStudy(addingComparisonOutsideAppend())).rejects.toThrow('APPEND_ONLY_VIOLATION');
});

it('enforces the injected variant capacity inside the CAS transaction', async () => {
  const repository = await openRepository({ maxVariantsPerStudy: 5 });
  await appendVariants(repository, 5);
  await expect(repository.appendVariant(sixthVariant())).rejects.toThrow('LIMITE_VARIANTES_EXCEDIDO');
});
```

Cobrir rollback após insert de comparison, owner divergente, mesmo ID/conteúdo, mesmo ID/conteúdo diferente, purge e conflitos de revisão entre duas instâncias.

- [ ] **Step 3: Confirmar RED**

```powershell
npm --prefix web run test:unit -- src/storage/stage4Contract.test.ts src/storage/migrations.test.ts src/storage/indexedDbApplicationRepository.test.ts
```

Esperado: FAIL por DB v3/store/métodos ausentes.

- [ ] **Step 4: Implementar upgrade atômico e read model**

```ts
const DATABASE_VERSION = 3;

export type AppendComparisonMutation = Readonly<{
  studyId: string;
  expectedRevision: number;
  operationId: string;
  comparison: ComparisonRecord;
}>;

export type RepositoryLimits = Readonly<{ maxVariantsPerStudy: 1 | 5 | 10 | 20 }>;
```

Na única upgrade transaction: criar store/índices, migrar row de estudo, `operations.intent`, `result_document`, execution IDs e comparison IDs, e só então `meta.schema_version=3`. `assembleStudy` lê comparison IDs ordenados e falha se faltar row.

- [ ] **Step 5: Implementar mutations explícitas**

```ts
async appendComparison(input: AppendComparisonMutation): Promise<StudyDocumentV4> {
  return this.#mutateStudyAtomically(input, ['studies', 'comparisons', 'operations']);
}
```

Mesmo `operationId`+intent devolve resultado anterior; mesmo comparison ID/documento é idempotente; conteúdo divergente é `OperationConflictError`; variante segue as mesmas regras sem nova store. `appendVariant` verifica `RepositoryLimits.maxVariantsPerStudy` dentro da mesma transação CAS. `saveStudy` exige prefixos de `variants` e `comparisons` exatamente iguais e não aceita append, remoção, reordenação ou mutação dessas coleções. `createBrowserApplicationRepository(scope, limits?)` aceita limites explícitos; o default intermediário é o teto estrutural 20 e T10 liga obrigatoriamente o cap medido no provider de produção.

- [ ] **Step 6: GREEN, rollback e recovery**

```powershell
npm --prefix web run test:unit -- src/storage
npm --prefix web run typecheck
```

Esperado: PASS, inclusive V1 vazio importado, V1 com variantes preservado/rejeitado, V2/V3→V4, future version e rollback.

- [ ] **Step 7: Refactor permitido e critérios**

Refactor permitido: helper transacional interno; proibido expor IndexedDB pela porta, guardar `ComparisonRecord` completo no row de estudo ou aceitar last-write-wins.

Critérios: autoridade única; CAS; owner; purge; operation replay antes/depois do upgrade; `saveStudy` não contorna append-only; cap injetado vale na transação; nenhum dado inventado.

- [ ] **Step 8: Revisar e preparar commit**

```powershell
git diff --check
npm --prefix web run test:unit -- src/storage
```

Commit: `feat: persiste variantes e comparações (MOT-N)`.

## Task T6: Origem `OPERATIONAL_PROFILE` e proveniência ponta a ponta

**Objetivo:** tornar a nova origem válida somente após materialização completa e preservar toda a cadeia de evidência e projeção.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `servidor/provenance.py`
- Create: `tests/web_api/test_stage4_provenance.py`
- Create: `web/src/profileRecipes/compileProfileRecipe.ts`
- Create: `web/src/profileRecipes/compileProfileRecipe.test.ts`
- Create: `web/src/profileRecipes/fingerprints.ts`
- Create: `web/src/profileRecipes/fingerprints.test.ts`
- Create: `web/src/profileRecipes/validation.ts`
- Create: `web/src/profileRecipes/validation.test.ts`
- Create: `web/src/profileRecipes/materializeProfileScenario.ts`
- Create: `web/src/profileRecipes/materializeProfileScenario.test.ts`
- Modify: `servidor/diagnostics/service.py`
- Modify: `web/src/preparation/resolvePortfolioSource.ts`
- Modify: `web/src/preparation/resolvePortfolioSource.test.ts`
- Modify: `web/src/preparation/buildPreviewRequest.ts`
- Modify: `web/src/preparation/buildPreviewRequest.test.ts`
- Modify: `web/src/study/studyController.ts`
- Modify: `web/src/study/studyController.test.ts`

**Interfaces:**
- Consumes: cliente T3, source/modelo T4, compiler T1.
- Produces: `compileProfileRecipeDraft`, `compileExistingRecipeVariant`, `resolveOperationalProfileSource`, `buildEffectiveInputForScenario`, `StudyController.materializeProfileScenario` e projeção conservadora `DERIVADO_PERFIL_OPERACIONAL` em preview/diagnóstico.

**Dependências:** T1, T3, T4 e T5.

**Riscos:** front recalcular fórmula, `DERIVED` virar `PADRAO_SINTETICO` ou custo antigo sobreviver em variante.

- [ ] **Step 1: Escrever RED do front para autoridade remota**

```ts
it('uses the server response and never recalculates profile metrics in the browser', async () => {
  const result = await compileProfileRecipeDraft(draft, { api: fakeApi(serverCompilation) });
  expect(result.recipe.recipeFingerprint).toBe(serverCompilation.recipe_fingerprint);
  expect(result.source.orders).toEqual(serverCompilation.preparation.orders);
});

it('rebinds costs and window from the scenario without changing orders', () => {
  const rebound = buildEffectiveInputForScenario(profileSource, changedCostScenario);
  expect(rebound.costs.ptax).toBe(changedCostScenario.premises.costs.ptax);
  expect(profileSource.orders).toEqual(originalOrders);
});

it('persists a complete profile materialization as a new base scenario revision', async () => {
  await controller.materializeProfileScenario({ scenarioId: BASE, compilation: serverCompilation });
  const reloaded = await repository.getStudy(STUDY);
  expect(resolveExecutableScenario(reloaded!, BASE).sourceSnapshot.source.kind)
    .toBe('OPERATIONAL_PROFILE');
  expect(resolveExecutableScenario(reloaded!, BASE).revision).toBe(2);
});
```

Cobrir resposta tardia após troca de estudo, owner divergente, CAS conflict com draft preservado, reload e garantia de que resposta parcial/invalidada nunca chama `saveStudy`.

- [ ] **Step 2: Escrever RED da proveniência Python**

```python
def test_generated_order_keeps_profile_and_user_inputs():
    origin = origin_for_generated_order(preparation_response(), participant_id=PARTICIPANT)
    assert origin.tipo == "DERIVADO_PERFIL_OPERACIONAL"
    assert "/participants/%s/seed" % PARTICIPANT in origin.input_paths
    assert "metrics.volume.totalBrl" in origin.metric_paths
```

- [ ] **Step 3: Confirmar RED**

```powershell
pytest tests/web_api/test_stage4_provenance.py -q
npm --prefix web run test:unit -- src/profileRecipes src/preparation
```

- [ ] **Step 4: Implementar adapters sem segunda regra de negócio**

```ts
export async function compileProfileRecipeDraft(draft: ProfileRecipeDraft, deps: Dependencies) {
  const response = await deps.api.compileProfileRecipe(toWireRequest(draft));
  assertValidCompilation(response);
  return resolveOperationalProfileSource(response, deps.now());
}
```

O front apenas monta request, valida response e cria snapshot. Fórmula, confirmação, Recipe ID e fingerprints vêm do servidor. `compileExistingRecipeVariant` seleciona o serializer/request version por um registry fechado do trio `compiler.id/version + generatorVersion` da Receita existente; o binding A sempre envia request V1, mesmo depois de B existir.

- [ ] **Step 5: Persistir a materialização completa por CAS**

```ts
async materializeProfileScenario(command: MaterializeProfileScenarioCommand) {
  const sourceSnapshot = resolveOperationalProfileSource(command.compilation);
  const next = await updateScenario(this.currentStudy(), command.scenarioId, { sourceSnapshot }, this.now());
  return this.saveCurrentRevision(next, command.intention);
}
```

O comando revisa o cenário-base selecionado; não cria variante. `updateScenario` incrementa a revisão do cenário, recalcula source/input fingerprints e preserva execuções históricas por seus snapshots. O controller captura owner, session epoch, study, cenário, revision, compilation fingerprint e intention; conflito mantém o draft e oferece reaplicar. Somente uma compilação integral e validada entra em `saveStudy`.

- [ ] **Step 6: Implementar projeção conservadora compartilhada**

```python
def profile_derived_origin(response: PreparationResponse, participant_id: UUID) -> OrigemPerfilOperacional:
    evidence = response.derived_provenance[f"/orders/{participant_id}"]
    return OrigemPerfilOperacional.from_sources(evidence.inputs, response.input_snapshot.sources)
```

Usar esse helper em `diagnostics/service.py`; no front, `buildPreviewRequest` preserva a mesma lista de inputs. Nunca alegar dependência mínima por campo.

- [ ] **Step 7: GREEN e regressões**

```powershell
pytest tests/web_api/test_stage4_provenance.py tests/web_api/test_adapter.py tests/web_api/test_diagnostics_analysis.py -q
npm --prefix web run test:unit -- src/profileRecipes src/preparation src/study/studyController.test.ts
npm --prefix web run typecheck
```

- [ ] **Step 8: Refactor permitido e critérios**

Refactor permitido: mapper de casing e helpers de provenance; proibido duplicar fórmula, mutar Perfil/Receita ou alterar geração.

Critérios: quarta origem só após response completa; source hash inclui input; materialização revisa/persiste o cenário selecionado por CAS; reload reproduz a fonte; custos/janela rebindados; preview e diagnóstico preservam Perfil+Receita+inputs.

- [ ] **Step 9: Revisar e preparar commit**

```powershell
git diff --check
pytest tests/web_api/test_stage4_provenance.py -q
npm --prefix web run test:unit -- src/profileRecipes src/preparation src/study/studyController.test.ts
```

Commit: `feat: preserva origem de perfil na execução (MOT-N)`.

## Task T7: DiagnosticRequest V2 e pareamento reproduzível

**Objetivo:** executar base e hipótese com configuração estatística e seeds pareadas, mantendo as garantias da Etapa 3.

**Modelo:** implementação `gpt-5.6-sol/high`; revisão `gpt-6-astra/high`.

**Files:**
- Modify: `web/src/diagnostics/buildDiagnosticRequest.ts`
- Modify: `web/src/diagnostics/buildDiagnosticRequest.test.ts`
- Modify: `web/src/diagnostics/diagnosticExecutionService.ts`
- Modify: `web/src/diagnostics/diagnosticExecutionService.test.ts`
- Modify: `web/src/diagnostics/domain.ts`
- Modify: `tests/web_api/test_diagnostics_executor.py`

**Interfaces:**
- Consumes: `DiagnosticRequestV2` T0, resolvedor T4 e effective input T6.
- Produces: `createPairingPlan`, request V2 com cohort/seed fingerprint e retry que preserva o plano.

**Dependências:** T3, T4 e T6.

**Riscos:** seed comum divergir, selected repetition diferente e retry criar nova amostra.

- [ ] **Step 1: Escrever RED de pareamento**

```ts
it('uses identical ids and seeds for participants common to base and hypothesis', async () => {
  const plan = await createPairingPlan({ baseSeed: '42', count: 30, baseParticipants, hypothesisParticipants });
  for (const repetitionId of plan.repetitionIds) {
    expect(plan.base[repetitionId]![COMMON]).toBe(plan.hypothesis[repetitionId]![COMMON]);
  }
  expect(plan.selectedRepetitionId).toBe(plan.repetitionIds[0]);
});

it('retry preserves cohort and all seeds', async () => {
  const retried = await retryFailedDiagnostic(failedAttempt);
  expect(retried.requestSnapshot.pairing).toEqual(failedAttempt.requestSnapshot.pairing);
  expect(retried.requestSnapshot.sampling).toEqual(failedAttempt.requestSnapshot.sampling);
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npm --prefix web run test:unit -- src/diagnostics/buildDiagnosticRequest.test.ts src/diagnostics/diagnosticExecutionService.test.ts
```

- [ ] **Step 3: Implementar plano único e request V2**

```ts
export async function createPairingPlan(input: PairingPlanInput): Promise<PairingPlan> {
  const repetitionIds = await deterministicRepetitionIds(input.baseSeed, input.count);
  return pairCommonParticipantSeeds(repetitionIds, input);
}
```

`buildDiagnosticRequest` recebe plano pronto, usa `resolveExecutableScenario` e `buildEffectiveInputForScenario`, e grava o mesmo selected repetition nos dois lados.

- [ ] **Step 4: Provar compatibilidade do executor V1/V2**

```python
@pytest.mark.parametrize("api_version", ["1.0.0", "2.0.0"])
def test_executor_accepts_both_versions(api_version, executor):
    snapshot = executor.submit(OWNER, diagnostic_request(api_version))
    assert snapshot.status == "QUEUED"
```

T3 já provou o transporte HTTP V1/V2. Aqui o objeto V2, subclasse compatível, atravessa executor/serviço real sem alterar scheduler.

Não alterar fila, workers, cancelamento, retenção ou terminal único.

- [ ] **Step 5: GREEN e gate**

```powershell
npm --prefix web run test:unit -- src/diagnostics
pytest tests/web_api/test_diagnostics_executor.py tests/web_api/test_diagnostics_http.py -q
```

Critérios: 1/10/30/100; seeds únicas por participante; common seeds iguais; add/remove explícito; retry preserva; V1 regressa verde.

- [ ] **Step 6: Refactor permitido e commit**

Refactor permitido: extrair hashing determinístico já existente; proibido mudar scheduler.

```powershell
git diff --check
npm --prefix web run test:unit -- src/diagnostics
```

Commit: `feat: pareia diagnósticos de hipóteses (MOT-N)`.

## Task T8: Aplicação tipada e materialização de variantes

**Objetivo:** aplicar changes permitidos, propagar consequências e criar snapshots variantes imutáveis e canônicos.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `web/src/variants/applyVariant.ts`
- Create: `web/src/variants/applyVariant.test.ts`
- Create: `web/src/variants/fingerprints.ts`
- Create: `web/src/variants/fingerprints.test.ts`
- Create: `web/src/variants/variantController.ts`
- Create: `web/src/variants/variantController.test.ts`

**Interfaces:**
- Consumes: Scenario/Variant T4, compiler T6 e repository T5.
- Produces: `applyVariantChanges`, `materializeVariant` e append CAS da variante.

**Dependências:** T4, T5 e T6.

**Riscos:** JSON Patch livre, cost change regenerar source ou delta não reproduzir snapshot.

- [ ] **Step 1: Escrever RED da matriz de propagação**

```ts
it.each([
  ['SET_PORTFOLIO_SCALE', true],
  ['ADD_PARTICIPANT', true],
  ['SET_PARTICIPANT_FIELD', true],
  ['SET_WINDOW_DAYS', false],
  ['SET_COST_PREMISE', false],
  ['SET_IOF_RULE', false],
] as const)('%s recompiles=%s', async (kind, recompiles) => {
  const compileExistingRecipeVariant = vi.fn().mockResolvedValue(compiledSource);
  const compiler = { compileExistingRecipeVariant };
  await materializeVariant(base, hypothesisWith(kind), { compiler, ids, now });
  expect(compileExistingRecipeVariant).toHaveBeenCalledTimes(recompiles ? 1 : 0);
});
```

Adicionar RED para `before` divergente, change proibido, dois changes ordenados, hipótese/variant fingerprints e base editada depois do append.

- [ ] **Step 2: Confirmar RED**

```powershell
npm --prefix web run test:unit -- src/variants
```

- [ ] **Step 3: Implementar aplicação exaustiva sem `default` permissivo**

```ts
export async function materializeVariant(base: ScenarioDocument, hypothesis: HypothesisDraft, deps: Dependencies) {
  const changed = applyVariantChanges(base, hypothesis.changes);
  const materialized = requiresCompilation(hypothesis.changes)
    ? await deps.compiler.compileExistingRecipeVariant({
        existingRecipe: base.sourceSnapshot.source.recipe,
        changedDraft: changed.recipeDraft,
      })
    : reuseSourceWithScenarioPremises(base.sourceSnapshot, changed);
  return finalizeVariant(base, hypothesis, materialized, deps);
}
```

Validar `before`, aplicar changes na ordem canônica, recomputar delta/hypothesis/variant fingerprints e provar reaplicação igual ao snapshot.

- [ ] **Step 4: Persistir por CAS e manter draft em conflito**

```ts
try {
  return await repository.appendVariant({ studyId, expectedRevision, operationId, variant });
} catch (error) {
  if (error instanceof RevisionConflictError) return { state: 'REVISION_CONFLICT', draft };
  throw error;
}
```

- [ ] **Step 5: GREEN, typecheck e critérios**

```powershell
npm --prefix web run test:unit -- src/variants
npm --prefix web run typecheck
```

Critérios: somente união tipada; generation change recompila; janela/custo preservam source; variante antiga não muda; conflito não sobrescreve.

- [ ] **Step 6: Refactor permitido e commit**

Refactor permitido: visitor exaustivo por change; proibido JSON Patch, mutação in-place ou atualização de variante.

```powershell
git diff --check
npm --prefix web run test:unit -- src/variants
```

Commit: `feat: materializa variantes imutáveis (MOT-N)`.

## Task T9: Orquestração e máquinas de estado da comparação

**Objetivo:** coordenar Receita, variante, duas execuções e comparação sem perder autoridade em concorrência, retry ou troca de seleção.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `web/src/comparison/domain.ts`
- Create: `web/src/comparison/domain.test.ts`
- Create: `web/src/comparison/comparisonController.ts`
- Create: `web/src/comparison/comparisonController.test.ts`
- Create: `web/src/comparison/queries.ts`
- Create: `web/src/comparison/queries.test.ts`

**Interfaces:**
- Consumes: API T3, repository T5, execution service T7 e variante T8.
- Produces: máquinas ortogonais, `runComparison`, guards A→B→A e persistência idempotente do terminal.

**Dependências:** T2, T3, T5, T7 e T8.

**Riscos:** enum global impossível, resposta tardia trocar seleção e falha de um lado apagar o outro.

- [ ] **Step 1: Escrever RED das máquinas ortogonais**

```ts
it('keeps a successful base when the hypothesis fails', () => {
  const next = reduceWorkspace(initialWorkspace, hypothesisFailed(error));
  expect(next.baseExecution.state).toBe('SUCCEEDED');
  expect(next.hypothesisExecution.state).toBe('FAILED');
  expect(next.comparison.state).toBe('UNAVAILABLE');
});

it('discards a late B response after A to B to A', async () => {
  const controller = createController(deferredApi());
  controller.select('A'); controller.select('B'); controller.select('A');
  await resolveB();
  expect(controller.snapshot().selection).toBe('A');
  expect(controller.snapshot().comparison).not.toMatchObject({ variantId: 'B' });
});
```

Cobrir `STALE`, conflict, retry isolado, reload, same fingerprint dedupe, owner/epoch/revision/input/attempt checks.

- [ ] **Step 2: Confirmar RED**

```powershell
npm --prefix web run test:unit -- src/comparison
```

- [ ] **Step 3: Implementar reducer total e intention token**

```ts
export type ComparisonWorkspaceState = Readonly<{
  recipe: RecipeState;
  persistence: PersistenceState;
  baseExecution: ExecutionSideState;
  hypothesisExecution: ExecutionSideState;
  comparison: ComparisonState;
  intention: number;
}>;
```

Cada async captura `{ownerSub, epoch, studyId, scenarioId, revision, inputFingerprint, attemptId, comparisonFingerprint, intention}` e valida todos antes do commit local.

- [ ] **Step 4: Implementar run sem reexecutar por conveniência**

```ts
export async function runComparison(context: ReadyComparison, deps: Dependencies) {
  assertSucceeded(context.baseExecution, context.hypothesisExecution);
  const envelope = await deps.api.compareScenarios(buildComparisonRequest(context));
  assertCurrentIntent(context.guard, deps.currentGuard());
  return deps.repository.appendComparison(toMutation(context, envelope));
}
```

Execução ausente deixa CTA/estado `EXECUTION_REQUIRED`; comparação nunca chama preview/motor.

- [ ] **Step 5: GREEN e critérios**

```powershell
npm --prefix web run test:unit -- src/comparison
npm --prefix web run typecheck
```

Critérios: estados independentes; último válido visível como stale; A→B→A; late response; retry de um lado; comparação idempotente; 422 preserva report.

- [ ] **Step 6: Refactor permitido e commit**

Refactor permitido: reducers/helpers sem React; proibido persistir progresso transitório ou calcular diferenças no cliente.

```powershell
git diff --check
npm --prefix web run test:unit -- src/comparison
```

Commit: `feat: orquestra comparação de hipóteses (MOT-N)`.

## Task T10: Medir domínio/storage e ligar o cap candidato à persistência

**Objetivo:** medir todas as matrizes não visuais, escolher um cap candidato e fazê-lo valer na transação autoritativa antes da UI.

**Modelo:** implementação `gpt-5.6-sol/high`; revisão `gpt-6-astra/high`.

**Files:**
- Create: `tests/web_api/measure_stage4.py`
- Create: `tests/web_api/test_stage4_limits.py`
- Create: `web/scripts/measure-stage4.mjs`
- Create: `web/src/config/stage4Limits.ts`
- Create: `web/src/config/stage4Limits.test.ts`
- Create: `docs/frontend/evidencias/etapa-4-limites-dominio.json`
- Create: `docs/frontend/evidencias/etapa-4-limites-storage.json`
- Create: `docs/frontend/etapa-4-limites.md`
- Modify: `web/package.json`
- Modify: `web/src/app/providers.tsx`
- Modify: `web/src/app/providers.test.tsx`

**Interfaces:**
- Consumes: contratos T0, serviços puros T1/T2, Study V4 T4 e repositório T5.
- Produces: `MAX_VARIANTS_PER_STUDY_CANDIDATE`, protocolo reexecutável, provider de produção ligado a `RepositoryLimits`, driver `--phase full` congelado para T13 e evidência de p95/memória/payload para domínio/storage.

**Dependências:** T1, T2, T4 e T5.

**Riscos:** cap escolhido por intuição, benchmark de build dev e máquina não reproduzível.

- [ ] **Step 1: Escrever RED do cap e dos thresholds**

```ts
it('rejects the variant immediately above the measured cap', async () => {
  const repository = productionRepository({ maxVariantsPerStudy: MAX_VARIANTS_PER_STUDY_CANDIDATE });
  await appendVariants(repository, MAX_VARIANTS_PER_STUDY_CANDIDATE);
  await expect(repository.appendVariant(nextVariant())).rejects.toThrow('LIMITE_VARIANTES_EXCEDIDO');
});
```

```python
def test_measurement_fails_when_profile_compilation_p95_exceeds_five_seconds():
    assert evaluate_profile_budget(samples_ms=[5_001] * 20).passed is False
```

- [ ] **Step 2: Confirmar RED**

```powershell
pytest tests/web_api/test_stage4_limits.py -q
npm --prefix web run test:unit -- src/config/stage4Limits.test.ts src/app/providers.test.tsx
```

- [ ] **Step 3: Implementar protocolo fixo de medição**

Executar build de produção com versões travadas, ambiente de referência de 4 vCPU/8 GiB, cinco warmups e vinte amostras. Registrar cada célula: compilação/materialização com 1/10/30/100 participantes até 1.000 ordens; comparação com 10/30/100 pares; persistência/reload com 1/5/10/20 variantes; tamanho serializado de Estudo, execuções e comparações. Budgets bloqueantes aplicam-se ao pior caso, mas nenhuma célula pode ser omitida.

O script implementa dois modos desde esta task: `--phase storage`, executado aqui, e `--phase full`, cuja execução fica diferida para T13. O modo full reexecuta e agrega as matrizes Python, comparação, storage e UI num único JSON do build candidato. O driver visual usa somente a rota `/estudos/:studyId/comparar` e nomes acessíveis congelados em S17/T11/T12, mede `PerformanceObserver('longtask')` e falha se a página ainda não oferece o fluxo; T13 não altera o script.

```powershell
pytest tests/web_api/test_stage4_limits.py -q
python -m tests.web_api.measure_stage4 --samples 20 --warmups 5 --output docs/frontend/evidencias/etapa-4-limites-dominio.json
npm --prefix web run build
npm --prefix web run measure:stage4 -- --phase storage --samples 20 --warmups 5 --output ../docs/frontend/evidencias/etapa-4-limites-storage.json
```

Os thresholds não visuais são: compilação ≤5 s p95, ≤1 GiB RSS e request/response ≤1/8 MiB; comparação ≤2 s p95, ≤512 MiB RSS e response ≤8 MiB; salvar+reabrir o candidato ≤2 s p95 e documento lógico ≤50 MiB. Long tasks da UI são medidas no build final em T13.

- [ ] **Step 4: Escolher e ligar o maior cap candidato estável**

Escolher o maior entre 1/5/10/20 que passe os budgets de domínio/storage em duas execuções consecutivas. Se o resultado for menor que 5, classificar como bloqueio Important e não avançar T11/T12. `ApplicationProviders` passa o valor de `stage4Limits.ts` a `createBrowserApplicationRepository`; o guard continua dentro da transação de `appendVariant`. O relatório contém hardware, SO, versões, SHA, comandos, dados brutos e marca o valor como **candidato até a confirmação visual T13**.

- [ ] **Step 5: GREEN, refactor e critérios**

```powershell
pytest tests/web_api/test_stage4_limits.py -q
npm --prefix web run test:unit -- src/config/stage4Limits.test.ts src/app/providers.test.tsx src/storage/indexedDbApplicationRepository.test.ts
npm --prefix web run typecheck
git diff --check
```

Refactor permitido: extrair coletores de métricas; proibido relaxar thresholds após observar resultados. Critérios: todas as células registradas; dois passes não visuais consecutivos; cap candidato exportado, injetado e imposto pelo repositório em `cap`/`cap+1`; relatório sem alegar aprovação visual antecipada.

Commit: `perf: mede e limita variantes da etapa 4 (MOT-N)`.

## Task T11: Construir Receita e hipótese com confirmação explícita

**Objetivo:** permitir que o usuário transforme um Perfil em Receita auditável e declare uma hipótese tipada antes de executar.

**Modelo:** implementação `gpt-5.6-sol/high`; revisão `gpt-6-astra/high`.

**Files:**
- Create: `web/src/profileRecipes/components/ProfileRecipeBuilder.tsx`
- Create: `web/src/profileRecipes/components/ProfileRecipeBuilder.test.tsx`
- Create: `web/src/profileRecipes/components/DerivedValueConfirmation.tsx`
- Create: `web/src/profileRecipes/components/ParticipantCompositionEditor.tsx`
- Create: `web/src/variants/components/VariantEditor.tsx`
- Create: `web/src/variants/components/VariantEditor.test.tsx`
- Create: `web/src/variants/components/InputDifferencePanel.tsx`
- Create: `web/src/variants/components/InputDifferencePanel.test.tsx`

**Interfaces:**
- Consumes: T3 API, T6 Receita/proveniência, T8 materializador e cap T10.
- Produces: callbacks `onProfileScenarioMaterialized`, `onVariantMaterialized` e uma prévia acessível de diferenças de entrada; sucesso só é anunciado após CAS T6.

**Dependências:** T3, T6, T8 e T10.

**Riscos:** esconder campos ausentes, confundir evidência com projeção e permitir hipótese ambígua.

- [ ] **Step 1: Escrever RED de bloqueios e linguagem**

```tsx
it('blocks compilation until every derived value is confirmed', async () => {
  render(<ProfileRecipeBuilder profile={profileWithAvailableMetrics} />);
  expect(screen.getByRole('button', { name: /gerar receita/i })).toBeDisabled();
  await user.click(screen.getByLabelText(/confirmo volume mensal derivado/i));
  expect(screen.getByRole('button', { name: /gerar receita/i })).toBeDisabled();
});

it('blocks when one of the three derivable metrics is unavailable', () => {
  render(<ProfileRecipeBuilder profile={profileWithUnavailableVolumeMetric} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/volume.*não está disponível/i);
});
```

Cobrir confirmações separadas de volume mensal, ticket p50 e fração OUT; `warmupDays`/`measurementDays` como entradas explícitas; adição/remoção/alteração de participante, composição agregada, escala, janela, prazo suportado, custo escalar, IOF por finalidade, cap e proibição de rótulo marginal individual.

- [ ] **Step 2: Confirmar RED**

```powershell
npm --prefix web run test:unit -- src/profileRecipes/components src/variants/components
```

- [ ] **Step 3: Implementar formulário mínimo orientado pelo contrato**

Renderizar quatro blocos: fonte/versionamento; derivados com fórmula+evidência+checkbox; lacunas explícitas; prévia de composição/ordens. `VariantEditor` emite somente `HypothesisDraft` válido; `InputDifferencePanel` mostra delta antes da execução e marca mudanças individuais como incompatíveis com marginal.

- [ ] **Step 4: GREEN e acessibilidade focada**

```powershell
npm --prefix web run test:unit -- src/profileRecipes/components src/variants/components
npm --prefix web run typecheck
```

Critérios: sem fallback; mensagens ligadas por `aria-describedby`; foco vai ao primeiro erro; composição editável por teclado; prévia diferencia observado, derivado, informado e sintético; nenhum cálculo de comparação no componente.

- [ ] **Step 5: Refactor permitido e commit**

Refactor permitido: componentes de campo sem estado global; proibido duplicar validadores Ajv ou persistir diretamente.

```powershell
git diff --check
npm --prefix web run test:unit -- src/profileRecipes/components src/variants/components
```

Commit: `feat: cria receitas e hipóteses no estudo (MOT-N)`.

## Task T12: Exibir comparação, sete eixos e marginal agregado

**Objetivo:** entregar a leitura ordenada e acessível de entrada, execução, distribuição, sete eixos, compatibilidade e limitações.

**Modelo:** implementação `gpt-5.6-sol/high`; revisão `gpt-6-astra/high`.

**Files:**
- Create: `web/src/comparison/components/CompatibilityPanel.tsx`
- Create: `web/src/comparison/components/AxisComparison.tsx`
- Create: `web/src/comparison/components/AxisComparison.test.tsx`
- Create: `web/src/comparison/components/PairedDistribution.tsx`
- Create: `web/src/comparison/components/PairedDistribution.test.tsx`
- Create: `web/src/comparison/components/MarginalAssessment.tsx`
- Create: `web/src/comparison/components/MarginalAssessment.test.tsx`
- Create: `web/src/comparison/components/ComparisonStatus.tsx`
- Create: `web/src/pages/StudyComparePage.tsx`
- Create: `web/src/pages/StudyComparePage.test.tsx`
- Create: `web/src/app/AppShell.test.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/router.test.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `servidor/static.py`
- Modify: `tests/web_api/test_static.py`

**Interfaces:**
- Consumes: T9 workspace, componentes T11 e `ComparisonEnvelope` T2/T3.
- Produces: rota lazy `/estudos/:studyId/comparar` e relatório visual sem autoridade própria.

**Dependências:** T9, T10 e T11.

**Riscos:** misturar exemplo e distribuição, gráfico sem tabela e texto causal/individual indevido.

- [ ] **Step 1: Escrever RED da ordem semântica**

```tsx
it('renders input, selected execution, paired distribution, axes and limits in order', () => {
  render(<StudyComparePage initialState={readyComparison} />);
  const headings = screen.getAllByRole('heading').map((node) => node.textContent);
  const expected = [
    'Diferenças de entrada', 'Execução selecionada', 'Distribuição pareada',
    'Sete eixos', 'Limitações',
  ];
  expect(headings.filter((heading) => expected.includes(heading ?? ''))).toEqual(expected);
});

it('renders a data table for every chart series', () => {
  render(<PairedDistribution distribution={distribution} />);
  expect(screen.getByRole('table', { name: /dados da distribuição/i })).toBeVisible();
});
```

Testar sete axis codes, unidade/definição/disponibilidade/proveniência, compatibilidade antes do bloqueio, marginal indisponível, navegação contextual do AppShell, deep link do fallback e ausência das palavras “causou”, “previsão” e “benefício do cliente” nas mensagens públicas.

- [ ] **Step 2: Confirmar RED**

```powershell
npm --prefix web run test:unit -- src/comparison/components src/pages/StudyComparePage.test.tsx src/app/AppShell.test.tsx src/app/router.test.tsx
pytest tests/web_api/test_static.py -q
```

- [ ] **Step 3: Implementar composição mínima**

Página apenas seleciona dados e despacha comandos T9. Gráficos recebem séries prontas do envelope; tabela espelha os mesmos pontos. `AppShell` expõe “Comparar” como `/estudos/:studyId/comparar` quando há estudo na URL. A rota histórica `/comparar` mantém um estado vazio com link para `/estudos`; o fallback estático passa a reconhecer o novo deep link, sem wildcard amplo.

- [ ] **Step 4: GREEN funcional e acessível**

```powershell
npm --prefix web run test:unit -- src/comparison/components src/pages/StudyComparePage.test.tsx src/app/AppShell.test.tsx src/app/router.test.tsx
npm --prefix web run typecheck
pytest tests/web_api/test_static.py -q
```

Validar teclado completo, ordem de foco, foco visível, regiões vivas sem ruído, zoom 200%, gráfico+tabela e nenhuma codificação exclusiva por cor.

- [ ] **Step 5: Refactor permitido e commit**

Refactor permitido: layout e tokens CSS; proibido recomputar estatística, compatibilidade ou marginal no React.

```powershell
git diff --check
npm --prefix web run test:unit -- src/comparison/components src/pages/StudyComparePage.test.tsx src/app/AppShell.test.tsx src/app/router.test.tsx
pytest tests/web_api/test_static.py -q
```

Commit: `feat: apresenta comparação nos sete eixos (MOT-N)`.

## Task T13: Fechar aceite integrado, concorrência e regressão

**Objetivo:** provar os fluxos da Etapa 4 no navegador e preservar integralmente as Etapas 1–3.

**Modelo:** implementação `gpt-6-astra/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `web/e2e/stage4-profile-recipe.spec.ts`
- Create: `web/e2e/stage4-hypotheses.spec.ts`
- Create: `web/e2e/stage4-concurrency.spec.ts`
- Create: `web/e2e/stage4-accessibility.spec.ts`
- Create: `tests/web_api/test_stage4_acceptance.py`
- Create: `docs/frontend/evidencias/etapa-4-limites-full-run-1.json`
- Create: `docs/frontend/evidencias/etapa-4-limites-full-run-2.json`
- Create: `docs/frontend/etapa-4-limites-final.md`
- Modify: `web/playwright.config.ts`
- Modify: `web/src/e2eBridge.ts`

**Interfaces:**
- Consumes: fluxo integrado T3–T12 e matriz herdada da especificação S22.5.
- Produces: evidência automatizada para S23 e regressão das três etapas anteriores.

**Dependências:** T10 e T12.

**Riscos:** testes felizes demais, mocks que não exercitam CAS e regressão parcial.

- [ ] **Step 1: Escrever E2E RED pelos riscos materiais**

```ts
test('two tabs preserve the CAS winner and refresh the loser', async ({ context }) => {
  const [first, second] = await openSameStudyInTwoPages(context);
  await armDeterministicCasBarrier(first, second);
  await saveDifferentVariantsConcurrently(first, second);
  await expectExactlyOneWinnerAndOneConflict(first, second);
  await expectStudyHistoryToContainExactlyOneCommittedMutation(first, second);
});
```

Cobrir Perfil→Receita→variante→execuções→comparação; A→B→A; retry isolado; reload; resposta tardia; `STALE`; owner/epoch; V1 sem variantes, V1 com variantes rejeitado de modo preservador, V2/V3→V4; limites; incompatibilidade explicada; indisponibilidade não zerada.

- [ ] **Step 2: Confirmar RED focado**

```powershell
pytest tests/web_api/test_stage4_acceptance.py -q
npm --prefix web run test:e2e -- stage4-profile-recipe.spec.ts stage4-hypotheses.spec.ts stage4-concurrency.spec.ts stage4-accessibility.spec.ts
npm --prefix web run test:e2e -- --list
```

O `testMatch` local precisa coletar explicitamente os quatro `stage4-*.spec.ts`; o teste/relatório registra seus nomes e contagem, para o gate não passar ignorando-os.

- [ ] **Step 3: Completar apenas fixtures/bridge de teste necessários**

Ampliar o bridge real `web/src/e2eBridge.ts`, instalado por `main.tsx`. Ele pode controlar relógio, deferred responses, barreira CAS, falha/retry e eventos entre abas; não substitui IndexedDB, CAS, validação, servidor nem executor nos cenários de aceite.

- [ ] **Step 4: Confirmar o cap no build final e medir long tasks**

```powershell
npm --prefix web run build
npm --prefix web run measure:stage4 -- --phase full --samples 20 --warmups 5 --output ../docs/frontend/evidencias/etapa-4-limites-full-run-1.json
npm --prefix web run measure:stage4 -- --phase full --samples 20 --warmups 5 --output ../docs/frontend/evidencias/etapa-4-limites-full-run-2.json
```

As duas execuções completas usam o mesmo build candidato e o cap T10, repetem todas as células, percorrem Receita→variante→reload→comparação e provam ausência de long task >200 ms. Se qualquer budget falhar, T13 não reduz o cap: reabre T10 para escolher o próximo candidato e repete os gates afetados T11–T13. `etapa-4-limites-final.md` registra o cap finalmente aprovado.

- [ ] **Step 5: Rodar GREEN integrado, regressão herdada e otimizada**

```powershell
pytest -q
python -O -m pytest -q
npm --prefix web run test:unit
npm --prefix web run test:e2e
npm --prefix web run build
```

Registrar contagens e duração. Nenhum snapshot é atualizado sem revisão visual e sem explicar a mudança.

- [ ] **Step 6: Refactor permitido, aceite e commit**

Refactor permitido: builders de fixture e comandos Playwright; proibido adicionar bypass de produção para facilitar teste.

```powershell
git diff --check
git status --short
```

Critérios: matriz S23 automatizada; os quatro E2E Stage 4 coletados; duas abas reais com vencedor controlado; ordem de estados; cap confirmado por dois runs `full` e long tasks ≤200 ms; Etapas 1–3 verdes; `python -O`; nenhuma flakiness em três execuções dos cenários concorrentes.

Commit: `test: fecha regressão integrada da etapa 4 (MOT-N)`.

## Task T14: Auditar evidência e fechar documentação

**Objetivo:** tornar aceite, operação, limites, riscos residuais e proveniência verificáveis sem depender desta conversa.

**Modelo:** implementação `gpt-5.6-sol/high`; revisão `gpt-6-astra/xhigh`.

**Files:**
- Create: `docs/frontend/etapa-4-operacao.md`
- Create: `docs/frontend/etapa-4-aceitacao.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: `docs/superpowers/specs/2026-09-20-frontend-etapa-4-design.md`
- Modify: `docs/superpowers/plans/2026-09-20-frontend-etapa-4-plano-tecnico.md`

**Interfaces:**
- Consumes: evidências T0–T13 e relatório T10.
- Produces: runbook, matriz final assinável, índices atualizados e handoff explícito sem iniciar Etapa 5.

**Dependências:** T13.

**Riscos:** documento afirmar algo não executado, SHA incorreto e finding importante encoberto.

- [ ] **Step 1: Escrever checklist RED contra documentação ausente**

```powershell
pytest tests/web_api/test_stage4_acceptance.py -q
if (-not (Test-Path -LiteralPath 'docs/frontend/etapa-4-aceitacao.md')) { throw 'Acceptance document is missing.' }
foreach ($marker in @('S23.1', 'S23.16', 'SHA', 'PASS|FAIL')) {
  if (-not (Select-String -LiteralPath 'docs/frontend/etapa-4-aceitacao.md' -Pattern $marker)) { throw "Missing marker: $marker" }
}
```

Antes da documentação, o segundo comando deve falhar por arquivo ausente.

- [ ] **Step 2: Registrar somente evidência observada**

`etapa-4-operacao.md` descreve startup, limites, estados, recuperação de conflito/reload/interrupção e mensagens públicas. `etapa-4-aceitacao.md` liga cada S23 a comando, teste, resultado, SHA e artefato de medição.

- [ ] **Step 3: Executar revisões independentes**

Uma revisão cobre arquitetura/dependências; outra, contratos/segurança/persistência; outra, rastreabilidade/testabilidade. Corrigir todos os Critical/Important na task dona e pedir re-review restrita do diff corretivo. Minor não bloqueante fica listado com impacto e owner futuro.

- [ ] **Step 4: Gate global final**

```powershell
pytest -q
python -O -m pytest -q
npm --prefix web run generate:api
$generatedBefore = @('contracts/openapi.json', 'web/src/api/generated.ts', 'web/src/api/schemas.json') | ForEach-Object { "$_=$((Get-FileHash -LiteralPath $_).Hash)" }
npm --prefix web run generate:api
$generatedAfter = @('contracts/openapi.json', 'web/src/api/generated.ts', 'web/src/api/schemas.json') | ForEach-Object { "$_=$((Get-FileHash -LiteralPath $_).Hash)" }
if (Compare-Object $generatedBefore $generatedAfter) { throw 'Generated API artifacts drifted.' }
git diff --exit-code -- contracts/openapi.json web/src/api/generated.ts web/src/api/schemas.json
npm --prefix web run lint
npm --prefix web run test:unit
npm --prefix web run test:e2e
npm --prefix web run typecheck
npm --prefix web run build
git diff --check
```

Confirmar também os dois runs completos finais de T13, schemas regenerados deterministicamente, working tree limitado ao escopo e zero Critical/Important aberto.

- [ ] **Step 5: Atualizar status e preparar commit**

Refactor permitido: clareza documental sem mudar contratos. Marcar spec/plano como implementados apenas depois do gate e registrar SHA real; não antecipar push, PR, merge nem Etapa 5.

Commit: `docs: registra aceite da etapa 4 (MOT-N)`.

## 1. Gates anteriores à implementação

Este plano depende da especificação aprovada em 2026-09-20. A execução só começa após:

1. aprovação deste plano;
2. apresentação e aprovação do mapeamento T0–T14 para issues reais;
3. criação autorizada das issues no Linear e substituição dos IDs locais;
4. autorização explícita para implementar;
5. baseline verde no worktree isolado.

Falha em qualquer gate interrompe a execução antes de editar código de produto.

## 2. Mapa de arquivos por responsabilidade

### 2.1 Contratos e serviços Python

```text
servidor/contracts/profile_recipe.py       # DTOs de compilação
servidor/contracts/comparison.py           # DTOs de comparação
servidor/contracts/primitives.py           # OrigemValor discriminada
servidor/contracts/preparation.py          # EffectiveSource PERFIL_OPERACIONAL
servidor/contracts/diagnostics.py          # DiagnosticRequest V1/V2
servidor/profile_recipe.py                 # compilador puro
servidor/comparison.py                     # compatibilidade e diferenças puras
servidor/provenance.py                     # projeção conservadora de proveniência
servidor/routes/profile_recipe.py          # POST de compilação
servidor/routes/comparison.py              # POST de comparação
servidor/app.py                            # composição e OpenAPI canônico
servidor/errors.py                         # erro tipado com details
```

### 2.2 Contratos e domínio TypeScript

```text
contracts/openapi.json
web/src/api/generated.ts
web/src/api/schemas.json
web/src/api/validators.ts
web/src/api/client.ts
web/src/study/model.ts
web/src/study/domain.ts
web/src/study/validation.ts
web/src/study/fingerprints.ts
web/src/study/study.schema.json
web/src/profileRecipes/
web/src/variants/
web/src/comparison/
```

### 2.3 Persistência e orquestração

```text
web/src/storage/applicationRepository.ts
web/src/storage/indexedDbApplicationRepository.ts
web/src/storage/migrations.ts
web/src/storage/productionRepository.ts
web/src/config/stage4Limits.ts
web/src/app/providers.tsx
web/src/diagnostics/buildDiagnosticRequest.ts
web/src/diagnostics/diagnosticExecutionService.ts
web/src/preparation/resolvePortfolioSource.ts
web/src/preparation/buildPreviewRequest.ts
```

### 2.4 Interface, testes e evidência

```text
web/src/comparison/components/
web/src/profileRecipes/components/
web/src/variants/components/
web/src/pages/StudyComparePage.tsx
web/src/app/AppShell.tsx
web/src/app/router.tsx
web/src/styles/global.css
servidor/static.py
web/playwright.config.ts
web/src/e2eBridge.ts
web/e2e/stage4-hypotheses.spec.ts
web/e2e/stage4-concurrency.spec.ts
tests/web_api/test_stage4_*.py
docs/frontend/etapa-4-*.md
```

## 3. Interfaces transversais congeladas

```py
def compile_profile_recipe(
    request: ProfileRecipeCompilationRequest,
    *,
    authenticated_owner_sub: str,
    build_sha: str,
) -> ProfileRecipeCompilationResponse: ...

def compare_scenarios(request: ComparisonRequest) -> ComparisonEnvelope: ...
```

```ts
export function resolveExecutableScenario(
  study: StudyDocumentV4,
  scenarioId: string,
): ScenarioDocument;

export function buildEffectiveInputForScenario(
  source: OperationalProfileSourceSnapshot,
  scenario: ScenarioDocument,
): EffectiveInput;

export function compileExistingRecipeVariant(input: Readonly<{
  existingRecipe: OperationalProfileRecipe;
  changedDraft: ProfileRecipeDraft;
}>): Promise<ProfileRecipeCompilationResponse>;

export function materializeVariant(
  base: ScenarioDocument,
  hypothesis: HypothesisDraft,
  dependencies: VariantMaterializerDependencies,
): Promise<ScenarioVariant>;

export interface ApplicationRepository {
  appendVariant(input: AppendVariantMutation): Promise<StudyDocumentV4>;
  appendComparison(input: AppendComparisonMutation): Promise<StudyDocumentV4>;
}

export type RepositoryLimits = Readonly<{
  maxVariantsPerStudy: 1 | 5 | 10 | 20;
}>;

export interface Stage4StudyCommands {
  materializeProfileScenario(input: MaterializeProfileScenarioCommand): Promise<StudyDocumentV4>;
}
```

Qualquer mudança dessas assinaturas exige atualizar a especificação e reabrir revisão antes da task consumidora.

## 4. Single-writer e paralelismo permitido

| Arquivo/fronteira compartilhada | Único owner |
|---|---|
| `servidor/contracts/*.py` da Etapa 4 e `servidor/identity.py` | T0 |
| `servidor/profile_recipe.py` | T1 |
| `servidor/comparison.py` | T2 |
| `servidor/app.py`, routes HTTP da Etapa 4/V2, `servidor/errors.py`, OpenAPI e `web/src/api/*` | T3 |
| `web/src/study/*` exceto `studyController*`, resolvedor e `StudyResultPage*` | T4 |
| `web/src/storage/*` | T5 |
| `servidor/provenance.py`, `servidor/diagnostics/service.py`, `web/src/preparation/*`, `web/src/profileRecipes/*` não visuais e `studyController*` | T6 |
| `web/src/diagnostics/buildDiagnosticRequest.ts` e `diagnosticExecutionService.ts` | T7 |
| `web/src/variants/*` não visuais | T8 |
| `web/src/comparison/*` não visuais | T9 |
| benchmark, `config/stage4Limits.ts`, relatório de limites e `app/providers*` | T10 |
| componentes de Receita/variante | T11 |
| página, componentes de resultado, AppShell, router, CSS e fallback estático | T12 |
| E2E/aceite automatizado, Playwright config, bridge E2E e evidência UI de limites | T13 |
| documentação final, MAPA, arquitetura e testing | T14 |
| `docs/DIARIO-DE-MUDANCAS.md` | exclusivamente a task que está fechando seu commit; nunca duas tasks simultâneas |

T1 e T2 podem avançar em paralelo após T0. T3 converge ambos; T4 só começa depois de T3. Todo o restante segue o grafo da seção 7. `docs/DIARIO-DE-MUDANCAS.md` é exceção sequencial: somente a task em gate de commit o toca; duas tasks nunca o editam simultaneamente.

## 5. Modelos recomendados, revisão e estimativa

| Task | Implementação | Revisão | Estimativa serial | Risco dominante |
|---|---|---|---:|---|
| T0 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 3 d | contrato público e proveniência |
| T1 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 2.5 d | determinismo e ausência |
| T2 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 3 d | estatística e semântica marginal |
| T3 | `gpt-5.6-sol/high` | `gpt-6-astra/high` | 2.5 d | HTTP, limites e geração de tipos |
| T4 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 3 d | identidade, V4 e executabilidade |
| T5 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 3 d | migration, CAS e idempotência |
| T6 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 3 d | proveniência ponta a ponta |
| T7 | `gpt-5.6-sol/high` | `gpt-6-astra/high` | 2 d | seeds pareadas e retry |
| T8 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 2.5 d | propagação de changes |
| T9 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 2.5 d | concorrência e resposta tardia |
| T10 | `gpt-5.6-sol/high` | `gpt-6-astra/high` | 2 d | medição e cap objetivo |
| T11 | `gpt-5.6-sol/high` | `gpt-6-astra/high` | 2 d | formulário e bloqueios |
| T12 | `gpt-5.6-sol/high` | `gpt-6-astra/high` | 2.5 d | visualização e acessibilidade |
| T13 | `gpt-6-astra/high` | `gpt-6-astra/xhigh` | 3 d | regressão e concorrência real |
| T14 | `gpt-5.6-sol/high` | `gpt-6-astra/xhigh` | 1 d | auditoria e rastreabilidade |

Estimativa: **37 dias-agente seriais**; **22–27 dias úteis de calendário** com o paralelismo controlado do grafo e sem findings importantes. Finding Critical/Important volta à task dona; re-review é restrito ao fix. Minor fica documentado quando não altera aceite.

## 6. Estratégia de commits sem inventar issue

T0–T14 são IDs locais. Não há commit de implementação antes do mapeamento autorizado para IDs reais do Linear. Após o mapeamento, cada task usa um commit focado com o sufixo `(MOT-N)` real:

| Task | Fragmento esperado |
|---|---|
| T0 | `feat: define contratos públicos da etapa 4` |
| T1 | `feat: compila receita a partir de perfil` |
| T2 | `feat: compara cenários compatíveis` |
| T3 | `feat: publica APIs de receita e comparação` |
| T4 | `feat: evolui estudo para variantes v4` |
| T5 | `feat: persiste variantes e comparações` |
| T6 | `feat: preserva origem de perfil na execução` |
| T7 | `feat: pareia diagnósticos de hipóteses` |
| T8 | `feat: materializa variantes imutáveis` |
| T9 | `feat: orquestra comparação de hipóteses` |
| T10 | `perf: mede e limita variantes da etapa 4` |
| T11 | `feat: cria receitas e hipóteses no estudo` |
| T12 | `feat: apresenta comparação nos sete eixos` |
| T13 | `test: fecha regressão integrada da etapa 4` |
| T14 | `docs: registra aceite da etapa 4` |

Cada commit inclui RED/GREEN, gate focado, revisão e entrada do diário. Squash entre tasks é proibido porque apagaria os gates.

## 7. Grafo de dependências e ordem linear segura

```text
T0 -> {T1, T2}
{T1, T2} -> T3 -> T4 -> T5
{T1, T3, T4, T5} -> T6 -> T7
{T1, T2, T4, T5} -> T10
{T4, T5, T6} -> T8
{T2, T3, T5, T7, T8} -> T9
{T3, T6, T8, T10} -> T11
{T9, T10, T11} -> T12
{T10, T12} -> T13 -> T14
```

Relações explícitas:

- T0 precede qualquer contrato consumidor.
- T1 e T2 podem avançar em paralelo após T0, respeitando single-writer.
- T3 depende de T1/T2; T4 depende de T0/T3; T5 depende de T4; T6 converge T1/T3/T4/T5.
- Depois de T5, T6 e T10 podem avançar em paralelo. T7 depende de T3/T4/T6; T8 depende de T4/T5/T6; T9 converge T2/T3/T5/T7/T8.
- T10 mede T1/T2/T4/T5 e bloqueia a UI caso o cap útil seja menor que cinco.
- T11 converge T3/T6/T8/T10. T12 só começa após T9/T10/T11.
- T13 e T14 são estritamente seriais.

Ordem linear segura quando houver apenas um implementador:

```text
T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14
```

A ordem coloca T10 antes da UI para escolher o candidato por domínio/storage; T13 só o torna final depois de medir o fluxo visual no mesmo build candidato.

## 8. Matriz proposta de tarefas/issues

Esta é a lista a apresentar ao usuário depois da aprovação deste plano. Ela não autoriza criação no Linear.

| ID local | Título proposto | Depende de | Aceite resumido |
|---|---|---|---|
| T0 | Contratos públicos e fixtures da Etapa 4 | — | Pydantic estrito, versões, proveniência e fixtures canônicas passam em Python normal e `-O` |
| T1 | Compilador determinístico de Receita de Perfil | T0 | mesmas entradas geram Receita, fingerprints, `EffectiveInput` e ordens idênticos; lacuna bloqueia |
| T2 | Comparação pura e marginal agregado | T0 | compatibilidade fechada, pareamento correto, sete eixos e marginal só para change elegível |
| T3 | APIs autenticadas e cliente gerado da Etapa 4 | T0, T1, T2 | limites/owner/erros públicos, OpenAPI e artefatos determinísticos |
| T4 | StudyDocument V4 e variantes executáveis | T0, T3 | fingerprints acíclicos, snapshots integrais e regras V1/V2/V3→V4 |
| T5 | Persistência v3, CAS e comparações normalizadas | T4 | migration atômica, stores físicas, CAS, idempotência e duas abas |
| T6 | Origem OPERATIONAL_PROFILE e proveniência | T1, T3, T4, T5 | origem só após materialização; cadeia completa preservada |
| T7 | Diagnósticos V2 e seeds pareadas | T3, T4, T6 | mesma configuração/seeds, retry explícito e invariantes da Etapa 3 |
| T8 | Materializador tipado de variantes | T4, T5, T6 | changes suportados propagam; base permanece imutável; mudança não declarada falha |
| T9 | Orquestração robusta da comparação | T2, T3, T5, T7, T8 | estados ortogonais, A→B→A, late response, retry/reload e terminal idempotente |
| T10 | Benchmark não visual e cap candidato | T1, T2, T4, T5 | matriz não visual passa duas vezes e o cap candidato é imposto pela persistência; <5 bloqueia |
| T11 | UI de Receita e hipótese | T3, T6, T8, T10 | confirmação, lacunas, prévia e delta funcionam por teclado sem fallback |
| T12 | UI de comparação nos sete eixos | T9, T10, T11 | ordem semântica, gráfico+tabela, marginal/limitações e zoom 200% |
| T13 | Aceite integrado e regressão | T10, T12 | cap confirmado no fluxo visual, S23 automatizado, duas abas reais e regressão completa das Etapas 1–3 |
| T14 | Auditoria e documentação final | T13 | evidência por SHA, zero Critical/Important e runbook/aceite/MAPA atualizados |

## 9. Matriz requisito → tarefa → teste → evidência

### 9.1 Critérios de aceite S23

| Critério | Tasks | Teste decisivo | Evidência final |
|---|---|---|---|
| S23.1 determinismo do Perfil | T0, T1, T13 | `test_profile_recipe_is_deterministic` + E2E Perfil→Receita | resposta/fingerprints capturados em `etapa-4-aceitacao.md` |
| S23.2 ausência bloqueia | T0, T1, T11, T13 | métricas `UNAVAILABLE` e campo explícito ausente | mensagens públicas e casos 400/422 |
| S23.3 cadeia de identidades | T0, T4, T6, T8 | `stage4Contract.test.ts` e `provenance.test.ts` | DAG e fingerprints por documento |
| S23.4 validade da origem | T6, T13 | rejeição antes e aceite após materialização | teste HTTP/E2E da origem |
| S23.5 variante imutável | T4, T5, T8 | editar base após variante não altera snapshot | hashes antes/depois e reload |
| S23.6 V1/V2/V3→V4 | T4, T5, T13 | fixtures de todas as versões e caso V1 legado com variantes | relatório de migration atômica |
| S23.7 incompatibilidade | T2, T8, T13 | matriz estrutural e alteração não declarada | `CompatibilityReport` persistido |
| S23.8 pareamento separado | T2, T7, T12 | seeds/repetition IDs e cartões distintos | distribuição+tabela e execução selecionada |
| S23.9 sete eixos | T2, T12 | todos os `AxisCode` com unidade/definição/status/origem | envelope e tabela dos sete eixos |
| S23.10 marginal restrito | T2, T8, T12 | exatamente um change agregado elegível; participante negado | `MarginalAssessment` ou reason code |
| S23.11 sem causalidade/individual | T0, T2, T11, T12 | assertions de linguagem e schema sem campo individual | revisão de textos públicos |
| S23.12 executor reutilizado | T7, T9, T13 | spy comprova serviço da Etapa 3 e comparação sem motor/UI | teste de integração do executor |
| S23.13 concorrência | T5, T9, T13 | duas abas, A→B→A, retry, reload, late response | trace E2E e CAS winner |
| S23.14 acessibilidade | T11, T12, T13 | Testing Library semântica, teclado, foco, zoom 200% e gráfico+tabela | relatório Playwright/a11y |
| S23.15 limites | T10, T13 | duas execuções do protocolo e cap+1 rejeitado | `etapa-4-limites.md` + JSON bruto |
| S23.16 regressão | T13, T14 | suíte total, `python -O`, unit/a11y/E2E/build | contagens, duração e SHA |

### 9.2 As vinte decisões obrigatórias da solicitação

| R | Decisão fechada na spec | Tasks que a executam | Teste/evidência |
|---:|---|---|---|
| 1 | Perfil + confirmações/lacunas → Receita própria versionada → materialização sintética | T0, T1, T6 | determinismo e proveniência |
| 2 | deriváveis são recalculados; ausentes e não deriváveis exigem entrada explícita | T1, T11 | `UNAVAILABLE`/missing bloqueiam |
| 3 | Receita é entidade própria; snapshot da origem referencia Receita e Perfil | T0, T4, T6 | DAG de fingerprints |
| 4 | endpoint próprio compila e reutiliza internamente preparação | T1, T3 | spy/integração sem duplicar regra |
| 5 | seed, versão, Perfil, parâmetros e ordens são preservados integralmente | T0, T1, T4, T6 | round-trip/reload |
| 6 | `OPERATIONAL_PROFILE` só após validação e materialização completas | T6 | casos antes/depois |
| 7 | delta imutável + materialização canônica + snapshot integral | T4, T8 | base inalterada e rebuild idêntico |
| 8 | IDs e fingerprints distintos, acíclicos e encadeados | T0, T4 | testes de canonicalização/DAG |
| 9 | matriz fechada distingue igualdade, diferença declarada e incompatibilidade | T2 | tabela parametrizada completa |
| 10 | entrada, exemplo, estatística e causalidade permanecem separadas | T2, T7, T12 | cartões e distributions pareadas |
| 11 | marginal = delta pareado por uma mudança agregada elementar elegível | T2, T8 | property/table tests |
| 12 | participante e mudanças múltiplas nunca são “efeito marginal” | T2, T8, T12 | reason codes explícitos |
| 13 | contrato/UI não expõem benefício individual não calculado | T0, T2, T12 | schema e copy tests |
| 14 | IDB físico 3 migra V2/V3; V1 sem variantes importa; V1 com variantes é preservado e rejeitado | T4, T5, T13 | fixtures e rollback |
| 15 | CAS decide; notification só invalida; intention/epoch/revision/attempt descartam atrasos | T5, T9, T13 | E2E concorrente |
| 16 | Pydantic → OpenAPI → TS/Ajv; endpoints de Receita/comparação | T0, T3 | geração determinística e HTTP |
| 17 | executor da Etapa 3 recebe cenários resolvidos; comparação consome terminais | T7, T9 | testes de serviço e ausência de acoplamento React |
| 18 | 1/10/30/100 participantes, até 1.000 ordens, 10/30/100 repetições e cap 1/5/10/20 medidos | T10, T13 | protocolo p95/RSS/payload/long tasks em dois runs completos finais |
| 19 | teclado, foco, 200%, gráfico+tabela e redundância de cor | T11, T12, T13 | Testing Library + Playwright |
| 20 | matriz herdada completa, incluindo Python otimizado | T13, T14 | gate global e registro por SHA |

## 10. Gates focados e gate global

Cada task só entrega ao consumidor após:

1. teste RED observado e registrado;
2. GREEN focado nos arquivos/contratos da task;
3. typecheck/build quando houver TypeScript;
4. `python -O` quando houver invariante Python;
5. `git diff --check`;
6. revisão pelo modelo indicado;
7. zero Critical/Important na fronteira publicada;
8. entrada do diário no mesmo commit publicável.

Gates de convergência:

- **G1 — contratos:** T0–T3; fixtures cruzadas e geração determinística.
- **G2 — identidade/persistência:** T4–T6; migration, CAS, origem e DAG.
- **G3 — execução/comparação:** T7–T9; pareamento, materialização, state machines.
- **G4 — capacidade/UI:** T10–T12; benchmark aprovado antes de expor cap e fluxo.
- **G5 — aceite:** T13–T14; suíte integral, evidência e revisões independentes.

O gate global final é exatamente o comando de T14 Step 4, acrescido dos dois runs completos consecutivos T13 e inspeção de status/diff. Falha em qualquer comando impede status PASS; não há waiver silencioso.

## 11. Riscos de execução e respostas

| Risco | Sinal precoce | Resposta prevista | Owner |
|---|---|---|---|
| Receita muda após custo/janela | fingerprint efetivo diverge sem mudança de Perfil | `buildEffectiveInputForScenario` reata autoridade do cenário; teste cruzado | T1/T6 |
| ciclo de fingerprints | documento precisa do próprio hash para ser serializado | canonicalização sem campos derivados e teste DAG | T0/T4 |
| marginal individual reaparece | change de participante retorna número marginal | denylist estrutural + reason code + copy test | T2/T8/T12 |
| comparação estatística parcial | eixo sem `RepetitionSummary` recebe p50/p95 inventado | `NOT_AVAILABLE` tipado; apenas eixos suportados distribuem | T2 |
| migration inventa história | V1 ganha Receita/delta inexistente | preservar/rejeitar; nunca sintetizar documento histórico | T4/T5 |
| duas abas perdem atualização | BroadcastChannel tratado como commit | CAS físico é autoridade; notificação apenas invalida | T5/T13 |
| resposta tardia vence intenção | B aparece após A→B→A | guard completo + abort como otimização | T9/T13 |
| benchmark não reproduz | cap muda por build dev/hardware oculto | protocolo fixo, dados brutos, duas passagens | T10 |
| UI vira segunda engine | React calcula compatibilidade/estatística | componentes recebem envelopes prontos; testes de fronteira | T9/T12 |
| regressão do fluxo antigo | nova union quebra observed/authored/synthetic | matriz herdada e fixtures anteriores intactas | T6/T13 |
| payload sensível em log | request completo em erro HTTP | logging por IDs/fingerprints, teste de captura | T3 |
| dependência de contexto oculto | implementador pergunta por decisão desta conversa | spec/plan contêm contrato, matriz e reason codes | T14 |

## 12. Fora de escopo

- alteração em `motor/`, P0, netting, custo, IOF, alíquota, regra regulatória ou rateio;
- inferência de causalidade, previsão, recomendação comercial ou benefício por cliente;
- observar fluxo real a partir de ordens sintéticas;
- edição mutável de Perfil, Receita, cenário-base, variante, execução ou comparação;
- Replay, Etapa 5, chat, PDF, publicação, compartilhamento, fila distribuída, persistência remota ou promessa de durabilidade do executor;
- suporte estatístico novo para eixos sem resumo por repetição;
- criação automática de issues, push, PR, merge ou deploy.

## 13. Estratégia de auditoria e re-review

Em T0, T4, T5, T6, T9 e T13, o implementador produz um pacote curto com contratos alterados, testes RED/GREEN, diff e riscos residuais. O revisor não implementador classifica findings como Critical, Important ou Minor:

- **Critical:** quebra de segurança/owner, perda/corrupção, identidade inválida ou conclusão individual/causal indevida; bloqueia imediatamente.
- **Important:** critério sem prova, migration/concorrência incorreta, divergência spec-código ou regressão material; volta à task owner.
- **Minor:** clareza/manutenção sem impacto de aceite; documentar com justificativa e owner futuro.

Após correção de Critical/Important, a re-review verifica apenas o finding, o diff corretivo e regressões adjacentes. Não se abre novo ciclo geral sem evidência nova. T14 consolida três pareceres independentes: arquitetura; contratos/segurança/persistência; rastreabilidade/testabilidade.

## 14. Handoff para a Etapa 5, sem iniciá-la

O fechamento entrega somente um inventário de fronteiras estáveis que uma futura Etapa 5 poderá consumir: IDs/fingerprints imutáveis, `ComparisonEnvelope`, repositório append-only, limites medidos e reason codes. Não cria rota, schema, componente, issue ou abstração “para Etapa 5”.

O handoff registra:

- contratos públicos realmente implementados e versões;
- limites e riscos residuais observados;
- Minors aceitos e razões;
- artefatos que permanecem locais versus persistidos;
- perguntas futuras que exigem produto, negócio ou regulação.

Qualquer expansão começa por nova auditoria e autorização explícita.

## 15. Definição de pronto do planejamento

O plano está pronto para aprovação quando:

- contém T0–T14 com objetivo, arquivos, interfaces, RED, GREEN, refactor, comandos, aceite, commit, dependências, riscos e modelos;
- o grafo, a ordem linear e single-writer não contradizem as dependências;
- S23.1–S23.16 e R1–R20 têm task e prova identificáveis;
- não há placeholder de decisão técnica ou contexto oculto;
- as três revisões independentes não deixam Critical/Important aberto;
- Minors, se houver, estão registrados;
- especificação permanece a autoridade e qualquer mudança material volta ao gate do usuário.

Depois da aprovação, o próximo ato permitido é apresentar esta matriz T0–T14 e perguntar se o usuário autoriza criar as issues. Aprovar o plano não autoriza criar issues nem iniciar implementação.

## 16. Registro das revisões independentes do plano

Três revisões somente leitura confrontaram este plano com a especificação aprovada, a solicitação original e os caminhos reais de `origin/main`:

- **Arquitetura e dependências:** encontrou lacunas em despacho V1/V2, evolução A→B, resolvedor de variantes, persistência da primeira materialização, grafo e cap. Todas foram corrigidas; a re-review classificou cada finding como `RESOLVED` e não encontrou novo Critical/Important.
- **Contratos, segurança e persistência:** encontrou 9 Important e 2 Minor, incluindo `TypeAdapter`, `user_id`, limites de resposta, append-only, cap dentro da CAS, fixtures cruzadas e coleta E2E. A re-review confirmou 11/11 como `RESOLVED`, sem novo Critical/Important.
- **Rastreabilidade e testabilidade:** encontrou 9 Important e 2 Minor, incluindo matriz de benchmark, gates `generate:api`/lint, Diário, blockers, ordem visual, limites HTTP e determinismo do E2E concorrente. A re-review confirmou 11/11 como `RESOLVED`, sem novo Critical/Important.

Resultado final: **0 Critical e 0 Important abertos**. S23.1–S23.16 e R1–R20 permanecem integralmente mapeados. Não houve edição de código de produto durante planejamento ou revisão.

---
