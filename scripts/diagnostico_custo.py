"""Descartavel: decompoe a economia do netting e mede sensibilidade. Nao altera o motor."""
from __future__ import annotations
from collections import defaultdict
from dataclasses import replace
from decimal import Decimal

from motor.custo import aliquota_iof, custo_baseline, custo_netado
from motor.dominio import Cenario, Direcao, TipoAlocacao
from motor.mixes import TODOS as MIXES
from motor.netting import executar_p0
from motor.varredura import PARAMETROS_VARREDURA, montar_pool_do_ponto

MIX, N, H, SEED, W = "equilibrado", 12, 365, 42, 7
BPS = Decimal(10000)

pool = montar_pool_do_ponto(MIXES[MIX], N, H, SEED)
cen = Cenario(ordens=pool, janela_dias=W, horizonte_dias=H, custo=PARAMETROS_VARREDURA)
ciclos = executar_p0(cen)
b, n = custo_baseline(cen), custo_netado(ciclos, cen)
ordem_por_id = {o.id: o for o in pool}
bruto = sum((o.valor_brl for o in pool), Decimal(0))

# --- Parte 3: decomposicao a partir das alocacoes, nao da subtracao dos totais ---
iof_evit = Decimal(0); casado_vol = Decimal(0); interno = Decimal(0)
for c in ciclos:
    for a in c.alocacoes:
        o = ordem_por_id[a.ordem_id]
        if a.tipo is TipoAlocacao.CASADO:
            iof_evit += a.valor_brl * aliquota_iof(cen.custo, o.finalidade, o.direcao)
            casado_vol += a.valor_brl
            interno += a.valor_brl * cen.custo.carry_cnr
spread_evit = casado_vol * cen.custo.spread_rail_bps / BPS
n_ciclos_com_residuo = sum(1 for c in ciclos if c.residuo > 0)
fixo_evit = (len(pool) - n_ciclos_com_residuo) * cen.custo.custo_fixo_remessa
economia = b.total - n.total
soma = iof_evit + spread_evit + fixo_evit - interno

print(f"POOL mix={MIX} N={N} H={H} seed={SEED} W={W} ordens={len(pool)} ciclos={len(ciclos)}")
print(f"bruto={bruto:.2f} casado(2 pernas)={casado_vol:.2f} netab={casado_vol/bruto:.4f}")
print(f"BASE iof={b.iof:.2f} carry={b.carry:.2f} spread={b.spread:.2f} espera={b.espera:.2f} fixo={b.fixo:.2f} tot={b.total:.2f}")
print(f"NET  iof={n.iof:.2f} carry={n.carry:.2f} spread={n.spread:.2f} espera={n.espera:.2f} fixo={n.fixo:.2f} tot={n.total:.2f}")
print("--- DECOMPOSICAO ---")
for nome, v in [("iof_evitado", iof_evit), ("spread_evitado", spread_evit),
                ("custo_fixo_evitado", Decimal(fixo_evit)), ("custo_interno_criado", -interno)]:
    print(f"{nome:22s} {v:>16.2f}  {v/economia*100:>7.2f}%")
print(f"{'SOMA':22s} {soma:>16.2f}   economia={economia:.2f}  delta={soma-economia:.10f}  FECHOU={soma==economia}")

# --- Parte 4: sensibilidade ao custo interno ---
print("--- SENSIBILIDADE carry_cnr ---")
for v in ["0", "0.0004", "0.0010", "0.0020", "0.0040"]:
    c2 = replace(cen, custo=replace(cen.custo, carry_cnr=Decimal(v)))
    ci = executar_p0(c2)
    e = custo_baseline(c2).total - custo_netado(ci, c2).total
    cas = sum((a.valor_brl for k in ci for a in k.alocacoes if a.tipo is TipoAlocacao.CASADO), Decimal(0))
    print(f"carry={v:>7s} economia={e:>14.2f} bps_bruto={e/bruto*BPS:>8.2f} casado={cas:.2f}")

# --- Parte 5: heterogeneidade ---
print("--- VOLUME POR (FINALIDADE, DIRECAO) ---")
vol = defaultdict(Decimal)
for o in pool:
    vol[(o.finalidade, o.direcao.value)] += o.valor_brl
for k in sorted(vol, key=lambda k: -vol[k]):
    print(f"{k[0]:28s} {k[1]:3s} {vol[k]:>16.2f} {vol[k]/bruto*100:>6.2f}%  aliq={aliquota_iof(cen.custo,k[0],Direcao(k[1]))}")

print("--- VALOR POR BRL CASADO (par OUT+IN, waterfall dentro do ciclo) ---")
segs = []
for c in ciclos:
    outs = [(a.valor_brl, aliquota_iof(cen.custo, ordem_por_id[a.ordem_id].finalidade, Direcao.OUT))
            for a in c.alocacoes if a.tipo is TipoAlocacao.CASADO and ordem_por_id[a.ordem_id].direcao is Direcao.OUT]
    ins = [(a.valor_brl, aliquota_iof(cen.custo, ordem_por_id[a.ordem_id].finalidade, Direcao.IN))
           for a in c.alocacoes if a.tipo is TipoAlocacao.CASADO and ordem_por_id[a.ordem_id].direcao is Direcao.IN]
    i = j = 0
    while i < len(outs) and j < len(ins):
        q = min(outs[i][0], ins[j][0])
        segs.append((outs[i][1] + ins[j][1], q))
        outs[i] = (outs[i][0] - q, outs[i][1]); ins[j] = (ins[j][0] - q, ins[j][1])
        if outs[i][0] == 0: i += 1
        if ins[j][0] == 0: j += 1
segs.sort()
tot = sum(q for _, q in segs)
acc = Decimal(0); mediana = None
for v, q in segs:
    acc += q
    if mediana is None and acc >= tot / 2: mediana = v
print(f"segmentos={len(segs)} brl_casado_por_perna={tot:.2f} (confere={tot*2==casado_vol})")
print(f"min={segs[0][0]} mediana_ponderada={mediana} max={segs[-1][0]}")
distintos = sorted({v for v, _ in segs})
print(f"valores distintos={distintos}")
