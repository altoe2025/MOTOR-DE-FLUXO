# Front-end — Etapa 3: Empresas, Perfis e Diagnóstico Robusto

**Data:** 2026-09-20

**Status:** aprovada e implementada localmente; aceite técnico `CONDITIONAL` em 2026-09-20

**Base:** `origin/main` em `97601bf290128a199668f15efd9980beb5ca4ef8`

**Candidato auditado:** `03e87b8222d26ef141ef519c8716b4e281b8a7b8`; sem push, PR ou merge

**Deriva de:** `2026-09-19-frontend-motor-de-fluxo-design-v2.md`, seção 29

**Auditoria:** `docs/frontend/etapa-3-auditoria-partida.md`

## S01 — Objetivo e resultado da etapa

Entregar um incremento em que o usuário:

1. navega entre **Empresas** e **Estudos**;
2. entende uma empresa por seus Casos Observados, cobertura, lacunas e estudos;
3. seleciona casos compatíveis e confirma uma versão imutável de Perfil Operacional;
4. vincula o snapshot de uma versão de perfil a um estudo sem transformá-lo em
   carteira executável;
5. executa diagnóstico robusto quando a origem possui receita geradora reproduzível;
6. acompanha fila, progresso, cancelamento, falha e retry;
7. distingue distribuição de repetições de uma execução individual;
8. lê os sete eixos por métricas, gráficos, tabelas, proveniência, consequências e
   limitações;
9. compara temporalmente casos e versões de perfil da mesma empresa sem antecipar a
   comparação de cenários da Etapa 4.

Ausência, incompatibilidade e cobertura insuficiente são estados explícitos. Nenhum
deles é serializado ou apresentado como zero, sucesso ou conclusão.

## S02 — Limites

Não fazem parte desta etapa:

- usar Perfil Operacional como quarta origem de `PortfolioSource`;
- gerar ordens a partir de perfil;
- variantes, cenário-base × hipótese, comparação marginal ou benefício individual;
- Replay, chat analítico, PDF, modo de apresentação ou publicação;
- tela de importação de arquivos;
- persistência remota de jobs;
- mudar `motor/`, P0, regras de custo ou números publicados;
- inferir premissas regulatórias, comerciais ou dados ausentes.

O importador continua terminando em `ObservedCase` confirmado. A Etapa 3 consome
casos já persistidos e não passa a interpretar arquivos.

## S03 — Abordagens avaliadas

### S03.1 Recomendada: perfil local, diagnóstico no servidor

O navegador calcula e versiona perfis por funções puras; o servidor executa apenas
trabalho computacional do diagnóstico. O IndexedDB permanece fonte local de
Empresas, Casos, Perfis, Estudos e execuções terminais.

**Por quê:** evita transmitir casos apenas para resumi-los, mantém a porta única de
persistência, reutiliza `decimal.js`, preserva o motor no servidor e permite fila e
cancelamento reais fora do ciclo de vida de um componente React.

**Custo:** o método de perfil precisa de contrato TypeScript e testes dourados fortes;
jobs em memória não sobrevivem a reinício do processo.

### S03.2 Alternativa: perfil e diagnóstico no servidor

Centralizaria os dois cálculos, mas faria o front enviar seleções completas de casos
para uma API que não é necessária ao produto local e aumentaria a superfície de
retenção de dados observados. Venceria quando `ApiRepository` remoto se tornasse a
fonte principal.

### S03.3 Alternativa: tudo no navegador

Eliminaria o executor HTTP, mas exigiria portar ou duplicar geração e motor, não
ofereceria isolamento de CPU confiável e violaria a fonte de verdade Python. Está
rejeitada.

## S04 — Navegação e rotas

A navegação global contém somente:

- **Empresas** → `/empresas`;
- **Estudos** → `/estudos`.

Rotas da empresa:

```text
/empresas
/empresas/:companyId
/empresas/:companyId/casos
/empresas/:companyId/perfis
/empresas/:companyId/estudos
```

