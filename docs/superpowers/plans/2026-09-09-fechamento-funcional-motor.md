# Fechamento Funcional do Motor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os defeitos confirmados nos relatórios e entregar um resultado analítico canônico, reconciliado e capaz de explicar ganho e contribuição por cliente.

**Architecture:** A política P0, o baseline e as fórmulas de custo permanecem no núcleo existente. Um novo pacote `motor.analise` consome o resultado agregado, produz ledger, rateio, análise marginal, estatísticas e manifesto; CLI, scripts e exportadores tornam-se consumidores dessa fonte única.

**Tech Stack:** Python 3.11+, `dataclasses`, `Decimal`, `csv`, `json`, `hashlib`, `pathlib`, NumPy, PyYAML e pytest.

**Spec:** `docs/superpowers/specs/2026-09-09-fechamento-funcional-motor-design.md`

## Global Constraints

- Preservar P0, EDF, desempate por ID, baseline imediato e fórmulas de custo atuais.
- Não implementar autonetting temporal anterior à pool.
- Permitir casamento entre ordens OUT e IN do mesmo cliente e incluí-lo na economia oficial.
- Manter os três indicadores incrementais somente em `diagnosticos_experimentais`.
- Manter `eh_efx` apenas como metadado e não ativar `visibilidade_dias_min/max`.
- Não incluir front-end, calendário civil, preços, dados reais, moedas/corredores ou regras jurídicas.
- Usar `Decimal` em todos os cálculos financeiros; JSON representa dinheiro e taxas por texto decimal.
- Usar W=1, W=2 e W=3 na grade oficial principal; W=7 é estresse.
- Usar 300 seeds únicas como padrão provisório configurável, sempre com ressalva de suficiência ainda não validada.
- Não tocar nem incluir em commits `motor/cenarios/fluxo_gabriel.yaml` ou `tests/test_exportar_player.py`, que já estavam não versionados no início do planejamento.
- Cada tarefa começa por teste falhando, termina com testes passando e recebe commit próprio no padrão `(MOT-14)`.

---

### Task 1: Fechar o contrato público do domínio

**Files:**
- Modify: `motor/dominio.py:29-105`
- Modify: `motor/mixes.py:30-59`
- Modify: `tests/test_dominio.py`
- Modify: `tests/test_mixes.py`

**Interfaces:**
- Consumes: `Ordem`, `ParametrosCusto`, `Cenario` e `validar_mix` existentes.
- Produces: entidades que rejeitam valores inválidos tanto pela API direta quanto pelo YAML.

- [ ] **Step 1: Escrever testes de falha da API direta**

Adicionar casos explícitos:

```python
def test_cenario_direto_rejeita_ids_duplicados(custo_zero):
    primeira = ordem(id="dup", cliente_id="a", valor_brl=Decimal("100"))
    segunda = ordem(id="dup", cliente_id="b", valor_brl=Decimal("100"))
    with pytest.raises(ValueError, match="id de ordem duplicado: 'dup'"):
        Cenario((primeira, segunda), janela_dias=1, horizonte_dias=0, custo=custo_zero)


@pytest.mark.parametrize("janela", [0, -1])
def test_cenario_rejeita_janela_nao_positiva(custo_zero, janela):
    with pytest.raises(ValueError, match="janela_dias deve ser >= 1"):
        Cenario((), janela_dias=janela, horizonte_dias=0, custo=custo_zero)


def test_cenario_rejeita_horizonte_negativo(custo_zero):
    with pytest.raises(ValueError, match="horizonte_dias deve ser >= 0"):
        Cenario((), janela_dias=1, horizonte_dias=-1, custo=custo_zero)
```

Adicionar testes para ID vazio, cliente vazio, `Decimal("NaN")`, PTAX zero, custos negativos, peso `nan` e peso `inf`.

- [ ] **Step 2: Executar os testes e confirmar a falha**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_dominio.py tests/test_mixes.py -q
```

Expected: FAIL nos novos casos porque `Cenario` e `ParametrosCusto` ainda não validam a construção direta e `validar_mix` aceita não finitos.

- [ ] **Step 3: Implementar validação na origem**

Adicionar `__post_init__` e helpers baseados em `Decimal.is_finite()` e `math.isfinite()`:

```python
def _decimal_finito_nao_negativo(nome: str, valor: Decimal) -> None:
    if not valor.is_finite() or valor < 0:
        raise ValueError(f"{nome} deve ser finito e não negativo, recebeu {valor!r}")


@dataclass(frozen=True)
class Cenario:
    ordens: tuple[Ordem, ...]
    janela_dias: int
    horizonte_dias: int
    custo: ParametrosCusto

    def __post_init__(self) -> None:
        if self.janela_dias < 1:
            raise ValueError(f"janela_dias deve ser >= 1, recebeu {self.janela_dias}")
        if self.horizonte_dias < 0:
            raise ValueError(f"horizonte_dias deve ser >= 0, recebeu {self.horizonte_dias}")
        _validar_ordens(self.ordens, self.horizonte_dias)
```

Copiar `iof_por_finalidade` para `MappingProxyType(dict(...))` em `ParametrosCusto.__post_init__` depois de validar chaves e valores. Em `validar_mix`, rejeitar qualquer peso para o qual `math.isfinite(peso)` seja falso.

- [ ] **Step 4: Rodar testes focados e suíte de domínio/netting**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_dominio.py tests/test_mixes.py tests/test_netting.py tests/test_integracao.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add motor/dominio.py motor/mixes.py tests/test_dominio.py tests/test_mixes.py
git commit -m "fix: valida contratos publicos do dominio (MOT-14)"
```

### Task 2: Tornar a conservação global uma invariante testável

**Files:**
- Modify: `motor/netting.py:157-179`
- Modify: `tests/test_netting.py`

**Interfaces:**
- Consumes: `tuple[Ordem, ...]` e `tuple[Ciclo, ...]`.
- Produces: `_validar_conservacao(ordens, ciclos) -> None`, chamado por `executar_p0` antes do retorno.

- [ ] **Step 1: Escrever regressões para volume global incorreto**

```python
def test_conservacao_global_rejeita_volume_ausente():
    ordem = _ordem("a", Direcao.OUT, "100", 0, 0)
    ciclo = Ciclo(0, (), Decimal("100"), Decimal(0), Decimal(0), Decimal(0), Direcao.OUT)
    with pytest.raises(ValueError, match="conservacao global violada"):
        _validar_conservacao((ordem,), (ciclo,))


def test_conservacao_global_aceita_particao_exata():
    ordem = _ordem("a", Direcao.OUT, "100", 0, 0)
    alocacao = Alocacao("a", 0, Decimal("100"), TipoAlocacao.REMETIDO)
    ciclo = Ciclo(0, (alocacao,), Decimal("100"), Decimal(0), Decimal(0), Decimal("100"), Direcao.OUT)
    _validar_conservacao((ordem,), (ciclo,))
```

