# Testes

## Contexto

Reconferido em 2026-09-16 na branch `codex/autonetting-preferencial`: a suíte Python
tem **670 testes aprovados e 2 ignorados**, tanto na execução normal quanto sob
`python -O`. O front-end tem **89 testes unitários aprovados**; build, lint e os
**3 testes Playwright** também passam.

## Decisão

### Módulos testados

Um arquivo de teste por módulo (ou por aspecto do módulo), espelhando
`docs/architecture.md`:

- `test_dominio.py` — entidades e `carregar_cenario`.
- `test_netting.py` — `executar_p0`.
- `test_custo.py`, `test_custo_finalidade.py`, `test_finalidade_por_direcao.py` —
  `custo_baseline`/`custo_netado` e a tabela de alíquotas por finalidade/direção.
- `test_geracao.py`, `test_geracao_todos_arquetipos.py`, `test_arquetipos.py` —
  geração sintética de ordens.
- `test_mixes.py` — composição de carteira.
- `test_varredura.py`, `test_netabilidade.py`, `test_resumo.py` — a grade de
  varredura, incluindo `test_celula_do_grid_reproduz_o_numero_de_aceitacao_da_amanda`
  (o número de aceitação, ver `AGENTS.md`).
- `test_cli.py` — a CLI em `motor/__main__.py`.
- `test_integracao.py` — ponta a ponta, netting + custo juntos.
- `test_oraculo_p0.py` — oráculo diferencial (ver abaixo).
- `test_analise_*.py`, `test_resultado_canonico.py` e
  `test_serializacao_canonica.py` — ledger, agregados, mecanismos e JSON canônico.
- `tests/web_api/` — contrato HTTP estrito, adaptador, publicação, identidade,
  autenticação e servidor estático.

### O oráculo diferencial do P0

`test_oraculo_p0.py` compara `executar_p0` com uma **reimplementação independente da
mesma política**, escrita dentro do próprio arquivo, sobre carteiras geradas ao acaso
com seed fixa. Os dois têm que produzir a **mesma linha do tempo de alocações** —
quem foi coberto, com quanto, em que dia — e não só o mesmo volume total.

A distinção importa: o volume casado de um ciclo é `min(soma_out, soma_in)`, que não
depende de quem foi coberto nem de quando. Um oráculo que comparasse só o total seria
cego exatamente às duas garantias que este motor dá — prioridade EDF e o dia em que o
resíduo sai.

Dois regimes de carteira, por motivos diferentes:

- **densa** — muitas ordens, prazos curtos. Alguma ordem vence quase todo dia, então é
  o vencimento que dispara o fechamento.
- **esparsa** — poucas ordens, buffers longos. Aqui é a **janela** que dispara, e sem
  este regime uma troca de `>=` por `>` no gatilho passava despercebida (é o mesmo
  motivo pelo qual o eixo W da varredura sai degenerado).

O segundo teste do arquivo roda a sombra com a semântica **anterior** ao MOT-11 e exige
que o motor divirja dela de forma gritante. É o que impede o oráculo de virar
decoração: um teste diferencial que concorda com tudo não testa nada.

Verificado por mutação em 2026-09-06 — o oráculo pega as cinco: gatilho de janela
alterado, EDF sem desempate por `id`, FIFO no lugar de EDF, ordem quitada mantida no
lote, e o bug histórico de remessa do lote inteiro.

### Como rodar

```bash
make test              # suíte completa (pytest -q)
pytest tests/test_netting.py -q   # um arquivo
pytest -k nome_do_teste -q        # um teste isolado
python -O -m pytest -q            # sem asserts: ver a regra abaixo
npm --prefix web run test:unit
npm --prefix web run build
npm --prefix web run lint
npm --prefix web run test:e2e
```

### Gate do autonetting preferencial — 2026-09-16

Executado sobre a base `a655d9d9fc166507e084b71bce98f2b601fb5d79`, com schema
de resultado `2.0.0`:

| Verificação | Resultado |
|---|---|
| `python -m pytest -q` | 670 aprovados, 2 ignorados |
| `python -O -m pytest -q` | 670 aprovados, 2 ignorados |
| `npm --prefix web run test:unit` | 89 aprovados em 14 arquivos |
| `npm --prefix web run build` | aprovado |
| `npm --prefix web run lint` | aprovado |
| `npm --prefix web run test:e2e` | 3 aprovados |