Rotas do estudo:

```text
/estudos/:studyId/carteira
/estudos/:studyId/diagnostico
/estudos/:studyId/dados
```

`/estudos/:studyId` redireciona para `carteira`. Os placeholders de Comparar e Replay
continuam visíveis apenas como destinos futuros do estudo, sem funcionalidade nova.
`/diagnostico` passa a redirecionar para o diagnóstico do estudo selecionado ou para
`/estudos` quando não houver seleção.

## S05 — Empresas e Casos Observados

### S05.1 Read model

`deriveCompanyOverview` recebe `CompanyRecord`, casos, perfis e estudos já lidos pelo
`ApplicationRepository` e produz:

- total de casos e versões de perfil;
- primeiro e último dia coberto;
- união de dias cobertos e intervalos sem cobertura entre casos;
- volume e quantidade de ordens por direção;
- qualidade por blocker, warning e campo não coletado;
- vínculos de Caso → Estudo e Perfil → Estudo derivados dos snapshots preservados.

O read model não é persistido. Ele é recalculado de documentos imutáveis e não altera
casos, estudos ou perfis.

### S05.2 Filtros

O histórico aceita filtros combináveis:

```ts
type ObservedCaseFilters = Readonly<{
  startDate: string | null;
  endDate: string | null;
  sourceKinds: readonly string[];
  quality: 'ALL' | 'NO_WARNINGS' | 'WITH_WARNINGS' | 'WITH_BLOCKERS' | 'INCOMPLETE';
}>;
```

`sourceManifest.sourceKind` é o tipo do caso. `INCOMPLETE` significa ao menos um
campo relevante com proveniência `NOT_COLLECTED`; não significa valor zero.

## S06 — Perfil Operacional

### S06.1 Compatibilidade da seleção

Uma seleção é bloqueada quando:

- está vazia;
- mistura `ownerSub` ou `companyId`;
- repete `(caseId, revision)`;
- contém caso diferente de `CONFIRMED` ou `ARCHIVED`;
- contém documento inválido;
- repete o mesmo SHA-256 de fonte em casos diferentes sem confirmação explícita de
  que representam operações distintas.

Janelas sobrepostas, versões diferentes de normalização e cobertura descontínua são
avisos, não blockers. O sistema não soma casos por mês e não elimina sobreposição em
silêncio.

### S06.2 Estados de evidência

Toda métrica usa:

```ts
type EvidenceValue<T> =
  | Readonly<{ state: 'AVAILABLE'; value: T; evidence: readonly string[] }>
  | Readonly<{ state: 'NOT_COLLECTED'; reason: string; evidence: readonly string[] }>
  | Readonly<{ state: 'INSUFFICIENT_COVERAGE'; reason: string; evidence: readonly string[] }>
  | Readonly<{ state: 'INCOMPATIBLE'; reason: string; evidence: readonly string[] }>;
```

O renderizador não aceita `value` nos três estados indisponíveis.

### S06.3 Documento versionado

```ts
type OperationalProfileVersion = DeepReadonly<{
  schemaVersion: '1.0.0';
  id: string;
  ownerSub: string;
  companyId: string;
  version: number;
  createdAt: string;
  method: {
    id: 'operational-profile-v1';
    version: '1.0.0';
    percentileMethod: 'NEAREST_RANK';
  };
  selectedCases: readonly {
    caseId: string;
    caseRevision: number;
    caseFingerprint: string;
    window: ObservedCaseWindow;
  }[];
  selectionFingerprint: string;
  documentFingerprint: string;
  compatibility: ProfileCompatibilityReport;
  coverage: ProfileCoverage;
  metrics: OperationalProfileMetrics;
  provenance: ProfileProvenance;
}>;
```

Versões são append-only. `version` cresce por empresa dentro da transação de criação.
Não existe update ou delete de versão na Etapa 3.

### S06.4 Método `operational-profile-v1`

