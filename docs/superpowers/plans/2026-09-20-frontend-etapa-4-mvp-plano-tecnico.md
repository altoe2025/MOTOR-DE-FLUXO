# Front-end Etapa 4 MVP de quatro dias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em até quatro dias úteis dois fluxos testáveis — hipótese sobre carteira observada e hipótese sobre simulação derivada de Perfis — com execução pelo diagnóstico existente e comparação agregada nos sete eixos.

**Architecture:** O MVP altera apenas o front-end de `origin/main`. Casos observados continuam usando `OBSERVED_CASE`; simulações por Perfil compilam localmente o `EffectiveInput` e reutilizam `/api/v1/preparacoes`. Hipóteses são novos cenários V3 imutáveis, e a comparação é um módulo TypeScript puro que consome diagnósticos terminais já calculados pelo servidor.

**Tech Stack:** React 19, TypeScript 5.9, Decimal.js, React Router 7, Vitest, Testing Library, Playwright, IndexedDB/repositório e APIs FastAPI já existentes.

**Spec:** `docs/superpowers/specs/2026-09-20-frontend-etapa-4-mvp-design.md`

## Global Constraints

- Prazo máximo: quatro dias úteis; não ampliar escopo durante a execução.
- Não modificar `motor/`, `servidor/`, OpenAPI, schemas gerados ou regras regulatórias.
- Não criar `StudyDocument` V4, migration, store, endpoint ou contrato HTTP.
- Dados observados nunca são alterados; hipótese observada muda somente janela e os
  sete custos escalares; `iof_por_finalidade` fica congelado.
- Hipótese baseada em Perfil pode mudar globalmente volume, mix, ticket, prazo, janela e as sete premissas escalares de custo; `iof_por_finalidade` fica congelado.
- Perfis, participantes, seeds, arquétipos, eFX, finalidades, horizonte e versões ficam congelados entre base e hipótese.
- Perfil é evidência real agregada; ordens geradas são sempre identificadas como sintéticas.
- Comparação é `hipótese − base`; não usar “efeito marginal”, “causa”, “previsão” ou “benefício individual”.
- Métrica indisponível permanece indisponível; nunca converter ausência em zero.
- `ApplicationRepository` e `StudyController` continuam sendo as únicas portas de persistência.
- A execução usa o diagnóstico da Etapa 3; nenhum cálculo de netting ou custo entra na UI.
- Um único commit final exige ID Linear real que corresponda a
  `^MOT-[1-9][0-9]*$`. Como este planejamento não autoriza criar issues, a execução
  deve obter esse ID no preflight; T1–T3 terminam em checkpoints de teste, sem
  commits parciais.

---

## 1. Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `web/src/hypotheses/profileMvp.ts` | derivar valores dos Perfis e montar `PreparationRequest` válida |
| `web/src/hypotheses/profileMvp.test.ts` | ausência, aritmética decimal, múltiplos Perfis e proveniência textual |
| `web/src/hypotheses/hypothesis.ts` | aplicar os dois tipos de hipótese sem mutar base nem campos congelados |
| `web/src/hypotheses/hypothesis.test.ts` | matriz dos seis grupos e invariantes observado/simulado |
| `web/src/hypotheses/comparison.ts` | validar compatibilidade e calcular deltas de resultados canônicos |
| `web/src/hypotheses/comparison.test.ts` | sete eixos, p50 descritivo, indisponibilidade e bloqueios |
| `web/src/hypotheses/components/ProfileScenarioBuilder.tsx` | selecionar Perfis anexados, completar lacunas e preparar base sintética |
| `web/src/hypotheses/components/HypothesisBuilder.tsx` | formulário restrito conforme a origem e prévia de mudanças |
| `web/src/hypotheses/components/ScenarioComparison.tsx` | tabela/gráfico acessíveis de base, hipótese e delta |
| `web/src/pages/StudyComparisonPage.tsx` | selecionar dois diagnósticos terminais e orquestrar a comparação |
| `web/src/study/domain.ts` | acrescentar cenário V3 imutável ao estudo |
| `web/src/study/fingerprints.ts` | incluir proveniência por ordem somente nos novos snapshots sintéticos que a possuem |
| `web/src/preparation/resolvePortfolioSource.ts` | associar proveniência por ordem às carteiras sintéticas heterogêneas |
| `web/src/preparation/buildPreviewRequest.test.ts` | provar que a associação por ordem elimina o fallback agregado ambíguo |
| `web/src/pages/StudyPortfolioPage.tsx` | integrar preparação por Perfil, criação de hipótese e links de execução |
| `web/src/pages/StudyDiagnosticPage.tsx` | executar o cenário indicado pela rota, não apenas o cenário-base |
| `web/src/app/router.tsx` | rotas de diagnóstico por cenário e comparação por estudo |
| `web/src/styles/global.css` | layout responsivo dos novos formulários e tabelas |
| `web/src/e2eBridge.ts` | somente os hooks determinísticos necessários aos dois E2E |
| `web/e2e/stage4-mvp.spec.ts` | fluxos observado e simulado ponta a ponta |
| `web/playwright.config.ts` | incluir `stage4-mvp.spec.ts` no projeto local existente |
| `docs/frontend/etapa-4-mvp-operacao.md` | uso, limitações e recuperação de erro |
| `docs/frontend/etapa-4-mvp-aceitacao.md` | comandos, SHA e evidências do aceite |

Não criar arquivos em `servidor/`, `motor/`, `web/src/storage/` ou `web/src/api/`.

## 2. Interfaces compartilhadas

T1 publica estas interfaces; T2 e T3 somente as consomem:

```ts
type ProfileMvpBlockerCode =
  | 'METRIC_UNAVAILABLE'
  | 'INVALID_COVERAGE'
  | 'INVALID_DECIMAL'
  | 'MISSING_EXPLICIT_FIELD'
  | 'INVALID_PROFILE'
  | 'INCOMPATIBLE_PROFILE'
  | 'OWNER_MISMATCH'
  | 'DUPLICATE_COMPANY'
  | 'EMPTY_SELECTION'
  | 'TOO_MANY_PROFILES';

type ProfileMvpParticipantDraft = Readonly<{
  profileId: string;
  companyId: string;
  profileFingerprint: string;
  participantId: string;
  monthlyVolumeBrl: string;
  ticketMedianBrl: string;
  outFraction: string;
  generatorProfile: EffectiveParticipant['profile'];
  seed: EffectiveParticipant['seed'];
  deadline: EffectiveParticipant['deadline'];
  efx: boolean;
  purposeOut: string;
  purposeIn: string;
}>;

type ProfileMvpExplicitFields = Readonly<{
  participantId: string;
  generatorProfile: EffectiveParticipant['profile'];
  seed: EffectiveParticipant['seed'];
  deadline: EffectiveParticipant['deadline'];
  efx: boolean;
  purposeOut: string;
  purposeIn: string;
}>;

type ProfileMvpDerivation =
  | Readonly<{ ok: true; value: ProfileMvpParticipantDraft }>
  | Readonly<{ ok: false; blockers: readonly Readonly<{
      code: ProfileMvpBlockerCode; path: string; message: string;
    }>[] }>;

type MvpScalarCostDraft = Readonly<Pick<CostPremises,
  | 'iof_out' | 'iof_in' | 'carry_cnr' | 'spread_rail_bps'
  | 'custo_fixo_remessa' | 'custo_oportunidade_aa' | 'ptax'>>;

type ObservedHypothesisDraft = Readonly<{
  kind: 'OBSERVED';
  name: string;
  windowDays: number;
  costs: MvpScalarCostDraft;
}>;

type ProfileHypothesisDraft = Readonly<{
  kind: 'PROFILE_SIMULATION';
  name: string;
  volumeMultiplier: string;
  ticketMultiplier: string;
  outFractionDelta: string;
  deadline: Readonly<{ mode: 'KEEP' }> | EffectiveParticipant['deadline'];
  windowDays: number;
  costs: MvpScalarCostDraft;
}>;

type MvpHypothesisDraft = ObservedHypothesisDraft | ProfileHypothesisDraft;

type MvpInputChange = Readonly<{
  code: 'VOLUME' | 'MIX' | 'TICKET' | 'DEADLINE' | 'WINDOW' | 'COST';
  label: string;
  before: string;
  after: string;
}>;

type MvpAxisDifference = Readonly<{
  axis: AxisCode;
  metric: string;
  unit: MetricUnit;
  state: 'AVAILABLE' | 'UNAVAILABLE';
  base: string | null;
  hypothesis: string | null;
  delta: string | null;
  reason?: string;
}>;

type MvpComparison = Readonly<{
  baseExecutionId: string;
  hypothesisExecutionId: string;
  inputChanges: readonly MvpInputChange[];
  axes: readonly MvpAxisDifference[];
  limitations: readonly ('UNPAIRED_DIAGNOSTICS' | 'SINGLE_EXECUTION_NO_DISTRIBUTION')[];
}>;

type BuildProfileMvpPreparationRequestInput = Readonly<{
  identity: Readonly<{
    studyId: string; scenarioId: string; scenarioRevision: number;
  }>;
  scenario: ScenarioDocument;
  participants: readonly ProfileMvpParticipantDraft[];
  requestId: string;
  expectedBuildSha: string;
  recordedAt: string;
}>;
```

Identificação da simulação por Perfil no contrato V3 existente:

```ts
export const PROFILE_MVP_EXAMPLE_ID = 'perfil-operacional-mvp';

export function isProfileMvpScenario(scenario: ScenarioDocument): boolean {
  return scenario.sourceSnapshot.source.kind === 'SYNTHETIC'
    && scenario.sourceSnapshot.source.recipe.exampleId === PROFILE_MVP_EXAMPLE_ID;
}
```

O vínculo tipado Perfil → Receita permanece pós-MVP. No MVP, os Perfis completos
continuam em `evidenceSnapshots`, os IDs de participante são preservados entre base e
hipótese e as `sources` do `EffectiveInput` registram ID e fingerprint do Perfil em
texto auditável.

## 3. Cronograma fechado

| Dia | Task | Entrega verificável | Limite |
|---:|---|---|---:|
| 1 | T1 | domínio puro, request por Perfil e cenário V3 imutável | 1,0 d |
| 2 | T2 | UI dos dois caminhos e criação das seis hipóteses | 1,0 d |
| 3 | T3 | diagnóstico por cenário e comparação nos sete eixos | 1,0 d |
| 4 | T4 | E2E, regressão, correções bloqueantes e documentação | 1,0 d |

