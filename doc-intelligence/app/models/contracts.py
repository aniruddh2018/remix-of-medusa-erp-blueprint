from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


class DocumentType(str, Enum):
    INVOICE = "invoice"
    PRESCRIPTION = "prescription"
    RECEIPT = "receipt"
    GENERIC = "generic"
    UNKNOWN = "unknown"


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def center_x(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def center_y(self) -> float:
        return (self.y1 + self.y2) / 2


class OCRWord(BaseModel):
    text: str
    confidence: float
    bbox: BoundingBox
    reading_order_index: Optional[int] = None


class OCRLine(BaseModel):
    words: list[OCRWord]
    bbox: BoundingBox
    confidence: float
    reading_order_index: Optional[int] = None

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


class OCRParagraph(BaseModel):
    lines: list[OCRLine]
    bbox: BoundingBox
    reading_order_index: Optional[int] = None


class OCRTable(BaseModel):
    rows: list[list[str]]
    header_row: Optional[list[str]] = None
    bbox: BoundingBox
    confidence: float
    row_bboxes: list[BoundingBox] = []
    column_boundaries: list[float] = []


class DocumentPage(BaseModel):
    page_number: int
    width: float
    height: float
    words: list[OCRWord] = []
    lines: list[OCRLine] = []
    paragraphs: list[OCRParagraph] = []
    tables: list[OCRTable] = []
    sections: list[BoundingBox] = []


class ProcessingMetadata(BaseModel):
    processing_time_ms: float
    orientation_detected: Optional[float] = None
    orientation_confidence: Optional[float] = None
    document_type_confidence: Optional[float] = None
    ocr_confidence_avg: Optional[float] = None
    table_count: int = 0
    complexity_score: Optional[float] = None


class ComplexityScores(BaseModel):
    blur_score: float = 0.0
    rotation_score: float = 0.0
    ocr_confidence_penalty: float = 0.0
    table_density_score: float = 0.0
    overall: float = 0.0


class ProcessedDocument(BaseModel):
    success: bool
    document_type: DocumentType
    orientation: float = 0.0
    pages: list[DocumentPage] = []
    structured_data: Optional[dict] = None
    metadata: ProcessingMetadata
    complexity: ComplexityScores = ComplexityScores()
    errors: list[str] = []


class PipelineContext(BaseModel):
    image_bytes: bytes
    document_type: Optional[DocumentType] = None
    orientation: float = 0.0
    orientation_confidence: float = 0.0
    preprocessed_image: Optional[bytes] = None
    pages: list[DocumentPage] = []
    structured_data: Optional[dict] = None
    complexity: ComplexityScores = ComplexityScores()
    errors: list[str] = []
    stage_timings: dict[str, float] = {}
    debug_images: dict[str, bytes] = {}

    class Config:
        arbitrary_types_allowed = True
