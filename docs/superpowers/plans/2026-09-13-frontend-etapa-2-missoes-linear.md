# Etapa 2 — missões preparadas para cadastro no Linear

Design e plano aprovados em 2026-09-13. Destino conferido: workspace felipe bisca, time MOTOR DE FLUXO. Autorização específica recebida. Dois documentos publicados e 11 missões cadastradas em Backlog, com modelos e dependências conferidos por releitura no Linear.

Cadastro: uma issue por tarefa, status Backlog, sem atribuir pessoa, agente, prazo ou prioridade não solicitados. Modelos abaixo são orientações de execução. Criar em ordem de dependência, guardar os IDs retornados e então configurar blockedBy com IDs reais. T2 depende da fundação concluída MOT-22. Não inventar identificadores.

Referências obrigatórias: docs/superpowers/specs/2026-09-13-frontend-etapa-2-design.md; docs/superpowers/plans/2026-09-13-frontend-etapa-2-plano-tecnico.md; documentos-base enumerados no plano, incluindo distribuição de modelos. Manter textos completos no repositório local; publicação integral no Linear autorizada e concluída; links na seção 13 do plano.

## Etapa 2 / T2 — DTOs HTTP de preparação e catálogo

PR planejado: A. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Sol/Medium; Astra somente revisão de mudança contratual identificada. **Criar:** `servidor/contracts/preparation.py`, `tests/web_api/test_preparation_contracts.py`, `contracts/fixtures/authored-input.json`.
**Modificar:** `servidor/app.py` (schema factory), `servidor/contracts/__init__.py`, `web/scripts/generate-api.mjs`, `contracts/openapi.json`, `web/src/api/generated.ts`, `web/src/api/schemas.json`, `web/src/api/validators.ts`, `tests/web_api/conftest.py`, operação (criar `docs/frontend/etapa-2-operacao.md`), Diário.
**Consome:** §4/S06/S07 e primitivos Pydantic. **Produz:** EffectiveInput/PreparationRequest/Response/Catalog/Capabilities e validadores AJV correspondentes; fixture sintética input de 1 participante mediana `1000`, volume `10000`, fração `0.5`, prazo fixo 7, NATURAL 0/30, custos da referência, fontes técnicas.
**Dependências:** base V0. **Libera:** T1/T3/T8. **Commit:** `feat: contratos de preparação de carteira` + C.

- [ ] Escrever parametrizações: seed number/negativa/>2^63−1 rejeitada; money number, 7 casas, volume zero; profile desconhecido; 101 participantes; duplicate ID; prazo 366; soma A+M=731; fonte ausente/extra; finalidades com espaços externos; IOF par duplicado; `true` em inteiro → 422/ValidationError.
- [ ] Âncora e vermelho:

```python
def test_seed_preserva_inteiro_acima_do_limite_js(authored_payload):
    authored_payload['input']['participants'][0]['seed'] = '9223372036854775807'
    dto = PreparationRequest.model_validate(authored_payload)
    assert dto.input.participants[0].seed == '9223372036854775807'
```

`python -m pytest tests/web_api/test_preparation_contracts.py -q` falha por import ausente antes dos DTOs.

- [ ] Definir fixture `authored_payload` em `tests/web_api/conftest.py` lendo authored-input.json com UUIDs sintéticos e deepcopy por teste. Todos os campos de §4.1 presentes. Definir também authored_request como PreparationRequest.model_validate(authored_payload), e clock como callable retornando datetime UTC fixo 2026-09-13T00:00:00Z, para T3.
- [ ] Implementar StrictModel, regras de sources/tempo/limites. Erros de fields estáveis em caminhos de IDs, sem dados de entrada em mensagens.
- [ ] Acrescentar schema das novas rotas sem alterar schemas existentes; gerar tipos/runtime e criar aliases em `web/src/api/client.ts` somente quando T8 implementar métodos.
- [ ] V1/V2; comparar schemas antigos e fixtures reference sem alteração inesperada; documentar/C.

**Conclusão:** schema valida forma em JS e semântica integral no servidor; versões explícitas, geração determinística de artefatos.

## Etapa 2 / T1 — Domínio local, schemas e fixtures de autoria

PR planejado: A. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Astra/Medium para fechar contrato revisado; Terra/Medium implementa formas/validação sob contrato. Essa concentração Astra é justificada pela evolução material do StudyDocument, permitida pelo plano geral; não é distribuição automática de trabalho a subagentes.

**Criar:** `web/src/study/model.ts`, `domain.ts`, `fingerprints.ts`, `resultState.ts`, `study.schema.json`, `validation.ts`, `domain.test.ts`, `fingerprints.test.ts`, `resultState.test.ts`, `fixtures.ts`, `legacyTypes.ts`.
**Modificar:** `web/src/study/types.ts`, `repository.ts`, `memoryRepository.ts`, `memoryRepository.test.ts`, `web/package.json`, `web/package-lock.json`, `docs/frontend/etapa-2-operacao.md`, Diário.
**Consome:** aliases HTTP herdados e novos de T2, S05/S08. **Produz:** tipos de §3, funções DomainServices, MemoryStudyRepository conforme §3.3; `makeStudy(scope?, ids?)`, `makeParticipant(id, groupId?)`, `makeGroup(id)` fixtures exportadas apenas para teste, com UUIDs sintéticos fixos e relógio 2026-09-13T00:00:00Z.
**Dependências:** base V0 e T2. **Libera:** T4/T7. **Commit:** `feat: contrato local de estudos` + C.