As tasks são sequenciais. Não há trabalho de backend paralelo escondido. Um finding
que exija novo endpoint, migration ou alteração do motor é bloqueio de escopo: não se
contorna dentro dos quatro dias.

### Preflight obrigatório — início das 32 horas

O preflight consome no máximo 1,5 h do orçamento de T1; ele não cria um “dia zero”
fora do prazo. Executar:

1. worktree limpa criada de `origin/main` pelo skill `superpowers:using-git-worktrees`;
2. copiar para ela os cinco documentos aprovados e
   `docs/frontend/etapa-4-planejamento.sha256` a partir deste checkout de planejamento;
   verificar cada SHA-256 antes/depois contra o manifest e abortar diante de ausência
   ou divergência — a worktree nova não herda arquivos untracked;
3. SHA base reconfirmado e diferenças posteriores auditadas nos arquivos deste plano;
4. Node 24, npm 11, Python e dependências já instalados;
5. ID Linear real autorizado disponível em `$env:MOTOR_ISSUE_ID`;
6. baseline verde: `npm run test:unit`, `npm run lint`, `npm run typecheck`,
   `npm run build`, `npm run test:e2e`, `pytest -q` e `python -O -m pytest -q`.

Os cinco documentos são: auditoria de partida, spec completa substituída, plano
completo substituído, spec MVP e este plano MVP. O manifest é gerado no fechamento
deste planejamento, fora da worktree de implementação.

Depois de definir `$env:MOTOR_IMPLEMENTATION_ROOT` com o caminho devolvido pela
criação da worktree, copiar e verificar sem glob:

```powershell
$planningRoot = 'C:\Users\gabriel Altoe\Documents\dados sobre cambio\motor-de-fluxo'
$manifestRel = 'docs/frontend/etapa-4-planejamento.sha256'
$manifestLines = Get-Content -LiteralPath (Join-Path $planningRoot $manifestRel)
$expectedPlanningHashes = @{}
foreach ($line in $manifestLines) {
  if ($line -notmatch '^([0-9a-f]{64})  (.+)$') { throw "Manifest inválido: $line" }
  $expectedPlanningHashes[$Matches[2]] = $Matches[1]
}
foreach ($relative in @($expectedPlanningHashes.Keys) + $manifestRel) {
  $source = Join-Path $planningRoot $relative
  $target = Join-Path $env:MOTOR_IMPLEMENTATION_ROOT $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Documento ausente: $relative" }
  $targetDirectory = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $targetDirectory | Out-Null
  }
  Copy-Item -LiteralPath $source -Destination $target
}
foreach ($relative in $expectedPlanningHashes.Keys) {
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $planningRoot $relative)).Hash.ToLowerInvariant()
  $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $env:MOTOR_IMPLEMENTATION_ROOT $relative)).Hash.ToLowerInvariant()
  if ($sourceHash -ne $expectedPlanningHashes[$relative] -or $targetHash -ne $sourceHash) {
    throw "Hash do planejamento diverge: $relative"
  }
}
```

Orçamento máximo de execução: T1 7 h, T2 7 h, T3 7 h, T4 6 h e reserva de 5 h para
correções bloqueantes. Ao consumir 27 h, parar novas melhorias visuais e preservar a
reserva. Se o baseline falhar ou surgir necessidade de backend/migration, reportar o
bloqueio antes de consumir o prazo; não iniciar com dívida desconhecida.

---

### Task 1: Domínio de Perfil, hipótese e cenário V3 — Dia 1

**Files:**
- Create: `web/src/hypotheses/profileMvp.ts`
- Create: `web/src/hypotheses/profileMvp.test.ts`
- Create: `web/src/hypotheses/hypothesis.ts`
- Create: `web/src/hypotheses/hypothesis.test.ts`
- Modify: `web/src/study/domain.ts`
- Modify: `web/src/study/domain.test.ts`
- Modify: `web/src/study/fingerprints.ts`
- Modify: `web/src/study/fingerprints.test.ts`
- Modify: `web/src/preparation/resolvePortfolioSource.ts`
- Modify: `web/src/preparation/resolvePortfolioSource.test.ts`
- Modify: `web/src/preparation/buildPreviewRequest.test.ts`

**Interfaces:**
- Consumes: `OperationalProfileVersion`, `PreparationRequest`, `EffectiveInput`, `ScenarioDocument`, `StudyDocument`, `resolvePortfolioSource` contract.
- Produces: `deriveProfileMvpParticipant`, `buildProfileMvpPreparationRequest`, `applyProfileHypothesis`, `buildHypothesisScenarioDraft`, `createProfileStudy`, `appendScenario`, `isProfileMvpScenario`, provenance per-order executável.

- [ ] **Step 1: Escrever os testes RED da derivação por Perfil**

```ts
it('deriva volume mensal, ticket p50 e fração OUT sem usar fallback', async () => {
  const result = await deriveProfileMvpParticipant(profileFixture({
    totalBrl: '3100', coveredDays: 31, ticketP50: '125', outFraction: '0.6',
  }), explicitFixture(), OWNER);
  expect(result).toMatchObject({ ok: true, value: {
    monthlyVolumeBrl: '3000', ticketMedianBrl: '125', outFraction: '0.6',
  }});
});

it.each(['volume', 'ticket', 'direction'] as const)(
  'bloqueia quando %s não está disponível',
  async (metric) => expect(await deriveProfileMvpParticipant(
    profileFixture({ unavailable: metric }), explicitFixture(), OWNER,
  )).toMatchObject({ ok: false, blockers: [{ code: 'METRIC_UNAVAILABLE' }] }),
);

it('arredonda volume recorrente para seis casas com HALF_UP', async () => {
  const result = await deriveProfileMvpParticipant(
    profileFixture({ totalBrl: '1', coveredDays: 7 }), explicitFixture(), OWNER,
  );
  expect(result).toMatchObject({ ok: true, value: { monthlyVolumeBrl: '4.285714' } });
});

it.each(['owner', 'fingerprint', 'compatibility'] as const)(
  'bloqueia Perfil inválido em %s', async (kind) => expect(await
    deriveProfileMvpSelection([profileFixture({ invalid: kind })], explicitById(), OWNER),
  ).toMatchObject({ ok: false }),
);

it('bloqueia duas versões da mesma empresa', async () => {
  expect(await deriveProfileMvpSelection(
    [profileA, { ...profileA, id: PROFILE_B }], explicitById(), OWNER,
  )).toMatchObject({ ok: false, blockers: [{ code: 'DUPLICATE_COMPANY' }] });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha esperada**

Run: `cd web; npm run test:unit -- src/hypotheses/profileMvp.test.ts`

Expected: FAIL porque `profileMvp.ts` e as funções ainda não existem.

- [ ] **Step 3: Implementar a derivação decimal mínima**

```ts
export async function deriveProfileMvpParticipant(
  profile: OperationalProfileVersion,
  explicit: ProfileMvpExplicitFields,
  expectedOwnerSub: string,
): Promise<ProfileMvpDerivation> {
  const validation = await validateOperationalProfile(profile);
  if (!validation.ok) return { ok: false, blockers: validation.issues.map(profileIssue) };
  const volume = profile.metrics.volume.totalBrl;
  const ticket = profile.metrics.ticketsBrl.p50;
  const direction = profile.metrics.direction;
  const blockers = collectBlockers(profile, explicit, expectedOwnerSub);
  if (blockers.length > 0) return { ok: false, blockers };
  if (volume.state !== 'AVAILABLE'
      || ticket.state !== 'AVAILABLE'
      || direction.state !== 'AVAILABLE') {
    throw new Error('Guard de disponibilidade não reconciliou.');
  }
  return { ok: true, value: {
    profileId: profile.id,
    companyId: profile.companyId,
    profileFingerprint: profile.documentFingerprint,
    participantId: explicit.participantId,
    monthlyVolumeBrl: canonicalMoney(new Decimal(volume.value)
      .div(profile.coverage.coveredDays).times(30)),
    ticketMedianBrl: new Decimal(ticket.value).toString(),
    outFraction: new Decimal(direction.value.out.fraction).toString(),
    generatorProfile: explicit.generatorProfile,
    seed: explicit.seed,
    deadline: structuredClone(explicit.deadline),
    efx: explicit.efx,
    purposeOut: explicit.purposeOut,
    purposeIn: explicit.purposeIn,
  }};
}
```

`deriveProfileMvpSelection` e a derivação individual são assíncronas porque precisam
recalcular os fingerprints com `validateOperationalProfile`; comparar apenas strings
armazenadas não é suficiente. `collectBlockers` deve rejeitar cobertura `<= 0`, decimal não finito/fora do domínio,
strings vazias, seed inválida, finalidade com espaços externos, owner divergente,
documento/fingerprint inválido e `compatibility.compatible === false`. A função
`deriveProfileMvpSelection(profiles, explicitById, expectedOwnerSub)` chama a
derivação individual, preserva a ordem selecionada, agrega todos os blockers e
rejeita `profiles.length === 0`, mais de 100 Perfis ou duas versões com o mesmo
`companyId`. Ela não propõe valor. `canonicalMoney` usa
`toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString()` e valida o intervalo
`0.000001`–`10^12`; frações aceitam no máximo 12 casas.

- [ ] **Step 4: Escrever os testes RED do request com múltiplos Perfis**

```ts
it('monta um participante por Perfil e registra a origem textual de cada derivação', () => {
  const request = buildProfileMvpPreparationRequest({
    identity: { studyId: STUDY_ID, scenarioId: SCENARIO_ID, scenarioRevision: 1 },
    scenario, participants: [participantA, participantB],
    requestId: REQUEST_ID, expectedBuildSha: BUILD_SHA, recordedAt: NOW,
  });
  expect(request.input.participants.map((item) => item.id)).toEqual([ID_A, ID_B]);
  expect(request.input.sources[`/participants/${ID_A}/monthly_volume_brl`]).toEqual({
    kind: 'ESTIMATIVA_USUARIO',
    source: `profile-mvp:${PROFILE_A}@${FINGERPRINT_A}:derived`,
    recorded_at: NOW,
  });
  expect(validatePreparationRequest(request)).toBe(true);
});

it.each([
  { deadline: { mode: 'PROFILE' as const }, iofRules: [] },
  { deadline: { mode: 'FIXED' as const, days: 7 }, iofRules: [iofRuleFixture()] },
])('gera sources exatas para prazo e IOF %#', ({ deadline, iofRules }) => {
  const request = buildRequestFixture({ deadline, iofRules });
  expect(validatePreparationRequest(request)).toBe(true);
  const daysPath = `/participants/${ID_A}/deadline/days`;
  expect(daysPath in request.input.sources).toBe(deadline.mode === 'FIXED');
});

