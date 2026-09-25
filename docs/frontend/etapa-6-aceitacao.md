# Etapa 6 — aceite local e limites de publicação (MOT-99)

**Data:** 2026-09-24. **Base histórica D6:** `723461c89bb9ec721ff45695081f3cfd74dcb834` + `aa9ad9f`. **Revisão finalidade opcional:** Tasks 1–4 integradas em `e9effcf`, branch `codex/frontend-etapa-6-planejamento`, sem push, PR, merge ou deploy.

**OBSERVED_FLOW=PASS local. LOCAL_ACCEPTANCE=FAIL. PUBLISHED_ACCEPTANCE=NOT_RUN.** O XLSX sem finalidade chega a Diagnóstico, Replay, Painel A e PDF com “IOF padrão por direção”. O catálogo de produção permanece `NAO_CONFIGURADO`, agora informativo: o cenário usa premissas persistidas e fallback quando não há par exato de finalidade e direção. Visual Linux/CI e imagem Docker continuam sem aceite neste host, como gates separados. Nenhum resultado local autoriza marcar MOT-99 Done.

## Matriz transversal

| Requisito | Evidência local | Estado |
|---|---|---|
| XLSX → Caso → Empresa → Perfil → Estudo | `stage6-acceptance.spec.ts` e `import-observed-case.spec.ts`; dados brutos ausentes de requests | PASS |
| Estudo comum excluído → lixeira → restaurar → reabrir | `StudyList` mantém lista principal limpa, botão de lixeira operável por teclado e E2E preserva ID e origem | PASS local |
| Estudo observado → diagnóstico, Replay, Painel A, PDF | XLSX de sete headers, finalidade `null`/`NOT_COLLECTED`, IOF padrão por direção, mesma repetição, métricas e fingerprint; PDF A4 de sete páginas inspecionado | PASS local |
| Cinco mixes demonstrativos | cinco cenários e envelopes atuais, origem `synthetic=true`, fingerprint e repetição conferidos | PASS |
| Valores entre Diagnóstico, Replay, chat, apresentação e PDF | request do chat confrontado com seleção, métricas, evidências e fingerprint do `CommunicationDocumentV1` esperado; valores conferidos no browser e PDF de nove páginas | PASS local |
| Reload e deep links | rota de apresentação com seleção explícita, execução em IndexedDB e fragmento de seção sobrevivem à recarga | PASS local |
| Falhas e isolamento | XLSX inválido; storage indisponível; job remoto expirado com execução local; offline após carregar; chat desabilitado, timeout, citação inválida e transporte indisponível; troca A/B | PASS local |
| Acessibilidade, orçamento e visual Windows | gates D3 no Playwright local completo e documento `etapa-6-acessibilidade-desempenho.md` | PASS local medido na fixture demonstrativa |
| Visual Linux/CI | sete baselines `*-local-linux.png` ausentes; revisão no runner Linux | NOT_RUN/BLOCKED |
| Imagem Docker + smoke | Docker CLI/daemon indisponível neste host; testes estruturais e Blueprint não executam a imagem | NOT_RUN/BLOCKED |
| HTTPS Render, Supabase real, provider real, convite Amanda | sem URL, deploy ou autorização externa nesta tarefa | NOT_RUN |

O E2E controlado usa FastAPI local, IndexedDB real, Chromium e provider fake; não é teste de Supabase/OpenAI/Render reais. A frase de recusa fora de escopo é verificada com o modo `out` do fake, além dos testes server-side da MOT-95. O teste de job expirado intercepta a API como 410 e comprova que o diagnóstico persistido é lido sem nova consulta ao job. O offline é aplicado **após** carregar a aplicação; não demonstra boot offline. A falha de transporte representa indisponibilidade temporária, não mede um cold start real do Render.

Uma tentativa de executar o script opt-in sem variáveis, apenas para provar seu
bloqueio inicial, foi **rejeitada pela revisão automática de permissões**: o
comando poderia autenticar e criar dados no Render caso houvesse credenciais no
ambiente. A execução foi interrompida antes de iniciar processo ou contato
externo. A proteção do runner foi inspecionada estaticamente; seu comportamento
em execução permanece NOT_RUN até autorização própria.

## Ambiente e fixtures

- Windows/Chromium `153.0.8010.12`, Node `24.19.0`, npm `11.17.0`, Python `3.12.14`, PyMuPDF `1.28.2`; a CI Linux ainda não foi observada.
- `web/src/importer/__fixtures__/valid-minimal.xlsx`: SHA-256 `4af02e94137748e0d6e6de3c5a937fc85f5a70d73e3f4cd0f27f9627d7f0ec57`. O teste de aceite reescreve o OOXML em memória com sete headers e duas ordens fictícias OUT/IN de 100 BRL, sem header nem células de finalidade.
- `web/src/importer/__fixtures__/formula.xlsx`: SHA-256 `c9594a66fc8ceaa66d272bd05eb511a7165e11a4f757535557e525f5a5d8f354`, usada para recusa local.
- Pacote `web/src/demo/generated/demo-study.v1.json`: produzido pela receita versionada do projeto, sem resultados da grade histórica. O limite de Replay permanece o medido na Etapa 5, 98 ordens × 365 dias, e o importador de 1.000 linhas não amplia esse limite.

## Gate e falhas conhecidas

A revisão da finalidade opcional passou o gate
`npm --prefix web run test:e2e -- --grep "Etapa 6|Caso observado|finalidade opcional"`
com **4/4**, e os três arquivos E2E afetados completos passaram **17/17**.
Ajuda HTTP **9/9**, ajuda/Diagnóstico web **12/12**, typecheck, lint, Ruff focado e
diff-check passaram. O PDF observado percorre sete páginas; o demonstrativo mantém nove.
A prova usa dados fictícios no fluxo observado, sem validar conteúdo regulatório.
O bloqueio por catálogo das rodadas históricas abaixo está superado.

O roteiro de reprodução está em `etapa-6-operacao.md`, e o índice dos artefatos está em `evidencias/etapa-6/README.md`. O teste opt-in `stage6-render-smoke.spec.ts` foi criado e **não executado**; o guard puro compartilhado com o runner tem testes locais para configuração inválida, 503, timeout, provider ausente, citação forjada, fingerprint e mensagem não terminal. Só um smoke HTTPS posterior, com autorização e credenciais efêmeras, poderá mudar o status publicado.

Na primeira rodada de baseline deste worktree, 11/13 E2Es focados passaram. O caso preexistente de CAS entre duas abas excedeu o timeout de 30 s sob carga; o teste de PDF falhou por um Python incompleto herdado do checkout anterior. Um ambiente Python isolado com o lock do repo foi preparado depois. O run completo subsequente passou **62/62 E2Es locais**, inclusive ambos os casos. Python normal e `-O` passaram **1.174/1.174** cada, com três skips; web unit passou **1.014/1.014**. Detalhes e tentativas intermediárias estão em `docs/testing.md`. Essas falhas iniciais não são apagadas da evidência.
