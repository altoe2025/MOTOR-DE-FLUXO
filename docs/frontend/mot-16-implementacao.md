# MOT-16 — contratos, identidade e apresentação

Estado em 2026-09-12: **T1 integrada na `main` pelo PR #27, commit `d2a261b`**. A
implementação foi preparada na branch `codex/mot16-contratos`, baseada em `1aecc57`. O escopo termina antes do
adaptador T2, da autenticação/API funcional T3 e da interface T4.

## Contratos entregues

- `servidor/contracts/`: DTOs Pydantic estritos para a requisição, JSON público do
  motor e `PreviewEnvelope`. Decimais entram e saem do transporte como texto, campos
  extras são recusados e as validações cruzadas cobrem limites, prazo, período,
  unicidade e proveniência.
- `servidor/identity.py`: normalização sem `float`, ordenação canônica de ordens e
  regras de IOF, `execution_fingerprint` separado de `provenance_fingerprint`.
- `servidor/app.py` e `servidor/export_openapi.py`: factory sem settings, rede ou
  segredos. As rotas existem apenas para publicar schema e falham fechadas com 501;
  execução e autenticação pertencem às tarefas seguintes.
- `contracts/openapi.json` e `contracts/fixtures/reference-request.json`: artefatos
  gerados. A requisição usa UUIDs fixos, revisão 1 e valores lidos diretamente de
  `motor/cenarios/exemplo_amanda.yaml`, marcados como `PADRAO_SINTETICO`.
- `web/src/api/`: tipos gerados por `openapi-typescript` e schemas/validadores Ajv
  2020 sem coerção, remoção de campos ou aplicação de defaults. A anotação OpenAPI
  `discriminator` é removida somente do schema runtime porque o Ajv não compila seu
  `mapping`; os ramos `oneOf` permanecem e fazem a validação.
- `web/src/presentation/format.ts`: `decimal.js`, arredondamento `ROUND_HALF_UP`,
  unidades explícitas e separadores pt-BR, inclusive zero negativo e inteiros acima
  do limite seguro de `Number`.
- `web/src/study/`: aliases dos tipos de transporte gerados e repositório em memória
  que valida nome, IDs, revisão base, escopo sem variantes e isolamento em
  `save/get/list/remove` por `owner_sub`.

## Dependências e compatibilidade

O extra Python `web` fixa FastAPI, Pydantic, pydantic-settings, HTTPX, Uvicorn e
`PyJWT[crypto]`; `web-dev` fixa pip-tools, Ruff, mypy e os stubs usados. O arquivo
`requirements/web-dev.lock` foi gerado por `pip-compile 7.6.1` executado com CPython
3.11.16 e instalado nessa mesma versão. O pacote passou a incluir `servidor*` sem
alterar as dependências centrais `pyyaml` e `numpy` no `pyproject.toml`.

O `web/package-lock.json` foi instalado por `npm ci` com Node 24.19.0 e npm 11.17.0.
O projeto registra esse intervalo em `engines`; versões diretas são exatas. O
TypeScript permanece em 5.9.3 porque `openapi-typescript` 7.13.0 declara peer
`typescript ^5.x`.

## Evidência de teste primeiro

Os primeiros testes Python falharam por ausência de `servidor`; os testes JS
falharam por ausência de `format`, `memoryRepository` e `validators`. Depois da
implementação, um teste HTTP ainda falhou porque o modo estrito recebia strings JSON
de UUID/data antes da conversão do Pydantic, e o carregamento Ajv falhou por
`discriminator.mapping`. Ambos foram reproduzidos e corrigidos na fronteira de
transporte/geração.

Verificações executadas em Python 3.11.16 e Node 24.19.0:

- `python -m pytest -q`: 558 testes passaram;
- `python -O -m pytest -q`: 558 passaram; somente o aviso esperado do pytest sobre
  asserts de testes sob `-O`;
- `python -m ruff check servidor tests/web_api`: passou;
- `python -m mypy servidor`: passou após o narrowing explícito do JSON Pointer;
- CI Python: instala `requirements/web-dev.lock`, em vez da lista histórica que não
  continha Pydantic/HTTPX;
- `npm run test:unit`: 14 testes passaram;
- `npm run typecheck`: passou;
- `npm ci`: instalação limpa, audit de 249 pacotes com 0 vulnerabilidades.

OpenAPI, fixture, tipos TypeScript, schema runtime e validadores foram gerados duas
vezes. Os cinco hashes SHA-256 permaneceram iguais, confirmando saída determinística.
O teste ASGI aceita a requisição real até o handler fechado e recusa dinheiro enviado
como JSON number com 422. O teste do DTO de saída compara o dump completo com
`resultado_para_json` usando apenas interfaces públicas do motor.

A wheel final incluiu `motor`, `servidor` e os cenários YAML. Ela foi instalada em
outra venv e importada com `python -I` a partir do diretório temporário; nesse ambiente
o exemplo retornou `10800000.00`, o schema expôs `PreviewEnvelope` e o contrato de
decimal de saída manteve `maxLength=80`.

Nenhum arquivo em `motor/` foi modificado. A factory de T1 não executa o motor nem
oferece autenticação funcional; esses comportamentos continuam explicitamente nas
T2 e T3.
