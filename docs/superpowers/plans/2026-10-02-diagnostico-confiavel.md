# Correções de execução do diagnóstico

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corrigir os seis achados da auditoria autorizada em 2026-10-02, preservando regras financeiras, entradas válidas e resultados já salvos.

**Architecture:** manter motor, adaptador e API existentes. Ajustar contratos e cliente juntos; recuperar falha de infraestrutura no coordenador, limitar retenção transitória e preservar falhas técnicas sem dados financeiros. Não criar subsistema, armazenamento externo ou serviço novo.

**Tech Stack:** Python/Pydantic/FastAPI/ProcessPoolExecutor, TypeScript/React/Ajv/IndexedDB, pytest e Vitest.

**Spec:** auditoria desta conversa, aprovada pelo usuário com “se não [trouxer prejuízo ao motor], pode consertá-lo”. Evidência local em `C:/Users/gabriel Altoe/Documents/dados sobre cambio/motor-de-fluxo/scratch/diagnostico-audit-20261002/AUDITORIA.txt`; contém causas, linhas e reproduções. O presente plano fecha o comportamento de correção.

## Global Constraints

- Não alterar `motor/`, regras P0, EDF, prioridade intracliente, IOF, conservação ou números de aceitação.
- Não alterar dados históricos ou invalidar diagnósticos antigos válidos por novas validações de snapshot.
- Preservar autenticação, owner, idempotência, cancelamento, FIFO, uma repetição por job e um único terminal.
- Sem dependências novas, serviço externo, chamadas pagas, criação/reescrita de issue, merge ou deploy.
- Artefatos OpenAPI/TypeScript/Ajv devem ser regenerados pelas ferramentas oficiais.
- Não registrar conteúdo financeiro, payload, credenciais ou texto bruto de exceção. Logs podem conter categoria/tipo da exceção e IDs opacos de correlação.
- Base `09a979e4cb91ebc4a1d611d5a4c9fb6f72112f3a`; worktree `codex/diagnostico-confiavel`; issues existentes MOT-70, MOT-72 e MOT-73 consultadas, sem alteração.
- A auditoria verificou 1398 testes Python e 101 testes web de diagnóstico nessa base. Confirmar baseline focado neste worktree e evidência RED de cada defeito antes de corrigi-lo.

## Task 1: Corrigir diagnóstico de ponta a ponta

**Files:**
- Contratos/rotas: `servidor/contracts/diagnostics.py`, `servidor/routes/diagnostics.py`; artefatos gerados em `contracts/` e `web/src/api/`.
- Cliente: `web/src/diagnostics/buildDiagnosticRequest.ts`, `diagnosticExecutionService.ts`, mensagens da página e validação de histórico em `web/src/study/validation.ts` quando necessário.
- Executor: `servidor/diagnostics/executor.py`, helper de retenção/contabilidade na mesma pasta se o bloco justificar separação; configuração somente se necessária ao limite operacional.
- Testes: testes existentes relacionados em `tests/web_api/`, `web/src/diagnostics/`, `web/src/study/`; testes novos isolados quando evitarem arquivos grandes.
- Documentação: entrada nova no topo de `docs/DIARIO-DE-MUDANCAS.md` e explicação operacional de retenção/recuperação em `docs/deploy-render.md`.

**Interfaces:**
- Consumir os contratos atuais `DiagnosticRequest`, `DiagnosticEnvelope`, `EffectiveInput`, `DiagnosticExecutor`, `executeStudyDiagnostic`.
- Produzir os mesmos contratos públicos, ampliando limites coerentemente e mantendo compatibilidade de dados históricos.

### 1A. Proveniência completa e limite em bytes

- [ ] Regressão RED com 99 e 1000 ordens completas; a prévia é válida e o diagnóstico também deve ser. Incluir regras de IOF e origem longa no teste HTTP de tamanho.

```python
# Sem regras adicionais: 9 campos gerais + 5 por ordem.
assert len(preview_99.proveniencia) == 504
assert DiagnosticRequest.model_validate(payload_99).sampling.count == 1
# Até 100 regras de IOF acrescentam 200 campos: 5209 caminhos canônicos.
assert DiagnosticRequest.model_validate(payload_1000_100_rules)
```

- [ ] Ampliar as três cotas de proveniência do request/envelope para acomodar os 5209 campos canônicos. Usar constante compartilhada (ou limite coerente acima desse total, documentado), sem remover limites.
- [ ] Conferir o JSON efetivo em bytes, incluindo duplicação de proveniência na entrada fixa; elevar somente o teto necessário do endpoint diagnóstico para a capacidade suportada. Manter resposta limitada, tratar oversize de forma explícita. Não prometer que qualquer preenchimento arbitrário ilimitado cabe.
- [ ] Regenerar contratos e validadores oficiais. Testar o builder real com proveniência completa, não dicionário vazio.

### 1B. Premissas atuais em diagnósticos gerados

- [ ] Regressões RED: receita preservada W=7/IOF=0.035; cenário editado W=1/IOF=0.01 deve enviar os últimos valores. Cobrir também período, regras de IOF e suas origens.

