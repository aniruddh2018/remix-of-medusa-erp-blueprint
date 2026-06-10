from app.core.ocr.provider import OCRProvider
from app.core.ocr.paddle_provider import PaddleOCRProvider
from app.core.ocr.handwriting_provider import HandwritingOCRProvider
from app.config.settings import settings


_providers: dict[str, OCRProvider] = {}


def get_ocr_provider() -> OCRProvider:
    name = settings.ocr_provider
    if name not in _providers:
        if name == "paddle":
            _providers[name] = PaddleOCRProvider()
        elif name == "handwriting":
            _providers[name] = HandwritingOCRProvider()
        else:
            raise ValueError(f"Unknown OCR provider: {name}")
    return _providers[name]