O cálculo ordena casos por `(window.startDate, window.endDate, id, revision)` e ordens
por `id`. JSON canônico remove `undefined`, ordena chaves e normaliza decimais antes
do SHA-256.

Métricas:

- **volume:** bruto OUT, IN e total em BRL;
- **frequência:** ordens por dia coberto e equivalente de 30 dias;
- **tickets:** mínimo, p25, p50, p75, máximo por contagem de ordens;
- **direção:** volume e fração OUT/IN;
- **prazo:** `deadlineDate - knownDate`, p50 e p90 por contagem e por volume;
- **finalidade:** volume, ordens e cobertura por código; ausência fica separada;
- **janelas:** duração, quantidade de casos, dias cobertos, sobreposição e lacunas;
- **sazonalidade:** volume e ordens por mês civil, acompanhados de dias cobertos e
  média por dia coberto.

Percentis usam observação no posto `max(1, ceil(q*n))`. Percentis ponderados por
volume usam o primeiro valor cuja soma acumulada alcança `q` do volume. Meses sem
caso não são inseridos como zero. Sazonalidade comparativa recebe
`INSUFFICIENT_COVERAGE` quando não há ao menos dois meses com dias cobertos; o perfil
ainda publica as observações mensais disponíveis.

Sobreposição não duplica o denominador de dias cobertos, mas as ordens de casos
distintos permanecem separadas. O aviso acompanha todas as métricas afetadas.

## S07 — Vínculo Perfil ↔ Estudo sem quarta origem

`PortfolioSource` permanece inalterado. `StudyDocument` 3.0.0 recebe:

```ts
type StudyEvidenceSnapshot = DeepReadonly<{
  kind: 'OPERATIONAL_PROFILE';
  capturedAt: string;
  profile: OperationalProfileVersion;
}>;

type StudyDocumentV3 = Omit<StudyDocumentV2, 'schemaVersion' | 'executions'> & {
  readonly schemaVersion: '3.0.0';
  readonly evidenceSnapshots: readonly StudyEvidenceSnapshot[];
  readonly executions: readonly ExecutionRecordV3[];
};
```

Anexar uma versão usa CAS e copia o documento completo. Nova versão do perfil não
altera snapshots anteriores. Esse vínculo informa contexto e proveniência; não
materializa ordens nem habilita execução.

Para fontes parametrizadas existentes, `PortfolioSourceSnapshot` passa a aceitar
`generationInputSnapshot?: EffectiveInput`. Execuções robustas exigem esse snapshot;
documentos migrados sem ele continuam legíveis, mas exibem limitação explícita.

## S08 — Persistência e migration

IndexedDB sobe da versão física 1 para 2, preservando o nome
`motor-fluxo:app:v2:<project-ref>:<owner-sub>`. O marcador `meta.schema_version`
também passa a 2.

Nova store:

| Store | Chave | Índices |
|---|---|---|
| `profile_versions` | `profile_version_id` | `by_owner`, `by_owner_company`, `by_owner_company_version` único |

Extensão da porta:

```ts
type AppendProfileVersionMutation = Readonly<{
  operationId: string;
  document: OperationalProfileVersion;
}>;

interface ApplicationRepositoryV3 extends ApplicationRepository {
  listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]>;
  getOperationalProfileVersion(id: string): Promise<OperationalProfileVersion | null>;
  appendOperationalProfileVersion(input: AppendProfileVersionMutation): Promise<OperationalProfileVersion>;
}
```

`ApplicationRepositoryV3` é notação de desenho. A implementação evolui o export
existente `ApplicationRepository` no mesmo arquivo; não cria uma segunda porta nem
expõe tipos de IndexedDB.

A upgrade transaction:

1. cria `profile_versions` e índices;
2. transforma cada estudo 2.0.0 em 3.0.0;
3. adiciona `kind: 'PREVIEW'` a execuções legadas;
4. adiciona `evidenceSnapshots: []`;
5. migra os resultados idempotentes de `operations` para que replay de um
   `operationId` antigo também devolva V3;
