# Autonetting Preferencial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar autonetting obrigatório antes do netting multilateral em cada fechamento P0 e propagar sua origem de forma auditável pelo motor, análises, API e front-end.

**Architecture:** A P0 mantém seus gatilhos e passa a ter um alocador em duas fases: intracliente e residual multilateral. `Alocacao` conserva o resultado transfronteiriço e ganha uma dimensão ortogonal de origem; todas as métricas e saídas derivam dessas alocações, sem pareamento físico entre ordens.

**Tech Stack:** Python 3.11+, `dataclasses`, `Decimal`, pytest, FastAPI/Pydantic, JSON Schema/OpenAPI, React/TypeScript/Vite.

**Spec:** `docs/superpowers/specs/2026-09-16-autonetting-preferencial-design.md`

**Estado de execução (2026-09-16):** Tasks 0–10 correspondem às MOT-34–MOT-44.
Motor, análise, CSV/CLI, API 2.0.0, UI, entrada e documentação foram implementados em
commits separados. Tasks 11–12 (MOT-45/MOT-46) permanecem para amostra e verificação
final. Task 13/MOT-47 continua bloqueada até aprovação explícita do Gabriel; a grade
histórica não foi sobrescrita.

## Global Constraints

- Executar a partir da `origin/main` integrada, atualmente identificada durante o planejamento pelo commit `a655d9d9fc166507e084b71bce98f2b601fb5d79`; confirmar novamente antes de criar o worktree.
- Não implementar na branch histórica `analise/sensibilidade-custo` nem reutilizar seus arquivos não versionados.
- Durante a execução, Gabriel autorizou explicitamente a criação das tarefas. O
  Linear atribuiu MOT-34–MOT-47, uma por Task 0–13; cada commit usa a issue da tarefa
  correspondente.
- Preservar os gatilhos da P0; autonetting não fecha lote antecipadamente.
- Preservar Modelo B, conservação por ordem, pureza e regra de importação entre `dominio.py`, `netting.py` e `custo.py`.
- Preferência intracliente supera EDF global; EDF/id permanece dentro de cada cliente e na fase intercliente.
- Não fazer look-ahead, reserva para ordens futuras, casamento retroativo ou pareamento jurídico ordem-a-ordem.
- Manter baseline por ordem isolada e fórmulas de custo atuais.
- Resultados históricos permanecem imutáveis e identificados como legado; nunca sobrescrever CSVs antigos.
- A regeneração integral da grade e dos relatórios é uma etapa pós-entrega. A Task 13
  só pode começar depois de motor, API e front-end estarem prontos e de Gabriel dar
  aprovação explícita com base na amostra da Task 11.
- Mudanças de contrato público exigem incremento de schema, regeneração por fonte canônica e testes Python/TypeScript.
- Não implementar o importador de documentos reais nesta entrega; apenas fixar e testar o contrato que ele deverá respeitar.
- Invariantes de correção usam `raise`, nunca `assert`, dentro do pacote.

---

### Task 0: Fixar base, issue e escopo de execução

**Files:**
- Verify: `AGENTS.md`
- Verify: `docs/DIARIO-DE-MUDANCAS.md`
- Verify: `docs/MAPA.md`
- Verify: `docs/superpowers/specs/2026-09-16-autonetting-preferencial-design.md`

**Interfaces:**
- Consumes: MOT-34–MOT-47, criadas após autorização explícita do Gabriel.
- Produces: worktree isolado em `codex/autonetting-preferencial`, baseado na `origin/main` mais recente e sem arquivos do usuário.

- [x] **Step 1: Registrar as issues autorizadas no Linear**

MOT-34–MOT-47 foram criadas após a autorização explícita do Gabriel. Isso substitui
a premissa de planejamento anterior de usar uma única issue já existente.

- [ ] **Step 2: Atualizar referências e confirmar a base**

```powershell
git fetch origin
git rev-parse origin/main
git status --short
```

Expected: o SHA de `origin/main` é registrado no diário de execução; mudanças locais do checkout atual não são movidas nem incluídas.

- [ ] **Step 3: Criar worktree isolado**

Usar `superpowers:using-git-worktrees` e criar a branch
`codex/autonetting-preferencial` a partir da `origin/main` confirmada. Não reutilizar
nenhum dos worktrees listados em 2026-09-16.

- [ ] **Step 4: Rodar a linha de base**

```powershell
python -m pytest -q
python -O -m pytest -q
python -m motor simular motor/cenarios/exemplo_amanda.yaml
```

Expected: duas suítes verdes e cenário Amanda reproduzindo os valores documentados pela base integrada. Registrar contagem e saída exatas; não atualizar expectativa nesta etapa.

- [ ] **Step 5: Confirmar arquivos afetados antes da implementação**

```powershell
rg -n -i "autonet|intra_cliente|incremental|posição líquida|posicao liquida|AlocacaoDTO|TipoAlocacao" motor servidor web tests docs
```

Expected: inventário inclui domínio, P0, análise canônica, varredura, DTOs, fixtures, tipos gerados e documentação listados nas tarefas seguintes.

### Task 1: Tornar a origem do casamento parte do domínio

**Files:**
- Modify: `motor/dominio.py`
- Modify: `motor/netting.py`
- Modify: `tests/test_dominio.py`
- Modify: `tests/test_custo_finalidade.py`
- Modify: `tests/test_netting.py`

**Interfaces:**
- Consumes: `TipoAlocacao` e `Alocacao` atuais.
- Produces: `OrigemCasamento` e `Alocacao(..., origem_casamento)` com validação cruzada.

- [ ] **Step 1: Escrever testes falhando para o novo contrato**

