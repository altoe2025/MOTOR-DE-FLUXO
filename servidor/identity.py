"""Identidade determinística de execução e de evidência."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC
from decimal import Decimal, localcontext

from servidor.contracts.input import PreviaRequest
from servidor.contracts.primitives import OrigemValor


def canon_decimal(text: str) -> str:
    with localcontext() as context:
        context.prec = max(100, len(text) + 10)
        value = Decimal(text)
        if value == 0:
            return "0"
        fixed = format(value, "f")
    return fixed.rstrip("0").rstrip(".") if "." in fixed else fixed


def _scenario_for_identity(request: PreviaRequest) -> dict[str, object]:
    scenario = request.cenario.model_dump(mode="json")
    cost = scenario["custo"]
    decimal_cost_fields = (
        "iof_out",
        "iof_in",
        "carry_cnr",
        "spread_rail_bps",
        "custo_fixo_remessa",
        "custo_oportunidade_aa",
        "ptax",
    )
    for field in decimal_cost_fields:
        cost[field] = canon_decimal(cost[field])
    for rule in cost["iof_por_finalidade"]:
        rule["aliquota"] = canon_decimal(rule["aliquota"])
    cost["iof_por_finalidade"] = sorted(
        cost["iof_por_finalidade"],
        key=lambda rule: (rule["finalidade"], rule["direcao"]),
    )
    for order in scenario["ordens"]:
        order["valor_brl"] = canon_decimal(order["valor_brl"])
    scenario["ordens"] = sorted(scenario["ordens"], key=lambda order: order["id"])
    return scenario


def normalizar_execucao(request: PreviaRequest, build_sha: str) -> dict[str, object]:
    return {
        "api_version": request.api_version,
        "motor_build_sha": build_sha,
        "schema_version_motor": "2.0.0",
        "cenario": _scenario_for_identity(request),
        "periodo": request.periodo.model_dump(mode="json"),
        "analise": {
            "tipo": "PREVIA",
            "modo_motor": "AGREGADO",
            "origem": "ORDENS_EXPLICITAS",
        },
    }


def _hash_json(value: object) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def execution_fingerprint(request: PreviaRequest, build_sha: str) -> str:
    return _hash_json(normalizar_execucao(request, build_sha))


def provenance_fingerprint(proveniencia: Mapping[str, OrigemValor]) -> str:
    normalized: dict[str, object] = {}
    for path, origin in sorted(proveniencia.items()):
        payload = origin.model_dump(mode="python")
        payload["registrado_em_utc"] = (
            payload["registrado_em_utc"]
            .astimezone(UTC)
            .isoformat()
            .replace("+00:00", "Z")
        )
        normalized[path] = payload
    return _hash_json(normalized)
