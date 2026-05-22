from fastapi import HTTPException, status


class DocumentIntelligenceError(Exception):
    def __init__(self, message: str, stage: str = "unknown"):
        self.message = message
        self.stage = stage
        super().__init__(message)


class OCRFailureError(DocumentIntelligenceError):
    def __init__(self, message: str):
        super().__init__(message, stage="ocr")


class PreprocessingError(DocumentIntelligenceError):
    def __init__(self, message: str):
        super().__init__(message, stage="preprocessing")


class LayoutError(DocumentIntelligenceError):
    def __init__(self, message: str):
        super().__init__(message, stage="layout")


class ClassificationError(DocumentIntelligenceError):
    def __init__(self, message: str):
        super().__init__(message, stage="classification")


class ParsingError(DocumentIntelligenceError):
    def __init__(self, message: str):
        super().__init__(message, stage="parsing")


def http_exception(status_code: int, detail: str, stage: str = "unknown") -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"error": detail, "stage": stage},
    )
