# ADR: custo em bps com taxas assimétricas, não "% de netabilidade"

## Contexto

Uma métrica de resultado precisava ser escolhida para comparar cenários entre si e
decidir se um mix de clientes "compensa" ou não. A opção mais simples seria reportar
uma "taxa de netabilidade" isolada (% do volume que não atravessou a fronteira).

## Decisão

O motor mede custo em basis points por operação, com **taxas assimétricas por
direção e finalidade**, não como uma % de netabilidade solta. Confirmado em
`motor/custo.py` (`aliquota_iof`) e nos parâmetros usados tanto na varredura
(`PARAMETROS_VARREDURA`, `motor/varredura.py`) quanto no cenário de aceitação
(`motor/cenarios/exemplo_amanda.yaml`):

- `iof_out` = 3,5%
- `iof_in` = 0,38%
- `carry_cnr` = 0,04%

A alíquota de IOF, além disso, varia por `(finalidade do Anexo V, direção)` — câmbio
de importação e de exportação têm tratamento próprio, então duas taxas fixas por
direção não bastam (`aliquota_iof` cai em `iof_out`/`iof_in` só quando a finalidade
declarada não tem regra própria).

Uma % de netabilidade isolada é enganosa porque o mesmo percentual pode representar
custos reais muito diferentes dependendo de quanto do volume é `OUT` (3,5%) vs. `IN`
(0,38%) — e porque uma % pode subir ou descer por causa de um bug de modelagem, sem
nenhuma mudança real de mix de clientes. Isso aconteceu neste repositório: o
`docs/ARQUITETURA.md` registra que, antes da correção de MOT-11
(`fix/semantica-remessa-p0`), o P0 remetia o lote inteiro sempre que qualquer ordem
aberta vencia — um artefato do modelo, não uma escolha de política — e isso descartava
netting ainda possível para ordens que tinham folga. Corrigir esse artefato (o
resíduo passou a sair só no vencimento da própria ordem, nunca do lote inteiro) fez a
netabilidade observada, num diagnóstico de 200 cenários com buffers heterogêneos,
subir de **42,1% para 75,3%** — quase 33 pontos — sem nenhuma mudança na composição
de clientes ou nos parâmetros de custo. Medir só a % de netabilidade, sem entender de
onde ela vem, teria escondido que a diferença era um bug de semântica de remessa, não
um ganho real de política.

## Consequências

- Qualquer comparação entre cenários precisa reportar a decomposição de custo (IOF,
  carry, espera, fixo — ver `Custos` em `motor/custo.py`), não só uma % de
  netabilidade, para que um bug de semântica não seja confundido com um resultado de
  negócio.
- Trocar os parâmetros de `iof_out`/`iof_in`/`carry_cnr`/tabela por finalidade é uma
  mudança de dado de cenário (YAML), não de código — mas qualquer PR que mude esses
  valores muda os números de saída de todos os testes que dependem deles
  (`test_custo.py`, `test_custo_finalidade.py`, `test_varredura.py`) e precisa
  atualizar a entrada do diário.

Para contexto de negócio e proveniência, consultar o vault Obsidian.