- [ ] **Step 2: Confirmar que o helper ainda não existe**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_netting.py -k conservacao_global -q
```

Expected: FAIL na coleta por ausência de `_validar_conservacao`.

- [ ] **Step 3: Extrair e fortalecer a validação**

```python
def _validar_conservacao(ordens: tuple[Ordem, ...], ciclos: tuple[Ciclo, ...]) -> None:
    entrada = sum((ordem.valor_brl for ordem in ordens), Decimal(0))
    saida = sum(
        (alocacao.valor_brl for ciclo in ciclos for alocacao in ciclo.alocacoes),
        Decimal(0),
    )
    if entrada != saida:
        raise ValueError(f"conservacao global violada: entrada {entrada} != alocado {saida}")

    por_id: dict[str, Decimal] = {}
    for ciclo in ciclos:
        for alocacao in ciclo.alocacoes:
            por_id[alocacao.ordem_id] = por_id.get(alocacao.ordem_id, Decimal(0)) + alocacao.valor_brl
    for ordem in ordens:
        if por_id.get(ordem.id, Decimal(0)) != ordem.valor_brl:
            raise ValueError(
                f"conservacao violada em {ordem.id}: "
                f"alocado {por_id.get(ordem.id, Decimal(0))} != valor_brl {ordem.valor_brl}"
            )
```

Materializar `resultado = tuple(ciclos)`, validar e devolver `resultado`.

- [ ] **Step 4: Rodar netting e aceitação**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_netting.py tests/test_integracao.py tests/test_varredura.py::test_celula_do_grid_reproduz_o_numero_de_aceitacao_da_amanda -q
```

Expected: PASS e cenário Amanda sem alteração.

- [ ] **Step 5: Commit**

```powershell
git add motor/netting.py tests/test_netting.py
git commit -m "fix: verifica conservacao global do p0 (MOT-14)"
```

### Task 3: Criar o contrato do resultado canônico

**Files:**
- Create: `motor/analise/__init__.py`
- Create: `motor/analise/modelo.py`
- Create: `tests/test_resultado_canonico.py`

**Interfaces:**
- Consumes: `Resultado`, `Custos`, `Direcao` e `TipoAlocacao` existentes.
- Produces: `ModoAnalise`, `ConfiguracaoAnalise`, `EventoCliente`, `ResumoDiaCliente`, `ResultadoCliente`, `ContribuicaoMarginal`, `AgregadoCanonico`, `DiagnosticosExperimentais`, `ManifestoExecucao` e `ResultadoCanonico`.

- [ ] **Step 1: Escrever testes dos quatro modos e suas restrições**

```python
def test_configuracao_expoe_quatro_modos():
    assert {modo.value for modo in ModoAnalise} == {
        "AGREGADO", "POR_CLIENTE", "MARGINAL_SELECIONADOS", "COMPLETO"
    }


def test_marginal_selecionados_exige_ids():
    with pytest.raises(ValueError, match="clientes_marginais"):
        ConfiguracaoAnalise(ModoAnalise.MARGINAL_SELECIONADOS)


def test_completo_exige_limite_de_clientes():
    with pytest.raises(ValueError, match="max_clientes_marginal_completo"):
        ConfiguracaoAnalise(ModoAnalise.COMPLETO)
```

- [ ] **Step 2: Confirmar falha por módulo ausente**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_resultado_canonico.py -q
```

Expected: FAIL com `ModuleNotFoundError: motor.analise`.

- [ ] **Step 3: Implementar os tipos imutáveis**

Definir as assinaturas:

```python
class ModoAnalise(str, Enum):
    AGREGADO = "AGREGADO"
    POR_CLIENTE = "POR_CLIENTE"
    MARGINAL_SELECIONADOS = "MARGINAL_SELECIONADOS"
    COMPLETO = "COMPLETO"


@dataclass(frozen=True)
class ConfiguracaoAnalise:
    modo: ModoAnalise
    clientes_marginais: tuple[str, ...] = ()
    max_clientes_marginal_completo: int | None = None
    confirmar_alto_custo: bool = False


@dataclass(frozen=True)
class EventoCliente:
    evento_id: str
    cliente_id: str
    ordem_id: str
    dia_conhecida: int
    dia_resolucao: int | None
    tipo: str
    valor_brl: Decimal
    baseline: Custos
    netado: Custos
    ganho_realizado_brl: Decimal
    eh_efx: bool
```

Implementar também os contratos abaixo, sem campos implícitos ou dicionários sem schema:

```python
@dataclass(frozen=True)
class ResumoDiaCliente:
    cliente_id: str
    dia: int
    volume_conhecido_brl: Decimal
    volume_casado_brl: Decimal
    volume_remetido_brl: Decimal
    baseline_brl: Decimal
    custo_netado_brl: Decimal
    ganho_dia_brl: Decimal
    ganho_acumulado_brl: Decimal


@dataclass(frozen=True)
class ResultadoCliente:
    cliente_id: str
    volume_bruto_brl: Decimal
    volume_casado_brl: Decimal
    volume_remetido_brl: Decimal
    baseline: Custos
    netado: Custos
    ganho_proprio_brl: Decimal
    ganho_proprio_bps: Decimal
    historico_diario: tuple[ResumoDiaCliente, ...]


@dataclass(frozen=True)
class ContribuicaoMarginal:
    cliente_id: str
    ganho_proprio_brl: Decimal
    ganho_proprio_bps: Decimal
    contribuicao_marginal_total_brl: Decimal
    contribuicao_marginal_total_bps: Decimal
    efeito_sobre_demais_brl: Decimal
    efeito_sobre_demais_bps: Decimal


@dataclass(frozen=True)
class AgregadoCanonico:
    execucao_completa: Resultado
    ids_ordens_medidas: tuple[str, ...]
    volume_bruto_periodo_brl: Decimal
    volume_casado_periodo_brl: Decimal
    volume_remetido_periodo_brl: Decimal
    baseline_periodo: Custos
    netado_periodo: Custos
    economia_periodo_brl: Decimal
    taxa_netabilidade_periodo: Decimal


@dataclass(frozen=True)
class DiagnosticosExperimentais:
    limite_intra_cliente_brl: Decimal | None = None
    volume_casado_incremental_brl: Decimal | None = None
    taxa_netabilidade_incremental: Decimal | None = None


@dataclass(frozen=True)
class ManifestoExecucao:
    run_id: str
    schema_version: str
    versao_motor: str
    criado_em_utc: str
    hash_configuracao: str
    run_ids_origem: tuple[str, ...]
    parametros_custo: ParametrosCusto
    mixes: tuple[str, ...]
    arquetipos: tuple[str, ...]
    horizonte_dias: int
    janela_dias: int
    seeds: tuple[int, ...]
    modo_analise: ModoAnalise
    custo_calibrado: bool
    metodo_percentil: str
    drenagem: str
    avisos: tuple[str, ...]


@dataclass(frozen=True)
class ResultadoCanonico:
    manifesto: ManifestoExecucao
    agregado: AgregadoCanonico
    clientes: tuple[ResultadoCliente, ...]
    ledger_eventos: tuple[EventoCliente, ...]
    contribuicoes_marginais: tuple[ContribuicaoMarginal, ...]
    diagnosticos_experimentais: DiagnosticosExperimentais
    avisos: tuple[str, ...]
