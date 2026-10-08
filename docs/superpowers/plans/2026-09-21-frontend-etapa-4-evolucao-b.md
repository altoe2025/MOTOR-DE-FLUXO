# Front-end — Etapa 4, Evolução B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir hipóteses sintéticas com composição e parâmetros por participante, persistidas em V3 e comparáveis pelos sete eixos existentes.

**Architecture:** Um delta tipado e puro materializa a composição-alvo; a página orquestra no máximo uma preparação e persiste evidência mais cenário em uma única revisão CAS. A comparação passa a aceitar diferenças estruturais declaradas, mantendo o diagnóstico agregado e as limitações explícitas.

**Tech Stack:** TypeScript 5.9, React 19, Vitest, Testing Library, Playwright, IndexedDB e API de preparação v1 existente.

**Spec:** `docs/superpowers/specs/2026-09-21-frontend-etapa-4-evolucao-b-design.md`

## Global Constraints

- Não alterar `motor/`, P0, EDF, regras regulatórias, schemas HTTP, API gerada ou migrations.
- Manter `StudyDocument` V3; não introduzir Receita, V4 ou ancestralidade persistida.
- `ApplicationRepository` continua como única porta de persistência e CAS continua sendo a autoridade entre abas.
- A base, seus snapshots, fingerprints e execuções permanecem imutáveis.
- Perfis e ordens derivados de Perfil continuam evidência histórica `SYNTHETIC`, não forecast.
- Composição final entre 1 e 100 participantes; Perfil/fingerprint, empresa e participante são únicos.
- IOF por finalidade nunca participa da prioridade EDF.
- Não usar linguagem causal, “efeito marginal” ou benefício individual.
- Preservar o caminho observado do MVP: somente janela e sete custos escalares.

---

### Task 1: MOT-82 — Domínio e materialização da composição

**Files:**
- Create: `web/src/hypotheses/composition.ts`
- Create: `web/src/hypotheses/composition.test.ts`
- Modify: `web/src/hypotheses/hypothesis.ts`
- Modify: `web/src/hypotheses/hypothesis.test.ts`
- Modify: `web/src/study/domain.ts`
- Modify: `web/src/study/domain.test.ts`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: `deriveProfileMvpParticipant`, `assertExactEffectiveSources`, `appendScenario`, `attachOperationalProfileEvidence` e `fingerprintPortfolioSource` existentes.
- Produces: `CompositionHypothesisDraft`, `CompositionMaterialization`, `materializeCompositionDraft()` e `appendCompositionHypothesis()`.

- [ ] **Step 1: Integrar as duas bases exigidas**

```powershell
git merge-base --is-ancestor 7ac9536 HEAD
git merge --no-edit origin/main
git merge-base --is-ancestor d612767 HEAD
```

Expected: os dois comandos `merge-base` retornam código 0 e o merge não altera regras do motor.

- [ ] **Step 2: Escrever os testes RED do delta estrutural**

```ts
it('preserva identidade e seed do mantido, remove um e adiciona outro Perfil', async () => {
  const result = await materializeCompositionDraft({
    base, evidenceProfiles: [profileA, profileB, profileC], recordedAt,
    draft: {
      kind: 'PROFILE_COMPOSITION', name: 'Troca B por C',
      participantChanges: [
        { kind: 'REMOVE_PARTICIPANT', participantId: participantB.id },
        { kind: 'ADD_PROFILE', profile: profileC, explicit: explicitC },
        { kind: 'UPDATE_PARTICIPANT', participantId: participantA.id,
          patch: { monthlyVolumeBrl: '2500000', purposeOut: 'SERVICOS' } },
      ],
      windowDays: 7, costs: base.premises.costs,
    },
  });
  expect(result.input.participants.find((p) => p.id === participantA.id)?.seed)
    .toBe(participantA.seed);
  expect(result.diff.removed).toHaveLength(1);
  expect(result.diff.added).toHaveLength(1);
});
```

Add parameterized cases for empty/over-100 composition, duplicate participant/Profile/company, owner mismatch, unavailable profile, empty patch and contradictory operations.

- [ ] **Step 3: Confirmar a falha pelo motivo esperado**

```powershell
Set-Location web
npm run test:unit -- src/hypotheses/composition.test.ts
```

Expected: FAIL porque `composition.ts` e suas exports ainda não existem.

- [ ] **Step 4: Implementar os contratos e a materialização pura**

