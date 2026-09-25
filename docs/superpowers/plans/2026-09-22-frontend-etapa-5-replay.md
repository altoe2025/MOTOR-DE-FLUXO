# Front-end Etapa 5 — Replay temporal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o MVP funcional do Replay Fronteira Viva para uma execução diagnóstica persistida, com contrato temporal canônico, estado determinístico, cena orientada a eventos e aceite reproduzível.

**Architecture:** O navegador resolve o Estudo e a execução terminal no IndexedDB e envia o `DiagnosticEnvelope` persistido a um endpoint autenticado e estateless. O servidor valida e reconcilia o resultado do motor, produz dias/eventos/segmentos ilustrativos; o front-end reduz eventos explícitos em estado puro e mantém animação separada dos valores de negócio.

**Tech Stack:** Python 3.11+, FastAPI/Pydantic, React 19, TypeScript 5.9, decimal.js, SVG, Vitest/Testing Library e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-frontend-etapa-5-replay-design.md`

## Global Constraints

- O pacote Python `motor` é autoridade; não alterar P0, EDF, autonetting preferencial, custo ou geração.
- Dinheiro cruza a API como decimal canônico em string e é reduzido no cliente com `decimal.js`.
- O período natural mostra aquecimento, medição e liquidação; a netabilidade usa apenas a coorte medida.
- Casado canônico é contribuição das pontas; posição casada do ciclo é contada uma vez e recebe rótulo distinto.
- A decomposição ilustrativa é criada somente no servidor em fases `INTRA_CLIENTE` e `INTER_CLIENTE`.
- O endpoint não consulta job expirado nem presume Estudo no backend; recebe o envelope persistido local.
- O documento contém todos os dias `0..settlementEndDay`, inclusive vazios.
- Limites: 1.000 ordens de entrada, 730 dias de liquidação, 8 MiB por requisição e resposta; medir 1.000 × 365.
- Não implementar 5A, 5B ou 5C neste plano.

---

### Task 1: MOT-86 — Contrato, reconciliação e endpoint estateless

**Files:**
- Create: `servidor/contracts/replay.py`
- Create: `servidor/replay.py`
- Create: `servidor/routes/replay.py`
- Modify: `servidor/contracts/__init__.py`
- Modify: `servidor/routes/__init__.py`
- Modify: `servidor/app.py`
- Modify: `web/scripts/generate-api.mjs`
- Regenerate: `contracts/openapi.json`, `web/src/api/generated.ts`, `web/src/api/schemas.json`, `web/src/api/validators.ts`
- Test: `tests/web_api/test_replay_contracts.py`
- Test: `tests/web_api/test_replay.py`
- Test: `tests/web_api/test_replay_http.py`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: `ReplayRequestV1(api_version, diagnostic_execution_id, diagnostic_envelope)` e o `PreviewEnvelope` selecionado dentro do diagnóstico.
- Produces: `POST /api/v1/replays -> ReplayDocumentV1`, `construir_replay(request)`, `decompor_fluxos(ciclo, ordens)`.

- [x] **Step 1: Write failing contract tests**

```python
def test_replay_request_preserves_local_and_canonical_identities():
    request = ReplayRequestV1.model_validate(fixture_request())
    assert request.diagnostic_execution_id != request.diagnostic_envelope.job_id
    assert request.diagnostic_envelope.statistics.selected_repetition_id == (
        request.diagnostic_envelope.selected_execution.statistics.repetition_id
    )

def test_replay_closing_accepts_simultaneous_triggers_in_canonical_order():
    closing = ReplayClosingV1.model_validate(fixture_closing(
        triggers=["WINDOW", "DEADLINE", "HORIZON_END"],
    ))
    assert closing.triggers == ["WINDOW", "DEADLINE", "HORIZON_END"]
