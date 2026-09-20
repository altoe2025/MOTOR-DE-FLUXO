# Etapa 3 — aceite condicional e handoff

## Decisão

**Aceite técnico local: CONDITIONAL.** O candidato auditado é
`03e87b8222d26ef141ef519c8716b4e281b8a7b8`. O gate global foi executado uma única
vez nesse SHA e ficou integralmente verde. Não há finding Critical ou Important de
correção de produto aberto.

A condição remanescente é de evidência: S15.14 exige que teclado e zoom a 200%
permaneçam usáveis no diagnóstico robusto. A implementação usa controles nativos,
foco programático, tabelas semânticas e container responsivo; gráfico e tabela têm
reconciliação automatizada. Porém o Playwright aplicou 200% ao diagnóstico legado,
não à rota nova `/estudos/:studyId/diagnostico`, e não percorreu por teclado essa
página. Pelo critério “não executado não é PASS”, S15.14 fica **PARTIAL**.

Push, PR, CI publicado, aprovação de merge e merge não foram executados nem são
autorizados por este documento. Também não foi iniciada a Etapa 4.

## Linha de evidência

| Marco | SHA | Evidência |
|---|---|---|
| Base integrada | `97601bf290128a199668f15efd9980beb5ca4ef8` | merge da Etapa 2 usado pela auditoria de partida |
| Perfil, storage e empresas | `9f1e975`–`d5b0717` | contratos V3, perfil puro, DB 2, páginas e vínculo por CAS |
| Contratos e executor | `cdf4c34`–`2567dcf` | schemas públicos, sete eixos, fila, cancelamento, retry e isolamento |
| Cliente e apresentação | `b0845d9`–`407bd08` | reserva/terminal append-only, restart, ECharts e UI diagnóstica |
| Integrações finais | `56f462e`–`d8fd3e1` | ordem canônica fixa e comparação temporal restrita |
| Aceitação inicial invalidada | `404533e` | gate revelou dois I001 e duas expectativas E2E desatualizadas; não é usado como aceite |
| Candidato final | `03e87b8222d26ef141ef519c8716b4e281b8a7b8` | gate global verde, 772 Python, 388 web e 14 E2E |

## Auditoria dos fluxos de autoridade

### Casos → Perfil → estudo

```text
ApplicationRepository.listObservedCases
→ ProfileBuilder seleciona casos e expõe blockers/warnings
→ checkProfileCompatibility
→ calculateOperationalProfile (puro, Decimal, ordenação canônica)
→ validateOperationalProfile + fingerprints
→ StudyController.appendOperationalProfileVersion
→ IndexedDB.profile_versions (append-only, versão única por empresa)
→ attachOperationalProfileEvidence
→ saveStudy(expectedRevision, operationId)
→ StudyDocument 3.0.0/evidenceSnapshots
→ páginas de Empresa, estudo e comparação temporal
```

Autoridade confirmada:

- owner e empresa são verificados no cálculo, controlador, repositório e vínculo;
- `selectionFingerprint` identifica casos/revisões/fingerprints e
  `documentFingerprint` identifica o documento completo sem autocontê-lo;
- versões são cópias destacadas, sequenciais e imutáveis;
- o snapshot anexado é integral; nova versão não o modifica;
- CAS do estudo é a autoridade entre abas; `BroadcastChannel` apenas notifica;
- estados ausentes usam `EvidenceValue`, sem `value` nos estados indisponíveis;
- Perfil não entra em `PortfolioSource` e não produz ordens.

### Cenário → diagnóstico → UI

```text
ScenarioDocument + inputFingerprint + snapshots
→ buildPreviewRequest
→ buildDiagnosticRequest e validator gerado
→ flush do estudo
→ reserva DIAGNOSTIC/QUEUED por CAS
→ POST /api/v1/diagnosticos autenticado
→ registry owner-scoped + FIFO + ProcessPoolExecutor
→ execute_repetition com seeds explícitas
→ summarize_repetition + analyze_diagnostic_repetitions
→ consequências/limitações com evidence_refs validadas
→ JobSnapshot terminal + DiagnosticEnvelope
→ validação de job/envelope e epoch no cliente
→ terminal único append-only por CAS
→ IndexedDB.executions
→ distribuição, execução selecionada, sete eixos, proveniência e histórico
```

Autoridade confirmada:

- `job_id == idempotency_key`, mas a chave do registry é `(ownerSub, job_id)`;
- fingerprints, IDs, revisão e tentativa são verificados antes de cada persistência;
- polling cobre `QUEUED`, `RUNNING`, `AGGREGATING` e `CANCEL_REQUESTED`;
- progresso é transitório; somente reserva e terminal chegam ao histórico;
- terminal duplicado, órfão, divergente ou registro `RUNNING` artesanal são rejeitados;
- 404 de reserva/resultado ativo vira `INTERRUPTED`, sem novo POST automático;
- entrada fixa não fabrica distribuição; entrada gerada usa exatamente as seeds do
  request; falha não publica distribuição parcial;
- a UI recebe envelope validado e não recalcula regra financeira.

## Matriz S15

Salvo indicação contrária, a execução citada ocorreu no SHA final `03e87b8`. Os
nomes de teste abaixo são âncoras de reprodução; o gate global é a evidência do
mesmo encadeamento de código.

| S15 | Estado | Teste/comando | Evidência |
|---:|---|---|---|
| 1. Perfil e fingerprints determinísticos | PASS | `npm --prefix web run test:unit -- src/profiles` — `is byte-deterministic under case and operation reordering`, validação de fingerprints | 388 unitários globais; implementação `3ac548e`–`a407dcd` |
| 2. Incompatibilidade bloqueia; overlap/lacunas aparecem | PASS | `compatibility.test.ts`, `calculateOperationalProfile.test.ts`, `profileComponents.test.tsx` | blockers, warnings, `overlapDays` e `gapDays` verificados; `3ac548e`/`d5b0717` |
| 3. Ausência não vira zero | PASS | `validation.test.ts`, `companyOverview.test.ts`, `presentation.test.ts` | estado sem `value`, empresa vazia e chart sem série zero; `a407dcd`/`42cecbb`/`407bd08` |
| 4. Perfil imutável e nova seleção cria próxima versão | PASS | `indexedDbApplicationRepository.test.ts`; `company-profiles.spec.ts` | append sequencial, conflito e v1/v2 no browser; 14 E2E |
| 5. Estudo conserva snapshot integral | PASS | `study/domain.test.ts`; `company-profiles.spec.ts` | cópia destacada e v1 preservada após v2; `6fcca62`/`404533e` |
| 6. Migration 1→2 sem drift | PASS | `npm --prefix web run test:unit -- src/storage/migrations.test.ts src/storage/stage3Contract.test.ts` | fixture V1, operations, rollback, idempotência e schema futuro; 388 unitários |
| 7. Fila, limites e owner | PASS | `python -m pytest tests/web_api/test_diagnostics_executor.py tests/web_api/test_stage3_acceptance.py -q` | limites 3/32, teto 2, FIFO, UUID igual em owners distintos e isolamento; 772 Python |
| 8. Cancelamento e terminal único | PASS | mesmos testes Python; `diagnostic-jobs.spec.ts`; `diagnosticExecutionService.test.ts` | queued imediato, running entre repetições, spawn real sem órfão e terminal único |
| 9. Idempotência, conflito e retry | PASS | `test_idempotencia_conflito_retry_e_retencao`; `diagnosticExecutionService.test.ts`; E2E jobs | mesmo job, 409 em conflito e tentativa nova no retry; `2567dcf`/`9e68215` |
| 10. Entrada fixa não vira distribuição | PASS | `test_fixed_input_keeps_summary_but_never_fabricates_distribution`; `diagnostic-jobs.spec.ts` | razão canônica visível no browser; 772 Python e 14 E2E |
| 11. Seeds registradas reproduzem geração | PASS | `test_worker_generated_usa_exatamente_as_seeds_do_plano`; `buildDiagnosticRequest.test.ts` | plano completo/único e worker usa os valores exatos; `b2c5f01`/`2567dcf` |
| 12. Sete eixos reconciliam | PASS | `python -m pytest tests/web_api/test_diagnostics_analysis.py -q`; `DiagnosticResult.test.tsx` | fixtures manuais cobrem eixos 1–7 e UI mantém ordem canônica; `9278265`–`f9ebdc9` |
| 13. Consequências/limitações determinísticas | PASS | `test_consequences_are_versioned_sorted_and_all_references_resolve`; `test_limitations_report_conditions_without_changing_metrics` | refs inexistentes falham; ordenação e condições estáveis |
| 14. Gráfico/tabela, teclado e zoom 200% | **PARTIAL** | `presentation.test.ts`, `EChart.test.tsx`, `DiagnosticResult.test.tsx`; `npm --prefix web run test:e2e` | mesma série, tabela no DOM, foco/controles semânticos. Zoom 200% foi executado apenas no diagnóstico legado; falta percurso browser da página robusta |
| 15. Comparação não mistura empresas/métricas | PASS | `npm --prefix web run test:unit -- src/companies/temporalComparison.test.ts src/companies/components/TemporalComparison.test.tsx` | empresa, unidade, definição e método incompatíveis bloqueiam; `64c5433`–`d8fd3e1` |
| 16. Troca de conta não expõe dados | PASS | `studyController.test.ts`, `diagnosticExecutionService.test.ts`, `test_stage3_acceptance.py`, `company-profiles.spec.ts` | A→B→A, resposta tardia, job 404 e perfis/snapshots vazios para B |
| 17. Etapas 1 e 2 continuam passando | PASS | `python -m pytest -q`; `npm --prefix web run test:unit`; `npm --prefix web run test:e2e` | 772 + 2 skipped, 388/51 e 14 E2E; `stage2-regression.spec.ts` inclui origens, migration, histórico e terminal único |
| 18. Contratos sem drift e Python sob `-O` | PASS | geradores + diff; `python -O -m pytest -q` | quatro artefatos sem diff; 772 + 2 skipped em `-O` |