```typescript
expect(request.sampling.preparation_input.window_days).toBe(1);
expect(request.sampling.preparation_input.costs.iof_out).toBe('0.01');
```

- [ ] Derivar receita de execução da receita preservada de participantes mais premissas/período atuais, sem mutar a receita original. Preservar participantes, sementes, identificação e regras de proveniência. Rejeitar modo incompatível com mensagem útil, em vez de ignorar a edição.
- [ ] Ajustar validação de registros novos para comparar participantes/receita e premissas efetivas; continuar aceitando registros históricos imutáveis que usavam exatamente o snapshot antigo. Não afrouxar validação para pedidos arbitrários.
- [ ] Histórico legado permanece legível, mas uma execução antiga cuja receita diverge de suas premissas/período salvos deve ser tratada como desatualizada pelos seletores de resultado atual. Não reescrever o resultado nem invalidar históricos que já conciliavam.
- [ ] Testar fluxo real de atualizar cenário → construir pedido → salvar reserva/terminal, além do builder isolado.

### 1C. Recuperação do executor e causa técnica sanitizada

- [ ] Regressão RED com morte real de um filho criado pelo teste: request válido após falha e de outro owner deve voltar a funcionar. Testar callback tardio do pool antigo, cancelamento e fechamento concorrente.
- [ ] Tratar `BrokenProcessPool` como infraestrutura; recuperar uma única vez por geração do pool, sem substituir um pool saudável em callbacks tardios e sem ressuscitar executor fechado. Não manter lock durante shutdown/trabalho pesado. Jobs afetados têm terminal explícito; nova execução/retry usa pool saudável. Nunca reexecutar automaticamente a mesma tentativa já terminada.
- [ ] Registrar falhas de worker/agregação/recuperação com categoria, tipo seguro e IDs; teste `caplog` deve excluir texto sentinela de uma exceção contendo dado sensível. Categorias públicas devem separar entrada/resultado inválido de indisponibilidade.

### 1D. Falha de resultado recuperável no navegador

- [ ] Regressão RED: job SUCCEEDED e download com erro permanente não pode deixar somente QUEUED; a próxima execução deve poder criar outra tentativa. Usar teste com erro HTTP e teste de envelope definitivamente inválido.
- [ ] Distinguir erros transitórios (rede/timeout/429/5xx), que mantêm a reserva retomável, de erros definitivos (p.ex. 413/422 e resposta incompatível/identidade inválida), que produzem um terminal local sem apagar histórico. Preservar tratamento de 404 como INTERRUPTED, session epoch e storage failure.
- [ ] Não converter erro de armazenamento em falso sucesso; não executar POST duplicado em falhas transitórias. Cobrir modo de persistência TERMINAL_ONLY e retry/cancel quando relevantes.

### 1E. Memória e retenção

- [ ] Regressão RED: terminar/cancelar/falhar libera repetições completas intermediárias. Resultado final recente continua consultável e retry usa request original.
- [ ] Implementar limite de terminais por quantidade e bytes retidos, com descarte dos terminais mais antigos; ativos nunca são expulsos. Defaults: até 128 terminais e 64 MiB de payload serializado retido; 24h continua TTL máximo, não garantia sob pressão. Contabilizar request e envelope, não só a resposta. Documentar que bytes serializados não representam exatamente RSS.
- [ ] Garantir que a reserva de um resultado até o teto HTTP não expulse imediatamente o próprio job por limite mal escolhido. Idempotência de itens expulsos deve ser limpa junto. Consulta expirada usa 404 já reconciliado pelo cliente; resultado salvo localmente permanece intacto.
- [ ] Medir um diagnóstico de 100 repetições com carteira sintética pequena/média para conferir que a correção não altera resultados nem retém intermediários após término. Não executar teste de OOM nem carga contra produção.

### 1F. Verificação e entrega

- [ ] Rodar pytest focado e Vitest focado após cada alteração. Reportar RED/GREEN com comandos e saídas.
- [ ] Rodar suíte Python normal e `-O`, suíte web, typecheck/lint, ruff/mypy nas fronteiras alteradas, geração determinística, build e teste de aceitação aplicável. Repetir apenas o necessário após novos ajustes.
- [ ] Executar cenário Amanda e confirmar o número vigente; nenhum arquivo de motor deve aparecer no diff.
- [ ] Entrada no diário no mesmo commit, usando issues existentes no sufixo MOT-N e explicitando que não houve publicação.
- [ ] Self-review, commit e relatório em `.superpowers/sdd/2026-10-02-diagnostico-confiavel/task-1-report.md` com limitações reais e resultados de teste. Não criar subagentes nem publicar.

## Aceite

Os seis achados têm correção e evidência de regressão. A memória transitória passa a ter retenção limitada e documentada, os dados salvos continuam legíveis, e execuções inalteradas mantêm o mesmo resultado financeiro. Revisão independente final cobre especificação e qualidade no mesmo diff, evitando dois reviews equivalentes desta única tarefa integrada.