Adicionar em `tests/test_dominio.py`:

```python
def test_alocacao_casada_exige_origem():
    with pytest.raises(ValueError, match="CASADO exige origem_casamento"):
        Alocacao("o1", 0, Decimal("10"), TipoAlocacao.CASADO, None)


@pytest.mark.parametrize(
    "origem",
    [OrigemCasamento.INTRA_CLIENTE, OrigemCasamento.INTER_CLIENTE],
)
def test_alocacao_casada_aceita_origem(origem):
    alocacao = Alocacao("o1", 0, Decimal("10"), TipoAlocacao.CASADO, origem)
    assert alocacao.origem_casamento is origem


def test_alocacao_remetida_rejeita_origem():
    with pytest.raises(ValueError, match="REMETIDO não aceita origem_casamento"):
        Alocacao(
            "o1", 0, Decimal("10"), TipoAlocacao.REMETIDO,
            OrigemCasamento.INTER_CLIENTE,
        )
```

- [ ] **Step 2: Confirmar as falhas**

```powershell
python -m pytest tests/test_dominio.py -q
```

Expected: FAIL por ausência de `OrigemCasamento` e do quinto campo.

- [ ] **Step 3: Implementar enum e invariantes**

Adicionar em `motor/dominio.py`:

```python
class OrigemCasamento(Enum):
    INTRA_CLIENTE = "INTRA_CLIENTE"
    INTER_CLIENTE = "INTER_CLIENTE"


@dataclass(frozen=True)
class Alocacao:
    ordem_id: str
    dia: int
    valor_brl: Decimal
    tipo: TipoAlocacao
    origem_casamento: OrigemCasamento | None = None

    def __post_init__(self) -> None:
        _decimal_finito_positivo("valor_brl de uma Alocacao", self.valor_brl)
        if self.tipo is TipoAlocacao.CASADO and self.origem_casamento is None:
            raise ValueError("Alocacao CASADO exige origem_casamento")
        if self.tipo is TipoAlocacao.REMETIDO and self.origem_casamento is not None:
            raise ValueError("Alocacao REMETIDO não aceita origem_casamento")
```

Atualizar construções diretas. Em `motor/netting.py`, rotular transitoriamente todos
os casamentos atuais como `INTER_CLIENTE`; a Task 2 substitui essa classificação pelo
algoritmo correto em duas fases. Toda alocação `REMETIDO` continua com `None`.

- [ ] **Step 4: Rodar domínio e consumidores diretos**

```powershell
python -m pytest tests/test_dominio.py tests/test_netting.py tests/test_custo.py tests/test_custo_finalidade.py tests/test_resultado_canonico.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add motor/dominio.py motor/netting.py tests/test_dominio.py tests/test_custo_finalidade.py tests/test_netting.py
git commit -m "feat: registra origem do casamento nas alocacoes (MOT-35)"
```

### Task 2: Implementar o fechamento P0 em duas fases

**Files:**
- Modify: `motor/netting.py`
- Modify: `tests/test_netting.py`

**Interfaces:**
- Consumes: `OrigemCasamento`, `Alocacao`, filas abertas em EDF/id e `pendente`.
- Produces: `_consumir_casamento(...) -> Decimal` e `executar_p0` com fases intra e inter.

- [ ] **Step 1: Escrever a regressão que distingue preferência de EDF global**

Adicionar em `tests/test_netting.py` um cenário no qual o cliente A possui as duas
pontas, mas o OUT do cliente B vence antes:

```python
def test_autonetting_precede_edf_global():
    ordens = (
        Ordem("a-out", "a", Direcao.OUT, Decimal("100"), 0, 10, False, "x"),
        Ordem("a-in", "a", Direcao.IN, Decimal("100"), 0, 10, False, "x"),
        Ordem("b-out", "b", Direcao.OUT, Decimal("100"), 0, 0, False, "x"),
    )
    ciclos = executar_p0(Cenario(ordens, 100, 10, _custo_zero()))
    casadas = {
        a.ordem_id: a
        for c in ciclos for a in c.alocacoes
        if a.tipo is TipoAlocacao.CASADO
    }
    assert casadas.keys() == {"a-out", "a-in"}
    assert all(
        a.origem_casamento is OrigemCasamento.INTRA_CLIENTE
        for a in casadas.values()
    )
    remetida_b = next(
        a for c in ciclos for a in c.alocacoes if a.ordem_id == "b-out"
    )
    assert remetida_b.tipo is TipoAlocacao.REMETIDO
    assert remetida_b.dia == 0
```

- [ ] **Step 2: Escrever regressões para parcialidade, tempo e determinismo**

Adicionar testes que fixem:

```python
def test_autonetting_parcial_libera_apenas_excedente_para_pool():
    ordens = (
        Ordem("a-out", "a", Direcao.OUT, Decimal("100"), 0, 5, False, "x"),
        Ordem("a-in", "a", Direcao.IN, Decimal("70"), 0, 5, False, "x"),
        Ordem("b-in", "b", Direcao.IN, Decimal("50"), 0, 5, False, "x"),
    )
    ciclos = executar_p0(Cenario(ordens, 100, 5, _custo_zero()))
    por_id = {
        a.ordem_id: a
        for c in ciclos for a in c.alocacoes
        if a.tipo is TipoAlocacao.CASADO
    }
    assert por_id["a-in"].valor_brl == Decimal("70")
    assert por_id["a-in"].origem_casamento is OrigemCasamento.INTRA_CLIENTE
    assert any(
        a.ordem_id == "a-out"
        and a.valor_brl == Decimal("30")
        and a.origem_casamento is OrigemCasamento.INTER_CLIENTE
        for c in ciclos for a in c.alocacoes
    )
    assert any(
        a.ordem_id == "b-in"
        and a.valor_brl == Decimal("20")
        and a.tipo is TipoAlocacao.REMETIDO
        for c in ciclos for a in c.alocacoes
    )


def test_ordens_do_mesmo_cliente_sem_sobreposicao_nao_casam():
    ordens = (
        Ordem("a-out", "a", Direcao.OUT, Decimal("100"), 0, 0, False, "x"),
        Ordem("a-in", "a", Direcao.IN, Decimal("100"), 1, 1, False, "x"),
    )
    ciclos = executar_p0(Cenario(ordens, 100, 1, _custo_zero()))
    assert all(
        a.tipo is TipoAlocacao.REMETIDO
        for c in ciclos for a in c.alocacoes
    )


def test_autonetting_usa_edf_e_id_dentro_do_cliente():
    ordens = (
        Ordem("a-out-folgada", "a", Direcao.OUT, Decimal("100"), 0, 5, False, "x"),
        Ordem("a-out-urgente", "a", Direcao.OUT, Decimal("100"), 0, 1, False, "x"),
        Ordem("a-in", "a", Direcao.IN, Decimal("100"), 0, 1, False, "x"),
    )
    ciclos = executar_p0(Cenario(ordens, 100, 5, _custo_zero()))
    ids_intra = {
        a.ordem_id for c in ciclos for a in c.alocacoes
        if a.origem_casamento is OrigemCasamento.INTRA_CLIENTE
    }
    assert ids_intra == {"a-out-urgente", "a-in"}


def test_resultado_independe_da_ordem_de_entrada_com_autonetting():
    ordens = (
        Ordem("a-out", "a", Direcao.OUT, Decimal("100"), 0, 3, False, "x"),
        Ordem("a-in", "a", Direcao.IN, Decimal("60"), 0, 3, False, "x"),
        Ordem("b-in", "b", Direcao.IN, Decimal("40"), 0, 3, False, "x"),
    )
    referencia = executar_p0(Cenario(ordens, 100, 3, _custo_zero()))
    for permutacao in itertools.permutations(ordens):
        assert executar_p0(Cenario(permutacao, 100, 3, _custo_zero())) == referencia
```

Nos corpos, comparar IDs, dias, valores e `origem_casamento`; não verificar apenas
totais agregados.

- [ ] **Step 3: Confirmar que a implementação atual falha semanticamente**

```powershell
python -m pytest tests/test_netting.py -k "autonetting or mesmo_cliente" -q
```

Expected: o caso de preferência falha porque a implementação atual seleciona
`b-out` por EDF global; os demais falham por ausência da origem.

- [ ] **Step 4: Extrair o consumidor de filas**

Implementar em `motor/netting.py`:

```python
def _consumir_casamento(
    fila_out: list[Ordem],
    fila_in: list[Ordem],
    valor: Decimal,
    dia: int,
    pendente: dict[str, Decimal],
    origem: OrigemCasamento,
    alocacoes: list[Alocacao],
) -> Decimal:
    for fila in (fila_out, fila_in):
        restante = valor
        for ordem in fila:
            if restante <= 0:
                break
            usa = min(pendente[ordem.id], restante)
            if usa <= 0:
                continue
            pendente[ordem.id] -= usa
            restante -= usa
            alocacoes.append(
                Alocacao(ordem.id, dia, usa, TipoAlocacao.CASADO, origem)
            )
        if restante != 0:
            raise ValueError(
                f"casamento {origem.value} não coube no próprio lado no dia {dia}: "
                f"sobraram {restante}"
            )
    return valor
```

- [ ] **Step 5: Implementar as duas fases sem alterar gatilhos**

No bloco de fechamento:

```python
alocacoes: list[Alocacao] = []
clientes = sorted({ordem.cliente_id for ordem in abertas})
casado_intra = Decimal(0)
for cliente_id in clientes:
    out_cliente = [
        o for o in abertas
        if o.cliente_id == cliente_id
        and o.direcao is Direcao.OUT
        and pendente[o.id] > 0
    ]
    in_cliente = [
        o for o in abertas
        if o.cliente_id == cliente_id
        and o.direcao is Direcao.IN
        and pendente[o.id] > 0
    ]
    valor = min(
        sum((pendente[o.id] for o in out_cliente), Decimal(0)),
        sum((pendente[o.id] for o in in_cliente), Decimal(0)),
    )
    casado_intra += _consumir_casamento(
        out_cliente, in_cliente, valor, dia, pendente,
        OrigemCasamento.INTRA_CLIENTE, alocacoes,
    )

out_residual = [o for o in abertas if o.direcao is Direcao.OUT and pendente[o.id] > 0]
in_residual = [o for o in abertas if o.direcao is Direcao.IN and pendente[o.id] > 0]
casado_inter = min(
    sum((pendente[o.id] for o in out_residual), Decimal(0)),
    sum((pendente[o.id] for o in in_residual), Decimal(0)),
)
_consumir_casamento(
    out_residual, in_residual, casado_inter, dia, pendente,
    OrigemCasamento.INTER_CLIENTE, alocacoes,
)
casado = casado_intra + casado_inter
```

Calcular `bruto_out` e `bruto_in` antes de consumir e manter remessa, sobrevivência,
fechamentos e `direcao_residuo` como estão.

- [ ] **Step 6: Rodar testes de política e conservação**

```powershell
python -m pytest tests/test_netting.py tests/test_netabilidade.py tests/test_integracao.py -q
```

Expected: PASS, inclusive permutação, conservação e prazos.

