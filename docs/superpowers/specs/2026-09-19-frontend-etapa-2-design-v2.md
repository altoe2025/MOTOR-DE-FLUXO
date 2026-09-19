# Front-end — Etapa 2 v2: primeiro fluxo completo com dados reais

**Data:** 2026-09-19
**Status:** aprovada para execução após o gate documental e baseline
**Evolui:** `2026-09-13-frontend-etapa-2-design.md`
**Base:** `2026-09-19-frontend-motor-de-fluxo-design-v2.md`

## S01 — Objetivo

Entregar o primeiro fluxo completo do estudo, preservando toda a robustez originalmente
planejada para domínio, persistência, migrations, concorrência, sessão, execução e
recuperação, e acrescentando Caso Observado e conciliação Observado × Motor.

Ao final, o usuário consegue:

1. criar, duplicar, renomear, excluir e reabrir estudos;
2. montar carteira sintética, manual ou observada;
3. revisar proveniência e premissas;
4. executar uma prévia real pelo motor;
5. consultar resultado básico e histórico;
6. conciliar métricas observadas e calculadas compatíveis;
7. alterar uma entrada e criar nova execução sem sobrescrever a anterior;
8. recuperar o trabalho após recarga, falha, expiração ou conflito entre abas.

## S02 — Base e precedência

Precedência:

1. `AGENTS.md` e regras do motor;
2. contratos publicados na `main` atual;
3. especificação global v2;
4. esta especificação;
5. especificação v2 do importador;
6. documentos anteriores, somente onde não conflitarem.

A Etapa 1 permanece base integrada. Não reconstruir autenticação, cliente, adaptador,
resultado canônico ou regras de apresentação já entregues.

## S03 — Fronteiras

### S03.1 Importador

Produz:

- `ObservedCaseDraft` ainda revisável;
- `ObservedCase` confirmado;
- empresa ou identidade leve vinculada;
- ordens canônicas;
- totais, proveniência, qualidade e correções;
- `ObservedOutcome` opcional.

Não produz Estudo, Cenário, Execução ou `EngineResult`.

### S03.2 Etapa 2

Consome o Caso Observado confirmado, cria snapshot, prepara o request canônico,
executa o motor, persiste a execução e apresenta o resultado.

### S03.3 Servidor e motor

O servidor revalida toda entrada e usa o adaptador existente. Nenhuma regra de
geração, netting ou custo é reimplementada no navegador. Nenhum arquivo em `motor/`
deve mudar para facilitar o front-end.

## S04 — Entidades locais

### S04.1 Empresa leve

```ts
type CompanyRecord = {
  id: string;
  ownerSub: string;
  displayName: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
};
```

Na Etapa 2, ela fornece identidade estável. Resumo histórico, perfil e telas completas
de empresa pertencem à Etapa 3.

### S04.2 Caso Observado

```ts
type ObservedCaseStatus = 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';

type ObservedCase = {
  schemaVersion: '2.0.0';
  id: string;
  ownerSub: string;
  companyId: string;
  status: 'CONFIRMED' | 'ARCHIVED';
  revision: number;
  window: { startDate: string; endDate: string; closingDate: string };
  orders: ObservedOrder[];
  controlTotals: ControlTotal[];
  sourceManifest: SourceManifest;
  normalization: NormalizationManifest;
  quality: DataQualityReport;
  corrections: CorrectionRecord[];
  observedOutcome: ObservedOutcome | null;
  confirmedAt: string;
};
```

O rascunho contém as mesmas áreas, mas aceita problemas corrigíveis e não pode ser
usado em execução.

### S04.3 Resultado observado

```ts
type ObservedMetricCode =
  | 'GROSS_OUT_BRL'
  | 'GROSS_IN_BRL'
  | 'MATCHED_BRL'
  | 'REMITTED_OUT_BRL'
  | 'REMITTED_IN_BRL'
  | 'TOTAL_COST_BRL';

type ObservedMetric = {
  code: ObservedMetricCode;
  value: string;
  unit: 'BRL';
  definitionVersion: string;
  provenance: FieldProvenance;
};

type ObservedOutcome = {
  schemaVersion: '1.0.0';
  metrics: ObservedMetric[];
};
```