```ts
export type CompositionHypothesisDraft = Readonly<{
  kind: 'PROFILE_COMPOSITION';
  name: string;
  participantChanges: readonly CompositionParticipantChange[];
  windowDays: number;
  costs: CostPremises;
}>;

export type CompositionMaterialization = Readonly<{
  input: EffectiveInput;
  profilesToAttach: readonly OperationalProfileVersion[];
  diff: CompositionInputDiff;
  requiresPreparation: boolean;
}>;

export type CompositionDraftErrorCode =
  | 'EMPTY_COMPOSITION' | 'DUPLICATE_PROFILE' | 'DUPLICATE_COMPANY'
  | 'DUPLICATE_PARTICIPANT' | 'UNKNOWN_PARTICIPANT'
  | 'CONTRADICTORY_CHANGE' | 'INVALID_PARTICIPANT_PATCH'
  | 'PROFILE_UNAVAILABLE' | 'OWNER_MISMATCH' | 'IOF_RULE_DUPLICATE'
  | 'UNDECLARED_CHANGE' | 'INCOMPATIBLE_COMPOSITION';

export async function materializeCompositionDraft(
  input: MaterializeCompositionDraftInput,
): Promise<CompositionMaterialization> {
  validateClosedDraft(input.draft);
  const target = await applyParticipantChanges(input);
  assertCompositionInvariants(target);
  assertExactEffectiveSources(target.input);
  return deepFreeze(target);
}
```

Use `Decimal` and the canonicalização já empregada em `hypothesis.ts`; derive participantes adicionados por `deriveProfileMvpParticipant`; remova sources do participante removido e crie `ESTIMATIVA_USUARIO` somente para paths alterados.

- [ ] **Step 5: Testar reutilização de ordens e IOF**

```ts
it('reutiliza ordens mas atualiza generationInputSnapshot para custo e IOF', async () => {
  const materialized = await materializeCompositionDraft(costOnlyInput);
  expect(materialized.requiresPreparation).toBe(false);
  const snapshot = await buildCompositionSourceSnapshot(base.sourceSnapshot, materialized, recordedAt);
  expect(snapshot.orders).toEqual(base.sourceSnapshot.orders);
  expect(snapshot.generationInputSnapshot?.costs.iof_por_finalidade)
    .toEqual(costOnlyInput.draft.costs.iof_por_finalidade);
  expect(snapshot.generationInputSnapshot?.sources)
    .toHaveProperty('/costs/iof_por_finalidade/SERVICOS/OUT');
});
```

Expected: janela/custos retornam `requiresPreparation: false`; composição ou campo de geração retorna `true`.

- [ ] **Step 6: Implementar a transição atômica do Estudo**

```ts
export async function appendCompositionHypothesis(
  study: StudyDocumentV3,
  input: Readonly<{
    scenario: ScenarioDraft;
    profiles: readonly OperationalProfileVersion[];
    recordedAt: string;
  }>,
): Promise<StudyDocumentV3> {
  const evidence = await mergeOperationalProfileEvidence(study, input.profiles, input.recordedAt);
  return appendScenarioInSameRevision(evidence, input.scenario, input.recordedAt);
}
```

The public operation must call `finalize()` once, increment revision once and reject the whole operation before returning when any evidence or scenario is invalid.

- [ ] **Step 7: Rodar o gate de MOT-82**

```powershell
Set-Location web
npm run test:unit -- src/hypotheses/composition.test.ts src/hypotheses/hypothesis.test.ts src/study/domain.test.ts
npm run typecheck
npm run lint
```

Expected: todos os comandos passam.

- [ ] **Step 8: Registrar e commitar**

Add a top diary entry describing the symptom, cause, change and invalidations, then run:

```powershell
git add web/src/hypotheses/composition.ts web/src/hypotheses/composition.test.ts web/src/hypotheses/hypothesis.ts web/src/hypotheses/hypothesis.test.ts web/src/study/domain.ts web/src/study/domain.test.ts docs/DIARIO-DE-MUDANCAS.md
git commit -m "feat: materializa composição de hipóteses por participante (MOT-82)"
```

---

### Task 2: MOT-83 — Construtor de composição e participantes

