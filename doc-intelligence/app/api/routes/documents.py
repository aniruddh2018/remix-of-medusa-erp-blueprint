from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from typing import Optional
from app.models.contracts import ProcessedDocument, DocumentType
from app.core.pipeline.orchestrator import DocumentPipeline
from app.config.settings import settings
from app.utils.logging import logger

router = APIRouter(prefix="/documents", tags=["documents"])

_pipeline: Optional[DocumentPipeline] = None


def get_pipeline() -> DocumentPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = DocumentPipeline()
    return _pipeline


@router.post("/process", response_model=ProcessedDocument)
async def process_document(
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    document_type: Optional[str] = Form(None, description="auto|invoice|prescription|receipt|generic"),
):
    if file is None and url is None:
        raise HTTPException(status_code=400, detail="Provide either file upload or image URL")

    doc_type_hint = None
    if document_type and document_type != "auto":
        try:
            doc_type_hint = DocumentType(document_type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid document_type: {document_type}")

    if file:
        if file.size and file.size > settings.max_upload_size_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_size_mb}MB limit")
        image_bytes = await file.read()
    else:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(url, follow_redirects=True, timeout=30.0)
            response.raise_for_status()
            image_bytes = response.content

    logger.info("process_request", source="upload" if file else "url", doc_type=document_type)
    pipeline = get_pipeline()
    result = await pipeline.process(image_bytes, doc_type_hint=doc_type_hint)
    return result


@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "doc-intelligence",
        "ocr_provider": settings.ocr_provider,
    }