it.each([
  ['missing', withoutSource(validRequest, '/warmup_days')],
  ['extra', withSource(validRequest, '/unexpected')],
  ['profile-with-days', withFixedDaysSource(profileDeadlineRequest)],
] as const)('recusa conjunto de sources %s', (_case, request) => {
  expect(() => assertExactEffectiveSources(request.input)).toThrow();
});

it('escapa finalidade como JSON Pointer RFC 6901', () => {
  const request = buildRequestFixture({ iofRules: [iofRuleFixture({ finalidade: 'A/B~C' })] });
  expect(Object.keys(request.input.sources))
    .toContain('/costs/iof_por_finalidade/A~1B~0C/OUT');
});
```

- [ ] **Step 5: Implementar `buildProfileMvpPreparationRequest` reutilizando o contrato atual**

```ts
export function buildProfileMvpPreparationRequest(
  input: BuildProfileMvpPreparationRequestInput,
): PreparationRequest {
  if (input.participants.length === 0) throw new Error('Selecione ao menos um Perfil.');
  const effectiveInput = buildEffectiveInput(input.scenario, input.participants, input.recordedAt);
  return {
    preparation_version: '1.0.0',
    request_id: input.requestId,
    study_id: input.identity.studyId,
    scenario_id: input.identity.scenarioId,
    scenario_revision: input.identity.scenarioRevision,
    expected_build_sha: input.expectedBuildSha,
    input: effectiveInput,
  };
}
```

`BuildProfileMvpPreparationRequestInput.identity` contém apenas IDs já alocados para
o Estudo/cenário que ainda serão materializados; não exige um `StudyDocument`
pré-existente. Preservar a ordem dos participantes pela ordem escolhida na tela. Usar
`ESTIMATIVA_USUARIO` porque o contrato atual não possui origem derivada de Perfil;
registrar no texto parseável `profile-mvp:<profileId>@<fingerprint>:derived`. Enumerar
exatamente `/warmup_days`, `/measurement_days`, `/window_days`,
`/costs/{iof_out,iof_in,carry_cnr,spread_rail_bps,custo_fixo_remessa,custo_oportunidade_aa,ptax}`,
`/costs/iof_por_finalidade/<finalidade>/<direcao>` para cada regra, e por participante
`/participants/<id>/{profile,seed,monthly_volume_brl,ticket_median_brl,out_fraction,deadline/mode,eh_efx,purpose_out,purpose_in}` mais
`/participants/<id>/deadline/days` somente quando `FIXED`. Limitar a 100 participantes e exigir
`validatePreparationRequest(request) === true` antes de devolver.

O Ajv valida forma, não completude de `sources`. Implementar também
`requiredEffectiveSourcePaths(input)`: reproduzir o conjunto obrigatório do contrato
de preparação, escapar segmentos dinâmicos com RFC 6901 (`~` → `~0`, `/` → `~1`) e
comparar igualdade exata com `Object.keys(input.sources)`. `assertExactEffectiveSources`
rejeita path ausente, extra, `/deadline/days` incompatível e regra dinâmica não
escapada antes da rede. Os testes cobrem PROFILE, FIXED, missing, extra, `/` e `~`.

- [ ] **Step 5a: Associar proveniência por ordem na resposta sintética heterogênea**

Escrever primeiro a integração RED que falha hoje no fallback agregado:

```ts
it('dois Perfis resolvem snapshot e request de prévia com proveniência por ordem', async () => {
  const snapshot = await resolvePortfolioSource({
    kind: 'SYNTHETIC', exampleId: PROFILE_MVP_EXAMPLE_ID,
    preparation: requestWithTwoProfiles,
  }, dependenciesReturningOrdersFromBothParticipants);

  expect(Object.keys(snapshot.provenanceByOrder ?? {})).toEqual(ORDER_IDS_SORTED);
  expect(() => buildPreviewRequest(
    snapshot, premises, period, previewIdentity, scenarioProvenance,
  )).not.toThrow();
});
```

Em `resolvePortfolioSource`, depois de validar a `PreparationResponse`, construir
`syntheticProvenanceByOrder(response)` e gravá-la no snapshot. Para cada ordem,
resolver `order.cliente_id` contra um único `input_snapshot.participants[].id`; cliente
ausente ou duplicado invalida a resposta. Projetar os campos assim:

- `id`, `cliente_id`, `direcao`, `dia_conhecida`, `dia_limite` e `valor_brl` usam
  `FieldProvenance.kind = 'DERIVED'`, `version = preparation_version`,
  `rule = generator_version`, `recordedAt` obtido da source do participante e
  `inputs` com os paths efetivos que alimentam aquele campo;
- `eh_efx` projeta exatamente a source de `/participants/<id>/eh_efx`;
- `finalidade` projeta a source de `purpose_out` ou `purpose_in` conforme a direção;
- `source` mantém o texto parseável do Perfil responsável por aquele participante.

Não relaxar `uniformSnapshotProvenance` nem fabricar uma origem agregada. O teste em
`buildPreviewRequest.test.ts` deve também remover uma entrada de
`provenanceByOrder` e provar erro explícito para aquela ordem.

Como o request executável passa a depender dessa associação, atualizar
`normalizeSnapshot` em `study/fingerprints.ts`: incluir `provenanceByOrder`
canonicamente **somente** quando `source.kind === 'SYNTHETIC'` e o campo opcional está
presente. Isso mantém idêntico o hash de documentos legados (sintéticos sem o campo e
observados já persistidos), mas protege os novos snapshots. Testar que trocar as
proveniências entre duas ordens muda `sourceFingerprint` e `inputFingerprint`, e que
uma fixture sintética antiga sem o campo conserva seu hash conhecido.

- [ ] **Step 6: Escrever os testes RED das hipóteses permitidas**

```ts
it('aplica os quatro deltas globais e preserva identidade, seed, perfil, eFX e finalidades', () => {
  const next = applyProfileHypothesis(baseInput, {
    volumeMultiplier: '2', ticketMultiplier: '0.5', outFractionDelta: '-0.1',
    deadline: { mode: 'FIXED', days: 3 },
  }, NOW);
  expect(next.participants[0]).toMatchObject({
    id: baseInput.participants[0]!.id,
    seed: baseInput.participants[0]!.seed,
    monthly_volume_brl: new Decimal(baseInput.participants[0]!.monthly_volume_brl).times(2).toString(),
    ticket_median_brl: new Decimal(baseInput.participants[0]!.ticket_median_brl).times('0.5').toString(),
    out_fraction: new Decimal(baseInput.participants[0]!.out_fraction).minus('0.1').toString(),
    deadline: { mode: 'FIXED', days: 3 },
  });
  expect(baseInput).toEqual(frozenBaseFixture);
});

it('KEEP preserva prazos heterogêneos e mudança reconcilia sources', () => {
  const kept = applyProfileHypothesis(baseWithMixedDeadlines, neutralChanges, NOW);
  expect(kept.participants.map((item) => item.deadline))
    .toEqual(baseWithMixedDeadlines.participants.map((item) => item.deadline));
  const changed = applyProfileHypothesis(baseWithMixedDeadlines, fixedDeadlineChanges, NOW);
  expect(Object.keys(changed.sources)).toContain(`/participants/${ID_A}/deadline/days`);
  expect(validateEffectiveInput(changed)).toBe(true);
});

it('recusa draft simulado para origem observada', () => {
  expect(() => buildHypothesisScenarioDraft({
    base: observedBase, draft: profileHypothesisDraft,
    sourceSnapshot: observedBase.sourceSnapshot, id: HYPOTHESIS_ID, recordedAt: NOW,
  }))
    .toThrow('Carteira observada permite alterar somente janela e custos.');
});

it('congela regras de IOF por finalidade e preserva origem dos campos não alterados', () => {
  const draft = buildHypothesisScenarioDraft(windowOnlyFixture);
  expect(draft.premises.costs.iof_por_finalidade)
    .toEqual(windowOnlyFixture.base.premises.costs.iof_por_finalidade);
  expect(draft.inputProvenance?.premises.costs.iof_out)
    .toEqual(windowOnlyFixture.base.inputProvenance?.premises.costs.iof_out);
  expect(draft.inputProvenance?.premises.windowDays.kind).toBe('USER_ESTIMATE');
});

it.each([
  ['VOLUME', volumeOnlyDraft], ['MIX', mixOnlyDraft],
  ['TICKET', ticketOnlyDraft], ['DEADLINE', deadlineOnlyDraft],
  ['WINDOW', windowOnlyDraft], ['COST', oneScalarCostOnlyDraft],
] as const)('%s altera somente seu grupo', (group, draft) => {
  const result = buildHypothesisFromFrozenBase(draft);
  expect(changedGroups(frozenBaseFixture, result)).toEqual([group]);
  expect(unchangedFieldsAndSources(frozenBaseFixture, result, group)).toBe(true);
  expect(Object.isFrozen(frozenBaseFixture)).toBe(true);
  expect(changedSourcePaths(result, group)).toEqual(expectedSourcePaths(group));
});