**Files:**
- Create: `web/src/hypotheses/components/CompositionHypothesisBuilder.tsx`
- Create: `web/src/hypotheses/components/CompositionHypothesisBuilder.test.tsx`
- Modify: `web/src/hypotheses/components/HypothesisBuilder.tsx`
- Modify: `web/src/hypotheses/components/HypothesisBuilder.test.tsx`
- Modify: `web/src/pages/StudyPortfolioPage.tsx`
- Modify: `web/src/pages/previewFlow.test.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: `CompositionHypothesisDraft`, `materializeCompositionDraft()` e `appendCompositionHypothesis()` de MOT-82; `StudyController.listOperationalProfileVersions()` e `flush()` existentes.
- Produces: `CompositionHypothesisBuilder` e fluxo de página com no máximo uma chamada de preparação.

- [ ] **Step 1: Escrever os testes RED do construtor**

```tsx
it('remove, adiciona e altera somente o participante selecionado', async () => {
  render(<CompositionHypothesisBuilder baseScenario={base} availableProfiles={profiles}
    onCreate={onCreate} />);
  await user.click(screen.getByRole('button', { name: /remover empresa b/i }));
  await user.selectOptions(screen.getByLabelText(/adicionar perfil/i), profileC.id);
  await user.clear(screen.getByLabelText(/volume mensal — empresa a/i));
  await user.type(screen.getByLabelText(/volume mensal — empresa a/i), '2500000');
  await user.click(screen.getByRole('button', { name: /criar hipótese/i }));
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'PROFILE_COMPOSITION',
    participantChanges: expect.arrayContaining([
      expect.objectContaining({ kind: 'REMOVE_PARTICIPANT' }),
      expect.objectContaining({ kind: 'ADD_PROFILE' }),
      expect.objectContaining({ kind: 'UPDATE_PARTICIPANT' }),
    ]),
  }));
});
```

Add cases for empty name, no change, invalid IOF duplicate, retry preserving fields, keyboard labels and regeneration notice.

- [ ] **Step 2: Confirmar o RED**

```powershell
Set-Location web
npm run test:unit -- src/hypotheses/components/CompositionHypothesisBuilder.test.tsx
```

Expected: FAIL porque o componente ainda não existe.

- [ ] **Step 3: Implementar o componente em três áreas**

```tsx
export function CompositionHypothesisBuilder(props: Props) {
  const [draft, setDraft] = useState(() => draftFromBase(props.baseScenario));
  const validation = useMemo(() => validateCompositionUiDraft(draft), [draft]);
  return <section aria-labelledby="composition-hypothesis-title">
    <h2 id="composition-hypothesis-title">Criar hipótese de composição</h2>
    <CompositionEditor value={draft} profiles={props.availableProfiles} onChange={setDraft} />
    <ParticipantEditors value={draft} onChange={setDraft} />
    <CommonPremisesEditor value={draft} onChange={setDraft} />
    <CompositionChangeSummary draft={draft} />
    <Button disabled={!validation.ok || props.submitting}
      onClick={() => void props.onCreate(toDomainDraft(draft))}>Criar hipótese</Button>
  </section>;
}

function CompositionEditor(props: CompositionEditorProps): ReactNode;
function ParticipantEditors(props: ParticipantEditorsProps): ReactNode;
function CommonPremisesEditor(props: CommonPremisesEditorProps): ReactNode;
function CompositionChangeSummary(props: { draft: CompositionUiDraft }): ReactNode;
```

Implement these four private render functions in the same file; each receives controlled
values and emits a complete `CompositionUiDraft`. Keep the observed branch in
`HypothesisBuilder`; route only `isProfileMvpScenario(baseScenario)` to the new component.

- [ ] **Step 4: Orquestrar a preparação e um único CAS na página**

```ts
const materialized = await materializeCompositionDraft({
  base: selectedBase, evidenceProfiles: availableProfiles, draft, recordedAt,
});
const sourceSnapshot = materialized.requiresPreparation
  ? await prepareCompositionOnce(materialized.input, hypothesisId)
  : await buildCompositionSourceSnapshot(selectedBase.sourceSnapshot, materialized, recordedAt);