- [ ] Criar teste com grupo volume raw `10000000`, três participantes herdados, um override raw `20000000`; modificar grupo para `12000000`: dois resolvem 12M, personalizado permanece 20M. Nome muda sem numeric_key mudar; reorder idem.
- [ ] Cobrir IDs repetidos, grupo inexistente, inherit sem grupo, fonte nula, número incompleto, zero/negativo/expoente, custo inválido, soma temporal 731, prazo 366 e vazio. Estrutura inválida recusa persistência; raw incompleto persiste e resolveInput retorna issues.
- [ ] Escrever âncora:

```typescript
it('nome não altera identidade numérica', async () => {
  const a = makeStudy();
  if (a.content.kind !== 'AUTHORED') throw new Error('fixture');
  const before = await fingerprintInput(a.content.input);
  a.content.input.participants[0].name = 'Nome revisto';
  expect((await fingerprintInput(a.content.input)).numeric).toBe(before.numeric);
});
```

- [ ] Vermelho: `npm --prefix web run test:unit -- src/study/domain.test.ts src/study/fingerprints.test.ts`; esperar módulo ausente, depois falha de comportamento, nunca fixture inválida como suposto sinal funcional.
- [ ] Implementar resolução de cada Slot por group_id, parsers puros e validators, comparação decimal canônica e hashes com sequenciamento no consumidor; deep clone nas fronteiras.
- [ ] Instalar dev `fake-indexeddb` com `npm --prefix web install --save-dev --save-exact fake-indexeddb`; registrar versão resolvida/compatibilidade Node24 no lock e operação. CI usa npm ci, não resolve novamente.
- [ ] Implementação mínima da herança:

```typescript
const slot = participant.fields[key];
const field = slot.mode === 'own' ? slot.field : group?.fields[key];
if (field === undefined) issues.push({ path, code: 'REFERENCIA_INVALIDA', message: 'Grupo indisponível.' });
```

- [ ] Cobrir raw 1,0/1,00 mesma key, A→B→A mesma key final, mudança só de fonte evidence diferente/numeric igual, dinheiro grande sem Number; duplicação remapeia relações, mantém sementes e zera execução.
- [ ] V1; revisar schema contra cada campo de §3; documentar e C.

**Conclusão:** documento incompleto persistível; entrada executável tipada; nenhuma função de domínio importa React/IndexedDB; contratos locais completos sem cast como validação.

## Etapa 2 / T3 — Dimensionamento, exemplos e rotas reais

PR planejado: B. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Sol/Medium. **Criar:** `servidor/catalog.py`, `preparation.py`, `preparation_identity.py`, `routes/preparation.py`, `routes/capabilities.py`, `transport_limits.py`, `tests/web_api/test_preparation.py`, `test_preparation_http.py`, `test_catalog.py`, `generate_preparation_fixture.py`, `contracts/fixtures/preparation-result.json`.
**Modificar:** `servidor/app.py`, `routes/examples.py`, `routes/preview.py` (somente extração de limite e slot compartilhado), `tests/web_api/conftest.py`, operação, Diário.
**Consome:** T2; funções públicas do motor; §4. **Produz:** três endpoints, build_catalog/dimension_participant/prepare_portfolio, preparação fixture gerada pelo motor.
**Dependências:** T2. **Libera:** T8/T9. **Commit:** `feat: geração de carteiras pelos perfis do motor` + C.

- [ ] Testar cálculo com sigma=0 por objeto de perfil sintético de teste: 10000/1000=10 operações esperadas/mês. Perfil real usa sigma do catálogo; verificar cálculo Decimal e cadência a 12 casas, sem volume ajustado após sorteio.
- [ ] Testar mesmos inputs/seeds/build → mesmas ordens; apenas nome UI não chega ao request; adição/remoção de B conserva ordens A; custos/janela/origem não mudam generation_fingerprint; prazo/direção/ticket/seed/build mudam.
- [ ] Âncora:

```python
def test_mesma_carteira_produz_mesmas_ordens(authored_request, clock):
    a = prepare_portfolio(authored_request, build_sha='a'*40, clock=clock)
    b = prepare_portfolio(authored_request, build_sha='a'*40, clock=clock)
    assert a.orders == b.orders
    assert a.generation_fingerprint == b.generation_fingerprint
```

- [ ] Vermelho: `python -m pytest tests/web_api/test_preparation.py tests/web_api/test_catalog.py -q`, módulo ausente.
- [ ] Implementação mínima numérica:

```python
with localcontext() as ctx:
    ctx.prec = 50
    mean = median * (sigma * sigma / Decimal(2)).exp()
    cadence = (volume / mean).quantize(Decimal('0.000000000001'), rounding=ROUND_HALF_UP)
if cadence <= 0:
    raise PreparationInputError('GERACAO_INVALIDA')
```

