"""Factory sem configuração externa usada para estabilizar o OpenAPI na T1."""

from fastapi import FastAPI, HTTPException

from servidor.contracts.input import PreviaRequest
from servidor.contracts.preview import PreviewEnvelope, ReferenceExample


def create_schema_app() -> FastAPI:
    app = FastAPI(title="Motor de Fluxo API", version="1.0.0")

    @app.get("/api/v1/examples/reference", response_model=ReferenceExample)
    def reference_example_schema() -> ReferenceExample:
        raise HTTPException(status_code=501, detail="endpoint disponível na T3")

    @app.post("/api/v1/previas", response_model=PreviewEnvelope)
    def preview_schema(_: PreviaRequest) -> PreviewEnvelope:
        raise HTTPException(status_code=501, detail="endpoint disponível na T3")

    return app
