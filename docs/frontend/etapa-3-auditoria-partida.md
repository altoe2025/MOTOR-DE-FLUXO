# Etapa 3 — auditoria do estado de partida

**Data:** 2026-09-20

**Escopo:** investigação e planejamento; nenhuma implementação de produto

**Base auditada:** `origin/main` em `97601bf290128a199668f15efd9980beb5ca4ef8`

## 1. Base confirmada

Após `git fetch origin main --prune`, `origin/main` e o `HEAD` do worktree isolado
apontam para `97601bf290128a199668f15efd9980beb5ca4ef8`, merge da PR #52. O worktree de
planejamento foi criado diretamente dessa referência e permaneceu sem alterações de
código de produto.

O estado confirmado pelo usuário prevalece sobre passagens históricas anteriores ao
merge: 715 testes Python e 2 ignorados nos modos normal e `python -O`, 213 testes web,
9 E2E e os gates publicados aprovados; autenticação externa real segue dependente de
credenciais autorizadas e o Ruff global continua com dívida legada fora do escopo do
CI.

## 2. Contratos reutilizáveis da Etapa 2

### 2.1 Domínio e snapshots

- `CompanyRecord`, `ObservedCase`, `ObservedCaseDraft`, qualidade e proveniência já
  existem em `web/src/cases/domain.ts`.
- `PortfolioSource` possui exatamente três origens executáveis:
  `OBSERVED_CASE | AUTHORED | SYNTHETIC`.
- `PortfolioSourceSnapshot`, `ScenarioDocument`, `StudyDocument` 2.0.0 e
  `ExecutionRecord` já preservam origem, premissas, período, fingerprints, request e
  envelope. Execuções são append-only; a reserva e o terminal são correlacionados por
  `attemptId` e `request_id`.
- `resolvePortfolioSource` mantém Caso Observado confirmado independente do resultado
  do motor e conserva proveniência por campo quando ela é heterogênea.

### 2.2 Persistência e autoridade

- `ApplicationRepository` é a única porta de persistência usada por telas e
  controladores.
- O adaptador IndexedDB usa versão física 1, marcador lógico 1 e oito stores:
  `companies`, `observed_cases`, `import_batches`, `import_events`, `studies`,
  `executions`, `operations` e `meta`.
- CAS por `expectedRevision`, idempotência por `operationId`, isolamento por
  `ownerSub`, proibição de binários e migrations determinísticas já estão implementados.
- `StudyController` serializa autosave, faz flush, isola sessões e usa
  `BroadcastChannel` apenas como notificação; CAS continua sendo a autoridade.

### 2.3 API e execução existente

- Contratos FastAPI/Pydantic e artefatos TypeScript são gerados pelas ferramentas
  oficiais.
- `POST /api/v1/previas` executa uma única repetição síncrona. O processo usa um
  `BoundedSemaphore(1)` e responde `CAPACIDADE_OCUPADA` quando o slot está ocupado.
- O cliente não repete POST automaticamente. `executeStudyScenario` faz
  flush → reserva CAS → POST → validação de identidade → terminal append-only.
- O resultado público atual é agregado; `DiagnosticosExperimentaisDTO` é vazio e as
  seções individuais são proibidas no modo publicado pela prévia.

## 3. Lacunas reais para a Etapa 3

1. **Empresas:** não existem rotas, páginas ou read models de empresa. A navegação
   global mistura `Estudos` com destinos internos do estudo e não possui `Empresas`.
2. **Casos:** o repositório lista casos, mas não há catálogo histórico, filtros por
   período/tipo/qualidade, cobertura, lacunas nem vínculos derivados com estudos.
3. **Perfil Operacional:** não há tipo, cálculo, fingerprint, versão imutável, store,
   migration, métodos no `ApplicationRepository`, tela ou vínculo com estudo.
4. **Reprodução estatística:** o snapshot sintético conserva ordens materializadas e
   um resumo da receita, mas não conserva o `EffectiveInput` completo necessário para
   gerar outras repetições de modo reproduzível.
5. **Executor robusto:** não há job, fila, progresso, cancelamento cooperativo,
   retry, idempotência de job ou concorrência limitada entre diagnósticos. Abortar o
   fetch atual encerra apenas a espera do cliente; o motor pode continuar no servidor.
