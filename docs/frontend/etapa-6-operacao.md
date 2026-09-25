# Etapa 6 — operação do piloto e gates de aceite

Este guia descreve a branch local MOT-99, atualizada pela decisão de finalidade opcional de 2026-09-24. O produto ainda não foi publicado. O percurso usa autenticação e chat controlados no teste local; operação de Render, Supabase e OpenAI reais exige a autorização e configuração descritas em `docs/deploy-render.md`.

## Percurso de uso

1. Faça login. Em **Estudos**, o primeiro acesso local instala o **Estudo demonstrativo sintético**. Ele contém cinco composições recalculadas com o motor vigente; os números são sintéticos e não calibrados para uma carteira real.
2. Abra um cenário, o Diagnóstico, a repetição representativa no Replay e **Apresentar esta execução**. O Painel A aceita cenário e execução explícitos na URL; comparação e dia do Replay são opcionais. **Salvar PDF** usa a impressão do navegador e o mesmo documento exibido.
   Para recuperar um Estudo comum excluído, abra **Lixeira de estudos** na lista de Estudos, escolha **Restaurar**, volte à lista e abra o mesmo Estudo. A lixeira é acessível por teclado; exclusão não altera sua identidade ou fonte.
3. Para uma fonte observada, use **Importar**, escolha a Empresa, selecione o XLSX canônico, aceite o contrato de operações explícitas, revise as linhas e confirme o Caso. Depois crie uma versão de Perfil e anexe-a manualmente a um Estudo. O XLSX bruto fica no navegador; Caso, Empresa, Perfil e Estudo persistem no IndexedDB da conta.
4. A coluna `finalidade_codigo` é opcional. Sem ela ou com célula vazia, a ausência permanece `null`, sem inferir classificação regulatória. Execute o Diagnóstico, abra **Abrir Replay · Fronteira Viva**, depois **Apresentar esta execução** e **Salvar PDF**. O Estudo usa suas premissas persistidas: regra específica somente para combinação exata de finalidade e direção; sem ela, **IOF padrão por direção**, indicado no resultado e no documento. Catálogo `NAO_CONFIGURADO`, vazio ou indisponível não bloqueia esse cenário. Os custos continuam sendo premissas de simulação, sem cotação ou calibração comercial implícita.
5. O botão **Perguntar** abre o chat contextual. Antes do envio, a interface informa que pergunta e contexto selecionado serão enviados à OpenAI quando o provider real estiver configurado. Falha, timeout ou chat desabilitado não apagam o Estudo; a tentativa pode ser repetida manualmente.

Estudos, Perfis e conversas ficam no armazenamento local daquele navegador e conta. Outro dispositivo não recebe uma cópia automática. Remover o pacote demonstrativo não deve recriá-lo silenciosamente; **Carregar estudo demonstrativo** restaura-o por ação explícita. Não apague IndexedDB para contornar erro de versão ou de publicação.

## Reprodução local

Use Node 24/npm 11 e Python 3.12 com `requirements/web-dev.lock`. Instale Chromium pelo Playwright. Os testes não usam credenciais reais, não chamam Render e mantêm o chat num provider fake local.

```powershell
npm --prefix web ci
python -m pip install -r requirements/web-dev.lock
python -m pip install --no-deps -e .
npm --prefix web run test:e2e -- stage6-acceptance.spec.ts
npm --prefix web run test:e2e -- --grep "Etapa 6|Caso observado|finalidade opcional"
npm --prefix web run test:e2e -- stage6-chat.spec.ts stage6-demo-communication.spec.ts stage6-presentation.spec.ts
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run test:render-gate
python -m tests.web_api.scan_credentials
```

O teste `stage6-acceptance.spec.ts` percorre a importação real pela interface, cinco cenários demonstrativos, Diagnóstico, Replay, chat, Painel A, deep link/reload e PDF A4 renderizado em páginas. Também injeta falhas locais: XLSX proibido, IndexedDB indisponível, API de job expirada com resultado já salvo, offline após carregar a tela, chat desabilitado, timeout, saída inválida e transporte temporariamente indisponível. As suites da 6A e 6C detalham conflitos, cancelamento, quotas, isolamento e privacidade.

As imagens de referência visual atualmente revisadas são `*-local-win32.png`. O gate Linux exige gerar e revisar sete imagens no runner Linux, sem copiar ou renomear as imagens Windows. O smoke da imagem Docker exige o daemon Docker; ambos estão registrados como pendências em `etapa-6-aceitacao.md`.

## Smoke HTTPS futuro

`web/e2e/stage6-render-smoke.spec.ts` é separado do projeto Playwright local e não roda na CI comum. Depois de uma publicação expressamente autorizada, defina no ambiente protegido `MOT_STAGE6_RENDER_APPROVED=1`, `MOT_STAGE6_RENDER_BASE_URL` com a origem HTTPS `*.onrender.com` (somente raiz, sem path, porta, query ou credenciais na URL), `MOT_STAGE6_RENDER_EMAIL` e `MOT_STAGE6_RENDER_PASSWORD` efêmera e não vazios. Execute `npm --prefix web run test:e2e:render` em máquina com Chromium e Python/PyMuPDF. Runner e spec usam o mesmo guard; configuração inválida falha antes de abrir o browser, sem skip verde. O smoke só aceita POST chat 200, mensagem ASSISTANT terminal SUCCEEDED, fingerprint, classificação IN_SCOPE, citações verificáveis e texto/fontes renderizados. O smoke usa XLSX sintético e uma pergunta sintética; nenhum arquivo real ou segredo deve entrar em logs ou evidências.

Registre commit, deploy ID, horário, duração do primeiro health, screenshots e PDF anonimizado somente após a execução real. Um primeiro acesso lento após inatividade é esperado no plano gratuito; não adicione ping de keep-alive. Se a imagem não responder, verifique saúde, variáveis de runtime e logs sem payload; rollback por deploy/commit autorizado está em `docs/deploy-render.md`. Enquanto não houver URL e autorização, `PUBLISHED_ACCEPTANCE=NOT_RUN`.
