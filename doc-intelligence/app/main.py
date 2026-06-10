from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.api.routes.documents import router as documents_router
from app.api.routes.pipeline import router as pipeline_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Document Intelligence Service",
        description="Local-first OCR and document processing service for pharmacy invoices, prescriptions, receipts, and medical documents.",
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(documents_router)
    app.include_router(pipeline_router)

    static_dir = Path(__file__).parent.parent / "static"
    if static_dir.exists():
        app.mount("/test", StaticFiles(directory=str(static_dir), html=True))

    return app


app = create_app()