Uma métrica só é comparável se código, unidade e definição forem compatíveis com a
projeção do resultado canônico. Campo ausente não é zero.

### S04.4 Origem da carteira

```ts
type PortfolioSource =
  | { kind: 'OBSERVED_CASE'; caseId: string; caseRevision: number }
  | { kind: 'AUTHORED'; authoredPortfolioId: string }
  | { kind: 'SYNTHETIC'; recipe: SyntheticRecipe };

type PortfolioSourceSnapshot = {
  source: PortfolioSource;
  capturedAt: string;
  orders: CanonicalAuthoredOrder[];
  provenance: FieldProvenance[];
  observedOutcome: ObservedOutcome | null;
  sourceFingerprint: string;
};
```

Perfil Operacional será uma quarta origem na Etapa 4 depois de ser criado na Etapa 3.

### S04.5 Estudo, cenário e execução

```ts
type StudyDocument = {
  schemaVersion: '2.0.0';
  id: string;
  ownerSub: string;
  name: string;
  revision: number;
  baseScenarioId: string;
  scenarios: ScenarioDocument[];
  executions: ExecutionRecord[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type ScenarioDocument = {
  id: string;
  revision: number;
  name: string;
  sourceSnapshot: PortfolioSourceSnapshot;
  premises: PremisesDocument;
  period: PeriodDocument;
  inputFingerprint: string;
};

type ExecutionRecord = {
  id: string;
  scenarioId: string;
  scenarioRevision: number;
  inputFingerprint: string;
  requestSnapshot: PreviaRequest;
  engineVersion: string;
  contractVersion: string;
  status: 'PREPARING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED';
  envelope: PreviewEnvelope | null;
  observedComparison: ObservedComparison | null;
  createdAt: string;
  finishedAt: string | null;
};
```

Execuções são append-only. Alterar cenário não muda `ExecutionRecord` existente.

## S05 — Proveniência

```ts
type ProvenanceKind =
  | 'OBSERVED'
  | 'INFERRED'
  | 'DERIVED'
  | 'USER_CORRECTED'
  | 'USER_ESTIMATE'
  | 'SYNTHETIC_DEFAULT'
  | 'NOT_COLLECTED';
```

Cada valor relevante registra tipo, fonte, regra ou ação, versão e momento. A
projeção HTTP converte essa taxonomia para os valores aceitos pelo contrato público
sem perder a informação no snapshot local.

`DADO_OBSERVADO` só representa valor fornecido pela fonte. Uma correção manual não
continua classificada como observação original.

## S06 — Preparação e geração

### S06.1 Carteira observada

Usa as ordens explícitas do Caso Observado confirmado. A Etapa 2 não agrega, divide,
pré-neta ou deduplica silenciosamente.

### S06.2 Carteira manual

Mantém grupos, participantes, operações avulsas, herança e overrides definidos na
Etapa 2 original.

### S06.3 Carteira sintética

Mantém os cinco exemplos, geração por seed, composição realizada, limites e
proveniência. A geração passa pelo servidor quando já previsto pelos contratos; o
navegador não implementa um segundo gerador financeiro.

### S06.4 Fingerprint

O fingerprint inclui conteúdo normalizado da carteira, origem, revisão do caso,
premissas, período, seeds e versões relevantes. Nome de estudo e timestamps de UI não
participam.

## S07 — Persistência compartilhada

### S07.1 Banco

Nome por projeto e usuário:

```text
motor-fluxo:app:v2:<project-ref>:<owner-sub>
```

Stores:

| Store | Chave | Responsabilidade |
|---|---|---|
| `companies` | `company_id` | identidades e aliases |
| `observed_cases` | `case_id` | casos confirmados e arquivados |
| `import_batches` | `[case_id, batch_sequence]` | lotes imutáveis |
| `import_events` | `[case_id, event_sequence]` | correções, decisões e reversões |
| `studies` | `study_id` | documento do estudo |
| `executions` | `[study_id, execution_id]` | requests e resultados imutáveis |
| `operations` | `operation_id` | idempotência das mutações locais |
| `meta` | `key` | schema, migration e marcadores |

Importador e estudo usam a mesma interface `ApplicationRepository`. Nenhum módulo
possui banco de produto paralelo.

### S07.2 Atomicidade e CAS

Toda mutação usa `expectedRevision` e `operationId`. A revisão só avança no commit da
transação. Duas abas não podem confirmar a mesma revisão. Repetir `operationId`
retorna o estado já confirmado sem duplicar evento.

`BroadcastChannel` apenas notifica; CAS continua sendo a proteção real.

### S07.3 Migrations

- schema possui versão inteira explícita;
- migration é transacional, determinística e testada com fixture da versão anterior;
- original não é apagado antes do commit;
- falha deixa documento indisponível ou recuperável, nunca parcialmente migrado;
- banco legado do rascunho da Etapa 1 e bases experimentais do importador recebem
  estratégia explícita de leitura, migração ou arquivamento.

### S07.4 Retenção e lixeira

Excluir estudo move para lixeira local e preserva restauração conforme o prazo
definido no plano técnico. Excluir Caso Observado usado por estudo não altera o
snapshot histórico. Exclusão definitiva e limpeza da conta exigem confirmação.

## S08 — Controlador e sessão

O controlador:

- abre o repositório somente para sessão válida;
- serializa autosave;
- faz flush antes de executar;
- mantém epoch de sessão e descarta respostas tardias de outra conta;
- reserva tentativa por CAS;
- não repete POST automaticamente;
- salva resultado e vínculo com snapshot atomicamente;
- preserva resultado em memória se o storage falhar;
- fecha banco em logout e `versionchange` sem apagar dados.

## S09 — Execução HTTP

Fluxo de autoridade:

```text
autoria persistida
→ snapshot efetivo
→ preparação validada
→ PreviaRequest explícito
→ API autenticada
→ adaptador
→ motor
→ PreviewEnvelope validado
→ ExecutionRecord imutável
```

Resposta só é aceita se usuário, estudo, cenário, revisão, fingerprint e tentativa
coincidirem. Resposta divergente vira erro e não atualiza o resultado corrente.

## S10 — Conciliação Observado × Motor

Uma função pura projeta métricas comparáveis:

```ts
function compareObservedWithEngine(input: {
  observed: ObservedOutcome;
  engine: PreviewEnvelope;
  registry: MetricCompatibilityRegistry;
}): ObservedComparison;
```

Cada linha informa:

- código e rótulo;
- observado;
- calculado;
- diferença absoluta;
- diferença percentual quando denominador permitir;
- estado `MATCHED`, `DIFFERENT`, `NOT_OBSERVED` ou `INCOMPATIBLE`;
- motivo de incompatibilidade.

A função não cria tolerância financeira sem regra explícita. Arredondamento de
apresentação não altera o valor comparado.

## S11 — Interface

### S11.1 Lista e operações de estudo

- criar;
- abrir;
- renomear;
- duplicar;
- excluir e restaurar;
- mostrar data, origem, estado do resultado e última atualização.

### S11.2 Editor da carteira

- selecionar origem;
- escolher Caso Observado confirmado;
- montar carteira manual;
- usar exemplo sintético;
- editar premissas;
- mostrar proveniência;
- mostrar resumo da entrada efetiva;
- impedir edição silenciosa da fonte observada; alterações criam cenário autorado
  derivado ou correção explícita no caso, conforme a ação escolhida.

### S11.3 Execução

- validar e focar o primeiro erro;
- mostrar preparação, salvamento e execução;
- impedir duplo disparo;
- permitir navegação sem perder estado;
- preservar resultado anterior durante nova tentativa;
- indicar atual, desatualizado, falho ou interrompido.

