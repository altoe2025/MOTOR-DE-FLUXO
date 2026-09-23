# Aceitação técnica — Front-end Etapa 5 Replay

Estado: **PASS para testes internos do MVP**, sujeito ao limite efetivo documentado
abaixo. Não autoriza push, PR, merge, deploy ou uso em produção.

## Base e entregas

- base: `origin/main` em `6c623a806d03962ef6e21af22a3edc69f9b1aa78`;
- branch local: `codex/frontend-etapa-5`;
- MOT-86: contrato temporal, reconciliação e plano executável;
- MOT-87: estado determinístico, controles e rota persistida;
- MOT-88: cena Fronteira Viva e animações orientadas a eventos;
- MOT-89: integração, provas browser, medição e aceite.

O MVP não altera `motor/`, suas regras financeiras ou os números históricos. A
projeção Python deriva eventos exclusivamente de ordens e alocações canônicas; o
front reconstrói e confere o documento publicado sem recalcular netting ou custos.

## Matriz de aceite

| Requisito | Evidência | Resultado |
|---|---|---|
| Todos os dias `0..horizonte`, inclusive vazios | E2E observado e testes do builder/estado | PASS |
| Warmup separado da coorte medida | contrato e regressões de reconciliação | PASS |
| Autonetting antes do multilateral | origens canônicas das alocações e testes de decomposição | PASS |
| Gatilhos simultâneos | fixture observada com `WINDOW + DEADLINE` | PASS |
| Parcial, saída e saldo correto | captura de fechamento parcial e assertions E2E | PASS |
| Casado, aberto, remetido OUT/IN e acumulados | métricas publicadas, testes e duas fixtures | PASS |
| Conexões ilustrativas, não contraparte | segments publicados pelo Python e texto explícito | PASS |
| Play/pause, velocidades, anterior/seguinte, salto, fechamento, repetição e recomeço | testes de estado, componentes e Chromium | PASS |
| Voltar, saltar e recarregar reconstruindo o mesmo estado | redutor puro, rota persistida e reload E2E | PASS |
| Movimento somente em eventos | testes de transição, dia vazio e inspeção visual | PASS |
| Zoom 200%, viewport estreito e resize | Chromium real, sem overflow global, curvas reancoradas | PASS |
| Resultado após expiração do job | rota lê `DiagnosticEnvelope` do IndexedDB | PASS |

## Evidência visual inspecionada

Arquivos em `docs/frontend/evidencias/`:

| Arquivo | SHA-256 |
|---|---|
| `mot89-observado-inicial-1280x800.png` | `3f3e5878b92b6846c87b05bd7efc36ed9d76d58c7f0124644a4f440ea9907388` |
| `mot89-observado-chegada.png` | `5cbaf0115d829036818ca679d946682a25589c703554b1402a1fd2a105365eb5` |
| `mot89-observado-fechamento-parcial.png` | `f5059f8bc04c72e9858db2e18d5e10ab9bf4f44a598e1d6a209fe1e23910f55b` |
| `mot89-observado-remessa-out.png` | `d76613673cbdd547f3a247a250cb7be7c1be00fe601bb1d6a5d00d94bbfda1dd` |
| `mot89-observado-zoom-200.png` | `5f3531a593a1df0763a21e510f4ddb4508d4d2e45fb071975c199e0fee3395be` |
| `mot89-sintetico-remessa-in.png` | `329b7420f35e0595fc836f40f5596b5e7fadcd4306fd6f012c1c393d19883b44` |
| `mot89-sintetico-final.png` | `4a602014cf6860ff30b4fffb62b62c92d7b4b5eb2695abcdc793d7ece484a152` |
| `mot89-orcamento-1000x365.json` | `aed96d8b0aa643943f375cc8218f3e0e194b192cab13c2cf48071ee27db7c67c` |

A inspeção confirmou cartões legíveis, saldo parcial preservado, saída sincronizada,
curvas ancoradas antes e depois de resize, remessas nas duas direções, diário e
métricas coerentes. A primeira versão comprimiu cartões letra a letra em 200%; o
layout empilhado e a geometria vertical foram corrigidos antes deste aceite e ganharam
regressão automatizada.

## Orçamento e limite real

A tentativa de 1.000 × 365 foi rejeitada antes do builder pelo contrato real:
`DiagnosticRequest.provenance` aceita no máximo 500 itens. O maior percurso atual é
**98 ordens × 365 dias**, com 499 entradas de proveniência.

Medição E2E registrada em `mot89-orcamento-1000x365.json`:

| Medida | Resultado |
|---|---:|
| dias inclusivos | 365 |
| ordens | 98 |
| eventos / segmentos | 210 / 97 |
| request / response | 200.513 / 156.112 bytes |
| input + Motor | 123,513 ms |
| builder p50 / máximo | 19,153 / 53,291 ms |
| reconstrução browser p50 / máximo | 9,6 / 11,1 ms |

Request e response ficaram abaixo do teto de 8 MiB e o estado direto ficou abaixo do
orçamento interno de 250 ms. Esses tempos caracterizam a máquina local e não são SLA.
O MVP está aceito para o limite efetivo; **1.000 × 365 permanece não suportado ponta
a ponta** até o contrato de proveniência e a representação serem revistos juntos.

## Verificações

O fechamento executa:

```powershell
.\.venv-t5\Scripts\python.exe -m pytest -q
.\.venv-t5\Scripts\python.exe -O -m pytest -q
npm --prefix web run test:unit
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run test:e2e -- stage5-replay.spec.ts
npm --prefix web run test:e2e
```

O resultado foi 794 testes Python aprovados e 2 ignorados, tanto normal quanto sob
`-O`; 477 unitários web aprovados em 67 arquivos com um worker; lint, typecheck e
build aprovados; E2E específico 3/3 duas vezes consecutivas; e Playwright integral
22/22. A execução Vitest padrão reproduziu uma contenção antiga no timeout de um
teste de roteamento; o arquivo isolado passou 25/25 antes do gate integral verde.
Detalhes estão em `docs/testing.md` e na entrada MOT-89 do Diário. Não foi rodada uma
nova grade de 27.000 simulações, pois a transformação Replay é aditiva e não modifica
o Motor.

## Limitações aceitas

- teto efetivo de 98 ordens no pipeline diagnóstico → Replay;
- uma repetição selecionada implicitamente pelo diagnóstico; seleção e inspeção são
  5A;
- ausência de baseline temporal sincronizado, reservado à 5B;
- sem modo executivo, exportação ou escala de produção, reservados à 5C;
- persistência continua local por owner; não há Estudo armazenado no backend;
- números sintéticos continuam hipóteses, não forecast ou calibração comercial.

## Decisão

**PASS para testes internos até 98 ordens × 365 dias.** O recorte aprovado entrega o
Replay determinístico Fronteira Viva com origem observada e sintética, reconciliação
com o Motor, comportamento temporal e acessibilidade visual verificados. O limite de
proveniência e as evoluções 5A/5B/5C permanecem explicitamente fora deste aceite.
