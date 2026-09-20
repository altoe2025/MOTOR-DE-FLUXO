# Etapa 3 — operação e contratos efetivos

## Estado deste guia

Este guia descreve o candidato local `03e87b8222d26ef141ef519c8716b4e281b8a7b8`.
O aceite técnico é **CONDITIONAL** porque o critério S15.14 ainda não possui prova
browser específica de teclado e zoom a 200% na página nova de diagnóstico robusto.
O gate global desse SHA está verde; push, PR, CI publicado e merge não foram feitos.

A Etapa 3 não altera o motor nem cria uma quarta origem executável. Perfil
Operacional é evidência observada, copiada integralmente para o estudo; geração de
ordens a partir de perfil pertence à Etapa 4.

## Pré-requisitos e configuração

- Python `>=3.11`; Node `>=24 <25`; npm `>=11 <12`.
- FastAPI `0.141.1`, Pydantic `2.13.5`, React `19.3.0`, TypeScript `5.9.3`,
  Vitest `5.0.0`, Playwright `1.63.0` e ECharts `6.1.0` exato.
- Configuração Supabase e SHA do bundle conforme
  [`etapa-2-v2-operacao.md`](etapa-2-v2-operacao.md). Nenhuma credencial real entra
  no repositório.

Configuração adicional do executor:

| Variável | Padrão | Validação |
|---|---:|---:|
| `DIAGNOSTIC_MAX_WORKERS` | 2 | 1–4 |
| `DIAGNOSTIC_MAX_JOBS_PER_USER` | 3 | ≥ 1 |
| `DIAGNOSTIC_MAX_JOBS_GLOBAL` | 32 | ≥ 1 |
| `DIAGNOSTIC_RETENTION_SECONDS` | 86400 | ≥ 1 |

Os jobs e resultados ficam somente em memória pelo período de retenção. Reiniciar o
servidor perde fila e resultados; isso é um limite deliberado, não uma fila durável.

## Percurso operacional

### 1. Empresas e casos

1. Abra `/empresas` e escolha a empresa.
2. Use **Casos** para consultar histórico. Os filtros de período, tipo e qualidade
   são combináveis e persistidos na query string.
3. Leia cobertura, lacunas e qualidade como evidência. Ausência aparece como “não
   coletado”; não é convertida em zero.

As telas leem somente por `ApplicationRepository`. Os vínculos com estudos derivam
dos snapshots históricos, não do cenário atualmente editável.

### 2. Criar uma versão de Perfil Operacional

1. Em `/empresas/<companyId>/perfis`, selecione Casos Observados.
2. Resolva blockers. Seleção vazia, owner/empresa misturados, caso/revisão repetidos,
   status inválido e documento inválido bloqueiam. SHA de fonte repetido exige
   confirmação explícita de que os casos representam operações distintas.
3. Revise warnings de sobreposição, lacunas e versões de normalização. Eles não são
   removidos silenciosamente.
4. Confira a prévia e selecione **Confirmar versão**.

O método `operational-profile-v1` ordena casos e ordens, usa decimal exato e
`NEAREST_RANK`, calcula fingerprints SHA-256 sobre JSON canônico e persiste uma
versão imutável. A versão cresce sequencialmente por empresa. Concorrência entre
abas tem um único vencedor pelo índice único/CAS; não há edição ou exclusão de uma
versão confirmada.

### 3. Anexar perfil a um estudo

1. Escolha um estudo na própria página de perfis.
2. Use **Usar como evidência em estudo**.
3. O controlador valida owner e perfil, copia a versão completa para
   `evidenceSnapshots`, avança a revisão por CAS e notifica outras abas.

O vínculo é idempotente para o mesmo `profile.id` e `documentFingerprint`. Mesmo ID
com outro fingerprint falha. Criar uma versão posterior não altera o snapshot já
anexado. O vínculo não muda `PortfolioSource`, não materializa ordens e não habilita
execução.

### 4. Executar diagnóstico robusto

Abra `/estudos/<studyId>/diagnostico`.

- Origem com `generationInputSnapshot`: escolha 10, 30 ou 100 repetições. O request
  registra cada `repetition_id` e todas as seeds por participante.
- Entrada fixa: existe uma única execução. A distribuição fica
  `INSUFFICIENT_COVERAGE` com razão
  `FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION`.

O fluxo de autoridade é:

```text
cenário salvo
→ request validado
→ reserva local QUEUED persistida por CAS
→ POST autenticado
→ fila em memória
→ uma repetição por vez por job no ProcessPoolExecutor
→ agregação e sete eixos
→ terminal local append-only
→ IndexedDB
→ UI validada
```

O `job_id` é a chave de idempotência conhecida pelo cliente e é scoped por owner.
Repetir a mesma chave com o mesmo fingerprint retorna o mesmo job; conteúdo
divergente retorna conflito. Progresso intermediário não é persistido no estudo.
Somente reserva e um terminal correlacionado por `attemptId` são persistidos.

### 5. Estados, cancelamento e retry

```text
QUEUED → RUNNING → AGGREGATING → SUCCEEDED
   └──────────────→ CANCEL_REQUESTED → CANCELLED
   └────────────────────────────────→ FAILED
```

- Cancelar `QUEUED` é imediato e não submete trabalho.
- Cancelar `RUNNING`/`AGGREGATING` é cooperativo: termina a repetição corrente e não
  agenda a próxima. Não significa interrupção instantânea do processo.
- Falha de uma repetição falha o job inteiro; nenhuma distribuição parcial é
  publicada.