const next = await appendCompositionHypothesis(study, {
  scenario: buildCompositionScenarioDraft(selectedBase, draft, sourceSnapshot, hypothesisId, recordedAt),
  profiles: materialized.profilesToAttach,
  recordedAt,
});
controller.edit(next);
await controller.flush();
```

Load profiles through `controller.listOperationalProfileVersions()` in the page effect. Preserve `pendingHypothesisId` and the draft when preparation, CAS or navigation fails.

- [ ] **Step 5: Provar contagem de preparação, retry e acessibilidade**

```tsx
expect(api.preparePortfolio).toHaveBeenCalledTimes(1);
expect(controller.snapshot.document?.revision).toBe(previousRevision + 1);
expect(screen.getByRole('alert')).toHaveTextContent(/conflito/i);
expect(screen.getByLabelText(/volume mensal — empresa a/i)).toHaveValue(2500000);
```

Run the cost-only variant with `expect(api.preparePortfolio).not.toHaveBeenCalled()`.

- [ ] **Step 6: Rodar o gate de MOT-83**

```powershell
Set-Location web
npm run test:unit -- src/hypotheses/components/CompositionHypothesisBuilder.test.tsx src/hypotheses/components/HypothesisBuilder.test.tsx src/pages/previewFlow.test.tsx
npm run lint
npm run typecheck
npm run build
```

Expected: todos os comandos passam.

- [ ] **Step 7: Registrar e commitar**

```powershell
git add web/src/hypotheses/components web/src/pages/StudyPortfolioPage.tsx web/src/pages/previewFlow.test.tsx web/src/styles/global.css docs/DIARIO-DE-MUDANCAS.md
git commit -m "feat: cria hipóteses com composição editável (MOT-83)"
```

---

### Task 3: MOT-84 — Compatibilidade estrutural e comparação

**Files:**
- Modify: `web/src/hypotheses/comparison.ts`
- Modify: `web/src/hypotheses/comparison.test.ts`
- Modify: `web/src/hypotheses/components/ScenarioComparison.tsx`
- Modify: `web/src/hypotheses/components/ScenarioComparison.test.tsx`
- Modify: `web/src/pages/StudyComparisonPage.tsx`
- Modify: `web/src/pages/StudyComparisonPage.test.tsx`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: V3 full snapshots and successful `DiagnosticExecutionRecord` objects.
- Produces: `CompositionCompatibilityReport`, expanded `MvpInputChange` and a comparison view ordered as input diff then seven axes.

- [ ] **Step 1: Escrever os testes RED do relatório estrutural**

```ts
it('classifica participantes mantidos, adicionados, removidos e modificados', () => {
  const result = compareMvpDiagnostics(baseExecution, changedCompositionExecution);
  expect(result).toMatchObject({ ok: true, value: {
    compatibility: {
      status: 'COMPARABLE', maintained: [{ participantId: participantA.id }],
      added: [{ participantId: participantC.id }],
      removed: [{ participantId: participantB.id }],
      modified: [{ participantId: participantA.id }],
    },
    limitations: ['COMPOSITION_CHANGED', 'UNPAIRED_DIAGNOSTICS'],
  }});
});
```

Add cases for reused participant ID with another profile, common profile fingerprint mismatch, seed mismatch, version/horizon mismatch, stale execution and undeclared change.

- [ ] **Step 2: Confirmar o RED**

```powershell
Set-Location web
npm run test:unit -- src/hypotheses/comparison.test.ts
```

Expected: FAIL porque composições distintas ainda são incompatíveis.

- [ ] **Step 3: Implementar compatibilidade e diff determinísticos**

```ts
export type CompositionCompatibilityReport = Readonly<{
  status: 'COMPARABLE' | 'INCOMPATIBLE';
  maintained: readonly ParticipantPair[];
  added: readonly ParticipantSnapshot[];
  removed: readonly ParticipantSnapshot[];
  modified: readonly ParticipantDifference[];
  blockers: readonly CompositionCompatibilityBlocker[];
}>;

export function compareCompositionInputs(
  base: EffectiveInput,
  hypothesis: EffectiveInput,
): CompositionCompatibilityReport {
  const pairs = pairByStableParticipantIdentity(base, hypothesis);
  return classifyAndValidatePairs(pairs, base, hypothesis);
}

function pairByStableParticipantIdentity(
  base: EffectiveInput,
  hypothesis: EffectiveInput,
): StableParticipantPairs;

function classifyAndValidatePairs(
  pairs: StableParticipantPairs,
  base: EffectiveInput,
  hypothesis: EffectiveInput,
): CompositionCompatibilityReport;
```

Sort every participant collection by stable ID. Reject profile identity reuse and undeclared changes. Add `PARTICIPANT_ADDED`, `PARTICIPANT_REMOVED`, `PARTICIPANT_UPDATED` and `IOF_RULE` to `MvpInputChange['code']`.

- [ ] **Step 4: Renderizar o diff antes dos sete eixos**

```tsx
<section aria-labelledby="comparison-composition-title">
  <h2 id="comparison-composition-title">Mudanças na composição</h2>
  <ParticipantDifferenceTable report={comparison.compatibility} />
</section>
<section aria-labelledby="comparison-inputs-title">
  <h2 id="comparison-inputs-title">Entradas alteradas</h2>
  <InputChanges changes={comparison.inputChanges} />