6. mantém snapshots legados sem `generationInputSnapshot`;
7. grava o marcador 2 somente no commit.

Falha aborta a transação inteira. Fixture real da versão 1 prova round-trip,
idempotência, rollback e rejeição de versão futura.

## S09 — Diagnóstico robusto e disponibilidade estatística

### S09.1 Modos

```ts
type DiagnosticSamplingPlan =
  | Readonly<{ kind: 'FIXED_INPUT'; previewRequest: PreviaRequest }>
  | Readonly<{
      kind: 'GENERATED_INPUT';
      preparationInput: EffectiveInput;
      repetitions: readonly {
        repetitionId: string;
        participantSeeds: Readonly<Record<string, string>>;
      }[];
    }>;
```

`FIXED_INPUT` possui `count=1`; sua distribuição tem estado
`INSUFFICIENT_COVERAGE` com razão `FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION`.
`GENERATED_INPUT` aceita 10, 30 ou 100 repetições, sem seeds repetidas por
participante. O request registra a lista completa; nenhum seed é implícito.

### S09.2 Request e resultado

```py
class DiagnosticRequest(StrictModel):
    api_version: Literal["1.0.0"]
    request_id: UUIDValue
    idempotency_key: UUIDValue
    study_id: UUIDValue
    scenario_id: UUIDValue
    scenario_revision: int
    input_fingerprint: Fingerprint
    sampling: FixedInputPlan | GeneratedInputPlan
    selected_repetition_id: UUIDValue
    provenance: dict[str, OrigemValor]

class DiagnosticEnvelope(StrictModel):
    api_version: Literal["1.0.0"]
    schema_version: Literal["1.0.0"]
    job_id: UUIDValue
    request_fingerprint: Fingerprint
    statistics: DiagnosticStatistics
    axes: DiagnosticAxes
    repetitions: list[RepetitionSummary]
    selected_execution: PreviewEnvelope
    consequences: list[DiagnosticConsequence]
    limitations: list[DiagnosticLimitation]
    provenance: DiagnosticProvenance
```

Somente a repetição escolhida guarda envelope completo. Todas as repetições guardam
resumo canônico, seed/fingerprint e métricas necessárias à distribuição.

### S09.3 Sete eixos

1. **Potencial estrutural:** bruto OUT/IN, desequilíbrio e teto agregado
   `2 * min(OUT, IN)`.
2. **Captura pela política:** casado total/intra/inter, potencial não capturado e
   fração capturada quando o denominador existe.
3. **Compatibilidade temporal:** prazos, D+0, espera por volume, fechamentos por
   janela/prazo/fim e truncamento de horizonte.
4. **Exposição residual:** volume remetido por direção, dia e finalidade.
5. **Dependência da composição:** participação por cliente, HHI, maior participação e
   concentração observada; sem contrafactual marginal.
6. **Robustez econômica:** distribuição de baseline, custo netado, economia e
   netabilidade, com p10/p25/p50/p75/p90 e amplitude; indisponível em entrada fixa.
7. **Perfil operacional da carteira:** ordens, ciclos, fila aberta máxima, vencimentos,
   espera e tempo de processamento.

As métricas derivam de requests e resultados canônicos; a UI nunca recalcula regra
do motor. Divisão por zero retorna estado indisponível, não `0`.

### S09.4 Consequências e limitações

Consequências são regras versionadas, sem adjetivos de decisão:

```py
class DiagnosticConsequence(StrictModel):
    rule_id: str
    rule_version: Literal["1.0.0"]
    axis: AxisCode
    statement_code: str
    evidence_refs: list[str]
```

Exemplos de gatilho exato: ausência de direção oposta; potencial não capturado maior
que zero; resíduo transfronteiriço maior que zero; dispersão econômica observada
maior que zero. O texto de interface é mapeado por `statement_code`.

Limitações incluem código, severidade analítica, condição e referências. Casos
obrigatórios: entrada fixa sem distribuição, receita geradora ausente, cobertura de
campo insuficiente, horizonte truncado, repetição falha e custos com proveniência não
observada. Uma limitação não muda métrica nem vira veredito.

