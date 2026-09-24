"""Roda os cenários manuais de motor/cenarios/manuais/ e imprime a timeline
ciclo a ciclo, com as alocações por ordem — para conferir a mão contra as
PREVISÕES escritas no topo de cada YAML.

Uso: python scripts/rodar_casos_manuais.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.dominio import carregar_cenario, TipoAlocacao
from motor.netting import executar_p0

PASTA = Path(__file__).resolve().parent.parent / "motor" / "cenarios" / "manuais"


def rodar_caso(caminho: Path) -> None:
    cenario = carregar_cenario(str(caminho))
    ciclos = executar_p0(cenario)

    print("=" * 72)
    print(caminho.name)
    print("=" * 72)
    for ciclo in ciclos:
        print(
            f"  dia {ciclo.dia:>2}: bruto_out {ciclo.bruto_out:>6} | "
            f"bruto_in {ciclo.bruto_in:>6} | casado {ciclo.casado:>6} | "
            f"residuo {ciclo.residuo:>6} {ciclo.direcao_residuo.value if ciclo.residuo else ''}"
        )
        for aloc in ciclo.alocacoes:
            marca = "CASADO  " if aloc.tipo is TipoAlocacao.CASADO else "REMETIDO"
            print(f"           {marca} {aloc.ordem_id:<3} {aloc.valor_brl}")
    print()


def main() -> None:
    arquivos = sorted(PASTA.glob("caso*.yaml"))
    if not arquivos:
        print(f"nenhum cenário encontrado em {PASTA}")
        return
    for caminho in arquivos:
        rodar_caso(caminho)


if __name__ == "__main__":
    main()
