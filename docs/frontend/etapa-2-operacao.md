# Etapa 2 — operação e continuidade

## MOT-23 / T2 — DTOs HTTP de preparação e catálogo

### Base e ambiente

- Branch: `codex/mot23-preparation-contracts`.
- Worktree: `.worktrees/mot23-preparation-contracts`.
- Base confirmada após `fetch`: `origin/main` em
  `a655d9d9fc166507e084b71bce98f2b601fb5d79`.
- CI dessa base: workflow `test` 34776725007, concluído com sucesso.
- Ambiente local: CPython 3.11.16 em `.venv`, Node 24.19.0 e npm 11.17.0.
- Mapeamento do plano: T2 = MOT-23. T1 = MOT-24 permanece bloqueada até a
  conclusão desta missão.

O worktree documental `.worktrees/frontend-etapa-2-plano` e suas alterações locais
foram preservados. Nenhum arquivo foi copiado sobre ele.

### Contratos publicados

`servidor/contracts/preparation.py` define objetos fechados para:

- `EffectiveSource`, `EffectiveParticipant` e `EffectiveInput`;
- `PreparationRequest` e `PreparationResponse` na versão própria `1.0.0`;
- `DerivedEvidence`, `PreparationParameter` e `RealizedComposition`;
- `ProfileTemplate`, `ExampleTemplate`, `CatalogResponse` e `Capabilities`.

Seeds são strings decimais entre 0 e 9223372036854775807. Dinheiro permanece
string decimal ASCII, sem expoente, com limites e precisão do plano. A entrada
aceita até 100 participantes, aquecimento 0–365, medição 1–365, soma até 730 e
janela 1–730. Perfil, prazos, booleanos, finalidades, custos e regras IOF são
validados semanticamente no servidor.

As fontes usam caminhos estáveis por UUID, por exemplo
`/participants/<uuid>/ticket_median_brl`. Custos usam `/costs/<campo>`; uma regra
IOF usa `/costs/iof_por_finalidade/<finalidade-escapada>/<direcao>`. Fontes
ausentes/extras produzem `ORIGEM_AUSENTE`/`ORIGEM_INVALIDA`, com o caminho no
campo do erro e mensagem fixa sem copiar o valor de entrada.

A factory canônica expõe schemas para:

- `GET /api/v1/capabilities`;
- `GET /api/v1/examples/catalog`;
- `POST /api/v1/preparacoes`.

Nesta T2 eles são apenas contratos na `create_schema_app`; a aplicação real não
ganhou endpoints fictícios. Implementação de catálogo, dimensionamento, geração e
rotas funcionais pertence à MOT-25/T3.

### Artefatos e fixture

`contracts/fixtures/authored-input.json` contém somente UUIDs sintéticos: um
participante, mediana 1000, volume mensal 10000, fração OUT 0.5, prazo fixo 7,
período NATURAL implícito pelos campos 0/30, janela 7, custos da referência e
fontes técnicas. `tests/web_api/conftest.py` devolve `deepcopy`, um
`PreparationRequest` validado e relógio UTC fixo em `2026-09-13T00:00:00Z`.

OpenAPI, tipos TypeScript, schema runtime e validadores Ajv foram regenerados. Os
validadores novos são `validateEffectiveInput`, `validatePreparationRequest`,
`validatePreparationResponse`, `validateCatalogResponse` e
`validateCapabilities`. Schemas e rotas anteriores da API 1.0.0 não mudaram.

### TDD e verificações

O primeiro vermelho focal falhou por
`ModuleNotFoundError: servidor.contracts.preparation`. Depois dos DTOs, o segundo
vermelho demonstrou ausência dos schemas/paths OpenAPI. Um terceiro caso mostrou
que o catálogo ainda aceitava mediana abaixo de R$ 0,01; a correção foi feita no
validador específico do perfil. Os casos focais terminaram com 33 testes verdes.

V0 na base limpa:

- Pytest normal: 647 passaram, 2 ignorados;
- Pytest `-O`: 647 passaram, 2 ignorados;
- Vitest: 89 passaram;
- typecheck, lint e build: passaram.

V1/V2 após a implementação:

- Pytest normal e `-O`: 680 passaram, 2 ignorados em cada modo;
- Ruff e mypy do servidor: passaram;
- Vitest: 90 passaram;
- typecheck, lint e build: passaram;
- duas exportações/gerações produziram bytes idênticos nos quatro artefatos;
- schemas e paths preexistentes foram comparados estruturalmente: nenhuma mudança;
- `git diff --exit-code -- motor` passou;
- fixtures `reference-request.json` e `reference-result.json` permaneceram intactas.

Avisos não bloqueantes preservados: depreciações Starlette/httpx e anyio nos testes,
aviso esperado de asserts sob `-O` e chunk Vite acima de 500 kB.

### Continuidade

A MOT-24/T1 pode consumir os aliases gerados de `EffectiveInput`, preparação,
catálogo e capabilities. Ela não deve copiar os campos HTTP manualmente. A MOT-25
implementará as funções/rotas reais e continuará consumindo apenas as interfaces
públicas do motor. Esta entrega não inicia nenhuma dessas missões.