PreparationInputError é erro novo em preparation.py com `code: str`, convertido na rota em ApiFailure 422; não capturar Exception como validação de domínio. Montar Arquetipo com campos completos do catálogo/customização, converter somente float exigido pelo motor. chamar gerar_ordens, revalidar saídas e somar Decimal na coorte; converter seed textual com int Python.

- [ ] Testar 500 esperadas aceitas, 500.000000000001 recusadas antes de chamar motor, 1.001 reais recusadas (gerador substituído só nesse teste de limite), ordem zero/valor>1e12/7 casas recusada sem reamostra. Vazio gera composição total zero/fração null.
- [ ] Testar catálogos cinco IDs/nomes/12 participantes, fontes fixas, custos iguais ao PARAMETROS_VARREDURA e lista IOF completa. Fixtures não contêm empresa real nem dados observados.
- [ ] Testar A=10/M=20: ordens dias 0–9 fora da composição medida, dia10 dentro, dia30 proibido; em caso separado A=365/M=365/prazo=365, dia_limite até1094 e horizonte_dias=730, dentro dos limites distintos de OrdemEntrada e CenarioEntrada; nenhuma métrica financeira recalculada.
- [ ] Rotas: auth antes de body; versão explícita diferente de 1.0.0 é recusada com409 antes de model_validate; 1MiB+1/2MiB+1 limites; POST simultâneo preparação/prévia recebe429; health permanece200; erro libera slot em finally; build divergente409; versão ausente422; output invalidado não parcial.
- [ ] Gerar fixture com relógio/UUID fixos em módulo exclusivamente de geração, duas vezes idêntica; V1/V2/V3; comparar referência numérica; documentar/C.

**Conclusão:** cinco exemplos preparáveis com contratos reais e nenhuma alteração motor; limites e evidência aplicados antes de publicação.

## Etapa 2 / T4 — Repositório IndexedDB e atomicidade

PR planejado: C. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Terra/Medium, com critérios CAS definidos neste plano. **Criar:** `web/src/study/indexedDbRepository.ts`, `storageRecords.ts`, `repository.contract.test.ts`, `indexedDbRepository.test.ts`. **Modificar:** `repository.ts`, `memoryRepository.ts`, respectivos testes em `web/src/study/`, operação e Diário.
**Consome:** contratos locais de §3, stores/transações de §5. **Produz:** openStudyRepository e todos os métodos de §3.3, implementados também no repositório em memória para executar o mesmo contrato de testes.
**Dependências:** T1. **Libera:** T5/T6. **Commit:** `feat: persistência transacional dos estudos` + C.

- [ ] Escrever suíte compartilhada parametrizada por factory; executar contra memória e fake-indexeddb. Dados: duas contas e projetos sintéticos, um estudo revision=1 e dois writers esperando revision=1.
- [ ] Testar criação/leitura sem alias mutável; escrever cópia não muda envelope original; segundo writer recebe REVISION_CONFLICT e não substitui o primeiro. Duas chamadas com mesmo operation_id não duplicam gravação; operation_id diferente não contorna CAS.
- [ ] Vermelho: `npm --prefix web run test:unit -- src/study/repository.contract.test.ts src/study/indexedDbRepository.test.ts`; factory nova ausente.
- [ ] Criar stores e índices de §5 em onupgradeneeded; validar scope, schema, tamanho e digest fora da transação. Recontar delta de bytes e revisão dentro da transação, inclusive quando dois estudos da conta salvam juntos.
- [ ] Confirmar sucesso exclusivamente em transaction.oncomplete. Injetar abort após put do estudo e antes de put do resultado: nenhum dos dois deve persistir. Não usar Promise de hash/fetch no corpo da transação.
- [ ] Testar 30 estudos incluindo lixeira, 10 resultados, 1 MiB de documento, 12 MiB de execução e 150 MiB lógicos nos limites inclusivos e +1. Abortar por quota não muda meta, referências nem estudo; quota física menor retorna QUOTA_EXCEEDED.
- [ ] appendExecution relê estudo e exige attempt_id vigente; preserva edição posterior, não exige que a revisão atual ainda seja a enviada. Resultado fica histórico se fingerprint divergiu. Tentativa substituída retorna ATTEMPT_CONFLICT e não grava.
- [ ] savePreparation e appendExecution conferem estudo/cenário/conta/request/revisão enviada e snapshots; não permitem referências cruzadas. Preparação anterior ainda referenciada por resultado não é removida.
- [ ] Testar list sem materializar envelopes, close/versionchange, blocked, digest errado em um registro e continuidade de outro. Repositório fechado retorna STORAGE_CLOSED; escopo divergente retorna OWNER_MISMATCH antes de mutação.
- [ ] V1; documentar limites de fake-indexeddb e encaminhar prova Chromium a T10; documentar/C.

**Conclusão:** contrato compartilhado passa nas duas implementações, abort é atômico, CAS e quota são transacionais; telas não importam IDB.

## Etapa 2 / T5 — Migrações, lixeira e recuperação local