```

- [x] **Step 2: Run contract tests and verify RED**

Run: `.venv-t5/Scripts/python.exe -m pytest tests/web_api/test_replay_contracts.py -q`

Expected: collection fails because `servidor.contracts.replay` does not exist.

- [x] **Step 3: Add strict Pydantic models**

Implement `ReplayRequestV1`, `ReplayPeriodV1`, `ReplayOrderV1`, discriminated replay events, `ReplayFlowSegmentV1`, `ReplayClosingV1`, `ReplayEndStateV1`, `ReplayTotalsV1` and `ReplayDocumentV1`. Validators enforce continuous days, canonical trigger order, unique event sequence, non-negative finite decimals, identity reconciliation and `matched_contribution_brl == 2 * matched_position_brl` for each full cycle.

- [x] **Step 4: Write failing builder tests for temporal semantics**

```python
def test_builder_emits_empty_days_and_separates_warmup_measurement_and_settlement():
    replay = construir_replay(request_from_natural_fixture())
    assert [day.day for day in replay.days] == list(range(replay.period.settlement_end_day + 1))
    assert replay.period.measurement_start_day == 2
    assert replay.period.measurement_end_day == 4
    assert {order.id: order.cohort for order in replay.orders} == {
        "warm": "WARMUP", "measured": "MEASUREMENT",
    }

def test_builder_uses_both_matched_allocations_for_canonical_netability():
    replay = construir_replay(request_with_position_40_and_two_contributions())
    assert replay.totals.execution_matched_position_brl == Decimal("40")
    assert replay.totals.measured_matched_contribution_brl == Decimal("80")
    assert replay.totals.netability_fraction == Decimal("0.8")
```

- [x] **Step 5: Run builder tests and verify RED**

Run: `.venv-t5/Scripts/python.exe -m pytest tests/web_api/test_replay.py -q`

Expected: fails because `construir_replay` is missing.

- [x] **Step 6: Implement the pure builder and fail-closed reconciliation**

Build the executed order set from `selected_execution.input_snapshot`, period and manifesto; index canonical cycles by day; emit arrival then allocation events in stable order; derive every trigger predicate; compute open balances and aggregates with `Decimal`; validate conservation by order/cycle/global and reconcile totals with `AgregadoDTO`. Compute `result_fingerprint` from canonical JSON of the selected result.

- [x] **Step 7: Write and satisfy decomposition tests**

```python
def test_segments_keep_intra_client_phase_before_multilateral():
    segments = decompor_fluxos(cycle_with_both_origins(), orders_by_id())
    assert [segment.matching_origin for segment in segments] == [
        "INTRA_CLIENTE", "INTER_CLIENTE",
    ]
    assert sum(segment.value_brl for segment in segments) == Decimal("70")
    assert segments[0].out_order_id.startswith("same-client")
```

The function groups intra-client allocations by client and pairs EDF queues inside each client, then pairs residual inter-client allocations globally. It never reads cost or invents a persisted counterparty.

- [x] **Step 8: Write failing authenticated HTTP tests**

Cover valid POST, missing/invalid token, future version, malformed envelope, request/response size and `REPLAY_INCONSISTENTE`. Prove the endpoint succeeds using only the supplied persisted envelope after the executor job is absent.

- [x] **Step 9: Implement and register `POST /api/v1/replays`**

Reuse `require_user`, limited streaming input and public `ApiFailure`; cap request and response at 8 MiB. Add the endpoint to `create_schema_app()` and the runtime router.

- [x] **Step 10: Regenerate and verify public schemas**

Run:

```powershell
.venv-t5/Scripts/python.exe -m servidor.export_openapi
cd web
npm run generate:api
npm run typecheck
```

Expected: generated TypeScript exposes `ReplayRequestV1` and `ReplayDocumentV1`; AJV exports `validateReplayRequest` and `validateReplayDocument`.

- [x] **Step 11: Verify MOT-86 and commit**

Run focused Python tests plus `tests/web_api/test_openapi.py`, update the Diário with symptom/cause/change/invalidation, then commit:

```text
feat: publica contrato temporal reconciliado do replay (MOT-86)
```

---

### Task 2: MOT-87 — Cliente, estado determinístico, controles e rota

**Files:**
- Modify: `web/src/api/client.ts`
- Create: `web/src/replay/domain.ts`
- Create: `web/src/replay/state.ts`
- Create: `web/src/replay/useReplayPlayback.ts`
- Create: `web/src/replay/ReplayPage.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/pages/StudyDiagnosticPage.tsx`
- Modify: `web/src/diagnostics/components/SelectedExecution.tsx`
- Test: `web/src/api/client.test.ts`
- Test: `web/src/replay/state.test.ts`
- Test: `web/src/replay/useReplayPlayback.test.tsx`
- Test: `web/src/replay/ReplayPage.test.tsx`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: generated `ReplayRequestV1`/`ReplayDocumentV1`, local `DiagnosticExecutionRecord`.
- Produces: `ApiClient.buildReplay`, `replayStateAt`, `replayTransition`, `nextClosingDay`, `useReplayPlayback`, route `/estudos/:studyId/replay?executionId=...`.

- [x] **Step 1: Write failing API and state tests**

```ts
it('posts the locally persisted diagnostic envelope instead of reading an expired job', async () => {
  const document = await client.buildReplay(replayRequestFixture());
  expect(fetch).toHaveBeenCalledWith('/api/v1/replays', expect.objectContaining({ method: 'POST' }));
  expect(document.diagnostic_execution_id).toBe(localExecutionId);
});

