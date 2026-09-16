# Frontend — Etapa 2: primeiro fluxo completo

> **ATUALIZAÇÃO DE CONTRATO (2026-09-16):** o envelope Preview continua 1.0.0,
> enquanto o resultado do motor passou ao schema 2.0.0. Operações OUT/IN do mesmo
> cliente permanecem explícitas até a P0; a interface consome da API a composição
> por autonetting, netting multilateral e remessa.

Data: 2026-09-13. Estado: design e plano consolidados aprovados explicitamente pelo usuário (mensagem “aprovado !”). Cadastro das missões no Linear autorizado. Esta sessão permanece sem implementação de funcionalidades, commit, push ou merge.

## S01 — Objetivo e base

Criar → executar → salvar → recarregar → editar → detectar desatualização, com entradas preservadas e nenhum resultado antigo apresentado como atual. O salvamento é automático; executar é ação explícita. Ausência de perda significa ausência de descarte/sobrescrita silenciosa pela aplicação, não garantia contra falha física, limpeza do perfil ou recarga de alterações que o navegador recusou gravar.

Base obrigatória, confirmada por novo fetch antes do worktree: `origin/main` em `a655d9d9fc166507e084b71bce98f2b601fb5d79`; nenhum commit posterior. [PR #34](https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/34) mergeado e [CI pós-merge](https://github.com/altoe2025/MOTOR-DE-FLUXO/actions/runs/34776725007) success. MOT-15–MOT-22 lidas integralmente no Linear Felipe Bisca/MOTOR DE FLUXO, incluindo comentários e status Done. Não foram executadas novamente as suítes nesta sessão documental.

Checkout original em `da271ad`, branch `analise/sensibilidade-custo`, preservado. Seus três arquivos não rastreados não integram a base: `docs/superpowers/plans/2026-09-11-frontend-motor-de-fluxo-design.md`, `motor/cenarios/fluxo_gabriel.yaml`, `tests/test_exportar_player.py`. Documentos desta entrega vivem no worktree `.worktrees/frontend-etapa-2-plano`, branch `codex/frontend-etapa-2-plano`.

## S02 — Fontes e precedência

Inventário completo de documentos frontend rastreados nas pastas pedidas, todos lidos:

1. `docs/superpowers/specs/2026-09-11-frontend-motor-de-fluxo-design.md` — produto e arquitetura geral.
2. `docs/superpowers/plans/2026-09-11-frontend-plano-geral-execucao-modelos.md` — seis etapas e modelos.
3. `docs/superpowers/plans/2026-09-11-frontend-ambiente-e-workflow.md` — ambiente, locks, isolamento e publicação.
4. `docs/superpowers/plans/2026-09-11-frontend-etapa-1-plano-tecnico.md` — contratos e gates herdados.
5. `docs/frontend/etapa-1-operacao.md`.
6. `docs/frontend/mot-16-implementacao.md`.
7. `docs/frontend/mot-18-implementacao.md`.
8. `docs/frontend/mot-20-implementacao.md`.
9. `docs/frontend/mot-21-implementacao.md`.
10. `docs/frontend/mot-22-aceitacao.md`.

Também lidos: `AGENTS.md` integral, `docs/MAPA.md`, topo e todas as entradas MOT-15–MOT-22 do Diário. As dez imagens em `docs/frontend/evidencias/` são evidências históricas de layout, não novos documentos contratuais. Os documentos de fechamento funcional de 2026-09-09 pertencem ao motor e não ao inventário frontend.

Precedência: instruções expressas desta sessão; decisões aqui consolidadas; design geral e separação de etapas; contratos do código na base; registros históricos para evidência. Estado Git/Linear atual prevalece sobre cabeçalhos históricos. Não alterar retroativamente os relatos da Etapa 1.

Conflitos resolvidos: variantes/comparação são Etapa 4, apesar da mensagem antiga em `memoryRepository.ts`; Supabase está provisionado; MOT-21/MOT-22 estão concluídas; a CI não é apenas Python. O antigo documento de ambiente associava preparação à MOT-20: isso não autoriza reutilizar essa issue para a Etapa 2. A proposta intermediária de exportação de recuperação foi rejeitada; a solução aprovada é aviso + nova tentativa, sem exportação. Herança por campo substitui a proposta intermediária de cópia independente.

## S03 — Diagnóstico herdado

CONFIRMED por inspeção: shell/rotas e componentes nativos são reutilizáveis; formatadores usam decimal.js/HALF_UP; API é mesma origem com JWT ES256/JWKS/allowlist; tipos/Ajv derivam de Pydantic; adaptador executa AGREGADO e portão valida conservação após serialização. O envelope 1.0.0 recebe apenas ordens explícitas, `seed=null`, sem grupos/participantes. Identidades numérica e de proveniência são distintas.

CONFIRMED: o repositório existente é em memória; a única persistência efetiva é o rascunho localStorage do nome, com `study_id=stage-1-draft`. PreviewProvider cria IDs novos a cada referência; não é o controlador de estudos completos. Não há IndexedDB, migrations, geração HTTP ou reprecificação canônica pronta. Tipos TypeScript gerados não reproduzem todos os validadores semânticos Python: a nova camada local precisa validar semântica e a API revalidar tudo.

Limites herdados: 1 MiB por request de prévia, 1.000 ordens, 8 MiB de envelope, uma execução por processo, 30 segundos de espera; POST não repete automaticamente. Cancelar espera não cancela o motor. A medição anterior de 11,2 ms/7.152 bytes é somente da referência.

## S04 — Fronteiras

Estudo é agregado raiz lógico. UI → aplicação → domínio local/repositório/cliente HTTP. Nenhuma tela importa IndexedDB. O domínio não importa React ou transporte. Os contratos HTTP são aliases gerados, não cópias manuais de seus campos.

Servidor: resolve e valida autoria efetiva, dimensiona o gerador público, devolve preparação imutável e executa prévia pelo adaptador existente. Não altera `motor/`, usa apenas `Arquetipo`, `gerar_ordens`, `montar_especificacao_pool`, catálogos públicos e APIs analíticas públicas. Nenhuma geração, P0, EDF, economia, custo ou netabilidade é reimplementada em TypeScript. Somas descritivas de volumes informados são permitidas com Decimal; métricas realizadas vêm do servidor.

Mantêm React 19/TS/Vite, Router, TanStack Query, Supabase JS, FastAPI/Pydantic, npm e locks da base. IndexedDB nativo encapsulado; `fake-indexeddb` somente dev para testes. Sem nova biblioteca de estado, Dexie, ECharts, banco remoto ou serviço externo nesta etapa.

## S05 — Autoria

Uma carteira por estudo; até 20 grupos e 100 participantes no total. Participante pode não ter grupo. Cada participante existe individualmente desde a criação; identificar/renomear não duplica. Grupo com quantidade cria participantes e IDs; quantidade exibida é derivada da lista, não uma segunda fonte de verdade. Reduzir quantidade exige selecionar os participantes removidos; remover grupo oferece mover seus participantes para fora do grupo com valores efetivos materializados ou removê-los mediante confirmação. Não remover filhos silenciosamente.

Campos efetivos: perfil sintético (um dos seis), volume mensal esperado BRL, mediana do ticket BRL, fração esperada OUT, prazo fixo ou faixa original do perfil, eFX e finalidade separada OUT/IN. Perfil controla dispersão; dispersão não editável. Campos de visibilidade inertes do motor não viram controles. Um participante sem grupo deve possuir todos os campos próprios para executar.

Herança por campo: `inherit` ou `own`, com ação Usar valor do grupo. Resolver herança no domínio e materializar valores para cada request. Alterar perfil muda a dispersão e, se prazo está em modo perfil, sua faixa; não substitui volume, ticket, direção ou finalidades já definidos. UI informa essa regra e mostra todos os valores antes de executar. Configuração incompleta é persistível, não executável.

Origem informada/sintética contém fonte e instante UTC. Derivado contém regra versionada e referências aos campos/seed/perfil que o produziram. Derivado não é uma terceira declaração de certeza: a origem das premissas continua visível. DADO_OBSERVADO não é habilitado. Proveniência local usa IDs/campos estáveis; JSON Pointers posicionais são construídos somente na fronteira HTTP, depois de ordenar ordens.

IDs novos são UUIDs; nomes de 1–120 caracteres para estudo/grupo/participante executável, permitindo vazio em rascunho; nomes renderizados como texto. IDs não dependem de nome, posição, horário ou valores. Autoria usa proprietário da sessão, sem e-mail. Timestamps UTC auxiliam apresentação; revisão monotônica inteira controla concorrência.

## S06 — Geração e tempo

Dimensionalização v1: em Decimal com precisão 50, `mean = median * exp(sigma*sigma/2)`, `cadence = monthly_volume / mean`. Mensal significa unidade de 30 dias, como o gerador atual. Cadence é arredondada HALF_UP a 12 casas, precisa continuar positiva/finita; só então é convertida a float no argumento público de Arquetipo. Mediana continua Decimal. Desvio por arredondamento de ordens a centavos é declarado, não compensado. Ninguém reescala ordens depois do sorteio. Falha de domínio do gerador, inclusive ordem arredondada a zero, retorna erro sem descartar/repetir sorteio.

Direção é Bernoulli por ordem; mesma distribuição de valores em ambas as direções torna p_out a fração monetária esperada, não a realização garantida. Prazo personalizado P gera min=max=P; modo perfil preserva limites versionados. Seeds são inteiros textuais decimais de 0 a 2^63−1 no armazenamento/HTTP. Cada participante guarda uma seed independente e estável. Outra realização altera todas as seeds por SHA-256 de `dimensionamento-v1|seed-anterior|numero-repeticao`, primeiros 8 bytes big-endian módulo 2^63. Número da repetição começa em 1, aumenta uma vez por ação, nunca em retry.

Ordenação usa comparação ordinal de IDs; cliente_id é UUID do participante. Arquetipo.nome usa chave técnica do perfil, nunca nome editável. Remover/adicionar outro participante não altera sua seed nem seus parâmetros. Duplicação copia seeds, mas troca IDs: não prometer resultado bit a bit idêntico porque IDs desempatem EDF.

Novos estudos: NATURAL, 0 dias de aquecimento, 30 de medição, janela 7. Editáveis: aquecimento 0–365, medição 1–365, soma até 730; janela 1–730; prazo fixo 0–365. Gerar ordens em [0,A+M); `horizonte_dias=A+M` no DTO legado de entrada atende sua validação. `preparar_execucao_temporal` determina o horizonte real de liquidação, até dia 1.094, sem confundir essa duração com período medido. Mostram-se números do agregado medido. Não apresentar volume de aquecimento como volume do período. O cenário de referência LEGADO continua como teste de regressão, não convertido em exemplo novo.

Volume mensal e mediana: texto decimal >0 até 10^12, no máximo 6 casas; mediana mínima 0,01. Fração OUT de 0 a 1 até 12 casas. eFX booleano estrito; finalidades exatas sem espaço externo de 1–128 caracteres, sem validação jurídica inventada. Custos mantêm todos os limites CustoEntrada da base. A configuração sem participantes pode executar e produzir a semântica canônica vazia; campos ausentes não equivalem a zero.

## S07 — Exemplos e preparação HTTP

Mapeamento exato: equilibrado → Composição diversificada; retail_pesado → Muitas operações frequentes de menor valor; corporativo_pesado → Empresas de maior volume; psp_dominante → Recebimentos concentrados em plataformas; outbound_extremo → Pagamentos ao exterior predominantes.

Catálogo autenticado fornece perfis, pesos, custos `PARAMETROS_VARREDURA`, origem técnica e versão. Sem empresa real, contexto do vault ou alegação de calibração. Templates são gerados no servidor com `montar_especificacao_pool(mix,12,1)`; cliente instancia UUIDs novos e retém seeds retornadas. Volume inicial por participante é `cadencia_original * mediana * exp(sigma²/2)`, HALF_UP a 6 casas. Isso preserva dimensões esperadas, não promete copiar exatamente uma antiga rodada de varredura após arredondamento. Templates não executam ordens.

POST preparação devolve ordens, autoria efetiva, versão do gerador/build, fingerprints e composição realizada por participante e total (quantidade, volume OUT/IN da coorte medida, fração OUT nula se volume zero), frequência derivada e volume esperado do período. Não devolve economia/custos inventados. Preparação não guarda dados no servidor. Reuso de ordens exige mesmo conteúdo gerativo e mesmo build conhecido. Custos, janela e fontes não afetam sorteio; período, perfil/dispersão, participantes, valores, direção, prazo, finalidades, eFX e seeds afetam.

Envelope Preview 1.0.0 continua intacto: o cliente constrói PreviaRequest a partir das ordens preparadas, custos/período atuais e proveniência projetada. A preparação associada registra a autoria do sorteio fora do manifesto legado; `seed=null` significa que o endpoint de prévia recebeu ordens explícitas. Não afirmar que o manifesto vazio sozinho reproduz a geração. A nova preparação contém proveniência derivada completa; a projeção de cada origem de ordem para a API 1.0.0 usa PADRAO_SINTETICO e fonte técnica `Geração sintética dimensionamento-v1; consultar preparação associada`. Custos e período mantêm suas próprias origens informadas/sintéticas. Mudança somente de origem cria nova evidência de preparação pela mesma seed, preservando ordens determinísticas; nunca altera o envelope anterior em memória ou no storage. Fontes de ordens referem todos os insumos na preparação, não só a mensagem abreviada.

## S08 — Identidade e estado

Três identidades independentes: revisão de gravação; conteúdo gerativo; conteúdo analítico/evidencial. Cenário tem UUID estável e revisão semântica, incrementada apenas ao mudar conteúdo efetivo relevante. Autosave de nome não altera revisão semântica. Hash servidor antigo permanece inalterado; hash local não recebe o nome execution_fingerprint.

Comparação local normaliza decimais sem Number, ordena entidades por ID e regras IOF por finalidade/direção, ignora nomes/posição/timestamps administrativos. Evidência inclui fontes e instantes das origens. Nunca compara arrays posicionais de proveniência entre listas reordenadas. Configuração inválida desatualiza com motivo ENTRADA_INCOMPLETA. Igualdade de conteúdo anterior pode restabelecer validade, ainda que a revisão tenha aumentado.

Validade: AUSENTE, ATUAL ou DESATUALIZADO, motivos ENTRADAS_ALTERADAS, PROVENIENCIA_ALTERADA, ENTRADA_INCOMPLETA, VERSAO_ALTERADA. Tentativa: NENHUMA, PREPARANDO, EXECUTANDO ou FALHA. Estado de persistência separado: SALVO, PENDENTE, SALVANDO, CONFLITO, FALHA. Histórico selecionado não é confundido com o resultado da configuração vigente.

Consultar capabilities autenticadas ao entrar e antes de executar fornece build/versionamento. Sem rede, resultado compatível continua identificado como atual para suas entradas e versão registrada, com versão do servidor não verificada. Build diferente desatualiza. Payload ou versão HTTP incompatível é recusado, não migrado silenciosamente. Envelopes antigos não são reescritos; formato local novo pode envolver envelope suportado antigo. Preview e presentation permanecem 1.0.0; o leitor de resultado do motor usa schema 2.0.0 nesta etapa.

Aceitar resposta exige mesma sessão (epoch), conta, request, estudo, cenário e revisão enviada; comparar input_snapshot com o request normalizado. Durante edição, aceitar como histórico da configuração enviada, sem marcar atual. Durante troca de conta/sessão, descartar resposta. Snapshot não desaparece por refetch em foco.

## S09 — IndexedDB, autosave e recuperação

Banco por projeto e owner, nome `motor-fluxo:studies:v1:<project-ref>:<sub>`. Versão estrutural 1, documento estudo 2.0.0. project-ref vem da URL Supabase configurada e validada, nunca de campo do estudo. Repositório vinculado ao escopo da sessão; valida também proprietário armazenado. Conexão fecha em logout/versionchange. Sem criptografia nova ou gestão de senha.

Autosave 500 ms após última edição, máximo 2 s de edição contínua; fila serial por estudo com coalescência da edição mais recente. Rascunhos preservam inclusive texto decimal parcialmente digitado. Flush explícito antes de executar, trocar estudo ou logout voluntário. Falha nesse flush oferece continuar editando ou descartar alterações pendentes; sair não é apresentado como salvamento. Expiração involuntária oculta UI e mantém rascunho pendente em memória privada por conta até retorno da mesma conta; outro login não o recebe. Pode tentar concluir gravação já preparada no escopo antigo, nunca gravar com a nova conta.

Transações readwrite com durability strict quando suportada; oncomplete é confirmação. Request success não basta. Validar e serializar antes de abrir transação; dentro dela somente leituras e writes IndexedDB, sem fetch/hash assíncrono/timers. CAS verifica revisão e torna operação inteira atômica. IDs de operação permitem reconhecer commit que concluiu antes de F5/perda de confirmação. Se update/retry já gravou mesmo operation_id, retornar sucesso sem duplicação.

Avisos entre abas contêm apenas estudo/revisão/operação; não tokens ou conteúdo financeiro. Aba limpa relê ao aviso/foco; aba suja compara revisão e pausa se divergente. BroadcastChannel é otimização, CAS continua protegendo sem ele. versionchange fecha conexão; blocked após 5 s mostra fechar outras abas e tentar novamente; não remove banco. Sem locks de editor ou merge automático.

Execução reserva tentativa por CAS antes de HTTP, impedindo duplicidade entre abas. Tentativa em outra aba bloqueia novo disparo; após 30 s oferece encerrar espera local e nova tentativa explícita, sem prometer cancelamento do servidor. Novo request substitui tentativa atomicamente e impede aceite da resposta antiga. Recarga da aba originadora identifica tentativa interrompida, sem POST automático. Mesmo estudo pode ser editado durante execução; persistência do resultado anexa ao estado mais recente sem sobrescrever autoria e verifica attempt_id e sessão.

Guardar resultado usa transação com registro imutável, referência no estudo e quota. Erro conserva resposta em memória com Resultado ainda não salvo; Tentar salvar repete somente gravação. Resultado acima de limite não é truncado. Não iniciar nova execução enquanto houver resposta não salva do estudo, evitando substituí-la em memória.

## S10 — Migrations e corrupção

Upgrade estrutural cria stores/índices, não converte todos os estudos. Migração por registro valida origem, converte em cópia, valida destino e conserva original com identificador/digest. Backup, destino e marcador de migração são gravados juntos. Falha deixa origem intacta. Versão futura abre como incompatível, sem downgrade.

Entradas suportadas: rascunho localStorage version 1 da Etapa 1 e StudyDocument 1.0.0 válido se encontrado no repositório. Não há importação de arquivo. Rascunho sem carteira vira autoria vazia incompleta; identidade stage-1-draft é substituída por UUID. Mapeamento do original no marcador impede duplicar em duas abas/reabertura. Original localStorage permanece até exclusão explícita do estudo migrado; marcador impede ressuscitar o rascunho após excluir. Não há escrita simultânea que apague localStorage antes da confirmação IndexedDB.

StudyDocument 1.0.0 técnico não contém autoria reconstituível: migrar como LEGACY_EXPLICIT em leitura, preservar base e envelopes válidos; não inventar participantes. Usuário pode criar novo estudo pelos exemplos. Resultados precisam apontar ao mesmo estudo/cenário e ter request válido; incompatíveis preservados no original, não exibidos como válidos. Variantes não vazias ou replay selecionado incompatível tornam migração recusada, preservada para leitura técnica, sem habilitar Etapa 4/5.

Documento inválido/digest divergente retorna item indisponível na lista, sem bloquear outros. Não se apaga/sobrescreve automaticamente. Recuperação é mensagem + tentar novamente + trabalhar em outro estudo. Sem exportação, importação, assistente técnico, backup remoto ou promessa de reparar corrupção. Backups locais de migração contam na quota; remover definitivamente o estudo remove seus backups após confirmação.

## S11 — Limites, retenção e operações

30 estudos/conta incluindo lixeira; 20 grupos/estudo; 100 participantes; 10 resultados/estudo; estudo serializado até 1.048.576 bytes; preparação até 2.097.152 bytes; registro completo da execução até 12.582.912 bytes; dados lógicos contabilizados por conta até 157.286.400 bytes. Contabilizar JSON UTF-8 de estudos/preparações/execuções/originais e overhead lógico dos registros; a quota do browser pode ser inferior. Não confundir contagem lógica com espaço físico garantido.

Preparação e execução compartilham o único slot de capacidade; body até 1 MiB, resposta preparação até 2 MiB, prévia até 8 MiB. Antes de gerar, soma das frequências efetivas * (A+M)/30 <=500. Conferir saída <=1.000 ordens e cada limite do DTO. Não truncar, reamostrar ou reduzir horizonte. `GERACAO_EXCEDE_LIMITE` informa reduzir quantidade/período/volume ou aumentar ticket. Limites são operacionais, não regras de negócio.

Listar estudos não carrega envelopes. Carregar só estudo ativo/resultado selecionado; retenção remove preparação não referenciada apenas na mesma transação de remoção explícita do resultado que a tornou órfã. A preparação corrente do estudo continua preservada. Últimos snapshots de geração não associados a resultado são substituíveis como cache, desde que não sejam usados por tentativa ativa. Não manter histórico ilimitado de edições.

Novo estudo/duplicação é bloqueado no 31º; 11ª execução é bloqueada antes de HTTP. Lixeira sem limpeza automática; excluir permanentemente pede confirmação e remove agregado, resultados e backups. Remover resultado pede confirmação e não altera autoria. Renomear não invalida. Duplicar copia autoria/proveniência/herança/seeds, gera novos IDs e remapeia relações, sem resultados nem tentativa ativa. Salvar conflito como outro estudo segue a mesma regra.

## S12 — UI e acessibilidade

Seletor no cabeçalho: lista, criar vazio/exemplo, renomear, duplicar, lixeira. Carteira e Premissas são editáveis livremente. Campos com rótulo, unidade e proveniência; números incompletos preservados. Executar valida, foca resumo e permite ir ao primeiro campo inválido; mensagens por campo. Nenhum cálculo financeiro em componentes. Diagnóstico apresenta composição esperada/realizada e resumo canônico de uma execução, com período e limitações; nada de percentis/robustez ou benefício individual.

Histórico em leitura dentro de Diagnóstico; cabeçalho identifica execução/data/entradas. Campos herdados mostram Do grupo/Personalizado. Mudança no grupo informa alcance e não destrói overrides. Rota Comparar anuncia Recurso da próxima etapa, sem convite a criar variantes inexistentes; Replay igualmente indisponível. Rotas profundas permanecem na allowlist do FastAPI.

Desktop 1280×800 e 1440×900, zoom navegador real de 200% e inspeção manual, não só CSS zoom. Teclado integral, foco visível/restaurado ao fechar diálogo, Escape cancela, labels/aria-describedby, aria-busy e role=status para progresso/salvamento; role=alert para erro acionável, não anúncio a cada tecla. Contraste normal >=4,5:1 e controles/foco >=3:1. Conteúdo alcançável sem controles cortados. Lista paginada 20 participantes por página, mantém edição no controlador ao mudar página. Movimento reduzido respeitado. Sem layout móvel completo.

## S13 — Falhas e segurança proporcionais

Falha local: preservar memória, avisar Não foi possível salvar; não feche esta aba, Tentar novamente. Conflito: opções já aprovadas. Corrompido: não abrir nem apagar. Timeout: espera encerrada, motor pode continuar. 401: expirar; 403: negar cálculo sem apagar estudo; 429: ocupado e nova tentativa explícita; 503: serviço/autenticação indisponível; 422: campos indicados; JSON/versão inválida: rejeitar antes de cache. Nenhum POST repetido automaticamente, inclusive preparação.

Estudos ficam no navegador e na conta; sem sincronização entre computadores. Sessão válida + app carregada permite ler/editar/salvar sem servidor; nova geração/análise exige rede. Catálogo já validado pode continuar em memória, mas criar exemplo sem catálogo disponível mostra indisponibilidade. Ao expirar, bloqueia acesso até autenticação da mesma conta; não cria desbloqueio local. Sem service worker/offline boot. Limpeza do perfil e storage recusado podem perder dados: avisar sem fluxo adicional.

Credenciais somente configuração ignorada/SDK; publishable key real somente em configuração local ignorada, não documentos/fixtures. Sem nova criptografia, PIN, administração de usuários ou checklist de segurança na UI. Logs sem corpo/nomes financeiros; texto escapado por React. Canal entre abas sem dados financeiros; owner/projeto verificados no repositório. Epoch de sessão impede resposta antiga aplicada ao retornar A→B→A.

## S14 — Testes, CI e modelos

Unitários de domínio/canonicalização, contrato de repositório executado em memória e fake-indexeddb, integração Python geração/DTO/API/motor, Chromium real IndexedDB e reabertura em perfil persistente de teste. Falhas de quota injetadas são testes controlados, não prova de quota física. Abort de transação testa atomicidade; fechamento real do contexto testa reabertura, sem alegar simulação de queda elétrica. Auth real no gate final com duas contas autorizadas, por ambiente protegido ou login humano; sem pedir tokens/senhas na conversa.

CI preserva job `pytest`, locks, geração sem diff, Python normal/-O, Ruff, mypy servidor, wheel, web tipos/lint/unit/build, scanner e navegador. Novo arquivo E2E exige ampliar testMatch: a configuração antiga só seleciona foundation.spec.ts. Retirar shutdown global do arquivo foundation: encerramento deve pertencer ao launcher/processo gerenciado do Playwright, após todos os arquivos. Auth controlado só em build e2e; produção não inclui bypass.

Modelos conforme plano geral: Terra/Medium em domínio/UI/persistência com contratos fechados; Sol/Medium em geração, integração, identidade, concorrência e aceitação. Astra para contratos/decisões materialmente ampliadas descobertas nesta etapa e auditoria final delimitada; não revisão a cada formulário. Luna somente ajustes mecânicos já definidos, opcional. Modelo não é responsável humano e não autoriza delegação. Sem subagentes nesta sessão e na execução sem autorização expressa.

Aceite: um estudo percorre todo fluxo, preserva envelopes exatamente, distingue validade/falha, mantém isolamento/CAS, cinco exemplos funcionam na configuração padrão, gates reais e layouts passam. Medir os cinco exemplos e fronteiras válidas (geração com 500 esperadas e prévia explícita com fixture de 1.000 ordens, sem reamostrar geração para forçar contagem) em ambiente anotado: percurso HTTP preparação+prévia p95 <=5 s em 20 repetições por caso; sem garantia de rede internet. IndexedDB salvar documento de 1 MiB p95 <=300 ms e abrir resultado de 12 MiB <=1 s em 20 medições Chromium local; orçamento deve passar antes da aceitação, não ser alterado para ocultar falha. Configuração que ultrapasse limite é rejeitada, não otimizada por mudança em motor.

## S15 — Não objetivos e handoff

Sem variantes executáveis, comparação/marginal, diagnóstico robusto, executor assíncrono persistente, replay, chat, PDF, publicação de site, importação/exportação ou dados observados. Nenhuma alteração planejada em motor/. Reprecificação dedicada adiada explicitamente. Etapa 3 recebe autoria/ordens reproduzíveis, histórico imutável, estados, comandos e limites medidos; não recebe promessa de suporte a carteiras maiores ou alteração de regras.

Publicação exige Diário no mesmo commit e identificador MOT real. Até aprovação final do plano não cadastrar missões. Não inventar MOT-XX em commit executável. Plano será aprovado antes de cadastro; IDs serão vinculados às tarefas sem reabrir decisões técnicas.

## S16 — Revisão crítica e fontes técnicas

Auditoria documental independente de perspectiva, realizada pelo mesmo agente (sem subagentes), comparou S01–S15 com pedido e dez documentos-base. Correções incorporadas: limite do resumo não substitui schemas; backups/resultado não salvo entram na quota; separar proveniência derivada da projeção HTTP; não fingir seed no manifesto legado; migração de rascunho não inventa autoria; CAS de anexação não sobrescreve edição; epoch cobre A→B→A; testMatch/shutdown antigos não suportam novos E2E; ausência de rede não prova versão corrente do servidor; cenários sintéticos dimensionados não prometem equivalência bit a bit com varredura histórica.

Persistem riscos aceitos: quota/limpeza do navegador, variação sintética, limites operacionais a demonstrar e dependência do gate Auth real. Não há afirmação de código implementado/testado nesta especificação. A revisão final do plano contém a matriz requisito→tarefa e a decisão humana de aprovação final.

Referência técnica: [Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB/) define transações, abort, complete, blocked e versionchange; durability é uma indicação ao navegador, não garantia contra toda perda física. A política de retenção e CAS deste documento é decisão do projeto. [fake-indexeddb](https://www.npmjs.com/package/fake-indexeddb) é implementação em memória para testes; será complementada pelo navegador real.
