from app.core.ocr.provider import OCRProvider
from app.models.contracts import DocumentPage
from app.utils.logging import logger


class HandwritingOCRProvider(OCRProvider):
    async def extract(self, image_bytes: bytes) -> list[DocumentPage]:
        logger.warning("handwriting_ocr_not_implemented")
        raise NotImplementedError(
            "Handwriting OCR provider is a placeholder. "
            "Integrate a handwriting model (e.g. TrOCR, GOT-OCR2) here."
        )

    def name(self) -> str:
        return "handwriting_ocr_placeholder"