- [ ] **Step 7: Commit**

```powershell
git add motor/netting.py tests/test_netting.py
git commit -m "feat: prioriza autonetting nos fechamentos p0 (MOT-36)"
```

### Task 3: Verificar o comportamento executado da nova política

**Files:**
- Modify: `tests/test_netting.py`
- Modify: `tests/test_integracao.py`

**Interfaces:**
- Consumes: ciclos produzidos por `executar_p0` e cenários concretos da regra aprovada.
- Produces: evidência direta de que o motor em execução prioriza o próprio cliente,
  preserva tempo e conserva volume.

- [ ] **Step 1: Consolidar três cenários de aceitação legíveis**

Manter como testes canônicos:

```python
test_autonetting_precede_edf_global
test_autonetting_parcial_libera_apenas_excedente_para_pool
test_ordens_do_mesmo_cliente_sem_sobreposicao_nao_casam
```

- [ ] **Step 2: Verificar os resultados completos dos cenários**

Em cada caso, conferir diretamente:

- IDs e valores das ordens casadas;
- dia de cada resolução;
- origem `INTRA_CLIENTE` ou `INTER_CLIENTE`;
- ordem e valor remetidos;
- conservação de cada ordem;
- `autonetting + multilateral == casado`.

- [ ] **Step 3: Rodar a suíte relacionada existente**

```powershell
python -m pytest tests/test_netting.py tests/test_integracao.py tests/test_custo.py tests/test_netabilidade.py -q
```

Expected: PASS. Não criar um segundo oráculo, bateria combinatória ou benchmark novo
nesta tarefa; investigar desempenho apenas se a execução real apresentar regressão.

- [ ] **Step 4: Commit**

```powershell
git add tests/test_netting.py tests/test_integracao.py
git commit -m "test: comprova comportamento do autonetting (MOT-37)"
```

### Task 4: Publicar métricas reais no resultado canônico

**Files:**
- Modify: `motor/simulacao.py`
- Modify: `motor/analise/modelo.py`
- Modify: `motor/analise/pipeline.py`
- Modify: `tests/test_netabilidade.py`
- Modify: `tests/test_resultado_canonico.py`
- Modify: `tests/test_execucao_temporal.py`

**Interfaces:**
- Consumes: alocações `CASADO` rotuladas por origem.
- Produces: volumes e taxas de autonetting e netting multilateral no resultado agregado.

- [ ] **Step 1: Escrever teste da identidade de decomposição**

Usar o cenário parcial da Task 2 e exigir:

```python
assert resultado.volume_autonetting_brl == Decimal("140")
assert resultado.volume_netting_multilateral_brl == Decimal("60")
assert resultado.volume_casado_brl == Decimal("200")
assert (
    resultado.volume_autonetting_brl
    + resultado.volume_netting_multilateral_brl
    == resultado.volume_casado_brl
)
assert resultado.taxa_autonetting == Decimal("140") / Decimal("220")
assert resultado.taxa_netting_multilateral == Decimal("60") / Decimal("220")
```

O denominador é o bruto `100 + 70 + 50 = 220`. Não arredondar dentro do motor.

- [ ] **Step 2: Adicionar campos ao resultado legado sem duplicar cálculo**

Em `motor/simulacao.py`, somar diretamente as alocações:

```python
volume_autonetting_brl = sum(
    (a.valor_brl for c in ciclos for a in c.alocacoes
     if a.tipo is TipoAlocacao.CASADO
     and a.origem_casamento is OrigemCasamento.INTRA_CLIENTE),
    Decimal(0),
)
volume_netting_multilateral_brl = sum(
    (a.valor_brl for c in ciclos for a in c.alocacoes
     if a.tipo is TipoAlocacao.CASADO
     and a.origem_casamento is OrigemCasamento.INTER_CLIENTE),
    Decimal(0),
)
```

Acrescentar ao `Resultado` os dois volumes e as duas taxas. Manter
`taxa_netabilidade` como soma das taxas, sujeita à identidade exata.

- [ ] **Step 3: Propagar para `AgregadoCanonico`**

Adicionar:

```python
volume_autonetting_periodo_brl: Decimal
volume_netting_multilateral_periodo_brl: Decimal
taxa_autonetting_periodo: Decimal
taxa_netting_multilateral_periodo: Decimal
```

Calcular sobre a mesma coorte e o mesmo período usados pelas métricas agregadas, não
sobre a execução completa quando houver aquecimento/liquidação.

- [ ] **Step 4: Remover a estimativa antiga do resultado novo**

Retirar de `DiagnosticosExperimentais`:

```python
limite_intra_cliente_brl
volume_casado_incremental_brl
taxa_netabilidade_incremental
```

Resultados históricos continuam legíveis apenas pelos seus schemas legados; não
converter estimativas antigas em medições reais.

- [ ] **Step 5: Rodar testes focados**

```powershell
python -m pytest tests/test_netabilidade.py tests/test_resultado_canonico.py tests/test_execucao_temporal.py -q
```

Expected: PASS e todas as identidades fecham exatamente com `Decimal`.

- [ ] **Step 6: Commit**

```powershell
git add motor/simulacao.py motor/analise/modelo.py motor/analise/pipeline.py tests/test_netabilidade.py tests/test_resultado_canonico.py tests/test_execucao_temporal.py
git commit -m "feat: decompoe netting por mecanismo no resultado (MOT-38)"
```

### Task 5: Propagar origem pelo ledger e reconciliar custos por cliente

**Files:**
- Modify: `motor/analise/modelo.py`
- Modify: `motor/analise/clientes.py`
- Modify: `tests/test_analise_clientes.py`
- Modify: `tests/test_resultado_canonico.py`