PR planejado: C. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Terra/Medium. **Criar:** `web/src/study/migrations.ts`, `migrations.test.ts`, `lifecycle.ts`, `lifecycle.test.ts`, `fixtures/legacy-draft.json`, `fixtures/legacy-study.json` (todos os caminhos fixtures sob `web/src/study/`). **Modificar:** `draftRecovery.ts`, `indexedDbRepository.ts`, `storageRecords.ts`, operação e Diário.
**Consome:** T4 e tabela §5. **Produz:** importLegacy, trash/restore/purge/removeExecution e duplicateStudy integrados ao repositório; leitor legado sem nova escrita.
**Dependências:** T4. **Libera:** T6/T7/T10. **Commit:** `feat: migração e ciclo de vida local dos estudos` + C.

- [ ] Testar draft version=1 com study_id=stage-1-draft: novo UUID, nome preservado, carteira vazia incompleta, original mantido. Dois imports concorrentes geram um único destino pelo marcador, inclusive após F5.
- [ ] Testar StudyDocument 1.0.0 válido: LEGACY_EXPLICIT em leitura, sem inventar grupos; validar request/envelope/identidades herdados. JSON inválido, versão futura, variantes não vazias e replay incompatível não sobrescrevem origem nem impedem abrir outro estudo.
- [ ] Vermelho: `npm --prefix web run test:unit -- src/study/migrations.test.ts src/study/lifecycle.test.ts` antes de implementar módulos.
- [ ] Implementar conversão pura em cópia, validá-la, então gravar original+destino+marcador+quota atomicamente. Digest do original usa os bytes UTF-8 do texto lido; não normalizar o JSON antes desse digest.
- [ ] Testar quota no meio da migração: rollback completo, origem mantida e nova tentativa possível. Nunca alterar envelope recebido para fazê-lo passar em schema novo.
- [ ] Testar renomeação conserva fingerprints; duplicação troca todos os IDs de autoria/relações, mantém seeds/fontes, remove resultados/tentativa e não promete resultado financeiro idêntico em empate EDF.
- [ ] Lixeira preserva tudo até purge confirmado. Purge remove agregado, preparações, execuções e backups; mantém marcador DELETED mínimo para não ressuscitar legado. Apagar localStorage legado só após commit; se falhar, marcador ainda bloqueia import.
- [ ] removeExecution só remove preparação órfã que não seja corrente nem pertença à tentativa ativa. Não remover automaticamente o 1º resultado para permitir o 11º.
- [ ] V1; documentar casos recusados e recuperação simples; documentar/C.

**Conclusão:** migração idempotente preserva origem; operações destrutivas são explícitas; nenhum fluxo extra de exportação/segurança.

## Etapa 2 / T6 — Controlador, autosave, sessão e concorrência

PR planejado: D. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Sol/Medium para máquina de estado e sessão; Terra implementa os estados visuais em T7. **Criar:** `web/src/study/controller.ts`, `StudyProvider.tsx`, `autosave.ts`, `tabEvents.ts`, `controller.test.ts`, `autosave.test.ts`. **Modificar:** `web/src/auth/AuthProvider.tsx`, `types.ts`, `web/src/app/providers.tsx`, testes existentes de auth, operação e Diário.
**Consome:** domínio T1/repositório T4/migrações T5, sessão SDK. **Produz:** controlador por scope+epoch e hook useStudy; comandos create/select/edit/flush/rename/duplicate/trash/restore/purge/resolveConflict/reserveAttempt; estado de persistência, resultado e tentativa separados.
**Dependências:** T5. **Libera:** T7/T8/T9. **Commit:** `feat: coordenação de estudos por sessão e aba` + C.

- [ ] Fake timers: 499 ms sem gravação, 500 ms uma gravação; digitação contínua grava até 2 s; gravação lenta + novas edições produz fila serial e último estado preservado; raw='1,' volta intacto.
- [ ] Vermelho: `npm --prefix web run test:unit -- src/study/controller.test.ts src/study/autosave.test.ts` por módulos ausentes.
- [ ] Implementar fila coalescente por estudo. flush retorna Promise de commit confirmado; erro mantém memória e estado FALHA. Retry só salva, nunca executa API. Não capturar erro e retornar SALVO.
- [ ] Testar editar→trocar estudo e editar→logout: flush precede ação; falha exige permanecer ou descarte explícito. Expiração involuntária oculta dados imediatamente e isola memória pendente até a mesma conta autenticar.
- [ ] Epoch monotônico em cada transição de sessão, inclusive A→B→A; verificar epoch antes de publicar resposta e antes de iniciar transação de anexação. Fechar repo/subscriptions da sessão anterior e limpar caches da UI/Query.
- [ ] Usar expires_at do SDK e evento de atualização de token para reagendar expiração; no retorno de foco conferir relógio atual. Refresh bem-sucedido conserva acesso; refresh inválido expira sem expor sessão passada.
- [ ] BroadcastChannel publica apenas study_id/revision/operation_id. Aba limpa relê; aba suja entra CONFLITO. Sem canal, CAS/foco ainda detectam. Opções: carregar versão salva, manter edição pendente para salvar como outro estudo, cancelar diálogo; sem merge automático.
- [ ] Reserva CAS impede dois POST no mesmo estudo. Reabertura marca tentativa originadora interrompida; após 30 s outra aba pode substituir tentativa explicitamente. Trocar seleção de estudo não altera identidade da tentativa já enviada.
- [ ] Testar offline com app carregada+sessão válida permite salvar; expirada impede leitura; login B não vê A. Nenhum service worker ou desbloqueio offline.
- [ ] V1; documentar/C.

