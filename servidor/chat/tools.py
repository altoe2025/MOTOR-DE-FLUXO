"""Closed read-only capability registry over validated, request-local sources.

No filesystem, database, network, simulation, eval or dynamic attribute dispatch.
Identifiers select within the supplied snapshot, never fetch another resource.
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import Field

from servidor.catalogs.product_help import ProductHelpCatalogV1
from servidor.chat.structured_output import read_object
from servidor.contracts.chat import ChatCitation, ChatId, ChatRequestV1
from servidor.contracts.communication import (
    CommunicationFact,
    CommunicationLimitation,
    CommunicationMetric,
)
from servidor.contracts.primitives import StrictModel


class InterfaceArguments(StrictModel):
    helpId: ChatId


class MetricArguments(StrictModel):
    metricCode: ChatId


class ReplayArguments(StrictModel):
    day: Annotated[int, Field(ge=0)]


class EmptyArguments(StrictModel):
    pass


_TOOLS: dict[str, tuple[type[StrictModel], str]] = {
    "consultar_interface": (InterfaceArguments, "Lê um item do catálogo pelo helpId."),
    "consultar_metrica": (MetricArguments, "Lê uma métrica publicada pelo metricCode."),
    "consultar_comparacao": (EmptyArguments, "Lê a comparação da seleção atual, se disponível."),
    "consultar_replay": (ReplayArguments, "Lê somente o snapshot do dia selecionado."),
    "consultar_premissas": (EmptyArguments,
                           "Lê premissas, proveniência, versões e fatos publicados das seções."),
    "consultar_limitacoes": (EmptyArguments, "Lê as limitações explícitas da seleção."),
}
Item = CommunicationMetric | CommunicationFact | CommunicationLimitation


class ReadOnlyTools:
    def __init__(self, chat: ChatRequestV1, catalog: ProductHelpCatalogV1):
        self.chat = chat
        self.catalog = catalog
        self.served: set[tuple[str, str]] = set()

    @staticmethod
    def definitions() -> list[dict[str, Any]]:
        return [{"type": "function", "name": name, "description": description, "strict": True,
                 "parameters": {"required": [], **arguments.model_json_schema()}}
                for name, (arguments, description) in _TOOLS.items()]

    def metrics(self) -> list[CommunicationMetric]:
        doc = self.chat.communication
        if doc is None:
            return []
        sections = [doc.composition, doc.mechanism, doc.economics, doc.robustness]
        if doc.comparison is not None:
            sections.append(doc.comparison)
        return [*doc.executiveMetrics, *(m for s in sections for m in s.metrics),
                *(doc.replaySnapshot.metrics if doc.replaySnapshot is not None else [])]

    def inventory(self) -> dict[str, Any]:
        """Discovery metadata only; full source text is read on demand by tools."""
        doc = self.chat.communication
        return {
            "catalogVersion": self.catalog.catalogVersion,
            "help": [{"id": item.id, "label": item.label} for item in self.catalog.items],
            "metrics": [{"code": item.code, "label": item.label} for item in self.metrics()],
            "facts": [{"code": item.code, "label": item.label} for item in self.facts()],
            "hasCommunication": doc is not None,
            "hasComparison": doc is not None and doc.comparison is not None,
            "replayDay": doc.selection.replayDay if doc is not None else None,
        }

    def facts(self) -> list[CommunicationFact]:
        doc = self.chat.communication
        if doc is None:
            return []
        return [*doc.assumptions, *doc.provenance, *doc.versions,
                *(fact for section in (doc.composition, doc.mechanism, doc.economics, doc.robustness)
                  for fact in section.facts)]

    def validate_references(
        self, citations: list[ChatCitation], limitation_codes: list[str], *, served_only: bool = False,
    ) -> None:
        doc = self.chat.communication
        known = {
            "HELP": {item.id for item in self.catalog.items},
            "METRIC": {item.code for item in self.metrics()},
            "EVIDENCE": set(doc.evidenceIndex) if doc else set(),
            "LIMITATION": {item.code for item in doc.limitations} if doc else set(),
        }
        for citation in citations:
            if citation.id not in known[citation.kind] or (
                served_only and (citation.kind, citation.id) not in self.served
            ):
                raise ValueError("unresolved citation")
        for code in limitation_codes:
            if code != "INSUFFICIENT_EVIDENCE" and (
                code not in known["LIMITATION"]
                or (served_only and ("LIMITATION", code) not in self.served)
            ):
                raise ValueError("unresolved limitation")

    @staticmethod
    def _missing() -> dict[str, Any]:
        return {"available": False, "data": None, "citations": [], "evidenceIndex": {},
                "limitationCodes": ["INSUFFICIENT_EVIDENCE"]}

    def _publish(self, data: Any, items: list[Item], *, available: bool = True) -> dict[str, Any]:
        doc = self.chat.communication
        refs = {ref for item in items for ref in item.evidenceRefs}
        citations = [{"kind": "EVIDENCE", "id": ref} for ref in sorted(refs)]
        citations.extend({"kind": "METRIC", "id": item.code} for item in items
                         if isinstance(item, CommunicationMetric))
        citations.extend({"kind": "LIMITATION", "id": item.code} for item in items
                         if isinstance(item, CommunicationLimitation))
        self.served.update((item["kind"], item["id"]) for item in citations)
        return {
            "available": available, "data": data, "citations": citations,
            "evidenceIndex": {ref: doc.evidenceIndex[ref].model_dump(mode="json")
                              for ref in sorted(refs)} if doc else {},
            "source": doc.source.model_dump(mode="json") if doc else None,
            "contextFingerprint": doc.contextFingerprint if doc else None,
            "limitationCodes": [] if available else ["INSUFFICIENT_EVIDENCE"],
        }

    def execute(self, name: str, arguments: str) -> dict[str, Any]:
        definition = _TOOLS.get(name)
        if definition is None or len(arguments) > 4096:
            raise ValueError("invalid tool call")
        args = definition[0].model_validate(read_object(arguments)).model_dump()
        doc = self.chat.communication
        if name == "consultar_interface":
            item = next((item for item in self.catalog.items if item.id == args["helpId"]), None)
            if item is None:
                return self._missing()
            self.served.add(("HELP", item.id))
            return {"available": True, "data": item.model_dump(mode="json"),
                    "citations": [{"kind": "HELP", "id": item.id}], "evidenceIndex": {},
                    "catalogVersion": self.catalog.catalogVersion, "limitationCodes": []}
        if doc is None:
            return self._missing()
        if name == "consultar_metrica":
            matches = [metric for metric in self.metrics() if metric.code == args["metricCode"]]
            if not matches:
                return self._missing()
            # A public code must resolve unambiguously, even if duplicated across sections.
            metric = matches[0]
            if any(other != metric for other in matches[1:]):
                raise ValueError("ambiguous metric")
            return self._publish(metric.model_dump(mode="json"), [metric],
                                 available=metric.availability == "AVAILABLE")
        if name == "consultar_comparacao":
            comparison = doc.comparison
            if comparison is None:
                return self._missing()
            return self._publish(comparison.model_dump(mode="json"),
                                 [*comparison.metrics, *comparison.facts])
        if name == "consultar_replay":
            replay = doc.replaySnapshot
            if replay is None or replay.day != args["day"]:
                return self._missing()
            return self._publish(replay.model_dump(mode="json"), [*replay.metrics, *replay.facts])
        if name == "consultar_premissas":
            facts = self.facts()
            return self._publish([fact.model_dump(mode="json") for fact in facts], [*facts],
                                 available=bool(facts))
        return self._publish([item.model_dump(mode="json") for item in doc.limitations],
                             [*doc.limitations], available=bool(doc.limitations))