it.each([
  ['iof_out', '1.0000000000001'], ['iof_in', '-0.1'],
  ['carry_cnr', '2'], ['custo_oportunidade_aa', '0.0000000000001'],
  ['spread_rail_bps', '10000.000000000001'],
  ['custo_fixo_remessa', '1000000000000.000001'],
  ['ptax', '0'], ['ptax', '1000000.000000000001'],
] as const)('recusa custo %s=%s fora do contrato', (field, value) => {
  expect(() => validateMvpScalarCosts({ ...validScalarCosts, [field]: value }))
    .toThrow();
});
```

- [ ] **Step 7: Implementar transformações puras e validação de domínio**

```ts
export function applyProfileHypothesis(
  base: EffectiveInput,
  changes: ProfileGenerationChanges,
  recordedAt: string,
): EffectiveInput {
  const participants = base.participants.map((participant) => ({
    ...structuredClone(participant),
    monthly_volume_brl: canonicalMoney(positiveDecimal(participant.monthly_volume_brl)
      .times(positiveDecimal(changes.volumeMultiplier))),
    ticket_median_brl: canonicalMoney(positiveDecimal(participant.ticket_median_brl)
      .times(positiveDecimal(changes.ticketMultiplier))),
    out_fraction: canonicalFraction(new Decimal(participant.out_fraction)
      .plus(decimal(changes.outFractionDelta))),
    deadline: changes.deadline.mode === 'KEEP'
      ? structuredClone(participant.deadline)
      : structuredClone(changes.deadline),
  }));
  return reconcileHypothesisSources({
    ...structuredClone(base),
    participants,
  }, base, changes, recordedAt);
}
```

Validar todos os participantes antes de devolver o documento. Uma fração que sair de
`[0,1]` bloqueia toda a hipótese; não truncar silenciosamente. Só substituir a origem
dos campos alterados, usando `profile-mvp:<profileId>@<fingerprint>:hypothesis`; o
path congelado `/profile` preserva a identidade original. Ao mudar de `FIXED` para
`PROFILE`, remover `/deadline/days`; ao mudar para `FIXED`, criá-lo. Validar o
`EffectiveInput` final antes da preparação.

`buildHypothesisScenarioDraft` valida a combinação origem/draft, fixa revisão 1,
clona período e snapshot, aplica janela/custos e chama
`mergeScenarioInputProvenance(base, nextPremises, recordedAt)`. Essa função preserva
a origem do horizonte e de cada premissa cujo valor canônico não mudou; somente a
janela e cada um dos sete campos escalares realmente alterados recebem
`USER_ESTIMATE`. `iof_por_finalidade` permanece byte a byte igual à base:

Antes de materializar, `validateMvpScalarCosts` usa `Decimal` e a mesma gramática
decimal do backend: `iof_out`, `iof_in`, `carry_cnr` e
`custo_oportunidade_aa` em `[0,1]` com até 12 casas; `spread_rail_bps` em
`[0,10000]` com até 12; `custo_fixo_remessa` em `[0,10^12]` com até 6; e `ptax` em
`(0,10^6]` com até 12. Testar mínimo, máximo, uma unidade além, precisão excedida,
expoente, whitespace e não finito para cada classe. Nenhum cenário inválido chega a
`appendScenario`.

```ts
export function buildHypothesisScenarioDraft(
  input: BuildHypothesisScenarioDraftInput,
): ScenarioDraft {
  validateMvpScalarCosts(input.draft.costs);
  const observed = input.base.sourceSnapshot.source.kind === 'OBSERVED_CASE';
  const simulated = isProfileMvpScenario(input.base);
  if (observed !== (input.draft.kind === 'OBSERVED')
      || simulated !== (input.draft.kind === 'PROFILE_SIMULATION')) {
    throw new Error(observed
      ? 'Carteira observada permite alterar somente janela e custos.'
      : 'A hipótese não corresponde à origem do cenário-base.');
  }
  return {
    id: input.id,
    revision: 1,
    name: input.draft.name,
    sourceSnapshot: structuredClone(input.sourceSnapshot),
    premises: {
      windowDays: input.draft.windowDays,
      costs: {
        ...structuredClone(input.draft.costs),
        iof_por_finalidade: structuredClone(input.base.premises.costs.iof_por_finalidade),
      },
    },
    period: structuredClone(input.base.period),
    inputProvenance: mergeScenarioInputProvenance(
      input.base, {
        windowDays: input.draft.windowDays,
        costs: {
          ...input.draft.costs,
          iof_por_finalidade: input.base.premises.costs.iof_por_finalidade,
        },
      },
      input.recordedAt,
    ),
  };
}
```

- [ ] **Step 8: Criar o Estudo por Perfil separado e acrescentar hipóteses sem migration**

Escrever RED para a separação obrigatória:

```ts
it('cria outro Estudo V3 com base sintética e não toca o estudo observado', async () => {
  const before = structuredClone(observedStudy);
  const created = await createProfileStudy({
    id: PROFILE_STUDY_ID, ownerSub: OWNER, name: 'Simulação por Perfil',
    baseScenario: syntheticBaseDraft, profiles: [profileA, profileB], now: NOW,
  });
  expect(observedStudy).toEqual(before);
  expect(created).toMatchObject({
    schemaVersion: '3.0.0', id: PROFILE_STUDY_ID, revision: 1,
    baseScenarioId: syntheticBaseDraft.id, executions: [],
  });
  expect(created.evidenceSnapshots.map((item) => item.profile.id))
    .toEqual([PROFILE_A, PROFILE_B]);
});
```

`createProfileStudy` vive em `study/domain.ts` para poder reutilizar
`materializeScenario` e `finalize`. Ele valida cada Perfil com
`validateOperationalProfile`, owner, fingerprint e unicidade de `profile.id` e
`companyId`; cria o documento inteiro já validado em revisão 1, com os Perfis
copiados integralmente para `evidenceSnapshots`. Antes de finalizar, extrai de
`baseScenario.sourceSnapshot.generationInputSnapshot.sources` a chave parseável
`(profileId, profileFingerprint, participantId)` de cada participante e exige
correspondência um-para-um com `profiles`: nenhum Perfil/participante ausente, extra
ou duplicado e nenhum fingerprint divergente. Testes negativos trocam o Perfil e o
fingerprint da base. Ele nunca recebe nem retorna o Estudo observado e não chama
`updateScenario`.

Depois escrever RED para `appendScenario`:

```ts
it('acrescenta cenário revisão 1 sem alterar base nem execuções', async () => {
  const next = await appendScenario(study, hypothesisDraft, NOW);
  expect(next.scenarios).toHaveLength(study.scenarios.length + 1);
  expect(next.scenarios[0]).toEqual(study.scenarios[0]);
  expect(next.executions).toEqual(study.executions);
  expect(next.revision).toBe(study.revision + 1);
});
```

```ts
export async function appendScenario(
  study: StudyDocument,
  draft: ScenarioDraft,
  now: string,
): Promise<StudyDocument> {
  if (study.scenarios.some((item) => item.id === draft.id)) {
    throw new Error('ID de cenário já existe no estudo.');
  }
  const scenario = await materializeScenario({ ...structuredClone(draft), revision: 1 });
  return finalize({
    ...structuredClone(study),
    scenarios: [...study.scenarios.map(structuredClone), scenario],
    revision: study.revision + 1,
    updatedAt: checkedInstant(now),
  });
}
```

- [ ] **Step 9: Rodar o gate focado do Dia 1**

Run:

```powershell
cd web
npm run test:unit -- src/hypotheses/profileMvp.test.ts src/hypotheses/hypothesis.test.ts src/study/domain.test.ts
npm run test:unit -- src/preparation/resolvePortfolioSource.test.ts src/preparation/buildPreviewRequest.test.ts
npm run test:unit -- src/study/fingerprints.test.ts
npm run typecheck
```

Expected: todos PASS; nenhuma alteração em arquivos de backend, API ou storage.

- [ ] **Step 10: Checkpoint sem commit**

Registrar os comandos e resultados no rascunho de aceite. Não fazer stage nem commit;
o Diário precisa entrar no mesmo commit publicável que o código final.

---

### Task 2: Preparação da base e criação da hipótese — Dia 2

**Files:**
- Create: `web/src/hypotheses/components/ProfileScenarioBuilder.tsx`
- Create: `web/src/hypotheses/components/ProfileScenarioBuilder.test.tsx`
- Create: `web/src/hypotheses/components/HypothesisBuilder.tsx`
- Create: `web/src/hypotheses/components/HypothesisBuilder.test.tsx`
- Modify: `web/src/pages/StudyPortfolioPage.tsx`
- Modify: `web/src/pages/previewFlow.test.tsx`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: funções de T1, `study.evidenceSnapshots`, `resolvePortfolioSource`,
  `api.preparePortfolio`, `controller.saveDetachedStudy`, `controller.edit` e
  `controller.flush`.
- Produces: novo Estudo V3 cuja base sintética é identificada por
  `PROFILE_MVP_EXAMPLE_ID`; cenário-hipótese salvo antes de navegar; callbacks
  `onRunDiagnostic(scenarioId)` e `onCompare()`.

- [ ] **Step 1: Escrever RED do construtor baseado em Perfis**

```tsx
it('distingue Perfil real de ordens sintéticas e bloqueia campo ausente', async () => {
  render(<ProfileScenarioBuilder profiles={[profileA, profileB]} onPrepare={onPrepare} />);
  await user.click(screen.getByRole('checkbox', { name: /Empresa A/ }));
  expect(screen.getByText('Evidência real agregada')).toBeVisible();
  expect(screen.getByText('As ordens geradas serão sintéticas')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Preparar simulação por Perfil' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Informe a finalidade OUT');
  expect(onPrepare).not.toHaveBeenCalled();
});

it('avisa quando há só um Perfil e mostra todos os valores congelados', async () => {
  render(<ProfileScenarioBuilder profiles={[profileA]} onPrepare={onPrepare} />);
  await selectAndCompleteProfileA();
  expect(screen.getByRole('alert')).toHaveTextContent('não representa uma pool multilateral');
  for (const [label, value] of [
    ['ID do Perfil', PROFILE_A], ['Fingerprint do Perfil', FINGERPRINT_A],
    ['Empresa', COMPANY_A], ['Participante', PARTICIPANT_A],
    ['Perfil do gerador', GENERATOR_PROFILE_A], ['Seed', SEED_A],
    ['eFX', 'Não'], ['Finalidade OUT', PURPOSE_OUT_A],
    ['Finalidade IN', PURPOSE_IN_A], ['Horizonte', '365 dias'],
  ] as const) {
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(value)).toBeVisible();
  }
});
```

- [ ] **Step 2: Implementar seleção e confirmação por Perfil**

```tsx
<fieldset>
  <legend>Perfis que formarão a simulação</legend>
  {profiles.map((profile) => (
    <ProfileParticipantFields
      key={profile.id}
      profile={profile}
      selected={selectedIds.has(profile.id)}
      draft={drafts[profile.id]}
      onChange={updateDraft}
    />
  ))}