</section>
{renderSevenAxes(comparison.axes)}
```

Render unavailable values as “Indisponível” with their reason; never coerce to zero. Map limitation codes to explanatory Portuguese copy without using causal or marginal language.

- [ ] **Step 5: Rodar o gate de MOT-84**

```powershell
Set-Location web
npm run test:unit -- src/hypotheses/comparison.test.ts src/hypotheses/components/ScenarioComparison.test.tsx src/pages/StudyComparisonPage.test.tsx
npm run lint
npm run typecheck
npm run build
```

Expected: todos os comandos passam and the DOM order test finds composition before `1. Potencial estrutural`.

- [ ] **Step 6: Registrar e commitar**

```powershell
git add web/src/hypotheses/comparison.ts web/src/hypotheses/comparison.test.ts web/src/hypotheses/components/ScenarioComparison.tsx web/src/hypotheses/components/ScenarioComparison.test.tsx web/src/pages/StudyComparisonPage.tsx web/src/pages/StudyComparisonPage.test.tsx docs/DIARIO-DE-MUDANCAS.md
git commit -m "feat: compara cenários com composições distintas (MOT-84)"
```

---

### Task 4: MOT-85 — Integração, E2E e aceite

**Files:**
- Create: `web/e2e/stage4-evolution-b.spec.ts`
- Modify: `web/src/e2eBridge.ts`
- Create: `docs/frontend/etapa-4-evolucao-b-aceitacao.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/testing.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: fluxo vertical entregue por MOT-82–MOT-84.
- Produces: evidência reprodutível de aceite interno e documentação da fronteira B/A/C.

- [ ] **Step 1: Escrever o E2E RED do fluxo vertical**

```ts
test('cria duas hipóteses, muda composição, executa, compara e recarrega', async ({ page }) => {
  const study = await seedEvolutionBStudy(page, { profileCount: 3 });
  await page.goto(`/carteira/${study.id}`);
  await createNamedHypothesis(page, 'Troca B por C', {
    removeCompany: 'Empresa B', addCompany: 'Empresa C',
    updateCompany: 'Empresa A', monthlyVolumeBrl: '2500000',
  });
  await createNamedHypothesis(page, 'Finalidades alternativas', {
    updateCompany: 'Empresa A', purposeOut: 'SERVICOS', purposeIn: 'EXPORTACAO',
  });
  await executeAndCompare(page, 'Cenário base por Perfil', 'Troca B por C');
  await expect(page.getByText('COMPOSITION_CHANGED')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Troca B por C')).toBeVisible();
  await expect(page.getByText('Finalidades alternativas')).toBeVisible();
});
```

Add a two-page CAS case that asserts one save wins and the losing form retains its values.

- [ ] **Step 2: Confirmar coleta e RED**

```powershell
Set-Location web
npx playwright test e2e/stage4-evolution-b.spec.ts --project=local --list
npx playwright test e2e/stage4-evolution-b.spec.ts --project=local
```

Expected: the file is collected and fails at the first missing Evolution B behavior.

- [ ] **Step 3: Completar somente fixtures e correções de integração**

Expose deterministic setup through `e2eBridge.ts` using existing repository/controller APIs. Do not bypass validation, write IndexedDB directly from the test or add product behavior only for E2E.

- [ ] **Step 4: Rodar o gate proporcional**

```powershell
Set-Location web
npm run test:unit
npm run lint
npm run typecheck
npm run build
npx playwright test e2e/stage4-evolution-b.spec.ts --project=local
npx playwright test e2e/stage4-evolution-b.spec.ts --project=local
Set-Location ..
pytest tests/web_api/test_preparation_contracts.py tests/web_api/test_preparation_http.py -q
python -m motor motor/cenarios/exemplo_amanda.yaml
```

Expected: all commands pass; Amanda remains approximately baseline US$439k, netted US$249k, savings US$190k and netability 58.82%.

- [ ] **Step 5: Registrar o aceite e a evolução futura**

In `etapa-4-evolucao-b-aceitacao.md`, record commit SHA, browser, commands, counts and results. State explicitly:

```markdown
Entregue em B: composição variável, edição individual, múltiplas hipóteses e comparação estrutural agregada.
Posterior em A: Receita, V4 e linhagem formal somente para relações criadas pelo novo contrato.
Posterior em C: repetições pareadas, incerteza, marginal e escala.
```

- [ ] **Step 6: Revisar o diff e commitar**

```powershell
git diff --check
git status --short
git add web/e2e/stage4-evolution-b.spec.ts web/src/e2eBridge.ts docs/frontend/etapa-4-evolucao-b-aceitacao.md docs/MAPA.md docs/testing.md docs/DIARIO-DE-MUDANCAS.md
git commit -m "test: fecha aceite da evolução B da etapa 4 (MOT-85)"
```

Expected: no unplanned files, no backend/motor/schema changes and a clean worktree after commit.