Os quatro geradores oficiais (`export_openapi`, fixtures de entrada e saída e
`generate:api`) foram executados duas vezes; a árvore permaneceu sem diferenças.
`git diff --check` não encontrou erro de whitespace.

A aceitação confrontou as alocações do motor com os três mecanismos do JSON. Os
volumes abaixo estão na ordem **intracliente / intercliente / remetido**:

- Amanda: `0 / 54.000.000 / 37.800.000` BRL;
- A OUT 100, A IN 70, B IN 50: `140 / 60 / 20` BRL;
- preferência intracliente sobre deadline externo: `200 / 0 / 100` BRL.

O Playwright percorreu Amanda pelo servidor real local. Para os dois cenários
sintéticos, o adaptador real publicou os mesmos volumes e origens do ledger; os
testes unitários do front usam valores canônicos não deriváveis e comprovam que a
tela os apresenta diretamente, sem recomputar mecanismos no navegador.

### Invariante de correção não pode ser `assert`

`python -O` remove todo `assert` do bytecode. Um invariante que garante que o
*resultado* está certo — conservação de valor, validação de entrada de cenário — não
pode depender disso: sob `-O` ele sumiria e o motor devolveria número errado em
silêncio. Esses invariantes usam `raise ValueError`, e a suíte roda também com `-O`
justamente para provar que continuam valendo. `assert` segue válido em teste.

### Quando um teste quebra

1. Não ajustar o teste para o comportamento novo sem entender por que o
   comportamento mudou — o "Número de aceitação" e os testes de conservação
   (`Alocacao`) existem para pegar exatamente esse tipo de regressão silenciosa.
2. Ler a entrada do topo de `docs/DIARIO-DE-MUDANCAS.md` — pode já haver contexto
   sobre uma mudança recente que explica a quebra.
3. Se a mudança de comportamento for intencional, atualizar o teste **e** registrar
   o motivo na entrada do diário do mesmo commit.

### Pendência conhecida — cenários manuais presos no PR #17

Os **7 cenários de verificação manual** (previsão feita à mão, ciclo a ciclo, antes
de rodar o motor) e o runner `scripts/rodar_casos_manuais.py` existem apenas na
branch `docs/auditoria-2026-09-06` (commit `cbc900d`), aberta como **PR #17 e
deliberadamente não mergeada** — **não estão na `main`**. O mesmo vale para
`scripts/exportar_timeline.py`. `docs/DIARIO-DE-MUDANCAS.md` narra esses 7 cenários
como já escritos e rodados — o que é verdade naquela branch, não na `main`.

Enquanto o PR #17 não for mergeado, **não trate os 7 cenários manuais como regressão
disponível** — não há arquivo para rodar na `main`. Decidir o destino do PR #17 é do
Gabriel; até lá, a regressão efetiva do repo são os testes do `pytest` — com o
oráculo diferencial cobrindo boa parte do que os 7 cenários manuais cobririam, já que
ele confere a política contra uma segunda implementação em vez de contra uma previsão
escrita à mão.

Para contexto de negócio e proveniência, consultar o vault Obsidian.

## Aceitação local da Etapa 2 — MOT-32

O comando `npm --prefix web run test:e2e` gera o bundle E2E com o SHA real do
checkout e executa, no Chromium, a fundação e os percursos `study-*`. A aceitação
cobre o caso observado confirmado até o resultado e a conciliação, as origens
sintética e manual, reload, histórico, CAS entre duas abas, isolamento de duas
contas locais controladas, migrações versionadas e recuperação de execução
interrompida.

O teste de quota usa `Storage.overrideQuotaForOrigin` no Chromium e comprova que uma
gravação real em IndexedDB aborta. Isso é injeção determinística do limite, não
evidência de esgotamento físico do disco. `blocked` usa duas conexões reais ao
IndexedDB; corrupção insere uma linha inválida e exige o erro tipado do repositório.

O zoom de 200% é aplicado e capturado pelo Chromium no percurso observado. Não é
um teste jsdom. As requisições dos percursos são inspecionadas para impedir nome de
arquivo bruto, nome local de grupo e token em URL. O scanner adicional detecta
segredos em query strings de URLs nos arquivos rastreados e no bundle de produção.

O projeto `real-auth` continua condicionado a `MOT_REAL_AUTH_BASE_URL`,
`MOT_REAL_AUTH_EMAIL` e `MOT_REAL_AUTH_PASSWORD` fornecidos pelo ambiente. A
aceitação local não fabrica credenciais reais nem publica artefatos.
