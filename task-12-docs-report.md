# Task 12 / MOT-33 — documentação e handoff

Base: `b5a2d9a`. Decisão registrada: **CONDITIONAL**; a Etapa 2 não foi declarada
concluída e a Etapa 3 não foi iniciada.

## Entrega

- operação reproduzível, contratos/stores/migrations/fingerprints/erros/versões e
  limites em `docs/frontend/etapa-2-v2-operacao.md`;
- matriz S15 com testes, comandos, SHAs, gates e handoff em
  `docs/frontend/etapa-2-v2-aceitacao.md`;
- `MAPA.md`, `architecture.md`, Diário e plano técnico v2 atualizados somente com o
  estado/evidência final.

## Condições preservadas

- globais em `53e74f1`; quota em `b46017b`; remediação focada até `b5a2d9a`;
- Ruff global com 296 violações legadas continua reprovado;
- auth real continua skipped sem credenciais;
- regressão global não foi repetida no SHA final;
- merge depende de CI publicado e aprovação explícita do Gabriel.

Nenhum código de produto, regra do motor, push, PR, merge ou item do Linear foi
alterado. A validação documental inicial está em `c7347ce`; o ajuste final alinha a
ordem do fluxo de autoridade à implementação sem mudar o aceite ou suas evidências.