## Gate global do candidato final

| Comando | Resultado em `03e87b8` |
|---|---|
| `python -m servidor.export_openapi` | aprovado |
| `npm --prefix web run generate:api` | aprovado |
| diff dos quatro contratos gerados | limpo |
| `python -m pytest -q` | 772 aprovados, 2 ignorados |
| `python -O -m pytest -q` | 772 aprovados, 2 ignorados |
| `python -m ruff check servidor tests/web_api` | aprovado |
| `python -m mypy servidor` | aprovado, 33 arquivos |
| `npm --prefix web run test:unit` | 388 aprovados em 51 arquivos |
| `npm --prefix web run typecheck` | aprovado |
| `npm --prefix web run lint` | aprovado |
| `npm --prefix web run build` | aprovado; aviso conhecido de chunks |
| `npm --prefix web run test:e2e` | 14 aprovados em 48,7 s |
| `python -m tests.web_api.scan_credentials` | aprovado; 376 textos e 10 binários |
| `git diff --check` | aprovado; avisos CRLF informativos |

Os dois skips Python são cenários de symlink não permitido no Windows observado. A
medição sintética serial registrou 133,3 ms/28.281 bytes em 10 repetições,
384,6 ms/39.681 bytes em 30 e 959,1 ms/64.173 bytes em 100. Não é SLA.

## Findings e limites preservados

Nenhum finding Critical ou Important foi confirmado na auditoria T12. Limites que
não devem ser reclassificados como conclusão de negócio:

- auth real continua sem execução por ausência das três credenciais autorizadas;
- há aviso informativo de chunk Vite acima de 500 kB;
- ECharts pode aproximar a posição de coordenadas além da precisão numérica interna,
  embora a série adaptada e a tabela preservem a string decimal exata;
- `ProfileBuilder` fixa ID e `createdAt` ao montar o componente, não no clique de
  confirmação; foi classificado como Minor, sem quebra de imutabilidade ou versão;
- a compatibilidade pode acessar campos aninhados antes de emitir o blocker genérico
  `INVALID_DOCUMENT` para um objeto runtime profundamente malformado; validações das
  fronteiras persistidas continuam estritas. Classificado como Minor;
- fila e retenção são locais ao processo; não há durabilidade, coordenação
  multi-instância ou replay integral.

## Condição para aceite integral e integração

Para converter `CONDITIONAL` em `PASS`, execute no SHA candidato um Playwright da
página `/estudos/:studyId/diagnostico` que, a 200%, percorra controles por teclado e
confirme acesso à distribuição, execução selecionada, sete eixos e tabelas sem perda
de ação ou conteúdo. Qualquer alteração de código invalida o gate global atual e
exige novo gate no novo SHA.

Depois disso, publicação ainda exige ações separadas: push/PR, CI da revisão
publicada, revisão e aprovação explícita do Gabriel. Este documento não as autoriza.

## Handoff para a Etapa 4

A Etapa 4 recebe:

- `OperationalProfileVersion` 1.0.0 imutável, com método, cobertura, métricas,
  proveniência e fingerprints;
- snapshots integrais de perfil no `StudyDocument` 3.0.0;
- `PortfolioSourceSnapshot.generationInputSnapshot` apenas quando a origem atual já
  preserva receita geradora;
- histórico diagnóstico append-only e envelopes 1.0.0.

A receita geradora de Perfil Operacional **não existe**. A próxima etapa precisa
definir e aprovar como um perfil produz ordens sintéticas antes de considerar uma
quarta origem. Não criar automaticamente `OPERATIONAL_PROFILE` em `PortfolioSource`,
endpoint de geração por perfil, variantes, hipótese, marginal, replay, fila
distribuída ou mudança no motor.
