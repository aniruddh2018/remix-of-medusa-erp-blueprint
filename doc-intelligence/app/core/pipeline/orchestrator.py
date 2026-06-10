from typing import Optional
from typing import Optional
from app.models.contracts import (
    PipelineContext,
    ProcessedDocument,
    DocumentType,
    ProcessingMetadata,
)
from app.core.preprocessing.pipeline import create_default_preprocessing_pipeline
from app.core.orientation.detector import OrientationDetector, rotate_image
from app.core.ocr.factory import get_ocr_provider
from app.core.layout.spatial_provider import SpatialLayoutProvider
from app.core.classification.heuristic import HeuristicDocumentClassifier
from app.core.pipeline.complexity import ComplexityScorer
from app.document_types.dispatcher import parse_document
from app.utils.logging import logger
from app.utils.timing import StageTimer, stage_timing


class DocumentPipeline:
    def __init__(self):
        self.preprocessor = create_default_preprocessing_pipeline(debug=False)
        self.orientation_detector = OrientationDetector()
        self.ocr_provider = get_ocr_provider()
        self.layout_provider = SpatialLayoutProvider()
        self.classifier = HeuristicDocumentClassifier()
        self.complexity_scorer = ComplexityScorer()
        self.timer = StageTimer()

    async def process(self, image_bytes: bytes, doc_type_hint: Optional[DocumentType] = None) -> ProcessedDocument:
        ctx = PipelineContext(image_bytes=image_bytes, document_type=doc_type_hint)
        errors: list[str] = []

        try:
            async with stage_timing(self.timer, "orientation"):
                angle, conf = self.orientation_detector.detect(image_bytes)
                ctx.orientation = angle
                ctx.orientation_confidence = conf
                if abs(angle) > 0.5:
                    image_bytes = rotate_image(image_bytes, -angle)
                    ctx.image_bytes = image_bytes
        except Exception as e:
            logger.warning("orientation_failed", error=str(e))
            errors.append(f"orientation: {e}")

        try:
            async with stage_timing(self.timer, "preprocessing"):
                preprocessed = self.preprocessor.process(image_bytes)
                ctx.preprocessed_image = preprocessed
        except Exception as e:
            logger.warning("preprocessing_failed", error=str(e))
            errors.append(f"preprocessing: {e}")

        try:
            async with stage_timing(self.timer, "ocr"):
                source = ctx.preprocessed_image if ctx.preprocessed_image else image_bytes
                ctx.pages = await self.ocr_provider.extract(source)
        except Exception as e:
            logger.error("ocr_failed", error=str(e))
            errors.append(f"ocr: {e}")
            return self._error_document(ctx, errors)

        try:
            async with stage_timing(self.timer, "layout"):
                ctx.pages = await self.layout_provider.reconstruct(ctx.pages)
        except Exception as e:
            logger.warning("layout_failed", error=str(e))
            errors.append(f"layout: {e}")

        try:
            async with stage_timing(self.timer, "classification"):
                if ctx.document_type is None:
                    ctx.document_type, _ = await self.classifier.classify(ctx)
        except Exception as e:
            logger.warning("classification_failed", error=str(e))
            ctx.document_type = DocumentType.UNKNOWN
            errors.append(f"classification: {e}")

        try:
            async with stage_timing(self.timer, "parsing"):
                ctx.structured_data = await parse_document(ctx.document_type, ctx.pages)
        except Exception as e:
            logger.warning("parsing_failed", error=str(e))
            errors.append(f"parsing: {e}")

        ctx.complexity = self.complexity_scorer.score(
            image_bytes, ctx.orientation, ctx.pages
        )

        return self._build_response(ctx, errors)

    def _build_response(self, ctx: PipelineContext, errors: list[str]) -> ProcessedDocument:
        avg_ocr_conf = 0.0
        if ctx.pages and ctx.pages[0].words:
            avg_ocr_conf = sum(w.confidence for w in ctx.pages[0].words) / len(ctx.pages[0].words)

        table_count = sum(len(p.tables) for p in ctx.pages)

        return ProcessedDocument(
            success=len(errors) == 0 or ctx.pages,
            document_type=ctx.document_type or DocumentType.UNKNOWN,
            orientation=ctx.orientation,
            pages=ctx.pages,
            structured_data=ctx.structured_data,
            metadata=ProcessingMetadata(
                processing_time_ms=round(self.timer.total_ms(), 2),
                orientation_detected=ctx.orientation if ctx.orientation_confidence > 0.5 else None,
                orientation_confidence=round(ctx.orientation_confidence, 3),
                document_type_confidence=None,
                ocr_confidence_avg=round(avg_ocr_conf, 3),
                table_count=table_count,
                complexity_score=round(ctx.complexity.overall, 3),
            ),
            complexity=ctx.complexity,
            errors=errors,
        )

    def _error_document(self, ctx: PipelineContext, errors: list[str]) -> ProcessedDocument:
        return ProcessedDocument(
            success=False,
            document_type=ctx.document_type or DocumentType.UNKNOWN,
            orientation=ctx.orientation,
            metadata=ProcessingMetadata(processing_time_ms=round(self.timer.total_ms(), 2)),
            errors=errors,
        )