**Conclusão:** autosave não perde última edição, troca de sessão não publica estado antigo e concorrência não depende do canal de aviso.

## Etapa 2 / T8 — Cliente HTTP e execução reproduzível

PR planejado: D. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Sol/Medium. **Criar:** `web/src/study/execution.ts`, `execution.test.ts`, `web/src/api/preparation.test.ts`. **Modificar:** `web/src/api/client.ts`, `errors.ts`, `validators.ts`, `web/src/preview/PreviewProvider.tsx`, testes existentes, operação e Diário.
**Consome:** T2/T3/T6, envelopes atuais do servidor. **Produz:** getCapabilities/getCatalog/preparePortfolio e executeStudy, encadeando flush→validar→reservar→preparar→prévia→persistir.
**Dependências:** T3/T6. **Libera:** T7/T9/T10. **Commit:** `feat: execução da carteira autorada pela API real` + C.

- [ ] Testar cliente com fetch controlado: headers Bearer atuais por chamada, 401/403/409/413/422/429/503, timeout30s e JSON inválido. Zero retry POST, inclusive preparação; GET no máximo uma repetição conforme política herdada.
- [ ] Vermelho: `npm --prefix web run test:unit -- src/study/execution.test.ts src/api/preparation.test.ts` com funções ausentes.
- [ ] Implementar máquina de §8: congelar snapshot após flush, obter capabilities, resolver fontes, calcular chaves, reservar tentativa, preparar e validar, montar PreviaRequest com ordens explícitas e período/custos atuais, executar API existente, validar e anexar.
- [ ] Compatibilidade inclui build e versões; não reaproveitar preparação de outro build. Mudança somente econômica reaproveita ordens; reexecuta prévia completa. Mudança só de proveniência atualiza preparação/evidência pela mesma seed, sem exigir ordens diferentes.
- [ ] Conferir identidades e input_snapshot nos dois retornos; qualquer divergência retorna CONTEXTO_DIVERGENTE, conserva anterior e não persiste resposta inválida. Não inserir seeds no manifesto 1.0.0; anexar PreparationResponse separadamente ao ExecutionRecord.
- [ ] Editar durante HTTP deixa retorno como histórico válido da entrada enviada. Renomear mantém atual. Revertem-se entradas/origens ao mesmo conteúdo e build: histórico compatível pode voltar a atual. Nova tentativa falha preserva execução anterior e mostra falha separada.
- [ ] A→B→A descarta retorno antigo mesmo com mesmo sub. Tentativa substituída, estudo excluído ou repo fechado não reabre agregado. Navegar não aborta silenciosamente resultado útil.
- [ ] Quota ao anexar conserva resultado em memória e bloqueia novo disparo desse estudo; Tentar salvar não faz fetch. Limite de 10 resultados é verificado antes de preparação e novamente na transação.
- [ ] Gerar outra realização incrementa repetition e deriva novas seeds de regra determinística versionada: SHA-256 UTF-8 de `dimensionamento-v1|seed-anterior|numero-repeticao`, primeiros 8 bytes big-endian com máscara de 63 bits, serializado decimal. Demais edições não alteram seeds. Testes com vetor fixo Python/JS verificam os mesmos bytes; não há geração de ordens JS.
- [ ] V1/V2/V3; requests dos testes de integração percorrem adaptador e motor reais em T10; documentar/C.

**Conclusão:** identidade estável, ordens reproduzíveis, respostas canônicas imutáveis e nenhum resultado obsoleto rotulado como atual.

## Etapa 2 / T7 — Editor de estudo, carteira e premissas

PR planejado: E. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Terra/Medium. **Criar:** `web/src/study/StudySelector.tsx`, `ParticipantEditor.tsx`, `GroupEditor.tsx`, `DraftFieldInput.tsx`, `StudyDialogs.tsx`, `editors.test.tsx`, `web/src/pages/AssumptionsPage.tsx`. **Modificar:** `web/src/pages/PortfolioPage.tsx`, `web/src/app/AppShell.tsx`, `router.tsx`, estilos existentes, operação e Diário.
**Consome:** useStudy/domínio, catálogo tipado por API T8 (injetável em teste). **Produz:** autoria completa e navegação carteira/premissas, CRUD e exemplos; nenhum acesso direto ao armazenamento.
**Dependências:** T6/T8. **Libera:** T9/T10. **Commit:** `feat: edição de carteiras e premissas com proveniência` + C.

