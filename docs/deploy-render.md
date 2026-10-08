# Piloto Render free — configuração declarativa (MOT-98)

Este guia prepara uma publicação futura. Criar/sincronizar o Blueprint, conectar
repositório, configurar segredos/callbacks, convidar usuários e executar deploy
exigem autorização separada. Esta tarefa não publica o produto nem chama OpenAI.
O aceite publicado permanece **NOT_RUN** e pertence à MOT-99.

## Imagem única

O Dockerfile compila Vite com Node 24 e instala o pacote Python com Python 3.12.
FastAPI serve SPA e `/api` na mesma origem. Um único worker Uvicorn preserva os
limites e jobs em memória; o usuário do processo não é root. Estudos ficam no
IndexedDB do navegador; jobs transitórios podem expirar ao reiniciar. Não há disco,
database ou worker externo. O smoke exige filesystem somente leitura.

`requirements/web.lock` fixa as dependências de produção com hashes, alinhadas ao
lock de desenvolvimento existente; `requirements/build.lock` fixa apenas o
backend de construção do pacote. Ferramentas de teste não entram no runtime.
As tags Node/Python fixam versões maiores/menores, não digest; atualizações dessas
imagens base exigem repetir o build e smoke. Não se promete imagem bit a bit igual.

Para resolver novamente o lock de produção, com Python 3.12 e uv disponíveis:

```powershell
uv pip compile pyproject.toml --extra web --constraint requirements/web-dev.lock --python-version 3.12 --generate-hashes --output-file requirements/web.lock
```

O backend de build é resolvido separadamente a partir de
`build-system.requires` em `pyproject.toml`; mantenha versão e hashes no lock.
Valide sempre por instalação Linux no Docker. Não copie um ambiente Windows.

## Configuração

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` | Origem HTTPS pública do projeto Supabase, sem barra final; build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave **publishable** pública; build; nunca service role |
| `VITE_MOTOR_BUILD_SHA` | SHA de 40 caracteres do contrato do motor; build |
| `SUPABASE_URL` | Mesma origem pública utilizada pelo frontend; runtime |
| `SUPABASE_JWT_ISSUER` | `SUPABASE_URL` seguida de `/auth/v1` |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` |
| `SUPABASE_ALLOWED_USER_IDS` | UUIDs dos usuários convidados permitidos, separados por vírgula |
| `MOTOR_BUILD_SHA` | Igual a `VITE_MOTOR_BUILD_SHA`; runtime |
| `OPENAI_API_KEY` | Segredo somente backend; obrigatório quando chat habilitado |
| `OPENAI_CHAT_MODEL` | Modelo explicitamente escolhido pelo responsável; sem default implícito |
| `OPENAI_CHAT_TIMEOUT_SECONDS` | Opcional; default C3/C4: 30 segundos, positivo finito |
| `OPENAI_CHAT_MAX_OUTPUT_TOKENS` | Opcional; default C3/C4: 2048, intervalo 1–4096 |
| `CHAT_ENABLED` | Blueprint declara `true`; pode ser `false` para operar sem provider |
| `APP_ENV`, `HOST`, `WEB_DIST_DIR` | `production`, `0.0.0.0`, `/app/web/dist` |
| `PORT` | Injetada pelo Render; não sobrescrever no Blueprint |

Sem overrides, o entrypoint local usa `127.0.0.1:8000`; produção usa
`0.0.0.0` e a porta fornecida (8000 se ausente). `HOST` explícito prevalece.
`APP_ENV`, `HOST` e `PORT` do entrypoint vêm do ambiente do processo; exporte-os
no shell local. O carregamento de `.env` por `Settings` ocorre depois, na API.
Copiar `.env.example` local para produção sem rever `HOST`/`PORT` impediria o
acesso externo. Não transporte arquivos `.env` para a imagem.

O SHA do motor não é necessariamente o HEAD documental do frontend: deve coincidir
com o pacote demo compatível. Não altere hashes para contornar incompatibilidade
de dados; regenere o pacote pelo procedimento próprio quando o motor mudar.