```

Nos modos que não solicitam uma seção, usar tupla vazia. Usar tuplas, não listas mutáveis, em todos os resultados. Cada novo arquivo de teste desta entrega define suas fábricas locais `_ordem`, `_custo` e `_cenario`, ou move implementações concretas compartilhadas para `tests/conftest.py`; não deixar nomes de fixtures sem implementação.

- [ ] **Step 4: Rodar os testes do contrato**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_resultado_canonico.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/__init__.py motor/analise/modelo.py tests/test_resultado_canonico.py
git commit -m "feat: define resultado analitico canonico (MOT-14)"
```

### Task 4: Implementar ledger e rateio por cliente

**Files:**
- Create: `motor/analise/clientes.py`
- Create: `tests/test_analise_clientes.py`
- Modify: `motor/analise/__init__.py`

**Interfaces:**
- Consumes: `Cenario`, `Resultado`, `Custos`, `EventoCliente` e `ResultadoCliente`.
- Produces: `analisar_clientes(cenario: Cenario, resultado: Resultado) -> tuple[tuple[EventoCliente, ...], tuple[ResultadoCliente, ...]]`.

- [ ] **Step 1: Escrever testes de reconciliação e ganho negativo**

```python
def test_rateio_dos_clientes_fecha_com_o_agregado(cenario_duas_pontas):
    resultado = simular(cenario_duas_pontas)
    eventos, clientes = analisar_clientes(cenario_duas_pontas, resultado)
    assert sum((c.baseline.total for c in clientes), Decimal(0)) == resultado.baseline.total
    assert sum((c.netado.total for c in clientes), Decimal(0)) == resultado.netado.total
    assert sum((c.ganho_proprio_brl for c in clientes), Decimal(0)) == resultado.economia


def test_cliente_pode_ter_ganho_negativo(cenario_com_espera_cara):
    resultado = simular(cenario_com_espera_cara)
    _, clientes = analisar_clientes(cenario_com_espera_cara, resultado)
    assert any(cliente.ganho_proprio_brl < 0 for cliente in clientes)
```

Adicionar casos para ordem em tranches, dois clientes remetidos no mesmo ciclo, soma do spread, soma da tarifa fixa e evento `ORDEM_CONHECIDA` sem ganho reconhecido.

- [ ] **Step 2: Confirmar falha por função ausente**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_analise_clientes.py -q
```

Expected: FAIL por ausência de `analisar_clientes`.

- [ ] **Step 3: Implementar rateio determinístico com resto explícito**

Usar helper que atribui o resto ao último item ordenado, garantindo soma exata:

```python
def _ratear(total: Decimal, pesos: tuple[tuple[str, Decimal], ...]) -> dict[str, Decimal]:
    ordenados = tuple(sorted(pesos))
    soma_pesos = sum((peso for _, peso in ordenados), Decimal(0))
    if total == 0:
        return {chave: Decimal(0) for chave, _ in ordenados}
    if soma_pesos <= 0:
        raise ValueError("rateio exige peso total positivo")
    resultado: dict[str, Decimal] = {}
    atribuido = Decimal(0)
    for chave, peso in ordenados[:-1]:
        parcela = total * peso / soma_pesos
        resultado[chave] = parcela
        atribuido += parcela
    resultado[ordenados[-1][0]] = total - atribuido
    return resultado
```

Aplicar as regras da especificação por componente. Criar eventos de entrada com custos zero e eventos de resolução com baseline proporcional e custos netados. Calcular resumos diários relativos e totais a partir dos eventos, sem calendário.

- [ ] **Step 4: Rodar testes focados e de custo**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_analise_clientes.py tests/test_custo.py tests/test_custo_finalidade.py -q
```

Expected: PASS e reconciliações exatas.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/__init__.py motor/analise/clientes.py tests/test_analise_clientes.py
git commit -m "feat: adiciona ledger e rateio tecnico por cliente (MOT-14)"
```

### Task 5: Implementar contribuição marginal e os modos de execução

**Files:**
- Create: `motor/analise/marginal.py`
- Create: `motor/analise/pipeline.py`
- Create: `tests/test_analise_marginal.py`
- Modify: `motor/analise/__init__.py`

**Interfaces:**
- Consumes: `ConfiguracaoAnalise`, `Cenario`, `simular` e `analisar_clientes`.
- Produces: `calcular_contribuicao_marginal(...) -> ContribuicaoMarginal` e `analisar(cenario, configuracao, manifesto) -> ResultadoCanonico`.

- [ ] **Step 1: Escrever testes dos cálculos marginais**

```python
def test_contribuicao_marginal_e_diferenca_com_e_sem_cliente(cenario_tres_clientes):
    completo = simular(cenario_tres_clientes)
    contribuicao = calcular_contribuicao_marginal(cenario_tres_clientes, "cliente-a")
    sem_a = simular(replace(
        cenario_tres_clientes,
        ordens=tuple(o for o in cenario_tres_clientes.ordens if o.cliente_id != "cliente-a"),
    ))
    assert contribuicao.contribuicao_marginal_total_brl == completo.economia - sem_a.economia
    assert contribuicao.efeito_sobre_demais_brl == (
        contribuicao.contribuicao_marginal_total_brl - contribuicao.ganho_proprio_brl
    )


def test_modo_agregado_nao_calcula_clientes(cenario_tres_clientes, manifesto):
    resultado = analisar(
        cenario_tres_clientes,
        ConfiguracaoAnalise(ModoAnalise.AGREGADO),
        manifesto,
    )
    assert resultado.clientes == ()
    assert resultado.contribuicoes_marginais == ()
```

Adicionar testes dos quatro modos, cliente inexistente, IDs selecionados duplicados, limite do modo completo e preservação byte a byte das ordens dos outros clientes.

- [ ] **Step 2: Confirmar falhas por módulos ausentes**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_analise_marginal.py -q
```

Expected: FAIL por ausência das funções.

- [ ] **Step 3: Implementar leave-one-client-out e despacho por modo**

```python
def calcular_contribuicao_marginal(cenario: Cenario, cliente_id: str) -> ContribuicaoMarginal:
    if cliente_id not in {ordem.cliente_id for ordem in cenario.ordens}:
        raise ValueError(f"cliente inexistente: {cliente_id!r}")
    cheio = simular(cenario)
    _, clientes = analisar_clientes(cenario, cheio)
    ganho = next(c.ganho_proprio_brl for c in clientes if c.cliente_id == cliente_id)
    sem_cliente = replace(
        cenario,
        ordens=tuple(o for o in cenario.ordens if o.cliente_id != cliente_id),
    )
    economia_sem = simular(sem_cliente).economia
    marginal = cheio.economia - economia_sem
    volume_cliente = sum(
        (o.valor_brl for o in cenario.ordens if o.cliente_id == cliente_id),
        Decimal(0),
    )
    volume_pool = sum((o.valor_brl for o in cenario.ordens), Decimal(0))
    return ContribuicaoMarginal.from_valores(
        cliente_id,
        ganho,
        marginal,
        volume_cliente,
        volume_pool,
    )
```

No pipeline, chamar `simular` uma vez para o agregado, `analisar_clientes` apenas nos três modos individuais e leave-one-out somente para a seleção determinada pelo modo.