- [ ] Testing Library: criar vazio incompleto; criar cada um dos cinco exemplos com 12 participantes/seeds; editar grupo atualiza somente participantes herdados; personalizar um campo e voltar a herdar; participante avulso exige own em todos os campos aplicáveis.
- [ ] Vermelho: `npm --prefix web run test:unit -- src/study/editors.test.tsx`, editor novo ausente.
- [ ] Inputs text+inputMode decimal preservam raw; exibir unidade, origem e estado herdado. Volume do grupo é por participante; resumo separa total esperado do grupo. Ticket identificado como mediana, sem sugerir média aritmética.
- [ ] Testar mediana='1000', volume='10000000', OUT='0,75', prazo fixo='7'; UI transmite autoria e não calcula cadência/lognormal, custo, economia ou netabilidade. p_out é probabilidade que produz proporção monetária esperada, não quota realizada garantida.
- [ ] Trocar perfil muda apenas dispersão e faixa de prazo quando modo PROFILE; não substitui volume, ticket, direção, eFX ou finalidades, herdados ou próprios. Textos de origem não são preenchidos com contexto de negócio inventado.
- [ ] Premissas: sete custos e tabela de IOF por finalidade/direção, warmup/medição/janela. Validar par IOF duplicado, decimal inválido, limites e fontes faltantes no resumo acessível sem impedir autosave.
- [ ] Paginar participantes em 20 sem descartar edição fora da página. Remover grupo oferece preservar participantes como avulsos com valores efetivos materializados, ou remover grupo e participantes mediante escolha explícita; nunca deixar group_id órfão. Se valor herdado estiver incompleto, materializar seu DraftField sem convertê-lo em zero.
- [ ] Diálogos de nome/duplicação/lixeira/remover resultado usam foco inicial, Escape e restauração; confirmação só para descarte/exclusão exigidos no design. Lista informa indisponível/corrompido sem expor texto bruto técnico.
- [ ] Testar limite 31º estudo/21º grupo/101º participante antes de mutar; catálogo indisponível permite vazio, bloqueia exemplo com explicação e retry GET.
- [ ] V1, teclado básico no Chromium de T10; documentar/C.

**Conclusão:** todas as entradas e origens são editáveis/persistíveis, grupos não destroem overrides e tela não contém lógica numérica do motor.

## Etapa 2 / T9 — Resultado básico, histórico e recuperação visível

PR planejado: E. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Terra/Medium para estados/componentes; Sol/Medium para ligação analítica e inspeção visual. **Criar:** `web/src/preview/ResultStatus.tsx`, `ExecutionHistory.tsx`, `CompositionSummary.tsx`, `resultFlow.test.tsx`. **Modificar:** `web/src/pages/PreviewPage.tsx`, `web/src/preview/PreviewProvider.tsx`, `web/src/app/router.tsx`, estilos existentes, operação e Diário.
**Consome:** executeStudy/useStudy, presentation e envelopes v1, composição do PreparationResponse. **Produz:** diagnóstico básico e histórico em leitura com estado inequívoco.
**Dependências:** T7/T8. **Libera:** T10. **Commit:** `feat: resultado atual e histórico imutável do estudo` + C.

- [ ] Tabela de testes: ausente, atual, desatualizado por entradas, por origem, por build, incompleto; cruzar atual/desatualizado com executando/falha e salvo/não salvo. Não reduzir os três eixos a um boolean.
- [ ] Vermelho: `npm --prefix web run test:unit -- src/preview/resultFlow.test.tsx` antes de componentes.
- [ ] Exibir período, seed por participante/proveniência pela preparação, composição esperada/realizada e número de ordens; métricas financeiras exclusivamente do envelope. Fração null com volume zero aparece como não aplicável.
- [ ] Histórico identifica data/entrada; selecionar antigo não substitui autoria. Remover resultado é explícito; não permite editar envelope. Campos de autoria snapshot podem ser consultados em leitura.
- [ ] Sem rede mostrar versão de servidor não verificada, permitir ler salvo e editar com sessão válida. 401 bloqueia acesso, 403 mantém estudo, 429/timeout permitem nova tentativa explícita. Resultado ainda não salvo usa aviso persistente simples com retry de gravação.
- [ ] Comparar/Replay continuam na navegação com indisponibilidade honesta; nenhum seletor funcional de variante/replay ou distribuição estatística.
- [ ] role=status para transições, role=alert para erro acionável, resumo de validação focável e link ao campo; controles bloqueados comunicam motivo. V1 e revisão visual T10; documentar/C.

**Conclusão:** resultado anterior continua consultável, mas não se confunde com entrada atual nem com tentativa que falhou.

## Etapa 2 / T10 — Percurso real, persistência no Chromium e CI

PR planejado: F. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Terra/Medium executa percurso e cobertura UI; Sol/Medium define/verifica critérios de API, identidade, concorrência e runner. **Criar:** `web/e2e/studies.spec.ts`, `persistence.spec.ts`, `study-failures.spec.ts`, `web/e2e/fixtures/study.ts`, `web/scripts/measure-studies.mjs`. **Modificar:** `web/e2e/foundation.spec.ts`, `real-auth.spec.ts`, `web/playwright.config.ts`, `tests/web_api/run_e2e.py`, `test_e2e_server.py`, `test_acceptance_tooling.py`, `.github/workflows/test.yml`, `web/package.json`, operação e Diário.
**Consome:** T3–T9 completos. **Produz:** gates locais/CI, medição e evidências reproduzíveis; não substitui auth real por mock.
**Dependências:** T9. **Libera:** T11. **Commit:** `test: aceitação do fluxo completo e persistência local` + C.

