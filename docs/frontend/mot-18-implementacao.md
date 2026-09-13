# MOT-18 — FastAPI, autenticação e mesma origem

## Escopo entregue

A factory `servidor.app:create_app` expõe a fronteira HTTP real sem alterar o pacote
`motor`. O health é público. Sessão, exemplo de referência e execução de prévia
exigem Bearer válido antes de ler ou processar o corpo. A prévia usa o adaptador e o
portão de publicação entregues pela MOT-17.

| Método e rota | Acesso | Comportamento |
|---|---|---|
| `GET /api/v1/health` | público | confirma somente `{"status":"ok"}` |
| `GET /api/v1/session` | privado | devolve o UUID autorizado |
| `GET /api/v1/examples/reference` | privado | devolve a entrada da fixture real |
| `POST /api/v1/previas` | privado | valida, executa e publica o envelope canônico |

Erros usam o envelope uniforme `error.code`, `error.message`, `error.request_id` e
`error.fields`. Tokens, corpo, query e stack trace não aparecem na resposta nem no
log sanitizado. Respostas privadas recebem `Cache-Control: no-store`.

## Configuração

Copie `.env.example` para `.env` somente no ambiente local e substitua os
placeholders. O arquivo real permanece ignorado pelo Git.

- `APP_ENV`: `development`, `test` ou `production`;
- `SUPABASE_URL`: URL HTTPS do projeto;
- `SUPABASE_JWT_ISSUER`: exatamente `SUPABASE_URL/auth/v1`;
- `SUPABASE_JWT_AUDIENCE`: exatamente `authenticated`;
- `SUPABASE_ALLOWED_USER_IDS`: UUIDs separados por vírgula;
- `MOTOR_BUILD_SHA`: SHA hexadecimal de 40 posições do código empacotado;
- `WEB_DIST_DIR`: caminho do build React, obrigatório em produção.

Não existe flag para desabilitar autenticação. Testes substituem o verificador
somente pelo argumento explícito da factory.

## Autenticação

`JWKSTokenVerifier` deriva o endpoint JWKS do issuer e aceita somente ES256. Ele
rejeita algoritmo diferente, `alg=none`, `jku`, `x5u`, emissor ou audience diferente,
token expirado, `iat` mais de 30 segundos no futuro, `nbf` futuro, role diferente de
`authenticated`, usuário anônimo, `sub` inválido e UUID fora da allowlist.

O JWKS fica em memória por cinco minutos e é obtido com timeout de cinco segundos.
Um `kid` desconhecido causa no máximo uma atualização concorrente por janela. Uma
chave expirada nunca é reutilizada quando o serviço está indisponível; nesse caso a
API responde `503 AUTH_INDISPONIVEL`.

O logout no navegador encerra a sessão local. Um access token já emitido continua
criptograficamente válido até expirar. Para revogação emergencial nesta etapa,
remova o UUID da allowlist e reinicie o único processo do servidor.

## Limites e concorrência

- corpo: 1 MiB, conferido por `Content-Length` e durante leitura chunked;
- ordens: 1.000, aplicado pelo contrato Pydantic;
- concorrência: uma prévia; a segunda recebe `429 CAPACIDADE_OCUPADA` e
  `Retry-After: 1`, sem fila;
- resposta: 8 MiB; excesso recebe `413 RESULTADO_EXCEDE_LIMITE`, sem truncamento;
- execução analítica: threadpool, preservando health e navegação durante o cálculo;
- processo: um worker, para manter o limite de concorrência global desta implantação.

O middleware registra método, pathname sem query, status, duração e `request_id`.
O access log do Uvicorn fica desativado.

## Mesma origem e estáticos

O proxy de desenvolvimento do Vite encaminha `/api` para
`http://127.0.0.1:8000`. O cliente usa caminhos relativos e a aplicação não instala
CORS curinga.

Em produção, FastAPI serve `index.html` apenas para as rotas conhecidas da SPA.
Assets com hash recebem cache imutável; `index.html` e assets sem hash recebem
`no-cache`. API, asset ausente, rota desconhecida, traversal e qualquer caminho
resolvido para fora de `WEB_DIST_DIR` recebem JSON 404.

## Execução e verificação

```powershell
python -m servidor
pytest -q
python -O -m pytest -q
python -m ruff check servidor tests/web_api
python -m mypy --follow-imports=skip servidor
cd web
npm run test:unit
npm run typecheck
```

A verificação local passou com 627 testes Python normais e sob `-O`, Ruff, mypy, 15 testes
Vitest e typecheck. A wheel foi construída, instalada em diretório temporário e
importou `servidor` dessa instalação. OpenAPI, tipos, schemas e validadores foram
regenerados duas vezes com hashes SHA-256 idênticos.

O projeto Supabase real ainda não existe. A MOT-18 valida o comportamento com chaves
ES256 temporárias locais; convite, callback e aceitação contra o serviço real são
gates próprios de MOT-20/T5 e MOT-22/T7.