- [ ] **Step 4: Rodar testes do pipeline e integração**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_analise_marginal.py tests/test_analise_clientes.py tests/test_integracao.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/__init__.py motor/analise/marginal.py motor/analise/pipeline.py tests/test_analise_marginal.py
git commit -m "feat: calcula contribuicao marginal sob demanda (MOT-14)"
```

### Task 6: Unificar percentis, seeds e precisão

**Files:**
- Create: `motor/analise/estatistica.py`
- Create: `tests/test_estatistica_canonica.py`
- Modify: `motor/varredura.py:488-672`
- Modify: `scripts/varredura_completa.py:77-105`
- Modify: `scripts/sensibilidade_custo.py:124-130`
- Modify: `scripts/estresse_sensibilidade.py`
- Modify: `scripts/projecao_fluxo_hipotetico.py`
- Modify: `tests/test_varredura.py`
- Modify: `tests/test_resumo.py`
- Modify: `tests/test_sensibilidade_custo.py`
- Modify: `tests/test_estresse_sensibilidade.py`
- Modify: `tests/test_projecao_fluxo_hipotetico.py`

**Interfaces:**
- Produces: `percentil_empirico(valores: Iterable[Decimal], q: Decimal) -> Decimal` e `validar_seeds_unicas(seeds: Sequence[int]) -> tuple[int, ...]`.
- Consumers: `resumir`, varredura completa, sensibilidade, estresse e projeção.

- [ ] **Step 1: Escrever testes da convenção aprovada**

```python
@pytest.mark.parametrize(
    ("q", "esperado"),
    [(Decimal("0.10"), Decimal("10")),
     (Decimal("0.50"), Decimal("50")),
     (Decimal("0.90"), Decimal("90"))],
)
def test_percentil_empirico_escolhe_resultado_real(q, esperado):
    valores = [Decimal(n) for n in range(10, 101, 10)]
    assert percentil_empirico(valores, q) == esperado


def test_seeds_duplicadas_sao_rejeitadas():
    with pytest.raises(ValueError, match="seeds duplicadas: \[1\]"):
        validar_seeds_unicas((1, 1, 2))
```

Adicionar regressão `_formatar("taxa_netabilidade_incremental", Decimal("0.0049")) == Decimal("0.004900")` enquanto o campo legado existir.

- [ ] **Step 2: Confirmar divergência atual**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_estatistica_canonica.py tests/test_varredura.py tests/test_resumo.py -q
```

Expected: FAIL porque os produtores usam métodos diferentes e seeds repetidas são aceitas.

- [ ] **Step 3: Implementar e substituir estatísticas duplicadas**

```python
def percentil_empirico(valores: Iterable[Decimal], q: Decimal) -> Decimal:
    ordenados = tuple(sorted(valores))
    if not ordenados:
        raise ValueError("percentil exige ao menos uma observação")
    if not Decimal(0) <= q <= Decimal(1):
        raise ValueError(f"q deve estar em [0,1], recebeu {q}")
    posto = max(1, int((q * len(ordenados)).to_integral_value(rounding=ROUND_CEILING)))
    return ordenados[posto - 1]
```

Remover `_mediana` e implementações privadas concorrentes. Fazer `resumir` usar `percentil_empirico(..., Decimal("0.50"))`. Validar seeds antes do laço. Adicionar as duas taxas incrementais ao mapa de seis casas decimais.

- [ ] **Step 4: Rodar estatística, resumo e scripts consumidores**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_estatistica_canonica.py tests/test_varredura.py tests/test_resumo.py tests/test_sensibilidade_custo.py tests/test_estresse_sensibilidade.py tests/test_projecao_fluxo_hipotetico.py -q
```

Expected: PASS com uma convenção única.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/estatistica.py motor/varredura.py scripts/varredura_completa.py scripts/sensibilidade_custo.py scripts/estresse_sensibilidade.py scripts/projecao_fluxo_hipotetico.py tests/test_estatistica_canonica.py tests/test_varredura.py tests/test_resumo.py tests/test_sensibilidade_custo.py tests/test_estresse_sensibilidade.py tests/test_projecao_fluxo_hipotetico.py
git commit -m "fix: unifica percentis seeds e precisao analitica (MOT-14)"
```

### Task 7: Separar período medido de liquidação e corrigir rótulos temporais

**Files:**
- Create: `motor/analise/temporal.py`
- Create: `tests/test_execucao_temporal.py`
- Modify: `motor/analise/pipeline.py`
- Modify: `motor/analise/clientes.py`
- Modify: `motor/analise/marginal.py`
- Modify: `scripts/projecao_fluxo_hipotetico.py:143-240`
- Modify: `tests/test_analise_clientes.py`
- Modify: `tests/test_analise_marginal.py`
- Modify: `tests/test_projecao_fluxo_hipotetico.py`

**Interfaces:**
- Produces: `ConfiguracaoTemporal`, `preparar_execucao_temporal(cenario, configuracao) -> ExecucaoTemporal` e `rotulo_periodo(periodo_medicao_dias) -> str`.
- `ExecucaoTemporal` contém cenário com horizonte estendido e IDs das coortes de aquecimento e medição.

- [ ] **Step 1: Escrever testes de liquidação natural e nomenclatura**

```python
def test_liquidacao_estende_execucao_ate_o_ultimo_vencimento(cenario_com_prazo_futuro):
    execucao = preparar_execucao_temporal(
        cenario_com_prazo_futuro,
        ConfiguracaoTemporal(dias_aquecimento=0, periodo_medicao_dias=30),
    )
    assert execucao.cenario.horizonte_dias == max(o.dia_limite for o in execucao.cenario.ordens)


def test_periodo_de_30_dias_nao_e_rotulado_anual():
    assert rotulo_periodo(30) == "periodo"


def test_somente_365_dias_e_rotulado_anual():
    assert rotulo_periodo(365) == "anual"


def test_agregado_oficial_contem_somente_a_coorte_medida(cenario_com_aquecimento, manifesto):
    resultado = analisar(
        cenario_com_aquecimento,
        ConfiguracaoAnalise(ModoAnalise.POR_CLIENTE),
        manifesto,
        configuracao_temporal=ConfiguracaoTemporal(dias_aquecimento=5, periodo_medicao_dias=30),
    )
    ids_medidos = {
        ordem.id for ordem in cenario_com_aquecimento.ordens
        if 5 <= ordem.dia_conhecida < 35
    }
    assert set(resultado.agregado.ids_ordens_medidas) == ids_medidos
    assert sum((c.ganho_proprio_brl for c in resultado.clientes), Decimal(0)) == resultado.agregado.economia_periodo_brl
```

Adicionar teste de que nenhuma ordem nova entra depois do período medido e teste de `fluxo_anual_central` usando `cadencia_mensal * Decimal(365) / Decimal(30)`.

- [ ] **Step 2: Confirmar falhas atuais**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_execucao_temporal.py tests/test_projecao_fluxo_hipotetico.py -q
```

Expected: FAIL por ausência da camada temporal e pela convenção anual divergente.

- [ ] **Step 3: Implementar configuração temporal sem mudar P0**

```python
@dataclass(frozen=True)
class ConfiguracaoTemporal:
    dias_aquecimento: int
    periodo_medicao_dias: int

    def __post_init__(self) -> None:
        if self.dias_aquecimento < 0 or self.periodo_medicao_dias <= 0:
            raise ValueError("aquecimento deve ser >= 0 e medição deve ser > 0")


