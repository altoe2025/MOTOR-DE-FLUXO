"""Exporta a timeline de motor/cenarios/cenario_temporal.yaml em JSON, para
alimentar o dashboard (Artifact). Inclui, por ciclo, uma decomposição
ilustrativa do `casado` agregado em pares OUT<->IN (waterfall na mesma ordem
EDF que o motor usa) — só para desenhar uma linha na tela; o motor em si NÃO
faz pareamento físico (ver motor/netting.py e CLAUDE.md).

Uso: python scripts/exportar_timeline.py [caminho/do/cenario.yaml] > scripts/timeline.json
Sem argumento, usa motor/cenarios/cenario_temporal.yaml.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.dominio import carregar_cenario, Direcao, TipoAlocacao
from motor.netting import executar_p0

CENARIO = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else Path(__file__).resolve().parent.parent / "motor" / "cenarios" / "cenario_temporal.yaml"
)


def par_prioridade(ordem_id: str, ordens_por_id: dict) -> tuple[int, str]:
    o = ordens_por_id[ordem_id]
    return (o.dia_limite, o.id)


def decompor_pares(alocacoes_casado_out, alocacoes_casado_in):
    """Waterfall determinístico entre as alocações CASADO de um lado e do
    outro, dentro do mesmo ciclo, na ordem em que já vieram (EDF)."""
    pares = []
    i = j = 0
    out = [[a.ordem_id, a.valor_brl] for a in alocacoes_casado_out]
    ins = [[a.ordem_id, a.valor_brl] for a in alocacoes_casado_in]
    while i < len(out) and j < len(ins):
        valor = min(out[i][1], ins[j][1])
        if valor > 0:
            pares.append({"out": out[i][0], "in": ins[j][0], "valor": str(valor)})
        out[i][1] -= valor
        ins[j][1] -= valor
        if out[i][1] == 0:
            i += 1
        if ins[j][1] == 0:
            j += 1
    return pares


def main() -> None:
    cenario = carregar_cenario(str(CENARIO))
    ordens_por_id = {o.id: o for o in cenario.ordens}
    ciclos = executar_p0(cenario)

    ordens_json = [
        {
            "id": o.id,
            "cliente_id": o.cliente_id,
            "direcao": o.direcao.value,
            "valor_brl": str(o.valor_brl),
            "dia_conhecida": o.dia_conhecida,
            "dia_limite": o.dia_limite,
        }
        for o in cenario.ordens
    ]

    ciclos_json = []
    for ciclo in ciclos:
        casado_out = [
            a for a in ciclo.alocacoes
            if a.tipo is TipoAlocacao.CASADO and ordens_por_id[a.ordem_id].direcao is Direcao.OUT
        ]
        casado_in = [
            a for a in ciclo.alocacoes
            if a.tipo is TipoAlocacao.CASADO and ordens_por_id[a.ordem_id].direcao is Direcao.IN
        ]
        remetidos = [a for a in ciclo.alocacoes if a.tipo is TipoAlocacao.REMETIDO]

        ciclos_json.append({
            "dia": ciclo.dia,
            "bruto_out": str(ciclo.bruto_out),
            "bruto_in": str(ciclo.bruto_in),
            "casado": str(ciclo.casado),
            "residuo": str(ciclo.residuo),
            "direcao_residuo": ciclo.direcao_residuo.value,
            "alocacoes": [
                {
                    "ordem_id": a.ordem_id,
                    "valor_brl": str(a.valor_brl),
                    "tipo": a.tipo.value,
                }
                for a in ciclo.alocacoes
            ],
            "pares_casado": decompor_pares(casado_out, casado_in),
            "remetidos": [{"ordem_id": a.ordem_id, "valor_brl": str(a.valor_brl)} for a in remetidos],
        })

    saida = {
        "horizonte_dias": cenario.horizonte_dias,
        "janela_dias": cenario.janela_dias,
        "ordens": ordens_json,
        "ciclos": ciclos_json,
    }

    print(json.dumps(saida, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