</fieldset>
```

Listar somente `study.evidenceSnapshots` com `kind === 'OPERATIONAL_PROFILE'`.
Quando não houver Perfil anexado, mostrar instrução e link existente para a página de
Perfis da empresa; não criar Perfil dentro da Etapa 4.

- [ ] **Step 3: Preparar e persistir outro Estudo sem tocar o observado**

```ts
async function createProfileSimulation(participants: readonly ProfileMvpParticipantDraft[]) {
  const sourceStudyBefore = structuredClone(study);
  const sourceBase = requiredBaseScenario(study);
  const recordedAt = new Date().toISOString();
  const studyId = crypto.randomUUID();
  const scenarioId = crypto.randomUUID();
  const request = buildProfileMvpPreparationRequest({
    identity: { studyId, scenarioId, scenarioRevision: 1 },
    scenario: sourceBase, participants, requestId: crypto.randomUUID(),
    expectedBuildSha: requiredBuildSha(import.meta.env.VITE_MOTOR_BUILD_SHA, undefined),
    recordedAt,
  });
  const snapshot = await resolvePortfolioSource({
    kind: 'SYNTHETIC', exampleId: PROFILE_MVP_EXAMPLE_ID, preparation: request,
  }, preparationDependencies);
  const created = await createProfileStudy({
    id: studyId, ownerSub: study.ownerSub, name: profileStudyName(study.name),
    baseScenario: profileBaseScenarioDraft(sourceBase, scenarioId, snapshot, recordedAt),
    profiles: selectedProfiles, now: recordedAt,
  });
  const saved = await controller.saveDetachedStudy(created, 0);
  if (saved === null) throw new Error('A sessão mudou antes de salvar a simulação.');
  if (canonical(study) !== canonical(sourceStudyBefore)) {
    throw new Error('O estudo observado foi alterado durante a preparação.');
  }
  navigate(`/carteira/${saved.id}`);
}
```

`preparationDependencies.preparePortfolio` aponta uma única vez para
`api.preparePortfolio`; não chamar a API antes de `resolvePortfolioSource`.
`StudyPortfolioPage.applySource` continua existindo apenas para o editor legado e
**não** participa deste fluxo, pois ele sobrescreve a base do Estudo aberto. Falha de
preparação ou persistência mantém o Estudo observado byte a byte igual, preserva o
rascunho do formulário e exibe botão “Tentar novamente”. O teste da página congela o
documento observado, confirma uma única chamada HTTP, uma chamada
`saveDetachedStudy(created, 0)` e zero chamadas a `updateScenario`/`controller.edit`.

- [ ] **Step 4: Escrever RED do formulário observado versus simulado**

```tsx
it('mostra apenas janela e sete custos escalares para base observada', () => {
  render(<HypothesisBuilder baseScenario={observedScenario} onCreate={onCreate} />);
  expect(screen.getByLabelText('Janela em dias')).toBeVisible();
  expect(screen.queryByLabelText('Multiplicador de volume')).not.toBeInTheDocument();
});

it('mostra os seis grupos para simulação por Perfil', () => {
  render(<HypothesisBuilder baseScenario={profileScenario} onCreate={onCreate} />);
  expect(screen.getByLabelText('Multiplicador de volume')).toBeVisible();
  expect(screen.getByLabelText('Deslocamento da fração OUT')).toBeVisible();
  expect(screen.getByLabelText('Multiplicador de ticket')).toBeVisible();
  expect(screen.getByLabelText('Prazo')).toBeVisible();
  expect(screen.getByLabelText('Janela em dias')).toBeVisible();
  expect(screen.getByLabelText('Spread do rail em bps')).toBeVisible();
  for (const [label, value] of [
    ['ID do Perfil', PROFILE_A], ['Fingerprint do Perfil', FINGERPRINT_A],
    ['Participante', PARTICIPANT_A], ['Perfil do gerador', GENERATOR_PROFILE_A],
    ['Seed', SEED_A], ['eFX', 'Não'], ['Finalidade OUT', PURPOSE_OUT_A],
    ['Finalidade IN', PURPOSE_IN_A], ['Horizonte', '365 dias'],
    ['Versão da preparação', PREPARATION_VERSION],
    ['Versão do gerador', GENERATOR_VERSION], ['Versão do motor', BUILD_SHA],
  ] as const) expect(screen.getByText(`${label}: ${value}`)).toBeVisible();
});
```

- [ ] **Step 5: Implementar a prévia de diferenças antes de criar**

```tsx
<table>
  <caption>Alterações da hipótese</caption>
  <thead><tr><th>Parâmetro</th><th>Base</th><th>Hipótese</th></tr></thead>
  <tbody>{changes.map((change) => (
    <tr key={change.code}><th scope="row">{change.label}</th>
      <td>{change.before}</td><td>{change.after}</td></tr>
  ))}</tbody>
</table>
```

Exibir “As ordens serão regeneradas” quando qualquer um de volume, mix, ticket ou
prazo divergir. Exibir “As mesmas ordens serão reutilizadas” para janela/custos.

- [ ] **Step 6: Implementar criação atômica da hipótese na página**

```ts
async function createHypothesis(draft: MvpHypothesisDraft): Promise<void> {
  const base = selectedBaseScenario(study);
  const hypothesisId = crypto.randomUUID();
  const recordedAt = new Date().toISOString();
  try {
    const generationChanged = draft.kind === 'PROFILE_SIMULATION'
      && profileGenerationChanged(base.sourceSnapshot.generationInputSnapshot, draft);
    const sourceSnapshot = generationChanged
      ? await prepareHypothesisSource({
          study, base, draft, hypothesisId, scenarioRevision: 1, api, recordedAt,
          expectedBuildSha: requiredRecipeBuildSha(base.sourceSnapshot),
        })
      : structuredClone(base.sourceSnapshot);
    const scenario = buildHypothesisScenarioDraft({
      base, draft, sourceSnapshot, id: hypothesisId, recordedAt,
    });
    const next = await appendScenario(study, scenario, recordedAt);
    controller.edit(next);
    const saved = await controller.flush();
    if (saved === null) throw new Error('A sessão mudou antes de salvar a hipótese.');
    navigate(`/estudos/${saved.id}/diagnostico?scenarioId=${hypothesisId}`);
  } catch (reason) {
    setSubmissionError(publicHypothesisError(reason));
    focusRetryButton();
  }
}
```

`prepareHypothesisSource` monta uma `PreparationRequest` com o novo ID/revisão da
hipótese e chama `resolvePortfolioSource` com a dependência real
`preparePortfolio`. O resolvedor existente realiza a única chamada HTTP; não chamar
`api.preparePortfolio` antes dele. O `expected_build_sha` vem obrigatoriamente de
`base.sourceSnapshot.source.recipe.motorBuildSha`; se a recipe ou SHA estiver
ausente, falhar com `VERSAO_INCOMPATIVEL` antes da rede. Considerar geração alterada
somente quando multiplicadores diferem de `1`, delta difere de `0` ou prazo difere
de `KEEP`. Janela/custo em base sintética, e qualquer hipótese observada, fazem zero
chamadas de preparação e reutilizam o snapshot integral.

Adicionar testes da página que cobrem: (a) janela/custo sintético com spy HTTP em
zero; (b) mix com exatamente uma chamada e o SHA da recipe; (c) navegação imediata
encontra o cenário porque `flush()` terminou; (d) conflito de revisão impede a
navegação, mantém todos os campos preenchidos e oferece retry explícito; (e) somente
campos de premissa alterados recebem nova proveniência.

Além do caso integrado, usar matriz isolada para provar a decisão de preparação:

```ts
it.each([
  ['VOLUME', volumeOnlyDraft], ['MIX', mixOnlyDraft],
  ['TICKET', ticketOnlyDraft], ['DEADLINE', deadlineOnlyDraft],
] as const)('%s prepara exatamente uma vez', async (_group, draft) => {
  await submitHypothesis(draft);
  expect(preparePortfolio).toHaveBeenCalledTimes(1);
});

it.each([
  ['WINDOW', windowOnlyDraft], ['COST', oneScalarCostOnlyDraft],
] as const)('%s reutiliza ordens sem preparação', async (_group, draft) => {
  await submitHypothesis(draft);
  expect(preparePortfolio).not.toHaveBeenCalled();
  expect(savedHypothesis.sourceSnapshot.orders).toEqual(base.sourceSnapshot.orders);
});
```

- [ ] **Step 7: Expor cenários e ações sem mudar o schema**

Em `StudyPortfolioPage`, renderizar:

```tsx
<ScenarioList
  scenarios={study.scenarios}
  baseScenarioId={study.baseScenarioId}
  onRunDiagnostic={(scenarioId) => void navigateAfterFlush(
    `/estudos/${study.id}/diagnostico?scenarioId=${scenarioId}`,
  )}
  onCompare={() => void navigateAfterFlush(`/comparar?studyId=${study.id}`)}
/>
```

Rotular origem como “Dados observados”, “Simulação baseada em Perfil” ou a origem
legada existente. Não chamar cenários legados de hipótese. `navigateAfterFlush`
aguarda `controller.flush()`, exige documento salvo do mesmo Estudo e só então chama
`navigate`; conflito, `STORAGE_FAILURE` ou sessão trocada mantém a página e mostra
erro acionável. Cobrir com teste em que uma edição legada está pendente e o clique em
“Executar diagnóstico” ou “Comparar resultados” ocorre antes do autosave.

- [ ] **Step 8: Rodar o gate focado do Dia 2**

Run:

```powershell
cd web
npm run test:unit -- src/hypotheses/components/ProfileScenarioBuilder.test.tsx src/hypotheses/components/HypothesisBuilder.test.tsx src/pages/previewFlow.test.tsx
npm run lint
npm run typecheck
```

Expected: PASS; fluxo observado existente continua selecionando e preservando ordens.

- [ ] **Step 9: Checkpoint sem commit**

Registrar o gate no rascunho de aceite e verificar `git diff --check`. Não fazer
stage nem commit.

---

### Task 3: Diagnóstico por cenário e comparação agregada — Dia 3

**Files:**
- Create: `web/src/hypotheses/comparison.ts`
- Create: `web/src/hypotheses/comparison.test.ts`
- Create: `web/src/hypotheses/components/ScenarioComparison.tsx`
- Create: `web/src/hypotheses/components/ScenarioComparison.test.tsx`
- Create: `web/src/pages/StudyComparisonPage.tsx`
- Create: `web/src/pages/StudyComparisonPage.test.tsx`
- Modify: `web/src/pages/StudyDiagnosticPage.tsx`
- Create: `web/src/pages/StudyDiagnosticPage.test.tsx`
- Modify: `web/src/diagnostics/components/DiagnosticHistory.tsx`
- Modify: `web/src/diagnostics/components/DiagnosticHistory.test.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/router.test.tsx`
- Modify: `web/src/pages/StudyPortfolioPage.tsx`
- Modify: `web/src/styles/global.css`

**Interfaces:**
- Consumes: `DiagnosticExecutionRecord`, `DiagnosticEnvelope`, cenários V3 de T2.
- Produces: `compareMvpDiagnostics`, `MvpComparison`; reutiliza somente as rotas já
  servidas `/estudos/:studyId/diagnostico?scenarioId=...` e
  `/comparar?studyId=...`.

- [ ] **Step 1: Escrever RED para selecionar o cenário da rota**

```tsx
it('executa o scenarioId da rota e não força baseScenarioId', async () => {
  renderRoute('/estudos/study-1/diagnostico?scenarioId=scenario-hypothesis');
  await user.click(await screen.findByRole('button', { name: /Executar diagnóstico/ }));
  expect(submittedRequest.scenario_id).toBe('scenario-hypothesis');
});