- [ ] Escrever cenário criar exemplo→editar volume→executar servidor→salvar→F5→editar→desatualizado→reverter→atual; asserts de ordens/identidades/fingerprints e valores do envelope, não só texto de sucesso.
- [ ] Vermelho: `npm --prefix web exec -- playwright test --config web/playwright.config.ts --project=local --list` inicialmente não lista novos arquivos pelo testMatch herdado; registrar falta como falha do gate, depois alterar seleção. A suíte nova ainda falha nas funcionalidades ausentes se executada antecipadamente.
- [ ] Configurar seleção explícita de todos os arquivos controlados, mantendo real-auth opt-in. Remover shutdown no afterAll de foundation; launcher encerra servidor depois da suíte completa também em falha. Testar seleção e lifecycle no Python.
- [ ] Dois contexts/abas mesma conta: conflito com writer perdedor intacto, salvar como outro, corrida de execução produz um POST. Fechar context e reabrir com o mesmo userDataDir confirma IndexedDB real; storageState isoladamente não comprova persistência do banco.
- [ ] Conta A cria, sai; B não lista A; A volta e relê; trocar projeto não compartilha. Testar expiração durante execução e A→B→A com resposta atrasada. Autenticação controlada só no servidor E2E, scanner confirma ausência de bypass no build produção.
- [ ] Exercitar API/adapter/motor reais para cinco exemplos; mocks só para falhas deliberadas (timeout, quota, corrupção, versão) em casos distintos identificados. Interceptar resposta e comparar deep equality com envelope reaberto do repositório; não reconstruir métricas no teste da UI.
- [ ] Testar IndexedDB indisponível, QuotaExceededError, abort, blocked/versionchange, migração impossível e documento corrompido. Conferir rascunho/resultado na memória e outro estudo utilizável; nunca promessa de salvamento. Sem alegar que quota injetada simula disco cheio físico.
- [ ] Auth real: MOT_REAL_AUTH_BASE_URL, MOT_REAL_AUTH_EMAIL, MOT_REAL_AUTH_PASSWORD e segunda conta via MOT_REAL_AUTH_SECOND_EMAIL/MOT_REAL_AUTH_SECOND_PASSWORD, somente env protegido/arquivo ignorado. Se indisponível, gate fica não executado e aceitação não é declarada; usuário pode realizar login humano no ambiente autorizado sem transmitir credenciais na conversa.
- [ ] Medir 20 amostras por exemplo e caso fronteira, descartar aquecimento separado e informar p95 pelo elemento ceil(0.95*n) da lista ordenada. Separar latência HTTP de storage; anotar CPU/RAM/OS/browser/build. Caso real de 1.000 ordens usa fixture explícita válida para prévia; geração com 500 esperadas usa seed fixa, sem reamostragem para forçar contagem.
- [ ] Inspecionar desktop1280×800/1440×900, zoom real200%, teclado, foco, contraste e redução de movimento. Capturas só de dados sintéticos, sem token/configuração. Corrigir falhas de acessibilidade antes do aceite.
- [ ] V1/V2/V3; CI mantém nome `pytest` e gates herdados; falha de um novo arquivo não pode ser escondida por seleção. Medição nova chamada por script `measure:studies` no package.json e integrada ao mesmo gate de aceite, com saída JSON e exit!=0 acima do orçamento.
- [ ] Documentar/C.

**Conclusão:** percurso real, reabertura, concorrência, falhas e isolamento demonstrados; CI executa efetivamente os novos testes; auth real é gate final obrigatório.

## Etapa 2 / T11 — Aceitação e handoff

PR planejado: F. Estado inicial: Backlog. Issue real: consultar vínculo confirmado abaixo.

**Responsável:** Terra/Medium consolida evidências; Sol/Medium revisa integração/visual; Astra/Low somente revisão delimitada dos contratos materialmente ampliados, sem cerimônia por componente. **Criar:** `docs/frontend/etapa-2-aceitacao.md`. **Modificar:** `docs/frontend/etapa-2-operacao.md` (iniciado em T2), `docs/MAPA.md`, `docs/DIARIO-DE-MUDANCAS.md`, este plano (checkboxes/evidência apenas).
**Consome:** T10, evidências V0–V3, matriz abaixo. **Produz:** manual operacional e registro de aceite com SHA, ambiente, comandos/saídas, capturas sintéticas, limites medidos e restrições conhecidas.
**Dependências:** T10. **Libera:** planejamento da Etapa 3 após aceite. **Commit:** `docs: aceitação e operação da etapa 2` + C.

- [ ] Tarefa documental: não criar teste artificial. Antes de escrever conclusão, executar novamente somente gates cujo resultado esteja ausente/invalidado por mudanças; vincular CI do SHA final e auth real desse build.
- [ ] Conferir cada linha de §10 contra evidência executada, não apenas checkbox. Registrar falha/não executado sem converter em aprovado.
- [ ] Manual: iniciar ambiente, criar/executar/reabrir, estados, dados locais por conta, limites, conflito, perda de conexão e limpeza de browser. Sem novas senhas/exportador/procedimento de recuperação não implementado.
- [ ] Registrar contratos HTTP/local/preparação, IDs, fingerprints, seed rule, catálogo e limitações do motor. Entregar à Etapa 3 apenas superfícies existentes; nada de contrato imaginado de job assíncrono.
- [ ] Verificar `git diff --check` e diff final sem motor/; Diário no mesmo commit, MOT real, nenhuma credencial/dado real nas evidências. Atualizar mapa apenas com artefatos realmente criados.
- [ ] Apresentar aceite e riscos ao usuário. Não iniciar Etapa 3, publicar site ou cadastrar novas fases automaticamente.