6. **Diagnóstico:** não há contrato dos sete eixos, distribuição de repetições,
   consequências determinísticas, limitações com evidência nem proveniência analítica.
7. **Visualização:** ECharts ainda não é dependência do projeto; não existem adapters
   de gráfico, tabelas analíticas ou fallback tabular.
8. **Comparação temporal:** não há comparação de Casos Observados ou versões de perfil.

## 4. Inconsistências entre documentação e código

| Estado documental histórico | Evidência vigente | Tratamento |
|---|---|---|
| `docs/MAPA.md` ainda aponta `main` em `c2ad175` e chama a Etapa 2 de candidata sem PR/merge | `origin/main` está em `97601bf`, merge da PR #52 | Fotografia pré-merge; não orienta a base |
| Tabela do topo do Diário diz que a branch da Etapa 2 está sem push/PR/merge | commit de merge `97601bf` e histórico da PR #52 | Preservar como histórico até atualização documental autorizada |
| `docs/testing.md` abre com 670 Python, 89 web e 3 E2E | estado final informado: 715+2, 213 e 9 | Contagem histórica; não reexecutada nesta sessão |
| Aceite e operação dizem `CONDITIONAL`/“Etapa 3 não iniciada” | CI obrigatório e validação final foram concluídos antes desta solicitação | O handoff técnico permanece válido; o bloqueio histórico foi superado |
| `create_schema_app` usa mensagens 501 que mencionam “T3” em endpoints já reais | as rotas reais estão registradas em `create_app` | Texto interno do app de schema, não lacuna funcional da Etapa 3 |

Nenhuma dessas inconsistências autoriza reescrever os documentos históricos durante
o planejamento. A atualização deve acompanhar a futura entrega ou um commit
documental explicitamente autorizado.

## 5. Decisões materiais recomendadas

1. **Perfil local e puro.** Calcular o Perfil Operacional em TypeScript com
   `decimal.js`, a partir de snapshots dos casos selecionados, e persistir somente a
   versão confirmada. Isso mantém dados observados atrás do `ApplicationRepository`,
   permite uso offline e torna o determinismo testável sem uma API nova.
2. **Perfil não é origem executável na Etapa 3.** A versão pode ser anexada como
   snapshot de evidência a um estudo, mas `PortfolioSource` continua com três membros.
   A origem `OPERATIONAL_PROFILE` e a geração de ordens ficam para a Etapa 4.
3. **Migration explícita.** Subir IndexedDB e marcador lógico de 1 para 2, adicionar
   `profile_versions` e migrar `StudyDocument` 2.0.0 para 3.0.0, acrescentando
   discriminador de execução, snapshot de evidência e receita geradora completa.
4. **Executor de servidor separado da prévia.** Manter `/previas` intacto e criar
   jobs de diagnóstico com POST/GET/cancel/retry. A primeira implantação usa
   `ProcessPoolExecutor` em memória, fila FIFO, concorrência global configurável e
   cancelamento entre repetições.
5. **Não fabricar distribuição.** Cenário de entrada fixa produz uma execução e marca
   a distribuição como indisponível. Múltiplas repetições só são aceitas quando o
   snapshot contém receita geradora reproduzível.
6. **Progresso não reescreve histórico.** Progresso vive no estado do job e no cache
   de query. O IndexedDB recebe uma reserva imutável e exatamente um terminal por
   tentativa.
7. **Comparação temporal restrita.** Comparar Casos e Perfis dentro da mesma empresa,
   com períodos e cobertura explícitos. Não criar variantes, cenário-base × hipótese
   ou análise marginal da Etapa 4.

## 6. Pontos que exigem aprovação antes da implementação

- limites operacionais propostos: 30 repetições por padrão, opções 10/30/100, máximo
  100; dois workers por padrão, configuráveis entre 1 e 4; no máximo três jobs ativos
  ou enfileirados por usuário e 32 globais;
- retenção do registro de job em memória por 24 horas, reconhecendo que reinício do
  servidor transforma reservas ainda abertas em `INTERRUPTED` no cliente;
- `StudyDocument` 3.0.0 e IndexedDB físico/lógico 2 como corte de migration;
- Perfil Operacional calculado no navegador, sem enviar os casos a um endpoint novo;
- ausência de distribuição para origens fixas, em vez de repetir artificialmente o
  mesmo resultado.

Essas escolhas são recomendações técnicas, não autorizações de implementação.