it('filtra estado, retomada, retry, terminal e histórico pelo cenário atual', async () => {
  renderRoute('/estudos/study-1/diagnostico?scenarioId=scenario-hypothesis');
  await expectScenarioScopedHistory('scenario-hypothesis');
  expect(resumedAttemptIds).not.toContain(BASE_ATTEMPT_ID);
  expect(screen.queryByText(BASE_RESULT_MARKER)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Alterar a rota e a resolução do cenário**

```tsx
<Route path="/estudos/:studyId/diagnostico" element={<DiagnosticRoute />} />
<Route path="/comparar" element={<StudyComparisonPage />} />
```

Em `StudyDiagnosticPage`, obter `scenarioId` de `useSearchParams`, procurar em
`study.scenarios` e mostrar `UNAVAILABLE` se ausente. Quando a query não tiver
`scenarioId`, usar `baseScenarioId` por compatibilidade. Criar
`diagnosticsForScenario(study, scenario)` que inclui apenas registros com o mesmo
`scenarioId`; classificar como current somente quando também coincidem
`scenarioRevision` e `inputFingerprint`, e como stale quando divergem. Usar esse
mesmo conjunto em `latestDiagnostic`, retomada de queued, cancelamento, retry,
`DiagnosticHistory`, escolha do terminal e envelope exibido. Uma execução de outro
cenário nunca pode acordar, esconder ou substituir o estado atual.

Tratar mudança de `scenarioId` na mesma montagem como nova identidade de tela: o
efeito depende de `[controller, studyId, scenarioId]`, incrementa um token local,
reseta `viewState`, tentativa selecionada e conjunto de retomadas, e ignora qualquer
callback assíncrono capturado com token/cenário anterior. Testar A → B sem remontar e
troca durante A em `QUEUED`/`RUNNING`; conclusão tardia de A não altera B.

- [ ] **Step 3: Escrever RED da matriz de compatibilidade**

```ts
it.each([
  ['motor', withMotorSha(hypothesis, OTHER_SHA)],
  ['horizonte', withHorizon(hypothesis, 31)],
  ['origem', withObservedSource(hypothesis)],
  ['participantes', withParticipantId(hypothesis, OTHER_ID)],
  ['seed', withParticipantSeed(hypothesis, '99')],
  ['Perfil/fingerprint', withProfileLineage(hypothesis, OTHER_FINGERPRINT)],
  ['gerador', withGeneratorVersion(hypothesis, OTHER_VERSION)],
  ['preparação', withPreparationVersion(hypothesis, OTHER_VERSION)],
] as const)('bloqueia diferença incompatível em %s', (_label, changed) => {
  expect(compareMvpDiagnostics(base, changed)).toMatchObject({
    ok: false, code: 'INCOMPATIBLE_EXECUTIONS',
  });
});
```

Compatibilidade mínima: ambos `SUCCEEDED`, envelopes presentes, current para o
cenário/revisão/fingerprint que representam, mesmo `motor_build_sha`, `api_version`,
`schema_version`, apresentação, período/horizonte e família de origem. Observado
exige mesmo `caseId`, `caseRevision`, ordens e `provenanceByOrder` canônicos. Simulado
exige mesmo `preparationVersion`, `generatorVersion` e a mesma chave ordenada
`(profileId, profileFingerprint, participantId)` extraída da source parseável de
`/participants/<id>/profile`; também exige mesmos IDs, arquétipos, seeds, eFX,
finalidades e regras `iof_por_finalidade`. Somente os quatro campos de geração e as
sete premissas escalares autorizadas podem divergir. Texto de source inválido ou
ambíguo bloqueia a comparação, em vez de fazer fallback.

- [ ] **Step 4: Escrever RED dos deltas nos sete eixos**

```ts
it('calcula hipótese menos base e preserva indisponibilidade', () => {
  const result = compareMvpDiagnostics(baseExecution, hypothesisExecution);
  if (!result.ok) throw new Error(result.code);
  expect(result.value.axes.map(({ axis, metric }) => `${axis}.${metric}`)).toEqual([
    'STRUCTURAL_POTENTIAL.gross_out_brl',
    'STRUCTURAL_POTENTIAL.gross_in_brl',
    'STRUCTURAL_POTENTIAL.imbalance_brl',
    'STRUCTURAL_POTENTIAL.ceiling_brl',
    'POLICY_CAPTURE.matched_brl', 'POLICY_CAPTURE.intra_client_brl',
    'POLICY_CAPTURE.inter_client_brl', 'POLICY_CAPTURE.uncaptured_potential_brl',
    'POLICY_CAPTURE.captured_fraction',
    'TEMPORAL_COMPATIBILITY.deadline_days',
    'TEMPORAL_COMPATIBILITY.same_day_fraction',
    'TEMPORAL_COMPATIBILITY.weighted_wait_days',
    'TEMPORAL_COMPATIBILITY.window_closures',
    'TEMPORAL_COMPATIBILITY.deadline_closures',
    'TEMPORAL_COMPATIBILITY.horizon_closures',
    'CROSS_BORDER_RESIDUAL.remitted_brl', 'CROSS_BORDER_RESIDUAL.out_brl',
    'CROSS_BORDER_RESIDUAL.in_brl',
    'COMPOSITION_DEPENDENCY.hhi', 'COMPOSITION_DEPENDENCY.largest_share',
    'ECONOMIC_ROBUSTNESS.baseline_brl.p50', 'ECONOMIC_ROBUSTNESS.netted_brl.p50',
    'ECONOMIC_ROBUSTNESS.savings_brl.p50',
    'ECONOMIC_ROBUSTNESS.netability_fraction.p50',
    'OPERATIONAL_PROFILE.order_count', 'OPERATIONAL_PROFILE.cycle_count',
    'OPERATIONAL_PROFILE.maximum_open_queue', 'OPERATIONAL_PROFILE.due_order_count',
    'OPERATIONAL_PROFILE.weighted_wait_days',
    'OPERATIONAL_PROFILE.processing_duration_ms',
  ]);
  expect(result.value.axes.find((item) => item.metric === 'gross_out_brl')?.delta)
    .toBe('25');
  expect(result.value.axes.find((item) => item.metric === 'savings_brl.p50'))
    .toMatchObject({ delta: null, state: 'UNAVAILABLE' });
});

it('marca p50 descritivo como não pareado', () => {
  const result = compareMvpDiagnostics(distributionBase, distributionHypothesis);
  if (!result.ok) throw new Error(result.code);
  expect(result.value.limitations).toContain('UNPAIRED_DIAGNOSTICS');
  expect(result.value.axes).toContainEqual(expect.objectContaining({
    axis: 'ECONOMIC_ROBUSTNESS', metric: 'savings_brl.p50',
  }));
});

it('explica os seis grupos pela diferença dos snapshots, sem inferência causal', () => {
  const result = compareMvpDiagnostics(baseExecution, hypothesisExecution);
  if (!result.ok) throw new Error(result.code);
  expect(result.value.inputChanges.map((item) => item.code)).toEqual([
    'VOLUME', 'MIX', 'TICKET', 'DEADLINE', 'WINDOW', 'COST',
  ]);
  expect(result.value.inputChanges.every((item) => item.before !== item.after)).toBe(true);
});
```

- [ ] **Step 5: Implementar catálogo fechado e subtração decimal**

```ts
const scalarMetrics: readonly AxisMetricDefinition[] = [
  ...definitions('STRUCTURAL_POTENTIAL', 'BRL',
    'gross_out_brl', 'gross_in_brl', 'imbalance_brl', 'ceiling_brl'),
  ...definitions('POLICY_CAPTURE', 'BRL',
    'matched_brl', 'intra_client_brl', 'inter_client_brl', 'uncaptured_potential_brl'),
  metric('POLICY_CAPTURE', 'captured_fraction', 'FRACTION'),
  metric('TEMPORAL_COMPATIBILITY', 'deadline_days', 'DAYS'),
  metric('TEMPORAL_COMPATIBILITY', 'same_day_fraction', 'FRACTION'),
  metric('TEMPORAL_COMPATIBILITY', 'weighted_wait_days', 'DAYS'),
  ...definitions('TEMPORAL_COMPATIBILITY', 'NUMBER',
    'window_closures', 'deadline_closures', 'horizon_closures'),
  ...definitions('CROSS_BORDER_RESIDUAL', 'BRL', 'remitted_brl', 'out_brl', 'in_brl'),
  metric('COMPOSITION_DEPENDENCY', 'hhi', 'NUMBER'),
  metric('COMPOSITION_DEPENDENCY', 'largest_share', 'FRACTION'),
  ...definitions('OPERATIONAL_PROFILE', 'NUMBER',
    'order_count', 'cycle_count', 'maximum_open_queue', 'due_order_count'),
  metric('OPERATIONAL_PROFILE', 'weighted_wait_days', 'DAYS'),
  metric('OPERATIONAL_PROFILE', 'processing_duration_ms', 'MS'),
];

const distributionMetrics: readonly DistributionMetricDefinition[] = [
  metric('ECONOMIC_ROBUSTNESS', 'baseline_brl', 'BRL'),
  metric('ECONOMIC_ROBUSTNESS', 'netted_brl', 'BRL'),
  metric('ECONOMIC_ROBUSTNESS', 'savings_brl', 'BRL'),
  metric('ECONOMIC_ROBUSTNESS', 'netability_fraction', 'FRACTION'),
];

function difference(base: string, hypothesis: string): string {
  return new Decimal(hypothesis).minus(base).toString();
}
```

O array acima é o contrato exato de ordem; não usar `arrayContaining`. Para robustez
econômica, usar somente `p50` quando os dois lados têm distribuição;
caso contrário devolver
`UNAVAILABLE` com o reason code original. `selected_execution.result` pode alimentar
um resumo econômico separado, claramente nomeado “execução selecionada”.

`inputChanges` é calculado apenas dos snapshots persistidos nas duas execuções. Para
simulação, cada mudança de geração precisa ser uniforme entre todos os participantes;
divergência por participante retorna `INCOMPATIBLE_EXECUTIONS`. Custos incluem os
sete campos escalares; `iof_por_finalidade` é congelado e qualquer divergência torna
o par incompatível.

- [ ] **Step 6: Implementar a seleção explícita das execuções**

```tsx
const candidates = study.executions.filter(
  (item): item is DiagnosticExecutionRecord =>
    item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED' && item.envelope !== null
    && isCurrentForScenario(item, requiredScenario(study, item.scenarioId)),
);

const baseCandidates = candidates.filter(
  (item) => item.scenarioId === study.baseScenarioId,
);
const hypothesisCandidates = candidates.filter(
  (item) => item.scenarioId !== study.baseScenarioId,
);

<ExecutionPairSelector
  baseExecutions={baseCandidates}
  hypothesisExecutions={hypothesisCandidates}
  scenarios={study.scenarios}
  baseId={baseExecutionId}
  hypothesisId={hypothesisExecutionId}
  onChange={setPair}
/>
```

Não escolher silenciosamente a execução mais recente. Desabilitar “Comparar” quando
os lados são iguais, ausentes, stale ou incompatíveis. `StudyComparisonPage` lê
`studyId` de `useSearchParams`, carrega exatamente esse Estudo e não mantém resultado
de outro Estudo quando a query muda.

- [ ] **Step 7: Renderizar os sete eixos com tabela completa**

```tsx
<section aria-labelledby={`comparison-${axis.code}`}>
  <h2 id={`comparison-${axis.code}`}>{axis.ordinal}. {axis.title}</h2>
  <table>
    <caption>{axis.title}: base, hipótese e diferença</caption>
    <thead><tr><th>Métrica</th><th>Base</th><th>Hipótese</th><th>Diferença</th></tr></thead>
    <tbody>{axis.metrics.map(renderMetricRow)}</tbody>
  </table>
</section>
```

Manter a ordem canônica 1–7. Gráfico é complementar e só recebe métricas com a mesma
unidade; a tabela sempre contém os valores exatos. Mostrar limitações antes da
interpretação dos deltas.

- [ ] **Step 8: Rodar o gate focado do Dia 3**

Run:

```powershell
cd web
npm run test:unit -- src/hypotheses/comparison.test.ts src/hypotheses/components/ScenarioComparison.test.tsx src/pages/StudyComparisonPage.test.tsx src/pages/StudyDiagnosticPage.test.tsx src/diagnostics/components/DiagnosticHistory.test.tsx src/app/router.test.tsx
npm run lint
npm run typecheck
npm run build
```

Expected: PASS; build não inclui mudanças em cliente gerado ou schemas.

- [ ] **Step 9: Checkpoint sem commit**

Registrar o gate no rascunho de aceite e verificar `git diff --check`. Não fazer
stage nem commit.

---

### Task 4: Aceite integrado, regressão e documentação — Dia 4

**Files:**
- Create: `web/e2e/stage4-mvp.spec.ts`
- Modify: `web/src/e2eBridge.ts`
- Modify: `web/playwright.config.ts`
- Create: `docs/frontend/etapa-4-mvp-operacao.md`
- Create: `docs/frontend/etapa-4-mvp-aceitacao.md`
- Carry unchanged from approved planning: `docs/frontend/etapa-4-auditoria-partida.md`
- Carry unchanged from approved planning: `docs/frontend/etapa-4-planejamento.sha256`
- Carry unchanged from approved planning: `docs/superpowers/specs/2026-09-20-frontend-etapa-4-design.md`
- Carry unchanged from approved planning: `docs/superpowers/specs/2026-09-20-frontend-etapa-4-mvp-design.md`
- Carry unchanged from approved planning: `docs/superpowers/plans/2026-09-20-frontend-etapa-4-plano-tecnico.md`
- Carry unchanged from approved planning: `docs/superpowers/plans/2026-09-20-frontend-etapa-4-mvp-plano-tecnico.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: fluxo completo T1–T3.
- Produces: dois E2E determinísticos, evidência de regressão e runbook que separa claramente MVP de Evoluções A/B/C.

- [ ] **Step 1: Escrever o E2E observado antes do ajuste final da UI**

```ts
test('carteira observada mantém ordens e compara hipótese de janela', async ({ page }) => {
  await seedStage4ObservedStudy(page);
  await page.goto('/carteira/study-observed');
  await page.getByRole('button', { name: 'Criar hipótese' }).click();
  await page.getByLabel('Janela em dias').fill('3');
  await page.getByRole('button', { name: 'Salvar hipótese' }).click();
  await runScenarioDiagnostic(page, 'Cenário base');
  await runScenarioDiagnostic(page, 'Hipótese janela 3 dias');
  await page.getByRole('link', { name: 'Comparar resultados' }).click();
  await expect(page.getByText('Dados observados')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. Potencial estrutural' })).toBeVisible();
  await expectInputChanges(page, ['Janela']);
  await expectExactAxisHeadingOrder(page, EXPECTED_SEVEN_AXES);
  await expectKnownDelta(page, 'Volume casado', EXPECTED_OBSERVED_MATCHED_DELTA);
  const persisted = await stage4Snapshot(page, 'study-observed');
  expect(persisted.scenarios[0]!.orderFingerprint)
    .toBe(persisted.scenarios[1]!.orderFingerprint);
  expect(persisted.scenarios[0]!.provenanceFingerprint)
    .toBe(persisted.scenarios[1]!.provenanceFingerprint);
});
```

- [ ] **Step 2: Escrever o E2E simulado por dois Perfis**

```ts
test('dois Perfis geram pool sintética e hipótese de mix', async ({ page }) => {
  await seedStage4ProfileSourceStudy(page);
  await page.goto('/carteira/study-profile-source');
  const preparation = await installPreparationHarness(page, { failFirst: true });
  await selectAndCompleteProfilesWithKeyboard(page, ['Empresa A', 'Empresa B']);
  await pressFocusedAction(page, 'Preparar simulação por Perfil');
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeFocused();
  await expectProfileDraftStillFilled(page);
  await pressFocusedAction(page, 'Tentar novamente');
  await createMixHypothesisWithKeyboard(page, '-0.1');
  await runBothDiagnosticsAndOpenComparisonWithKeyboard(page);
  await expect(page.getByText('Simulação baseada em Perfil')).toBeVisible();
  await expect(page.getByText('As ordens desta análise são sintéticas')).toBeVisible();
  await expect(page.getByRole('heading', { name: '5. Dependência da composição' })).toBeVisible();
  await expectInputChanges(page, ['Mix OUT/IN']);
  await expect(page.getByText('UNPAIRED_DIAGNOSTICS')).toBeVisible();
  expect(preparation.calls).toBe(3); // falha explícita + base + hipótese; sem duplicação
  const createdStudyId = await currentStudyId(page);
  const persisted = await stage4Snapshot(page, createdStudyId);
  expect(persisted.profileLineage).toEqual([
    { profileId: PROFILE_A, participantId: PARTICIPANT_A, seed: SEED_A },
    { profileId: PROFILE_B, participantId: PARTICIPANT_B, seed: SEED_B },
  ]);
  await page.reload();
  await reselectExecutionPair(page);
  await expect(page.getByRole('heading', { name: 'Comparação agregada' })).toBeVisible();
});
```

- [ ] **Step 3: Implementar somente fixtures determinísticas no bridge E2E**

```ts
type Stage4Fixture = 'OBSERVED_HYPOTHESIS' | 'PROFILE_HYPOTHESIS';

type Stage4Snapshot = Readonly<{
  studyId: string;
  baseScenarioId: string;
  scenarios: readonly Readonly<{
    id: string;
    revision: number;
    inputFingerprint: string;
    orderFingerprint: string;
    provenanceFingerprint: string;
  }>[];
  profileLineage: readonly Readonly<{
    profileId: string; participantId: string; seed: string;
  }>[];
  diagnosticExecutionIds: readonly string[];
  sourceLabels: readonly string[];
}>;

// Acrescentar à interface MotorE2EBridge e ao objeto congelado instalado.
seedStage4(fixture: Stage4Fixture): Promise<void>;
stage4Snapshot(studyId: string): Promise<Stage4Snapshot>;
```

`seedStage4` abre `IndexedDbApplicationRepository`, salva empresas/casos/Perfis pelas
operações públicas e salva o Estudo V3 por `saveStudy`; `stage4Snapshot` relê o mesmo
repositório e calcula somente dados de asserção. Os helpers do spec Playwright chamam
essas duas operações, navegam por roles/labels e interceptam apenas o transporte HTTP
como nos E2E existentes. Não adicionar atalhos que substituam preparação, domínio,
`ApplicationRepository` ou os serviços reais do front-end.

No `playwright.config.ts`, estender somente o `testMatch` local:

```ts
testMatch: /(?:foundation|study-.*|company-profiles|diagnostic-jobs|stage2-regression|stage4-mvp)\.spec\.ts/,
```

Antes de executar, provar coleta do novo spec:

```powershell
cd web
npm run test:e2e -- --list stage4-mvp.spec.ts
```

Expected: lista exatamente os dois testes acima; zero “No tests found”.

- [ ] **Step 4: Rodar os E2E focados e corrigir somente blockers do MVP**

Run, como dois comandos independentes:

```powershell
cd web
npm run test:e2e -- stage4-mvp.spec.ts
npm run test:e2e -- stage4-mvp.spec.ts
```

Expected: 2 testes PASS em duas execuções consecutivas.

- [ ] **Step 5: Verificar teclado, foco e zoom no mesmo E2E**

O helper do E2E simulado percorre o caminho crítico somente por teclado (seleção,
campos, confirmação, retry, execução, seleção do par e comparação). Verificar foco no
retry após erro e no título após cada navegação. Adicionar viewport estreita e zoom:

```ts
await expect(page.getByRole('heading', { name: 'Comparação agregada' })).toBeFocused();
await page.setViewportSize({ width: 640, height: 900 });
await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
await expect(page.getByRole('table', { name: /base, hipótese e diferença/i })).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  .toBe(true);
await expect(page.getByText('Simulação baseada em Perfil')).toBeVisible();
```

As tabelas podem rolar dentro de regiões focáveis identificadas; a página não pode
ter overflow horizontal global. Origem, disponibilidade e sinais dos deltas precisam
ter texto/ícone além de cor. Não bloquear o prazo por refinamento visual que não
impeça leitura ou operação.

- [ ] **Step 6: Rodar a regressão web completa**

Run:

```powershell
cd web
npm run test:unit
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Expected: todos os comandos com exit code 0.

- [ ] **Step 7: Rodar a regressão Python sem alterar o backend**

Run, a partir da raiz:

```powershell
pytest -q
python -O -m pytest -q
```

Expected: suíte existente PASS nos dois modos; qualquer falha introduzida pelo diff
é blocker, mesmo que nenhum arquivo Python tenha sido alterado.

- [ ] **Step 8: Escrever operação e aceite com limites explícitos**

`etapa-4-mvp-operacao.md` deve conter:

```markdown
## O que funciona agora
- carteira observada: janela e sete custos escalares;
- simulação por Perfil: volume, mix, ticket, prazo, janela e sete custos escalares.

## O que não concluir
- ordens sintéticas não são previsão;
- diferença agregada não é causalidade;
- p50 de diagnósticos não pareados é somente descritivo.

## Próximas evoluções
- A: Receita, proveniência, V4, migrations e histórico;
- B: composição e alterações por participante;
- C: pareamento estatístico, marginal, benchmark e concorrência endurecida.
```

`etapa-4-mvp-aceitacao.md` registra SHA, navegador, comandos, contagens, duração,
evidências dos dois fluxos e qualquer limitação observada. Não declarar produção.

- [ ] **Step 9: Atualizar MAPA, testing e Diário no mesmo commit publicável**

O Diário registra sintoma, causa, mudança e invalidações. Não copiar contexto de
negócio do vault. O MAPA aponta para spec, plano, operação e aceite do MVP e mantém a
visão completa como evolução posterior.

- [ ] **Step 10: Gate final de integridade**

Run:

```powershell
git diff --check
git status --short
git diff --name-only
```

Expected:

- nenhum arquivo em `motor/`, `servidor/`, `web/src/api/` ou `web/src/storage/`;
- nenhum schema ou migration alterado;
- somente arquivos enumerados na allowlist explícita do Step 11; nenhum lockfile novo;
- zero teste falhando;
- zero linguagem de causalidade ou benefício individual.

- [ ] **Step 11: Gate de commit final**

Inspecionar o worktree e fazer stage por allowlist explícita, nunca `git add .`:

```powershell
if ($env:MOTOR_ISSUE_ID -notmatch '^MOT-[1-9][0-9]*$') { throw 'ID Linear real obrigatório' }
$allowed = @(
  'web/src/hypotheses/profileMvp.ts',
  'web/src/hypotheses/profileMvp.test.ts',
  'web/src/hypotheses/hypothesis.ts',
  'web/src/hypotheses/hypothesis.test.ts',
  'web/src/hypotheses/comparison.ts',
  'web/src/hypotheses/comparison.test.ts',
  'web/src/hypotheses/components/ProfileScenarioBuilder.tsx',
  'web/src/hypotheses/components/ProfileScenarioBuilder.test.tsx',
  'web/src/hypotheses/components/HypothesisBuilder.tsx',
  'web/src/hypotheses/components/HypothesisBuilder.test.tsx',
  'web/src/hypotheses/components/ScenarioComparison.tsx',
  'web/src/hypotheses/components/ScenarioComparison.test.tsx',
  'web/src/pages/StudyPortfolioPage.tsx',
  'web/src/pages/previewFlow.test.tsx',
  'web/src/pages/StudyDiagnosticPage.tsx',
  'web/src/pages/StudyDiagnosticPage.test.tsx',
  'web/src/pages/StudyComparisonPage.tsx',
  'web/src/pages/StudyComparisonPage.test.tsx',
  'web/src/diagnostics/components/DiagnosticHistory.tsx',
  'web/src/diagnostics/components/DiagnosticHistory.test.tsx',
  'web/src/study/domain.ts',
  'web/src/study/domain.test.ts',
  'web/src/study/fingerprints.ts',
  'web/src/study/fingerprints.test.ts',
  'web/src/preparation/resolvePortfolioSource.ts',
  'web/src/preparation/resolvePortfolioSource.test.ts',
  'web/src/preparation/buildPreviewRequest.test.ts',
  'web/src/app/router.tsx',
  'web/src/app/router.test.tsx',
  'web/src/styles/global.css',
  'web/src/e2eBridge.ts',
  'web/e2e/stage4-mvp.spec.ts',
  'web/playwright.config.ts',
  'docs/frontend/etapa-4-auditoria-partida.md',
  'docs/frontend/etapa-4-planejamento.sha256',
  'docs/frontend/etapa-4-mvp-operacao.md',
  'docs/frontend/etapa-4-mvp-aceitacao.md',
  'docs/superpowers/specs/2026-09-20-frontend-etapa-4-design.md',
  'docs/superpowers/specs/2026-09-20-frontend-etapa-4-mvp-design.md',
  'docs/superpowers/plans/2026-09-20-frontend-etapa-4-plano-tecnico.md',
  'docs/superpowers/plans/2026-09-20-frontend-etapa-4-mvp-plano-tecnico.md',
  'docs/DIARIO-DE-MUDANCAS.md', 'docs/MAPA.md', 'docs/testing.md'
)
git diff --name-only
git add -- $allowed
git diff --cached --check
$expected = @($allowed | Sort-Object -Unique)
$staged = @(git diff --cached --name-only | Sort-Object -Unique)
$unexpected = @(Compare-Object -ReferenceObject $expected -DifferenceObject $staged)
if ($unexpected.Count -ne 0) {
  $unexpected | Format-Table | Out-String | Write-Error
  throw 'Stage diverge da allowlist exata.'
}
git commit -m "test: fecha aceite do MVP da etapa 4 ($env:MOTOR_ISSUE_ID)"
```

O `Compare-Object` bloqueia arquivo estranho e arquivo esperado ausente. O Diário e o
código entram juntos neste único commit.
Push, PR, merge e deploy continuam fora do escopo até autorização separada.

---

## 4. Critérios de aceite rastreáveis

| Critério | Task | Prova |
|---|---|---|
| ordens reais permanecem intactas | T1, T2, T4 | unitário + E2E observado |
| Perfil deriva apenas volume, ticket e OUT | T1 | `profileMvp.test.ts` |
| ausência bloqueia sem fallback | T1, T2 | domínio + componente |
| um Perfil vira um participante sintético | T1, T2 | request com dois Perfis |
| simulação cria outro Estudo, sem sobrescrever observado | T1, T2, T4 | domínio + página + E2E |
| cada ordem sintética tem proveniência do participante | T1 | resolver → preview com dois Perfis |
| base não é alterada pela hipótese | T1 | `appendScenario` + freeze fixture |
| observado muda somente janela/custo | T1, T2 | matriz negativa + UI |
| simulado muda os seis grupos | T1, T2 | matriz parametrizada |
| geração muda → nova preparação | T2 | spy de uma chamada oficial |
| janela/custo → mesmas ordens e zero preparação | T1, T2 | fingerprint + spy HTTP zero |
| hipótese é persistida antes de navegar | T2 | teste de `flush`, navegação e conflito |
| qualquer cenário pode executar diagnóstico | T3 | teste de rota por `scenarioId` |
| estado diagnóstico não vaza entre cenários | T3 | current/stale/history/resume/retry/terminal |
| comparação é hipótese menos base | T3 | Decimal.js e fixtures negativas |
| sete eixos aparecem na ordem | T3, T4 | component test + E2E |
| ausência não vira zero | T3 | fixture `INSUFFICIENT_COVERAGE` |
| p50 não pareado é limitado | T3 | `UNPAIRED_DIAGNOSTICS` visível |
| observado e sintético não se confundem | T2–T4 | rótulos + incompatibilidade |
| Etapas 1–3 não regridem | T4 | gates web, E2E e Python |

## 5. Cortes proibidos para cumprir o prazo

Se houver pressão no quarto dia, não cortar:

- preservação das ordens observadas;
- os seis grupos aprovados para simulação por Perfil;
- uso do motor e diagnóstico existentes;
- bloqueio de ausência e incompatibilidade;
- tabela exata de comparação;
- regressão automatizada.

Podem ser simplificados sem mudar o produto aprovado:

- gráfico complementar, mantendo a tabela;
- microcopy secundária, mantendo avisos normativos;
- animações e refinamentos visuais;
- atalhos de navegação redundantes.

## 6. Evoluções posteriores — explicitamente fora dos quatro dias

### A. Tornar o histórico auditável e durável

1. Receita imutável e versionada;
2. endpoint próprio Perfil → Receita → materialização;
3. origem `OPERATIONAL_PROFILE` e proveniência por campo;
4. fingerprints encadeados Perfil → Receita → ordens → cenário;
5. `StudyDocument` V4 e migrations transacionais;
6. variantes/comparações append-only e reabertura após reload;
7. concorrência específica da Etapa 4 em duas abas.

### B. Ampliar composição de carteira

1. adicionar/remover Perfis e participantes dentro da hipótese;
2. volume, mix, ticket, prazo, arquétipo, eFX e finalidade por participante;
3. múltiplas hipóteses nomeadas por base;
4. compatibilidade estrutural tipada;
5. pareamento de participantes comuns.

### C. Análise estatística e capacidade

1. comparação canônica no servidor;
2. pareamento de seeds e repetição entre base/hipótese;
3. distribuições completas 10/30/100 com incerteza;
4. efeito marginal apenas para alteração elementar;
5. benchmarks de participantes, ordens, variantes, memória, tempo e payload;
6. caps de produto medidos;
7. aceite de produção, reload/retry/late-response e acessibilidade ampliada.

Cada bloco futuro recebe spec e plano próprios. O documento completo substituído
`2026-09-20-frontend-etapa-4-plano-tecnico.md` permanece referência, não fila
implícita de trabalho.

## 7. Definition of Done do MVP

O MVP está pronto somente quando:

- T1–T4 estão completos dentro de quatro dias úteis;
- os dois E2E passam duas vezes seguidas;
- unit, lint, typecheck, build, E2E e pytest normal/otimizado passam;
- dados observados são byte-a-byte equivalentes antes/depois da hipótese;
- a simulação por dois Perfis produz dois participantes e rótulo sintético;
- a comparação mostra sete seções, diferenças de entrada e limitações;
- nenhuma funcionalidade das Evoluções A/B/C foi iniciada silenciosamente;
- documentação registra que o resultado é apropriado para testes internos, não uma
  entrega de produção ou conclusão regulatória.