O Render disponibiliza variáveis do serviço como build args, mas o Dockerfile
declara **somente os três `VITE_*` públicos**. Segredos não são declarados como
`ARG` ou `ENV`, não entram em comandos de build ou logs. Alterar `VITE_*` exige
rebuild, enquanto alterar variável de runtime exige reiniciar/reimplantar o serviço.
Confira a [documentação Docker do Render](https://render.com/docs/docker).

## Gates locais, sem publicação

Use somente valores sintéticos no teste local:

```powershell
python -m pytest tests/web_api/test_server_entrypoint.py tests/web_api/test_container_contract.py tests/web_api/test_security_headers.py tests/web_api/test_smoke_container.py tests/web_api/test_render_blueprint.py -q
python -m tests.web_api.scan_credentials
npm --prefix web run check:validators
npm --prefix web run build
npm --prefix web run test:csp
docker build --build-arg VITE_SUPABASE_URL=https://example.supabase.co --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test --build-arg VITE_MOTOR_BUILD_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -t motor-de-fluxo:etapa-6 .
python scripts/smoke_container.py --image motor-de-fluxo:etapa-6
git diff --check
```

O smoke cria somente um contêiner temporário identificado pelo script, publica uma
porta efêmera em loopback e desabilita o chat. Verifica health, login, asset com
cache imutável, deep link, 404 seguro, autenticação, headers, usuário e conteúdo
empacotado. Remove apenas seu próprio contêiner, inclusive quando falha. Não é
teste de login real, provider pago, publicação HTTPS ou jornada da apresentação.
Não depende da MOT-96/MOT-97 nem adiciona a rota de apresentação antes delas.

A CSP mantém `script-src 'self'`, sem `unsafe-eval`: os validadores Ajv são
pré-compilados a partir dos schemas existentes e versionados. `npm --prefix web run generate:validators` atualiza os arquivos; `check:validators` detecta drift.
O gerador de API também atualiza os validadores após regenerar os schemas.
`test:csp` abre o bundle em Chromium com os headers produzidos pelo backend,
recusa chamadas externas e exige o login visível sem violações de CSP. Use
`MOT_E2E_PYTHON` para indicar o Python do projeto quando não estiver no PATH.
Os estilos inline continuam permitidos para ECharts/Replay; scripts inline,
frames e conexões do browser à OpenAI permanecem bloqueados.

`render.yaml` passa por teste estrutural offline. Se já houver CLI Render
autenticada, pode-se executar somente sua validação read-only de Blueprint
(versão compatível, consultar `render blueprints validate --help`). Não use
criação ou sincronização como substituto de validação.

## Publicação futura, somente após autorização

1. Reexecutar os gates e registrar commit, hashes públicos, imagem e resultados.
   Selecionar a branch/commit autorizados e o projeto Supabase correto.
2. No Render, criar Blueprint pelo repositório autorizado e conferir exatamente
   **um Web Service free**, sem database, disco, cron, preview ou serviço pago.
   Escolher região antes de criar. `autoDeployTrigger: "off"` impede deploy por
   commit; não impede o primeiro deploy ao criar/sincronizar o serviço.
3. Preencher as entradas `sync: false` no dashboard. Não inserir os valores no
   YAML. Para um serviço já existente, novas entradas `sync: false` precisam ser
   cadastradas manualmente; sincronizar não as preenche. Conferir variáveis
   [na referência do Blueprint](https://render.com/docs/blueprint-spec) e no
   [guia de ambiente](https://render.com/docs/configure-environment-variables).
4. Configurar a URL HTTPS final no Supabase: Site URL e redirects exatos
   `https://SERVICO.onrender.com/auth/callback` e
   `https://SERVICO.onrender.com/auth/definir-senha`, conforme o fluxo existente.
   Não adicionar wildcard aberto. Convidar Amanda pela conta autorizada do
   Supabase e incluir seu UUID em `SUPABASE_ALLOWED_USER_IDS`; o convite sozinho
   não concede acesso ao backend. Não copiar credencial ou token para evidências.
5. Executar o primeiro deploy manual autorizado, observar `/api/v1/health` e
   conferir o login real e deep links. Manter auto deploy desligado.
6. Seguir a MOT-99 para smoke HTTPS, chat sintético autorizado, apresentação,
   impressão e evidências. Somente depois alterar o aceite publicado para PASS.

## Operação e rollback

O plano gratuito pode dormir após inatividade; a próxima visita pode aguardar
cold start. Não configure ping ou keep-alive artificial. Limites e elegibilidade
podem mudar: confira [Render Free](https://render.com/docs/free) antes da criação.
O filesystem é efêmero e não armazena Estudos ou XLSX. Outro navegador/dispositivo
não herda os Estudos locais; reiniciar o serviço encerra jobs em memória.

Logs HTTP omitem query string e payload; chat mantém a sanitização C3/C4.
Nunca habilite access log do Uvicorn nem registre Authorization, pergunta,
resposta ou valores financeiros para investigar um incidente. Correlacione pelo
`X-Request-ID`, status e duração. `/api/v1/health` não chama provedores externos.

Para desativar o chat, definir `CHAT_ENABLED=false` no serviço e efetuar o restart
ou deploy manual autorizado. A autenticação e demais funções permanecem; chave e
modelo deixam de ser obrigatórios. O YAML continua declarando `true`, portanto
uma futura sincronização deve ser revista para não reabilitar o chat sem intenção.

Para rollback, usar o deploy anterior/commit previamente aprovado no Render,
revisar variáveis de runtime e repetir health/login/deep links. Manter frontend e
backend da mesma imagem e os dois SHAs compatíveis. Rollback da imagem não desfaz
automaticamente variáveis do dashboard ou dados no IndexedDB; não apague o banco
local para mascarar incompatibilidade. Registrar deploy ID, commit, horário e
resultado, sem segredos. Cada publicação ou rollback externo exige autorização.


## Diagnóstico: retenção e recuperação

O executor é transitório e isolado por owner. Guarda até 128 jobs terminais e até 64 MiB
somando o JSON UTF-8 dos pedidos originais e dos envelopes finais. Esses bytes
serializados não equivalem ao RSS: objetos Python, trabalhos ativos, processos e
agregação também consomem memória. As repetições completas intermediárias são
liberadas ao concluir, falhar ou cancelar. Sob pressão, os terminais mais antigos e
seus bindings de idempotência são descartados; jobs ativos nunca são expulsos.
As 24 h são TTL máximo, não garantia de disponibilidade sob pressão ou reinício.
O resultado já salvo no histórico local do navegador permanece intacto.

Somente o diagnóstico aceita até 16 MiB de pedido e 32 MiB de resposta. O maior pedido
canônico testado possui 1000 ordens, 100 regras de IOF e fontes de 200 caracteres
Unicode: 9.618.350 bytes de pedido e 9.876.635 de envelope. A cota de 8309 caminhos
acomoda os 5209 obrigatórios e os opcionais de identidade/direção. Campos arbitrários
não têm capacidade ilimitada; excessos continuam recebendo 413. O limite padrão da
prévia e seu endpoint permanecem inalterados. Os consumidores de diagnóstico,
individual e em lote, usam explicitamente o orçamento maior ao construir a entrada.

Se um processo filho morrer, a tentativa afetada termina com
`EXECUTOR_INDISPONIVEL`; o coordenador substitui uma vez a geração quebrada do pool.
Callbacks tardios não substituem o pool saudável e o fechamento não o ressuscita.
A limpeza do pool antigo ocorre fora de seu callback e do lock do coordenador.
Não há reexecução automática da tentativa terminada. Se a criação do pool substituto
falhar, novos pedidos recebem 503 até reiniciar o serviço. Logs técnicos contêm
categoria, nome seguro do tipo de exceção e job ID, sem payload, traceback ou texto
da exceção.

No navegador, 404 reconcilia a reserva como `INTERRUPTED`. Falhas definitivas de
resultado (como 413/422 ou envelope incompatível) criam terminal local `FAILED` e
permitem iniciar outra tentativa. Rede, timeout, 429 e 5xx mantêm uma reserva retomável,
sem repetir POST. O modo de gravação só ao terminar também salva uma reserva quando
uma falha transitória exige retomada; o caminho de sucesso continua a gravação única.
Falha ao salvar continua sendo erro de armazenamento. Diagnósticos históricos cuja
receita original divergia das premissas salvas permanecem legíveis no histórico,
mas exigem recálculo para voltar a ser considerados atuais.