**Interfaces:**
- Consumes: `Alocacao.origem_casamento` e rateio técnico existente.
- Produces: eventos, resumos por cliente e `ResultadoMecanismo` que separam volume,
  custo e economia de autonetting, netting multilateral e remessa.

- [ ] **Step 1: Escrever teste de ledger por mecanismo**

Para o cenário parcial, exigir que eventos `CASADO` carreguem origem e que a soma de
eventos por mecanismo reconcilie com `AgregadoCanonico`:

```python
intra = sum(
    (e.valor_brl for e in resultado.ledger_eventos
     if e.tipo == "CASADO" and e.origem_casamento == "INTRA_CLIENTE"),
    Decimal(0),
)
inter = sum(
    (e.valor_brl for e in resultado.ledger_eventos
     if e.tipo == "CASADO" and e.origem_casamento == "INTER_CLIENTE"),
    Decimal(0),
)
assert intra == resultado.agregado.volume_autonetting_periodo_brl
assert inter == resultado.agregado.volume_netting_multilateral_periodo_brl
```

- [ ] **Step 2: Estender modelos de evento e resumo**

Adicionar `origem_casamento: OrigemCasamento | None` a `EventoCliente` e volumes
separados a `ResumoDiaCliente` e `ResultadoCliente`. Validar a mesma combinação
CASADO/REMETIDO usada pelo domínio. Criar:

```python
class DestinoContabil(Enum):
    INTRA_CLIENTE = "INTRA_CLIENTE"
    INTER_CLIENTE = "INTER_CLIENTE"
    REMETIDO = "REMETIDO"


@dataclass(frozen=True)
class ResultadoMecanismo:
    destino: DestinoContabil
    volume_brl: Decimal
    baseline_atribuido_brl: Decimal
    custo_netado_brl: Decimal
    economia_brl: Decimal
```

Adicionar `mecanismos: tuple[ResultadoMecanismo, ...]` ao agregado canônico, sempre
na ordem enum acima.

- [ ] **Step 3: Preservar as fórmulas de custo**

Não alterar IOF, carry, espera, spread ou custo fixo. Apenas transportar a origem da
alocação para o evento correspondente e acrescentar reconciliações:

```text
autonetting dos clientes == autonetting agregado
multilateral dos clientes == multilateral agregado
remetido dos clientes == remetido agregado
baseline dos clientes == baseline agregado
netado dos clientes == netado agregado
baseline dos mecanismos == baseline agregado
netado dos mecanismos == netado agregado
economia dos mecanismos == economia agregada
```

Para cada `ResultadoMecanismo`, exigir também
`economia_brl == baseline_atribuido_brl - custo_netado_brl`. Documentar no modelo que
se trata de atribuição contábil, não de contrafactual causal.

- [ ] **Step 4: Rodar clientes, custos e marginal**

```powershell
python -m pytest tests/test_analise_clientes.py tests/test_custo.py tests/test_custo_finalidade.py tests/test_analise_marginal.py -q
```

Expected: PASS; análise marginal pode mudar numericamente, mas continua definida pela
mesma diferença entre pool completa e pool sem cliente.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/modelo.py motor/analise/clientes.py tests/test_analise_clientes.py tests/test_resultado_canonico.py
git commit -m "feat: reconcilia autonetting por cliente (MOT-39)"
```

### Task 6: Migrar varredura, CSV e CLI para métricas observadas

**Files:**
- Modify: `motor/varredura.py`
- Modify: `motor/__main__.py`
- Modify: `docs/dicionario-csv.md`
- Modify: `tests/test_varredura.py`
- Modify: `tests/test_resumo.py`
- Modify: `tests/test_cli.py`

**Interfaces:**
- Consumes: métricas reais de `Resultado`.
- Produces: CSV e CLI que não usam `limite_intra_cliente_brl` como proxy.

- [ ] **Step 1: Escrever testes da nova linha de varredura**

Substituir testes das três métricas incrementais por:

```python
assert ponto.volume_autonetting_brl + ponto.volume_netting_multilateral_brl \
    == ponto.volume_casado_brl
assert ponto.taxa_autonetting + ponto.taxa_netting_multilateral \
    == ponto.taxa_netabilidade