## S10 — Executor robusto

### S10.1 Endpoints

```text
POST /api/v1/diagnosticos                         → 202 JobSnapshot
GET  /api/v1/diagnosticos/{job_id}                → JobSnapshot
GET  /api/v1/diagnosticos/{job_id}/resultado      → DiagnosticEnvelope
POST /api/v1/diagnosticos/{job_id}/cancelamentos  → JobSnapshot
POST /api/v1/diagnosticos/{job_id}/retries        → 202 JobSnapshot
```

Jobs são sempre filtrados pelo `sub` autenticado. ID existente de outro usuário
responde 404. Erros adicionais: `FILA_CHEIA`, `JOB_NAO_ENCONTRADO`,
`JOB_NAO_TERMINAL`, `JOB_NAO_REPETIVEL`, `CANCELAMENTO_TARDIO`,
`IDEMPOTENCIA_CONFLITANTE` e `DIAGNOSTICO_INVALIDO`.

### S10.2 Estados e progresso

```text
QUEUED → RUNNING → AGGREGATING → SUCCEEDED
   └──────────────→ CANCEL_REQUESTED → CANCELLED
   └────────────────────────────────→ FAILED
```

`JobProgress` contém `completed`, `total`, `failed`, `currentRepetitionId`, `phase`
e timestamps. Progresso é monotônico. Falha de uma repetição falha o job inteiro e
preserva as evidências já produzidas apenas para diagnóstico operacional, nunca como
distribuição parcial publicada.

### S10.3 Concorrência, cancelamento e idempotência

- `ProcessPoolExecutor` executa funções puras e recebe payload serializável;
- FIFO global, no máximo um worker por job;
- padrão de dois workers, configurável de um a quatro;
- limite de três jobs ativos/enfileirados por usuário e 32 globais;
- cancelamento de job enfileirado é imediato;
- job em execução termina a repetição corrente e não agenda a próxima;
- `idempotency_key` repetida com o mesmo fingerprint devolve o mesmo job;
- a mesma chave com payload diferente retorna 409;
- retry só parte de `FAILED` ou `CANCELLED`, usa chave nova e registra `retry_of_job_id`;
- registros terminais permanecem em memória por 24 horas; resultados aceitos são
  persistidos no IndexedDB antes de depender dessa retenção.

Reinício do processo perde a fila. Ao receber 404 para reserva local ativa, o cliente
anexa terminal `INTERRUPTED` com razão `SERVER_RESTART_OR_JOB_EXPIRED` e nunca repete
automaticamente.

## S11 — Execução persistida no estudo

`ExecutionRecordV3` vira união discriminada:

```ts
type ExecutionRecordV3 = PreviewExecutionRecord | DiagnosticExecutionRecord;

type DiagnosticExecutionRecord = DeepReadonly<{
  kind: 'DIAGNOSTIC';
  id: string;
  attemptId: string;
  scenarioId: string;
  scenarioRevision: number;
  inputFingerprint: string;
  requestSnapshot: DiagnosticRequest;
  sourceSnapshot: PortfolioSourceSnapshot;
  premisesSnapshot: PremisesDocument;
  periodSnapshot: PeriodDocument;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  jobId: string | null;
  envelope: DiagnosticEnvelope | null;
  error: PersistedExecutionError | null;
  createdAt: string;
  finishedAt: string | null;
}>;
```

Progresso intermediário não é persistido. A reserva e o terminal são registros
distintos correlacionados pelo `attemptId`. Retry cria nova tentativa; não altera a
anterior. O repositório rejeita terminal duplicado e qualquer mutação de registro já
terminal.

## S12 — Interface do diagnóstico

A página do estudo contém:

- disponibilidade estatística e motivo quando indisponível;
- configuração 10/30/100 e repetição escolhida para inspeção;
- fila, progresso, fase, cancelamento e retry;
- cartão explícito **Distribuição de repetições**;
- cartão separado **Execução selecionada**;
- sete seções na ordem canônica;
- gráficos ECharts 6.1.0 com tabela equivalente, descrição textual e valores
  tabulares;