### S11.4 Resultado básico

- volumes bruto OUT/IN;
- volume casado pelos mecanismos canônicos;
- resíduos remetidos;
- custos, economia e netabilidade;
- versão, período, origem e premissas;
- histórico de execuções;
- seção Observado × Motor quando aplicável.

`ComparisonSummary` continua resumindo mecanismos do motor. A conciliação observada
é componente distinto para não misturar conceitos.

## S12 — Falhas e segurança

- documento inválido não é apagado;
- storage indisponível preserva estado em memória e não promete salvamento;
- quota, bloqueio, `versionchange` e corrupção têm estados específicos;
- conflito de revisão permite recarregar salvo ou salvar cópia;
- erro HTTP não repete execução;
- troca de conta isola bancos, caches, queries e respostas tardias;
- mensagens públicas não exibem payloads, nomes sensíveis ou tokens;
- conteúdo importado é renderizado como texto;
- requests e logs não incluem binário ou campos brutos desnecessários.

## S13 — Limites

Limites existentes de API, quantidade de ordens, tamanho de request, período e
geração continuam valendo. O front-end mede e bloqueia antes da rede, e o servidor
revalida.

Casos Observados que excederem o contrato não podem ser truncados silenciosamente.
Devem voltar à camada de normalização ou exigir decisão de produto explícita.

## S14 — Testes

### S14.1 Domínio

- tipos e validações;
- snapshots e fingerprints;
- todas as origens;
- imutabilidade das execuções;
- conciliação observada;
- estados atuais e desatualizados.

### S14.2 Persistência

- round-trip de todas as stores;
- atomicidade e idempotência;
- duas abas;
- migrations, corrupção, quota e `versionchange`;
- conta A → B → A;
- lixeira e restauração.

### S14.3 Integração

- preparação real e API real;
- adaptador e motor reais;
- contratos gerados;
- resposta divergente;
- falhas deliberadas separadas.

### S14.4 Interface e e2e

- criar, executar, salvar, recarregar e editar;
- sintético, manual e observado;
- Observado × Motor presente, ausente e incompatível;
- teclado, foco, zoom e mensagens;
- auth real no gate final;
- build, lint, typecheck e testes protegidos na CI.

## S15 — Critérios de aceite

1. As três origens executam pelo mesmo caminho canônico.
2. Caso Observado rascunho nunca é executado.
3. Snapshot mantém caso e premissas exatos usados.
4. Alteração não reescreve execução anterior.
5. Resultado observado ausente aparece como não informado.
6. Métrica incompatível explica a incompatibilidade.
7. Estudo, caso e execução sobrevivem à recarga.
8. Duas abas não sobrescrevem revisões.
9. Troca de conta não expõe dados anteriores.
10. Migrations e corrupção não causam perda silenciosa.
11. Contratos Python/TypeScript e schemas gerados concordam.
12. Suítes Python normal e otimizada, web unitária, build, lint e e2e passam.

## S16 — Limites da etapa

Não implementar nesta etapa:

- Perfil Operacional calculado e telas completas de Empresa — Etapa 3;
- diagnóstico robusto de múltiplas repetições — Etapa 3;
- variantes completas e comparação de hipóteses — Etapa 4;
- Replay — Etapa 5;
- chat, relatório e modo de apresentação — Etapa 6.

Esses limites são fronteiras de dependência entre etapas, não retirada do escopo da
versão completa.

## S17 — Trabalho existente

Os commits `50fc384` e `1270458` serão avaliados arquivo a arquivo. Contratos de
preparação, domínio, fingerprints e repositório podem ser reaproveitados se atenderem
esta especificação. Arquivos gerados e modelos que conflitem com Caso Observado,
snapshot ou repositório compartilhado devem ser regenerados ou adaptados.

Nenhum merge será feito antes do plano técnico v2 e da auditoria de compatibilidade.