```

Adicionar um caso temporal em que o limite anual antigo seria positivo, mas as
ordens nunca coexistem; o novo `volume_autonetting_brl` precisa ser zero.

- [ ] **Step 2: Substituir campos de `PontoVarredura` e `ResumoCelula`**

Remover o cálculo agregado por cliente das linhas atuais 428–445 e preencher os
novos campos diretamente a partir de `simular(cenario)`. Resumos publicam p50 das
duas taxas reais.

- [ ] **Step 3: Atualizar CLI**

Remover a frase “netting que só existe entre clientes diferentes”. Exibir, quando a
saída detalhada solicitar composição:

```text
autonetting: <volume e taxa>
netting multilateral: <volume e taxa>
remetido: <volume e taxa>
```

- [ ] **Step 4: Versionar o schema CSV**

Atualizar `docs/dicionario-csv.md` com nomes, unidades e identidade. Leitores de
arquivos antigos reconhecem explicitamente o schema legado; não preencher colunas
novas a partir das estimativas antigas.

- [ ] **Step 5: Rodar varredura e CLI focadas**

```powershell
python -m pytest tests/test_varredura.py tests/test_resumo.py tests/test_cli.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add motor/varredura.py motor/__main__.py docs/dicionario-csv.md tests/test_varredura.py tests/test_resumo.py tests/test_cli.py
git commit -m "feat: publica metricas reais de autonetting (MOT-40)"
```

### Task 7: Migrar JSON, API e contratos gerados

**Files:**
- Modify: `motor/analise/serializacao.py`
- Modify: `servidor/contracts/output.py`
- Modify: `servidor/motor_adapter.py`
- Modify: `tests/test_serializacao_canonica.py`
- Modify: `tests/web_api/test_output_contract.py`
- Modify: `tests/web_api/test_adapter.py`
- Regenerate: `contracts/openapi.json`
- Regenerate: `contracts/fixtures/reference-result.json`
- Regenerate: `web/src/api/schemas.json`
- Regenerate: `web/src/api/generated.ts`
- Regenerate: `web/src/api/validators.ts`

**Interfaces:**
- Consumes: resultado canônico com origem e decomposição real.
- Produces: schema público versionado e tipos gerados consistentes.

- [ ] **Step 1: Escrever testes de rejeição e round-trip**

Exigir:

```python
assert payload["agregado"]["volume_autonetting_periodo_brl"] == "0"
assert payload["agregado"]["volume_netting_multilateral_periodo_brl"] == "54000000.00"
assert payload["agregado"]["taxa_netabilidade_periodo"] == (
    Decimal(payload["agregado"]["taxa_autonetting_periodo"])
    + Decimal(payload["agregado"]["taxa_netting_multilateral_periodo"])
)
assert sum(
    Decimal(item["economia_brl"])
    for item in payload["agregado"]["mecanismos"]
) == Decimal(payload["agregado"]["economia_periodo_brl"])
```

Mutar `origem_casamento`, omitir um dos novos campos e reintroduzir uma métrica
incremental antiga; `ResultadoCanonicoDTO` deve rejeitar os três payloads.

- [ ] **Step 2: Atualizar DTOs e incrementar schema**

Adicionar `OrigemCasamentoDTO`, `DestinoContabilDTO`, `ResultadoMecanismoDTO`, campo
nullable em `AlocacaoDTO`, os quatro campos agregados e a lista ordenada de três
mecanismos. Incrementar `schema_version` de `1.0.0` para `2.0.0`.

- [ ] **Step 3: Regenerar artefatos pelas ferramentas oficiais**

Executar, nesta ordem:

```powershell
python -m servidor.export_openapi
python -m servidor.generate_reference_fixture
python -m servidor.generate_reference_result
npm --prefix web run generate:api
```

Não editar os arquivos gerados manualmente. Executar a sequência uma segunda vez e
confirmar que a segunda execução não acrescenta diferenças.

- [ ] **Step 4: Rodar contratos Python e TypeScript**

```powershell
python -m pytest tests/test_serializacao_canonica.py tests/web_api/test_output_contract.py tests/web_api/test_adapter.py -q
npm --prefix web run test:unit
```

Expected: PASS e árvore limpa depois de executar novamente os geradores.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/serializacao.py servidor/contracts/output.py servidor/motor_adapter.py contracts/openapi.json contracts/fixtures/reference-request.json contracts/fixtures/reference-result.json web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts tests/test_serializacao_canonica.py tests/web_api/test_output_contract.py tests/web_api/test_adapter.py
git commit -m "feat: versiona contrato publico de autonetting (MOT-41)"
```

### Task 8: Exibir a composição no front-end sem recalcular o motor

**Files:**
- Modify: `web/src/ui/ComparisonSummary.tsx`
- Modify: `web/src/ui/ui.test.tsx`
- Modify: `web/src/pages/PreviewPage.tsx`
- Modify: `web/src/pages/previewFlow.test.tsx`
- Modify: `web/src/presentation/format.ts` only if an existing formatter cannot represent the new fields

**Interfaces:**
- Consumes: campos gerados da Task 7.
- Produces: apresentação de autonetting, multilateral e remessa com reconciliação visível.

- [ ] **Step 1: Escrever teste de apresentação**

Montar um payload tipado com as três parcelas e exigir rótulos e valores vindos da
API. O teste deve falhar se o componente calcular uma parcela por subtração no JS.

- [ ] **Step 2: Implementar a composição**

Mostrar:

```text
Autonetting — mesmo participante
Netting multilateral — entre participantes
Remetido — cruzou a fronteira
```

Usar volumes, taxas e `ResultadoMecanismo` fornecidos pela API. Mostrar custo e
economia por destino com o rótulo “atribuição contábil”, sem sugerir causalidade.
Manter os avisos de dado sintético e custo não calibrado. Não usar
`diagnosticos_experimentais`.

- [ ] **Step 3: Rodar testes e build**

```powershell
npm --prefix web run test:unit
npm --prefix web run build
```

Expected: PASS.

- [ ] **Step 4: Fazer verificação visual proporcional**

Abrir a prévia no navegador, verificar 1280×800, 1440×900 e zoom equivalente a 200%.
Confirmar que os três destinos são legíveis, não parecem somar percentuais diferentes
de 100% e não escondem os avisos de premissa.

- [ ] **Step 5: Commit**

```powershell
git add web/src
git commit -m "feat: exibe composicao do netting na previa (MOT-42)"
```

### Task 9: Fixar o contrato de entrada para importadores futuros

**Files:**
- Modify: `servidor/contracts/input.py`
- Modify: `tests/web_api/test_contracts.py`
- Modify: `docs/architecture.md`
- Modify: `docs/ARQUITETURA.md`

**Interfaces:**
- Consumes: `OrdemEntrada` explícita e campos de proveniência existentes.
- Produces: contrato documentado que proíbe pré-netting silencioso e agregação incompatível.

- [ ] **Step 1: Escrever teste que preserva duas pontas do mesmo cliente**