**Conclusão:** critérios satisfeitos com evidência e continuidade documentada; nenhuma pendência material ocultada.

## Gates compartilhados que integram cada missão

Todos os comandos partem da raiz do worktree. Em Windows usar `.venv\Scripts\python.exe` no lugar de `python`; em CI Python 3.11 está no PATH. Não copiar venv/node_modules/configuração de outro worktree.

**V0 — baseline e instalação na execução:**

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements/web-dev.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e .
npm --prefix web ci
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -O -m pytest -q
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Se `python` não existir no PATH, usar o CPython 3.11 instalado encontrado no ambiente; registrar seu caminho, não presumir `py`. Nenhum desses comandos de implementação foi executado para fingir baseline novo nesta sessão.

**V1 — verificação completa obrigatória ao concluir cada tarefa de código:**

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -O -m pytest -q
.\.venv\Scripts\python.exe -m ruff check servidor tests/web_api
.\.venv\Scripts\python.exe -m mypy servidor
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
git diff --exit-code -- motor
```

**V2 — contrato, obrigatório T1/T2/T3/T8 e todo PR que muda API:**

```powershell
.\.venv\Scripts\python.exe -m servidor.export_openapi
npm --prefix web run generate:api
```

Rodar duas vezes, comparar os bytes dos artefatos entre gerações; primeira geração pode alterar contratos deliberadamente. CI compara com os arquivos commitados via `git diff --exit-code -- contracts web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts`. Acrescentar schema local aos checks somente se gerado (neste plano é fonte versionada).

**V3 — integração/browser/empacotamento por PR funcional e T10/T11:**

```powershell
npm --prefix web run test:e2e
.\.venv\Scripts\python.exe -m tests.web_api.scan_credentials
.\.venv\Scripts\python.exe -m tests.web_api.measure_reference --max-p95-ms 5000
.\.venv\Scripts\python.exe -m build --wheel
```

Wheel precisa ser instalada em venv temporária própria e importada de fora do checkout, igual gate CI existente. Não executar instalação forçada sobre ambiente pessoal. Validar inclusão motor/servidor/YAML/catálogo gerado em código.

**C — commit:** cada tarefa abaixo informa título sem inventar número. Depois da aprovação/cadastro, responsável registra mapeamento Tn→MOT-N em `docs/frontend/etapa-2-operacao.md`; antes de commit exige `$env:MOT_ISSUE` corresponder a `^MOT-[0-9]+$` e à tarefa. Exemplo de execução seguro:

```powershell
if ($env:MOT_ISSUE -notmatch '^MOT-[0-9]+$') { throw 'Issue real obrigatória' }
git commit -m ('feat: contrato local de estudos (' + $env:MOT_ISSUE + ')')
```

Título concreto varia por T. `git add` somente arquivos da tarefa e Diário; nunca `git add .` sem inspeção. Cada tarefa atualiza Diário com sintoma/causa/feito/invalidação e operação com comandos/resultados. Aprovar este documento não autoriza merge automático.

Restrições: sem alterações em motor/, sem geração ou métricas financeiras em TypeScript, sem antecipar Etapas 3–6, sem subagentes sem autorização; worktree por PR, Diário no mesmo commit e identificador MOT real. Cadastro não inicia implementação nesta sessão.
\n## Vínculos confirmados\n\n- T2: [MOT-23](https://linear.app/felipe-bisca/issue/MOT-23/etapa-2-t2-dtos-http-de-preparacao-e-catalogo)\n- T1: [MOT-24](https://linear.app/felipe-bisca/issue/MOT-24/etapa-2-t1-dominio-local-schemas-e-fixtures-de-autoria)\n- T3: [MOT-25](https://linear.app/felipe-bisca/issue/MOT-25/etapa-2-t3-dimensionamento-exemplos-e-rotas-reais)\n- T4: [MOT-26](https://linear.app/felipe-bisca/issue/MOT-26/etapa-2-t4-repositorio-indexeddb-e-atomicidade)\n- T5: [MOT-27](https://linear.app/felipe-bisca/issue/MOT-27/etapa-2-t5-migracoes-lixeira-e-recuperacao-local)\n- T6: [MOT-28](https://linear.app/felipe-bisca/issue/MOT-28/etapa-2-t6-controlador-autosave-sessao-e-concorrencia)\n- T8: [MOT-29](https://linear.app/felipe-bisca/issue/MOT-29/etapa-2-t8-cliente-http-e-execucao-reproduzivel)\n- T7: [MOT-30](https://linear.app/felipe-bisca/issue/MOT-30/etapa-2-t7-editor-de-estudo-carteira-e-premissas)\n- T9: [MOT-31](https://linear.app/felipe-bisca/issue/MOT-31/etapa-2-t9-resultado-basico-historico-e-recuperacao-visivel)\n- T10: [MOT-32](https://linear.app/felipe-bisca/issue/MOT-32/etapa-2-t10-percurso-real-persistencia-no-chromium-e-ci)\n- T11: [MOT-33](https://linear.app/felipe-bisca/issue/MOT-33/etapa-2-t11-aceitacao-e-handoff)\n