- Retry só parte de `FAILED` ou `CANCELLED`, usa chave e tentativa novas e preserva
  o terminal anterior.
- Ao receber 404 para reserva ativa ou resultado recém-concluído, o cliente grava
  `INTERRUPTED` com `SERVER_RESTART_OR_JOB_EXPIRED`. Não há retry automático.
- Troca de conta cancela a espera local, não cancela job alheio, e respostas tardias
  são descartadas por owner, epoch, estudo, cenário, revisão, fingerprint e tentativa.

### 6. Ler o resultado

A página separa **Distribuição de repetições** de **Execução selecionada**. Em seguida
mostra, nesta ordem:

1. potencial estrutural;
2. captura pela política;
3. compatibilidade temporal;
4. exposição residual;
5. dependência da composição;
6. robustez econômica;
7. perfil operacional da carteira.

Valores vêm do envelope canônico; a UI apenas formata. Divisão sem denominador e
campo ausente usam estados indisponíveis, nunca zero. Consequências são regras
versionadas e factuais; limitações informam condição e referências, sem alterar a
métrica ou produzir veredito. Cada gráfico usa a mesma série de sua tabela e a
tabela permanece no DOM.

### 7. Comparação temporal

Na Empresa, selecione de 2 a 6 Casos Observados ou versões de Perfil da mesma
empresa. A comparação alinha somente definição, unidade e método compatíveis, mostra
período, dias cobertos, lacunas e proveniência antes de diferenças e não declara
tendência a partir de um único intervalo. Não compara cenário-base, hipótese ou
marginal.

## Persistência e migration

O nome do banco permanece:

```text
motor-fluxo:app:v2:<project-ref-percent-encoded>:<owner-sub-percent-encoded>
```

A versão física e `meta.schema_version` são `2`. Há nove stores:

| Store | Chave | Índices relevantes |
|---|---|---|
| `companies` | `company_id` | `by_owner` |
| `observed_cases` | `case_id` | `by_owner`, `by_owner_company` |
| `import_batches` | `[case_id, batch_sequence]` | owner/empresa/caso |
| `import_events` | `[case_id, event_sequence]` | owner/empresa/caso |
| `studies` | `study_id` | `by_owner`, `by_owner_deleted` |
| `executions` | `[study_id, execution_id]` | `by_owner`, `by_owner_study` |
| `operations` | `operation_id` | `by_owner`, `by_owner_entity` |
| `meta` | `key` | — |
| `profile_versions` | `profile_version_id` | `by_owner`, `by_owner_company`, `by_owner_company_version` único |

O upgrade 1→2 cria `profile_versions`, migra `StudyDocument` 2.0.0 para 3.0.0,
adiciona `kind: PREVIEW` às execuções, cria `evidenceSnapshots: []` e migra os
resultados de operações idempotentes. A transação grava o marcador 2 somente no
commit; erro aborta tudo. Snapshots legados sem `generationInputSnapshot` continuam
legíveis, mas não podem produzir distribuição.

Contratos locais efetivos:

- `ObservedCase`: 2.0.0;
- `OperationalProfileVersion`: 1.0.0;
- `StudyDocument`: 3.0.0;
- `DiagnosticRequest`, `JobSnapshot` e `DiagnosticEnvelope`: API/schema 1.0.0;
- resultado do motor dentro de `selected_execution`: 2.0.0;
- `PortfolioSource`: continua `OBSERVED_CASE | AUTHORED | SYNTHETIC`.

## HTTP e erros

| Operação | Resposta |
|---|---|
| `POST /api/v1/diagnosticos` | `202 JobSnapshot` |
| `GET /api/v1/diagnosticos/{job_id}` | `200 JobSnapshot` |
| `GET /api/v1/diagnosticos/{job_id}/resultado` | `200 DiagnosticEnvelope` |
| `POST /api/v1/diagnosticos/{job_id}/cancelamentos` | `202 JobSnapshot` |
| `POST /api/v1/diagnosticos/{job_id}/retries` | `202 JobSnapshot` |

Todos exigem autenticação, filtram por owner e respondem `Cache-Control: no-store`.
Owner diferente recebe 404. Request é limitado a 1 MiB e resposta a 8 MiB.
Códigos próprios: `FILA_CHEIA`, `JOB_NAO_ENCONTRADO`, `JOB_NAO_TERMINAL`,
`JOB_NAO_REPETIVEL`, `CANCELAMENTO_TARDIO`, `IDEMPOTENCIA_CONFLITANTE`,
`EXECUTOR_FECHADO`, `DIAGNOSTICO_INVALIDO` e `RESULTADO_EXCEDE_LIMITE`, além dos
erros comuns de JSON, versão, entrada, limite e autenticação.

## Limites conhecidos e recuperação

- Jobs são voláteis e não atravessam restart ou múltiplas instâncias sem afinidade.
- Retenção de 24 horas é do registro em memória; o terminal aceito deve estar no
  IndexedDB antes de depender dela.
- Autenticação externa real depende das variáveis `MOT_REAL_AUTH_*` e não foi
  exercitada no gate local.
- O bundle informa chunk maior que 500 kB; é aviso de build, não falha observada.
- O adapter preserva decimais canônicos como texto; o renderer ECharts pode posicionar
  coordenadas muito grandes com a precisão numérica interna da biblioteca. A tabela
  mantém o valor exato.
- O critério de zoom/teclado do diagnóstico robusto precisa de aceitação browser
  específica antes do aceite integral.

Não use a bridge E2E ou os endpoints `__e2e__` em operação real.