Enviar duas ordens explícitas, uma OUT e uma IN, com o mesmo `cliente_id`. O adaptador
precisa criar duas `Ordem` distintas e permitir que a P0 decida o autonetting.

- [ ] **Step 2: Documentar a fronteira e a chave mínima de agregação**

Registrar que planilhas/PDFs são sanitizados antes do motor, mas o adaptador não
compensa OUT/IN nem elimina operações. Uma futura agregação documental só pode unir
linhas com os mesmos `cliente_id`, direção, `dia_conhecida`, `dia_limite`, finalidade
e `eh_efx`; corredor e moeda entram na chave quando forem adicionados ao domínio.

- [ ] **Step 3: Rodar contratos e adaptador**

```powershell
python -m pytest tests/web_api/test_contracts.py tests/web_api/test_adapter.py -q
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add servidor/contracts/input.py tests/web_api/test_contracts.py docs/architecture.md docs/ARQUITETURA.md
git commit -m "docs: fixa entrada sem pre-netting silencioso (MOT-43)"
```

### Task 10: Atualizar decisões, planos dependentes e fonte de verdade

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/MAPA.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: `docs/adr-edf-tiebreak.md`
- Create: `docs/adr-autonetting-preferencial.md`
- Modify: `docs/superpowers/specs/2026-09-09-fechamento-funcional-motor-design.md`
- Modify: `docs/superpowers/plans/2026-09-09-fechamento-funcional-motor.md`
- Modify: `docs/superpowers/plans/2026-09-11-frontend-etapa-1-plano-tecnico.md`
- Modify: `docs/superpowers/plans/2026-09-13-frontend-etapa-2-plano-tecnico.md`

**Interfaces:**
- Consumes: comportamento verificado das Tasks 1–9.
- Produces: uma única semântica vigente, sem planos futuros contraditórios.

- [ ] **Step 1: Escrever o ADR**

Registrar contexto, decisão, alternativas rejeitadas e consequências:

- pré-netar antes da P0 perde granularidade e foi rejeitado;
- EDF global puro viola a preferência e foi rejeitado;
- reserva/look-ahead viola causalidade e foi rejeitada;
- duas fases em cada fechamento foi escolhida.

- [ ] **Step 2: Corrigir documentos normativos**

Substituir “cada ordem já é posição líquida” pelo contrato aprovado. Explicar que
`cliente_id` agora participa da política e que EDF global é secundário à preferência
intracliente.

- [ ] **Step 3: Corrigir planos ainda ativos**

Nos planos de fechamento e front-end, remover as restrições contraditórias, atualizar
DTOs e apontar para o novo ADR/spec. Preservar o histórico: documentos analíticos
antigos recebem aviso de legado; seus números não são reescritos como se tivessem sido
produzidos pela política nova.

- [ ] **Step 4: Atualizar o diário no mesmo commit da mudança documental**

A entrada deve informar:

1. sintoma: EDF global podia consumir a contraparte de outro cliente antes do próprio;
2. causa: `cliente_id` não participava do algoritmo e o contrato de entrada estava errado;
3. feito: duas fases, origem auditável, contratos e UI;
4. invalida: simulações, CSVs e conclusões baseados na política anterior.

- [ ] **Step 5: Verificar ausência de contradições vigentes**

```powershell
rg -n -i "posição líquida|posicao liquida|não implementar autonetting|nao implementar autonetting|incremental" AGENTS.md docs motor servidor web
```

Expected: ocorrências restantes pertencem apenas a histórico/legado e estão marcadas
como tal; nenhuma instrução vigente manda ignorar a prioridade intracliente.

- [ ] **Step 6: Commit**

```powershell
git add AGENTS.md docs
git commit -m "docs: consolida regra de autonetting preferencial (MOT-44)"
```

### Task 11: Medir o impacto numa amostra pequena

**Files:**
- Create: `docs/RELATORIO-AMOSTRA-AUTONETTING.md`
- Verify: `scripts/varredura_completa.py`
- Verify: `scripts/diagnostico_custo.py`
- Verify: `scripts/sensibilidade_custo.py`

**Interfaces:**
- Consumes: motor e schema novos, mesmas seeds pareadas e parâmetros históricos.
- Produces: amostra comparável suficiente para conferir o comportamento e estimar o
  custo da regeneração completa, sem dispará-la.

- [ ] **Step 1: Rodar uma grade pequena de fumaça**

Executar duas seeds em pelo menos um mix com clientes de duas pontas e verificar:

```text
autonetting + multilateral == casado
casado + remetido == bruto
custos por cliente == custos agregados
```

Expected: todas as identidades fecham e autonetting é positivo no cenário escolhido.

- [ ] **Step 2: Comparar política antiga e nova numa amostra congelada**

Usar as mesmas ordens e parâmetros para medir apenas a mudança de seleção. Publicar:

- volume e taxa por mecanismo;
- mudança em IOF, carry, spread, espera e economia;
- ordens que trocaram de destino ou dia;
- efeito sobre netabilidade futura causado pela prioridade.

- [ ] **Step 3: Medir o custo operacional da regeneração**

Cronometrar somente a amostra e projetar o tempo da grade completa usando quantidade
de células, seeds e custo observado por rodada. Não iniciar a grade completa.

- [ ] **Step 4: Registrar a amostra**

Criar `docs/RELATORIO-AMOSTRA-AUTONETTING.md` com:

- configuração e seeds exatas;
- comparação antes/depois;
- volumes por mecanismo;
- mudanças de custo, espera e economia;
- tempo observado e projeção da grade completa;
- aviso de que a amostra não substitui a regeneração oficial.