- consequências factuais, limitações, cobertura, versões e fingerprints.

Cores não significam bom/ruim. Gráfico nunca é a única representação. Estados
`NOT_COLLECTED`, `INSUFFICIENT_COVERAGE` e `INCOMPATIBLE` têm texto e motivo próprios.

## S13 — Comparação temporal de casos e perfis

A comparação vive em Empresa e aceita itens da mesma empresa:

```ts
type TemporalComparisonItem =
  | Readonly<{ kind: 'OBSERVED_CASE'; caseId: string; revision: number }>
  | Readonly<{ kind: 'OPERATIONAL_PROFILE'; profileVersionId: string }>;
```

Ela alinha somente métricas com definição, unidade e método compatíveis. Mostra
período, dias cobertos, lacunas e proveniência antes de deltas. Caso versus perfil
usa o caso como observação pontual e o perfil como resumo; não declara tendência com
um único ponto nem cria cenário variante.

## S14 — Segurança e isolamento

- tokens continuam validados pelo servidor;
- jobs e resultados são scoped por `ownerSub`;
- logs contêm IDs, estados e duração, nunca ordens, nomes ou valores financeiros;
- payloads usam `Cache-Control: no-store`;
- conteúdo observado é texto, não instrução;
- nenhum arquivo, binário ou credencial entra no diagnóstico;
- resposta tardia de outra sessão/estudo é descartada pelos mesmos checks de epoch,
  owner, scenario revision, fingerprint e attempt usados na Etapa 2;
- invariantes Python usam `raise`, inclusive sob `python -O`.

## S15 — Testes e critérios de aceite

1. Mesmos casos, revisões e método produzem o mesmo perfil e fingerprints.
2. Seleção incompatível bloqueia; sobreposição e lacunas aparecem como evidência.
3. Campo ausente nunca vira zero e métrica dependente fica indisponível.
4. Perfil confirmado é imutável; nova seleção cria versão seguinte.
5. Estudo conserva snapshot integral da versão vinculada.
6. Migration 1→2 preserva estudos/execuções e adiciona discriminação sem drift.
7. Jobs respeitam fila, limites globais/por usuário e isolamento de owner.
8. Cancelamento enfileirado é imediato; cancelamento em execução para entre
   repetições e termina uma única vez.
9. Idempotência não duplica job; conflito de chave é 409; retry cria tentativa nova.
10. Entrada fixa nunca aparece como distribuição de múltiplas repetições.
11. Entrada gerada reproduz exatamente as seeds registradas.
12. Sete eixos reconciliam com requests e resultados canônicos.
13. Consequências e limitações apontam para evidência existente e são determinísticas.
14. Gráficos e tabelas mostram a mesma série; teclado e zoom 200% permanecem usáveis.
15. Comparação temporal não mistura empresas nem métricas incompatíveis.
16. Troca de conta não expõe empresa, caso, perfil, job ou resultado anterior.
17. Etapas 1 e 2 continuam passando, inclusive snapshots, Observado × Motor,
   concorrência e migrations legadas.
18. Contratos gerados permanecem sem drift e Python continua correto sob `-O`.

## S16 — Aprovações necessárias

Antes de implementar, Gabriel precisa aprovar:

1. corte de versões: IndexedDB 2, `StudyDocument` 3.0.0 e Perfil 1.0.0;
2. perfil calculado localmente;
3. perfil como evidência, não quarta origem, nesta etapa;
4. distribuição indisponível para entrada fixa;
5. limites 10/30/100, dois workers, três jobs por usuário, 32 globais e retenção de
   24 horas;
6. cancelamento cooperativo entre repetições;
7. persistência local de apenas reserva/terminal, sem fila durável no servidor.

Nenhuma dessas decisões altera regra do motor ou antecipa Etapas 4–6.
