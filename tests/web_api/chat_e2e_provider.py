"""Local deterministic provider; controls live only in the test server."""

import asyncio

from servidor.chat.scope import ScopeDecision, ScopeRequest
from servidor.chat.service import AnswerRequest, ProviderAnswer
from servidor.contracts.chat import ChatCitation


class ControlledChatProvider:
    def __init__(self):
        self.mode = "ok"
        self.classified = 0
        self.answered = 0
        self.release = asyncio.Event()

    async def classify(self, request: ScopeRequest) -> ScopeDecision:
        self.classified += 1
        mode = self.mode
        if mode == "hold":
            await self.release.wait()
        if mode == "fail":
            raise RuntimeError("controlled provider unavailable")
        classification = {"out": "OUT_OF_SCOPE", "mixed": "MIXED",
                          "insufficient": "INSUFFICIENT_EVIDENCE"}.get(mode, "IN_SCOPE")
        return ScopeDecision(classification=classification)

    async def answer(self, request: AnswerRequest) -> ProviderAnswer:
        self.answered += 1
        document = request.chat.communication
        citation = ChatCitation(kind="HELP", id=request.chat.routeContext.helpId or "page.importacao")
        answer = "A importação revisa uma planilha local."
        if document is not None:
            metrics = list(document.executiveMetrics)
            for section in (document.composition, document.mechanism, document.economics,
                            document.robustness, document.comparison, document.replaySnapshot):
                if section is not None:
                    metrics.extend(section.metrics)
            if metrics:
                metric = metrics[0]
                citation = ChatCitation(kind="METRIC", id=metric.code)
                answer = f"Métrica selecionada: {metric.code} = {metric.value}."
            elif document.evidenceIndex:
                citation = ChatCitation(kind="EVIDENCE", id=next(iter(document.evidenceIndex)))
                answer = "A evidência selecionada sustenta este contexto."
        if self.mode == "invalid-citation":
            citation = ChatCitation(kind="METRIC", id="absent-metric")
        return ProviderAnswer(answer=answer, citations=[citation], limitationCodes=[])

    def control(self, mode: str) -> None:
        if mode not in {"ok", "out", "mixed", "insufficient", "fail", "hold", "invalid-citation", "disabled"}:
            raise ValueError("unknown test mode")
        self.release.set()
        self.release = asyncio.Event()
        self.mode = mode

    def snapshot(self) -> dict[str, int]:
        return {"classified": self.classified, "answered": self.answered}