- [ ] **Step 5: Verificar cenário Amanda isoladamente**

```powershell
python -m motor simular motor/cenarios/exemplo_amanda.yaml
python -m pytest tests/test_varredura.py -k "aceitacao_da_amanda" -q
```

Expected: número de aceitação permanece igual ao da base porque o cenário não possui
duas pontas do mesmo cliente.

- [ ] **Step 6: Commit**

```powershell
git add docs/RELATORIO-AMOSTRA-AUTONETTING.md
git commit -m "analise: mede amostra do autonetting preferencial (MOT-45)"
```

### Task 12: Verificação final e preparação para integração

**Files:**
- Verify: todos os arquivos alterados nas Tasks 1–11
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: `docs/testing.md`

**Interfaces:**
- Produces: branch revisada, reproduzível e pronta para decisão de integração.

- [ ] **Step 1: Rodar suíte Python completa**

```powershell
python -m pytest -q
python -O -m pytest -q
```

Expected: todas as suítes passam; registrar contagem real.

- [ ] **Step 2: Rodar suíte e build do front-end**

```powershell
npm --prefix web run test:unit
npm --prefix web run build
```

Expected: PASS.

- [ ] **Step 3: Verificar artefatos gerados e escopo**

```powershell
git diff --check
git status --short
git diff --stat origin/main...HEAD
git grep -n "taxa_netabilidade_incremental" HEAD -- ':!docs/DIARIO-DE-MUDANCAS.md' ':!docs/RELATORIO-*' ':!resultados/**'
```

Expected: zero erro de whitespace; somente mudanças planejadas; nenhuma dependência
vigente da métrica incremental antiga fora de compatibilidade explicitamente marcada.

- [ ] **Step 4: Rodar aceitação ponta a ponta**

Usar o servidor e a prévia para executar:

1. cenário Amanda, sem autonetting;
2. cenário A OUT 100/A IN 70/B IN 50;
3. cenário que força preferência intracliente sobre deadline externo.

Expected: JSON, UI e ledger apresentam os mesmos volumes e origens do motor.

- [ ] **Step 5: Revisar os resultados executados**

Comparar a saída do motor, JSON, ledger e tela para os três cenários do Step 4.
Corrigir somente divergências observadas e repetir os testes diretamente afetados.

- [ ] **Step 6: Registrar evidência final e fazer o commit documental**

Atualizar `docs/testing.md` com os comandos e contagens reais e completar a entrada
do diário com o SHA da base, versão do schema e resultados da amostra e da aceitação.

```powershell
git add docs/DIARIO-DE-MUDANCAS.md docs/testing.md
git commit -m "docs: registra verificacao do autonetting (MOT-46)"
```

- [ ] **Step 7: Finalizar a branch sem integrar automaticamente**

Usar `superpowers:finishing-a-development-branch`. Não fazer merge, push ou abrir PR
sem a escolha explícita de Gabriel no fluxo de finalização.

### Task 13: Regenerar a grade e os relatórios após aprovação explícita

**Gate obrigatório:** esta tarefa não faz parte da prontidão técnica das Tasks 0–12.
Só começa depois de todas elas estarem concluídas e Gabriel escrever explicitamente
que aprova a regeneração integral com base no relatório da amostra.

Executar em uma nova branch/worktree criada a partir da integração aprovada das Tasks
0–12; não reabrir silenciosamente a branch técnica já finalizada.

**Files:**
- Create: novo diretório versionado sob `resultados/canonico/` com novo `run_id`
- Modify: `docs/RELATORIO-VARREDURA.md`
- Modify: `docs/RELATORIO-DECOMPOSICAO-CUSTO.md`
- Modify: `docs/RELATORIO-SENSIBILIDADE-CUSTO.md`
- Modify: `docs/RESUMO-EXECUTIVO-AMANDA.md`
- Modify: `docs/DIARIO-DE-MUDANCAS.md`

**Interfaces:**
- Consumes: motor aprovado, schema `2.0.0`, amostra da Task 11 e autorização de Gabriel.
- Produces: grade oficial e relatórios recalculados sob autonetting preferencial.

- [ ] **Step 1: Registrar a autorização e estimativa aprovada**

Confirmar no início da execução o escopo da grade, número de seeds, janelas, mixes,
tempo projetado e espaço de saída. Se qualquer um diferir da amostra aprovada, parar
e pedir nova decisão.

- [ ] **Step 2: Rodar a grade oficial em novo `run_id`**

Executar o comando oficial da base integrada com as mesmas seeds pareadas do estudo
anterior. Não sobrescrever nem alterar arquivos históricos.

- [ ] **Step 3: Verificar identidades e completude**

Para todas as linhas:

```text
autonetting + multilateral == casado
casado + remetido == bruto
economia por mecanismo == economia agregada
```

Conferir contagem esperada de células e seeds antes de publicar.

- [ ] **Step 4: Atualizar os quatro relatórios**

Separar claramente resultados antigos e novos. As conclusões novas usam as métricas
observadas; continuam valendo as ressalvas de dados sintéticos, custos não calibrados
e alíquotas incertas.

- [ ] **Step 5: Commit independente da regeneração**

```powershell
git add -f resultados/canonico
git add docs/RELATORIO-VARREDURA.md docs/RELATORIO-DECOMPOSICAO-CUSTO.md docs/RELATORIO-SENSIBILIDADE-CUSTO.md docs/RESUMO-EXECUTIVO-AMANDA.md docs/DIARIO-DE-MUDANCAS.md
git commit -m "analise: regenera resultados com autonetting preferencial (MOT-47)"
```