def preparar_execucao_temporal(cenario: Cenario, configuracao: ConfiguracaoTemporal) -> ExecucaoTemporal:
    inicio = configuracao.dias_aquecimento
    fim_exclusivo = inicio + configuracao.periodo_medicao_dias
    medidas = tuple(o.id for o in cenario.ordens if inicio <= o.dia_conhecida < fim_exclusivo)
    aquecimento = tuple(o.id for o in cenario.ordens if o.dia_conhecida < inicio)
    horizonte_execucao = max(
        fim_exclusivo - 1,
        max((o.dia_limite for o in cenario.ordens), default=fim_exclusivo - 1),
    )
    return ExecucaoTemporal(replace(cenario, horizonte_dias=horizonte_execucao), aquecimento, medidas)
```

O pipeline simula `execucao.cenario` por inteiro para preservar as invariantes globais. Em seguida, usa o mesmo rateio técnico de `clientes.py` para selecionar eventos cujos `ordem_id` pertencem a `ids_ordens_medidas` e construir `AgregadoCanonico`: baseline, custo netado, ganho e volumes oficiais são somas dessa coorte; `execucao_completa` preserva o resultado integral. No modo por cliente, filtrar também os resumos publicados para a coorte medida e reconciliá-los com `AgregadoCanonico`. A contribuição marginal temporal repete a mesma preparação e compara `economia_periodo_brl` com e sem todas as ordens do cliente, inclusive as de aquecimento; nunca compara um agregado integral com uma coorte filtrada. A geração oficial cria ordens apenas nos `dias_aquecimento + periodo_medicao_dias`; depois disso, somente liquida ordens já conhecidas.

Na projeção, exigir 365 dias para nomes anuais; para outros períodos, emitir campos `_do_periodo`. Corrigir a tabela de cadência para a mesma base de 30 dias do gerador. O manifesto registra `drenagem="NATURAL"`; a opção rápida antiga registra `drenagem="FORCADA_LEGADA"`.

- [ ] **Step 4: Rodar tempo, geração e projeção**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_execucao_temporal.py tests/test_tempo.py tests/test_geracao.py tests/test_projecao_fluxo_hipotetico.py -q
```

Expected: PASS e nenhuma drenagem antecipada no caminho oficial.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/temporal.py motor/analise/pipeline.py motor/analise/clientes.py motor/analise/marginal.py scripts/projecao_fluxo_hipotetico.py tests/test_execucao_temporal.py tests/test_analise_clientes.py tests/test_analise_marginal.py tests/test_projecao_fluxo_hipotetico.py
git commit -m "fix: separa medicao e liquidacao natural (MOT-14)"
```

### Task 8: Criar manifesto e serialização decimal exata

**Files:**
- Create: `motor/analise/serializacao.py`
- Create: `tests/test_serializacao_canonica.py`
- Modify: `motor/analise/pipeline.py`

**Interfaces:**
- Produces: `TabelaCsvCanonica`, `PacoteExecucao`, `criar_manifesto(...) -> ManifestoExecucao`, `resultado_para_json(resultado) -> str`, `escrever_json(resultado, path) -> None`, `escrever_csv_canonico(tabela, path) -> None` e `validar_compatibilidade(manifestos) -> None`.
- `PacoteExecucao` agrupa um manifesto, um ou mais `ResultadoCanonico` do mesmo `run_id` e tabelas derivadas com schema explícito; assim uma varredura inteira é publicada atomicamente sem fingir que uma célula é a execução completa.

- [ ] **Step 1: Escrever testes de precisão e incompatibilidade**

```python
def test_json_preserva_decimal_como_texto(resultado_canonico):
    documento = json.loads(resultado_para_json(resultado_canonico))
    assert documento["agregado"]["economia_periodo_brl"] == "1026000.000000"


def test_manifestos_com_parametros_diferentes_nao_podem_ser_combinados(manifesto_a, manifesto_b):
    incompatível = replace(manifesto_b, hash_configuracao="outro")
    with pytest.raises(ValueError, match="hash_configuracao incompatível"):
        validar_compatibilidade((manifesto_a, incompatível))
```

Adicionar testes para schema diferente, run ID ausente, componentes de custo no manifesto e serialização determinística com chaves ordenadas.

- [ ] **Step 2: Confirmar falha por serializador ausente**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_serializacao_canonica.py -q
```

Expected: FAIL por ausência das interfaces.

- [ ] **Step 3: Implementar normalização e hash canônicos**

```python
SCHEMA_VERSION = "1.0.0"


@dataclass(frozen=True)
class TabelaCsvCanonica:
    nome_arquivo: str
    colunas: tuple[str, ...]
    linhas: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class PacoteExecucao:
    manifesto: ManifestoExecucao
    resultados: tuple[ResultadoCanonico, ...]
    tabelas: tuple[TabelaCsvCanonica, ...]


def _jsonavel(valor: object) -> object:
    if isinstance(valor, Decimal):
        return format(valor, "f")
    if dataclasses.is_dataclass(valor):
        return {campo.name: _jsonavel(getattr(valor, campo.name)) for campo in dataclasses.fields(valor)}
    if isinstance(valor, Enum):
        return valor.value
    if isinstance(valor, tuple):
        return [_jsonavel(item) for item in valor]
    if isinstance(valor, dict):
        return {str(chave): _jsonavel(valor[chave]) for chave in sorted(valor, key=str)}
    return valor


def resultado_para_json(resultado: ResultadoCanonico) -> str:
    return json.dumps(_jsonavel(resultado), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
```

Gerar `hash_configuracao` com SHA-256 do JSON canônico da configuração e `run_id` com instante UTC mais os primeiros 12 caracteres do hash. Injetar relógio e versão do motor nos testes para evitar flutuação. Validar que todo resultado do pacote carrega exatamente o mesmo `run_id`, schema e hash do manifesto do pacote e que `nome_arquivo` é somente um nome seguro, sem diretórios.

- [ ] **Step 4: Rodar serialização e pipeline**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_serializacao_canonica.py tests/test_resultado_canonico.py tests/test_analise_marginal.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/serializacao.py motor/analise/pipeline.py tests/test_serializacao_canonica.py
git commit -m "feat: adiciona manifesto e serializacao canonica (MOT-14)"
```

### Task 9: Publicar cada execução de forma atômica

**Files:**
- Modify: `motor/analise/serializacao.py`
- Create: `tests/test_publicacao_atomica.py`

**Interfaces:**
- Produces: `publicar_execucao(pacote: PacoteExecucao, destino_raiz: Path) -> Path`.
- Garante diretório final `<destino_raiz>/<run_id>` somente depois de todas as validações.

- [ ] **Step 1: Escrever testes de falha sem saída parcial**

```python
def test_falha_na_escrita_nao_publica_diretorio_final(tmp_path, pacote_execucao, monkeypatch):
    def falhar(*args, **kwargs):
        raise OSError("falha simulada")
    monkeypatch.setattr(serializacao, "escrever_csv_canonico", falhar)
    with pytest.raises(OSError, match="falha simulada"):
        publicar_execucao(pacote_execucao, tmp_path)
    assert not (tmp_path / pacote_execucao.manifesto.run_id).exists()