it('produces identical state by direct selection and sequential navigation', () => {
  expect(replayStateAt(document, 9)).toEqual(reduceSequentially(document, 9));
  expect(replayStateAt(document, 3)).toEqual(replayStateAt(structuredClone(document), 3));
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npm run test:unit -- src/api/client.test.ts src/replay/state.test.ts`

- [x] **Step 3: Implement typed client and pure state**

Use generated types and AJV. `replayStateAt` validates day bounds, replays explicit arrivals/allocations with `Decimal`, checks its sums against the published `end_state`, and returns immutable visible orders. `replayTransition` emits arrival, closing, segment, balance, remittance and settlement commands without feeding values back into state.

- [x] **Step 4: Test and implement playback lifecycle**

Use fake timers to prove play/pause, 1×/2×/4×, previous/next, direct day, next closing, repeat and restart. Each effect owns one timeout and clears it when paused, document identity changes, direct navigation occurs or the component unmounts. Late replay responses are ignored with `AbortController` plus an identity token.

- [x] **Step 5: Test and implement the route**

The page loads the Study from the owner-scoped repository, resolves the local execution, requires `DIAGNOSTIC/SUCCEEDED` with an envelope, posts it to `buildReplay`, and renders explicit unavailable/incompatible/inconsistent states with a return link to the diagnostic. Reload resolves the same URL again. Add an “Abrir Replay” link beside the selected execution.

- [x] **Step 6: Verify MOT-87 and commit**

Run focused unit tests, router tests and typecheck; update the Diário; commit:

```text
feat: adiciona estado determinístico e rota do replay (MOT-87)
```

---

### Task 3: MOT-88 — Cena Fronteira Viva e transições por evento

**Files:**
- Create: `web/src/replay/components/ReplayControls.tsx`
- Create: `web/src/replay/components/ReplayMetrics.tsx`
- Create: `web/src/replay/components/ReplayStage.tsx`
- Create: `web/src/replay/components/ReplayOrderCard.tsx`
- Create: `web/src/replay/components/ReplayConnections.tsx`
- Create: `web/src/replay/components/ReplayJournal.tsx`
- Create: `web/src/replay/geometry.ts`
- Create: `web/src/replay/presentation.ts`
- Create tests beside the modules above.
- Modify: `web/src/replay/ReplayPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: `ReplayState`, `ReplayVisualTransition[]`, playback actions.
- Produces: accessible event-driven React/SVG scene and factual journal.

- [x] **Step 1: Write failing component and presentation tests**

Assert cards expose ID/client/open value/deadline/cohort; partial allocations retain the exact balance; zero-balance cards remain through the current readable transition then leave; empty days have no operational animation; journal values equal scene values; labels distinguish position from two-sided measured contribution.

- [x] **Step 2: Run tests and verify RED**

Run: `npm run test:unit -- src/replay`

- [x] **Step 3: Implement controls, metrics and journal**

Follow the approved visual rhythm: kicker/title, compact transport controls, full-width timeline, three headline metrics, ordering toggle, stage and journal. Keep 5A–5C controls absent.

- [x] **Step 4: Implement the Brazil/CNR/Exterior scene**

Render OUT on the Brazil side and IN on the Exterior side; center the CNR/frontier; preserve stable keys and queue order. Use CSS grid/flex for card lanes and one SVG overlay for current closing segments/remittances.

- [x] **Step 5: Implement anchored geometry and event sequencing**

`geometry.ts` receives current card/stage rectangles and returns paths. A layout effect measures after cards settle, and `ResizeObserver` recalculates on resize. The transition runner sequences arrivals, closing, phase-aware segments, balance changes, remittances and exits; jumps/back/reload render final state without replaying intermediates. Reduced motion applies final states immediately.

- [x] **Step 6: Verify accessibility and MOT-88 commit**

Run component tests and typecheck; inspect keyboard focus order and 200% layout; update the Diário; commit:

```text
feat: implementa cena fronteira viva orientada a eventos (MOT-88)
```

---

### Task 4: MOT-89 — Integração, visual, orçamento e aceite

**Files:**
- Create: `web/e2e/stage5-replay.spec.ts`
- Modify: `web/src/e2eBridge.ts`
- Create: `tests/web_api/measure_replay.py`
- Create: `docs/frontend/etapa-5-replay-operacao.md`
- Create: `docs/frontend/etapa-5-replay-aceitacao.md`
- Create visual evidence under `docs/frontend/evidencias/`
- Modify: `docs/MAPA.md`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: complete Replay vertical slice.
- Produces: reproducible E2E, measured limits, visual captures, operation and acceptance records.

- [x] **Step 1: Write failing E2E for observed and synthetic Studies**

Seed public/non-private fixtures from Stage 4. Open Replay through the selected execution; verify arrival, simultaneous closing triggers, partial balance, both remittance directions, empty day, pause, next closing, direct jump, back and reload determinism. Repeat with observed-input and generated-hypothesis records.

- [x] **Step 2: Run E2E and verify RED**

Run: `npm run test:e2e -- stage5-replay.spec.ts`

- [x] **Step 3: Complete fixture bridge and visual assertions**

Expose only deterministic test seeding already used by E2E. Capture 1280×800 initial, arrival, partial closing, OUT remittance, IN remittance and final states; also inspect 640 CSS px equivalence for 200% zoom and one narrow viewport without global horizontal overflow.

- [x] **Step 4: Measure the real 1.000 × 365 budget**

Build a deterministic request at the public contract limit, run `construir_replay` repeatedly, record p50/max builder duration, serialized request/response bytes, event/segment counts and browser direct-state timing. If either document exceeds 8 MiB or direct reconstruction exceeds the documented internal-test budget, report the measured lower supported limit instead of claiming 1.000 × 365.

- [x] **Step 5: Run the complete proportional gate**

Run:

```powershell
.venv-t5/Scripts/python.exe -m pytest -q
.venv-t5/Scripts/python.exe -O -m pytest -q
cd web
npm run test:unit
npm run lint
npm run typecheck
npm run build
npm run test:e2e -- stage5-replay.spec.ts
```

Repeat the new E2E twice. Run the Amanda scenario only if the adapter/result code changed beyond the additive Replay transformation; do not run the 27.000-simulation sweep.

- [x] **Step 6: Browser QA and systemic audit**

Open the built app with the local server, test every control in a real browser, inspect line/card anchoring during resize, console errors, empty/final days, reduced motion and reload. Audit contract identity, measured-cohort math, late-response cancellation and Stage 1–4 regressions; fix every material finding with a red-green regression test.

- [x] **Step 7: Document operation, acceptance and future evolutions**

Record exact commands, evidence hashes, measured budget, known limitations and the explicit future scope: 5A selection/inspection, 5B synchronized baseline, 5C presentation/scale/export.

- [x] **Step 8: Verify MOT-89 and commit**

Update MAPA, testing and Diário in the same commit; commit:

```text
test: fecha integração e aceite do replay temporal (MOT-89)
```