def test_nao_sobrescreve_run_existente(tmp_path, pacote_execucao):
    publicar_execucao(pacote_execucao, tmp_path)
    with pytest.raises(FileExistsError):
        publicar_execucao(pacote_execucao, tmp_path)
```

- [ ] **Step 2: Confirmar falha por função ausente**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_publicacao_atomica.py -q
```

Expected: FAIL.

- [ ] **Step 3: Implementar staging e promoção**

Criar diretório temporário irmão com `tempfile.mkdtemp(dir=destino_raiz)`, escrever JSON, CSVs e manifesto, executar reconciliações, então promover com `Path.replace`. Em `except`, remover somente o diretório temporário criado pela função e relançar a exceção. Verificar o caminho resolvido antes da limpeza.

```python
def publicar_execucao(pacote: PacoteExecucao, destino_raiz: Path) -> Path:
    destino_raiz.mkdir(parents=True, exist_ok=True)
    final = destino_raiz / pacote.manifesto.run_id
    if final.exists():
        raise FileExistsError(final)
    temporario = Path(tempfile.mkdtemp(prefix=".motor-", dir=destino_raiz))
    try:
        _escrever_conjunto(pacote, temporario)
        _validar_conjunto_publicado(pacote, temporario)
        temporario.replace(final)
        return final
    except Exception:
        shutil.rmtree(temporario)
        raise
```

- [ ] **Step 4: Rodar testes de publicação**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_publicacao_atomica.py tests/test_serializacao_canonica.py -q
```

Expected: PASS e nenhum diretório final parcial.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/serializacao.py tests/test_publicacao_atomica.py
git commit -m "feat: publica execucoes analiticas atomicamente (MOT-14)"
```

### Task 10: Corrigir entradas encadeadas da sensibilidade e do estresse

**Files:**
- Modify: `scripts/sensibilidade_custo.py:213-527`
- Modify: `scripts/estresse_sensibilidade.py:115-336`
- Modify: `tests/test_sensibilidade_custo.py`
- Modify: `tests/test_estresse_sensibilidade.py`

**Interfaces:**
- Consumes: manifestos e `validar_compatibilidade`.
- Produces: índices que rejeitam duplicatas, reconciliam exposições e validam todos os argumentos antes de escrever.

- [ ] **Step 1: Escrever regressões das falhas confirmadas**

```python
def test_exposicao_iof_duplicada_e_rejeitada():
    linhas = [exposicao("ATIVOS", "OUT", "1"), exposicao("ATIVOS", "OUT", "2")]
    with pytest.raises(ValueError, match="exposicao IOF duplicada"):
        indexar_exposicoes_iof(linhas)


def test_exposicoes_incompletas_nao_viram_zero_silenciosamente(produto, exposicoes_sem_ativos):
    with pytest.raises(ValueError, match="exposicoes IOF nao reconciliam"):
        reprecificar_economia(produto, exposicoes_sem_ativos, CENARIOS[0])


def test_csv_de_spread_25_nao_e_reprecificado_com_base_50(registro_spread_25, manifesto_spread_50):
    with pytest.raises(ValueError, match="parametros-base incompativeis"):
        decompor_linha_grade(registro_spread_25, manifesto_spread_50)
```

- [ ] **Step 2: Confirmar que os casos passam silenciosamente hoje**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_sensibilidade_custo.py tests/test_estresse_sensibilidade.py -q
```

Expected: FAIL nos novos testes.

- [ ] **Step 3: Validar proveniência e reconciliação antes da escrita**

Trocar atribuição silenciosa no índice por verificação explícita:

```python
if chave in indice:
    raise ValueError(f"exposicao IOF duplicada: {chave}")
indice[chave] = exposicao
```

Antes de reprecificar, somar exposições por carteira e exigir igualdade com as bases de IOF da linha do produto. Ler os parâmetros-base do manifesto do dataset, nunca de `PARAMETROS_VARREDURA` atual. Em `main`, validar mixes, seeds, arquivos e manifestos antes da primeira chamada de escrita.

- [ ] **Step 4: Rodar os testes da cadeia econômica**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_sensibilidade_custo.py tests/test_estresse_sensibilidade.py tests/test_projecao_fluxo_hipotetico.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/sensibilidade_custo.py scripts/estresse_sensibilidade.py tests/test_sensibilidade_custo.py tests/test_estresse_sensibilidade.py
git commit -m "fix: valida proveniencia e exposicoes de custo (MOT-14)"
```

### Task 11: Tornar as análises comandos oficiais e corrigir a CLI

**Files:**
- Create: `motor/analise/comandos.py`
- Create: `motor/analise/varredura_oficial.py`
- Create: `motor/analise/custos.py`
- Create: `motor/analise/estresse.py`
- Create: `motor/analise/projecao.py`
- Modify: `motor/__main__.py`
- Modify: `scripts/varredura_completa.py`
- Modify: `scripts/sensibilidade_custo.py`
- Modify: `scripts/estresse_sensibilidade.py`
- Modify: `scripts/projecao_fluxo_hipotetico.py`
- Modify: `tests/test_cli.py`
- Create: `tests/test_comandos_analiticos.py`

**Interfaces:**
- Produces subcomandos: `simular`, `varrer`, `analisar-custos`, `estressar`, `projetar`, `analisar-clientes` e `validar-execucao`.
- Scripts antigos chamam as funções de `motor.analise.comandos` e não contêm fórmulas próprias.

- [ ] **Step 1: Escrever testes dos comandos e da semântica oficial**

```python
def test_help_lista_todos_os_comandos(capsys):
    assert main(["motor", "--help"]) == 0
    saida = capsys.readouterr().out
    for comando in ("simular", "varrer", "analisar-custos", "estressar", "projetar", "analisar-clientes", "validar-execucao"):
        assert comando in saida


def test_cli_nao_afirma_que_autonetting_nao_pertence_ao_produto(capsys, tmp_path):
    codigo = main(argumentos_varredura_minima(tmp_path))
    texto = capsys.readouterr().out
    assert codigo == 0
    assert "descontado o que cada cliente casaria sozinho" not in texto
```

Adicionar testes de que cada comando chama o pipeline canônico e publica um diretório com manifesto.

- [ ] **Step 2: Confirmar falhas no help e no texto antigo**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_cli.py tests/test_comandos_analiticos.py -q
```

Expected: FAIL porque os subcomandos não existem e a frase antiga permanece.

- [ ] **Step 3: Implementar comandos finos e adaptadores**

Definir funções `cmd_simular`, `cmd_varrer`, `cmd_analisar_custos`, `cmd_estressar`, `cmd_projetar`, `cmd_analisar_clientes` e `cmd_validar_execucao`. Cada função apenas parseia argumentos, cria configurações, chama o módulo analítico correspondente e publica um novo diretório atômico. `cmd_validar_execucao` relê manifesto e CSVs, recalcula as identidades de conservação/custos/clientes e imprime `VALIDO` somente se todas fecharem. Manter temporariamente `python -m motor <cenario.yaml>` como alias de `simular`.

Mover o código puro dos scripts para destinos explícitos:

- `motor/analise/varredura_oficial.py`: grade, agregação entre seeds, variância e formatação;
- `motor/analise/custos.py`: decomposição e reprecificação de cenários de custo;
- `motor/analise/estresse.py`: cenários adversos e suas agregações;
- `motor/analise/projecao.py`: projeção por período e rótulos;
- `motor/analise/comandos.py`: apenas CLI e orquestração de leitura/publicação.

Todo comando derivado recebe o diretório exato da execução de origem em `--entrada`, valida seu manifesto antes do cálculo, cria outro `run_id` e grava o `run_id` original em `manifesto.run_ids_origem`. Nenhum comando acrescenta arquivos num diretório de execução já publicado. Durante a migração, os scripts podem reexportar por importação os nomes públicos que seus testes/consumidores existentes usam, mas a implementação desses nomes vive somente em `motor.analise`.

Nos scripts, reduzir `main()` a importação e delegação:

```python
from motor.analise.comandos import cmd_estressar


def main(argv: Sequence[str] | None = None) -> int:
    return cmd_estressar(argv)
```

Mover fórmulas reutilizáveis para os módulos oficiais antes de delegar; não duplicar código entre pacote e scripts.

- [ ] **Step 4: Rodar CLI e testes analíticos**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_cli.py tests/test_comandos_analiticos.py tests/test_varredura.py tests/test_sensibilidade_custo.py tests/test_estresse_sensibilidade.py tests/test_projecao_fluxo_hipotetico.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add motor/__main__.py motor/analise/comandos.py motor/analise/varredura_oficial.py motor/analise/custos.py motor/analise/estresse.py motor/analise/projecao.py scripts/varredura_completa.py scripts/sensibilidade_custo.py scripts/estresse_sensibilidade.py scripts/projecao_fluxo_hipotetico.py tests/test_cli.py tests/test_comandos_analiticos.py
git commit -m "feat: oficializa comandos da camada analitica (MOT-14)"
```

### Task 12: Atualizar a grade oficial e marcar o legado

**Files:**
- Modify: `motor/analise/comandos.py`
- Modify: `scripts/varredura_completa.py:39-46`
- Modify: `docs/dicionario-csv.md`
- Modify: `docs/RELATORIO-VARREDURA.md`
- Modify: `docs/RELATORIO-DECOMPOSICAO-CUSTO.md`
- Modify: `docs/RELATORIO-SENSIBILIDADE-CUSTO.md`
- Modify: `docs/RESUMO-EXECUTIVO-AMANDA.md`
- Modify: `tests/test_comandos_analiticos.py`

**Interfaces:**
- Grade principal: `VALORES_W = (1, 2, 3)`.
- Estresse: `VALORES_W_ESTRESSE = (7,)`.
- Seeds oficiais provisórias: `tuple(range(1, 301))`.
- Comparação: `comparar_janelas(registros, limite_espera_dias=None) -> ComparacaoJanelas`, sempre pareada por mix, N e seed.

- [ ] **Step 1: Escrever teste da grade aprovada e das ressalvas**

```python
REGISTROS_PAREADOS = tuple(
    RegistroComparacaoJanela("equilibrado", 10, seed, w, economia, espera)
    for seed in (1, 2)
    for w, economia, espera in (
        (1, Decimal("100"), Decimal("1.0")),
        (2, Decimal("120"), Decimal("1.5")),
        (3, Decimal("140"), Decimal("2.0")),
    )
)
REGISTROS_COM_SEED_AUSENTE = REGISTROS_PAREADOS[:-1]


def test_grade_oficial_usa_janelas_1_2_3_e_estresse_7():
    assert CONFIGURACAO_GRADE.valores_w == (1, 2, 3)
    assert CONFIGURACAO_ESTRESSE.valores_w == (7,)
    assert CONFIGURACAO_GRADE.seeds == tuple(range(1, 301))


def test_manifesto_avisa_que_300_seeds_ainda_nao_foram_validadas(manifesto_grade):
    assert "suficiencia estatistica nao validada" in manifesto_grade.avisos


def test_sem_limite_de_espera_nao_escolhe_uma_janela_sozinha():
    comparacao = comparar_janelas(REGISTROS_PAREADOS, limite_espera_dias=None)
    assert comparacao.janela_recomendada is None
    assert comparacao.janelas_nao_dominadas == (1, 2, 3)


def test_com_limite_recomenda_maior_economia_dentro_da_espera():
    comparacao = comparar_janelas(REGISTROS_PAREADOS, limite_espera_dias=Decimal("1.5"))
    assert comparacao.janela_recomendada == 2


def test_comparacao_rejeita_seeds_nao_pareadas():
    with pytest.raises(ValueError, match="comparacao de W exige as mesmas pools e seeds"):
        comparar_janelas(REGISTROS_COM_SEED_AUSENTE)
```

- [ ] **Step 2: Confirmar falha porque a grade ainda é W=1/7**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_comandos_analiticos.py -q
```

Expected: FAIL.

- [ ] **Step 3: Atualizar configuração e documentação antes de regenerar**

Configurar W=1/2/3 no produto principal e W=7 no comando de estresse. Criar em `varredura_oficial.py` os dataclasses imutáveis `RegistroComparacaoJanela(mix: str, n_clientes: int, seed: int, janela_dias: int, economia_brl: Decimal, espera_media_dias: Decimal)` e `ComparacaoJanelas(janelas_nao_dominadas: tuple[int, ...], janela_recomendada: int | None)`.

Agrupar registros pela chave `(mix, n_clientes, seed, demais parâmetros exceto W)`, exigir exatamente os mesmos pares em todos os W e calcular as opções não dominadas: uma janela domina outra somente quando tem economia maior ou igual e espera menor ou igual, com pelo menos uma desigualdade estrita. Sem `limite_espera_dias`, publicar o trade-off sem recomendação. Com limite, escolher a maior economia média entre as janelas que atendem ao limite, desempatar por menor espera e depois menor W; se nenhuma atender, não recomendar.

Atualizar o dicionário com schemas canônicos, definição correta de truncamento, percentil empírico e diagnóstico incremental experimental. Marcar os números dos relatórios existentes como `LEGADO — gerado antes do schema canônico` sem alterar os CSVs antigos.

- [ ] **Step 4: Rodar testes da configuração e documentação**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_comandos_analiticos.py tests/test_varredura.py tests/test_resumo.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add motor/analise/comandos.py scripts/varredura_completa.py docs/dicionario-csv.md docs/RELATORIO-VARREDURA.md docs/RELATORIO-DECOMPOSICAO-CUSTO.md docs/RELATORIO-SENSIBILIDADE-CUSTO.md docs/RESUMO-EXECUTIVO-AMANDA.md tests/test_comandos_analiticos.py
git commit -m "docs: fixa grade oficial e identifica resultados legados (MOT-14)"
```

### Task 13: Regenerar os resultados oficiais pelo pipeline canônico

**Files:**
- Create: `resultados/canonico/varredura/{run_id}/manifesto.json`
- Create: `resultados/canonico/varredura/{run_id}/varredura_principal.csv`
- Create: `resultados/canonico/custos/{run_id}/manifesto.json`
- Create: `resultados/canonico/custos/{run_id}/sensibilidade.csv`
- Create: `resultados/canonico/estresse/{run_id}/manifesto.json`
- Create: `resultados/canonico/estresse/{run_id}/varredura_estresse_w7.csv`
- Create: `resultados/canonico/projecao/{run_id}/manifesto.json`
- Create: `resultados/canonico/projecao/{run_id}/projecao.csv`
- Modify: `docs/RELATORIO-VARREDURA.md`
- Modify: `docs/RELATORIO-DECOMPOSICAO-CUSTO.md`
- Modify: `docs/RELATORIO-SENSIBILIDADE-CUSTO.md`
- Modify: `docs/RESUMO-EXECUTIVO-AMANDA.md`

**Interfaces:**
- Consumes: comandos oficiais e publicação atômica.
- Produces: um conjunto canônico completo, reconciliado e referenciado pelos relatórios.

- [ ] **Step 1: Executar uma grade mínima de ensaio**

Run:

```powershell
.\.venv\Scripts\python.exe -m motor varrer --mixes equilibrado --n 2 --w 1,2,3 --seeds 1,2 --horizonte 30 --saida resultados/ensaio
```

Expected: diretório único com manifesto completo, seis pontos e nenhum arquivo parcial.

- [ ] **Step 2: Validar o ensaio automaticamente**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_serializacao_canonica.py tests/test_publicacao_atomica.py tests/test_comandos_analiticos.py -q
```

Expected: PASS.

- [ ] **Step 3: Executar a bateria oficial**

Run, em ordem:

```powershell
.\.venv\Scripts\python.exe -m motor varrer --perfil oficial --saida resultados/canonico/varredura
if ($LASTEXITCODE -ne 0) { throw "falha na varredura oficial" }
$gradeRunDir = Get-ChildItem -LiteralPath resultados/canonico/varredura -Directory | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
.\.venv\Scripts\python.exe -m motor analisar-custos --entrada $gradeRunDir.FullName --saida resultados/canonico/custos
if ($LASTEXITCODE -ne 0) { throw "falha na analise de custos" }
.\.venv\Scripts\python.exe -m motor estressar --entrada $gradeRunDir.FullName --saida resultados/canonico/estresse
if ($LASTEXITCODE -ne 0) { throw "falha no estresse" }
.\.venv\Scripts\python.exe -m motor projetar --entrada $gradeRunDir.FullName --saida resultados/canonico/projecao
if ($LASTEXITCODE -ne 0) { throw "falha na projecao" }
```

Expected: cada comando conclui com manifesto compatível; W=1/2/3 aparece na grade principal, W=7 no estresse e todas as seeds são únicas.

- [ ] **Step 4: Recalcular tabelas e atualizar os quatro relatórios**

Substituir números legados apenas por valores extraídos dos quatro novos diretórios de execução. Cada relatório informa os `run_id` que usa, hashes, schemas, período, seeds, custos não calibrados e método de percentil. Não reaproveitar números antigos por cópia manual.

- [ ] **Step 5: Conferir identidades dos arquivos regenerados**

Run:

```powershell
$canonicalCategories = 'varredura','custos','estresse','projecao'
$officialRunDirs = foreach ($canonicalCategory in $canonicalCategories) {
    Get-ChildItem -LiteralPath (Join-Path 'resultados/canonico' $canonicalCategory) -Directory |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
}
foreach ($officialRunDir in $officialRunDirs) {
    .\.venv\Scripts\python.exe -m motor validar-execucao $officialRunDir.FullName
    if ($LASTEXITCODE -ne 0) { throw "execucao canonica invalida: $($officialRunDir.FullName)" }
}
```

Expected: quatro linhas `VALIDO`, uma por execução, com zero diferenças de conservação, custo, cliente e proveniência.

- [ ] **Step 6: Commit**

Adicionar exatamente os quatro diretórios oficiais, seus manifestos/CSVs e os quatro relatórios; não adicionar `resultados/ensaio` nem diretórios temporários. Como CSVs são ignorados globalmente hoje, usar `-f` somente no caminho canônico explícito.

```powershell
git add -f resultados/canonico/varredura resultados/canonico/custos resultados/canonico/estresse resultados/canonico/projecao
git add docs/RELATORIO-VARREDURA.md docs/RELATORIO-DECOMPOSICAO-CUSTO.md docs/RELATORIO-SENSIBILIDADE-CUSTO.md docs/RESUMO-EXECUTIVO-AMANDA.md
git commit -m "analise: regenera resultados pelo motor canonico (MOT-14)"
```

### Task 14: Verificação final e preparação para integração

**Files:**
- Modify: `docs/DIARIO-DE-MUDANCAS.md`
- Modify: `docs/MAPA.md`
- Modify: `README.md`
- Modify: `docs/testing.md`
- Verify: all tracked implementation and test files changed by Tasks 1-13

**Interfaces:**
- Produces: branch verificada, documentação atualizada e pronta para o fluxo de integração.

- [ ] **Step 1: Atualizar documentação operacional**

Registrar comandos oficiais, quatro modos de análise, ledger, manifesto, limitações de custos, diagnóstico incremental experimental, W=1/2/3 e W=7 de estresse. Atualizar a contagem de testes somente depois da coleta real.

- [ ] **Step 2: Rodar a suíte normal completa**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: todos os testes passam; registrar a contagem exata emitida, sem antecipá-la no plano.

- [ ] **Step 3: Rodar a suíte completa com otimização**

Run:

```powershell
.\.venv\Scripts\python.exe -O -m pytest -q
```

Expected: todos os testes passam; somente o aviso esperado do pytest sobre asserts em testes pode aparecer.

- [ ] **Step 4: Reproduzir o cenário de aceitação**

Run:

```powershell
.\.venv\Scripts\python.exe -m motor simular motor/cenarios/exemplo_amanda.yaml
```

Expected:

```text
baseline: 2370600.000000 BRL
netado:   1344600.000000 BRL
economia: 1026000.000000 BRL
taxa de netabilidade: 58.82%
```

- [ ] **Step 5: Conferir escopo e worktree**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -15
```

Expected: nenhum erro de whitespace; somente mudanças intencionais; os arquivos preexistentes `motor/cenarios/fluxo_gabriel.yaml` e `tests/test_exportar_player.py` continuam fora dos commits.

- [ ] **Step 6: Commit documental final**

```powershell
git add README.md docs/DIARIO-DE-MUDANCAS.md docs/MAPA.md docs/testing.md
git commit -m "docs: fecha contrato funcional do motor (MOT-14)"
```

- [ ] **Step 7: Solicitar revisão e usar o fluxo de finalização**

Executar `superpowers:requesting-code-review`, corrigir somente achados confirmados, repetir Steps 2-5 e então usar `superpowers:finishing-a-development-branch`. Não fazer merge nem push sem a escolha explícita do Gabriel no fluxo de finalização.
