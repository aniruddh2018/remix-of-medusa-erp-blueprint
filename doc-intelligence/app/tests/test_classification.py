import pytest
from app.models.contracts import PipelineContext, DocumentType
from app.core.classification.heuristic import HeuristicDocumentClassifier


@pytest.mark.asyncio
class TestHeuristicClassifier:
    async def test_classify_invoice(self):
        ctx = PipelineContext(
            image_bytes=b"",
            pages=[],
        )
        classifier = HeuristicDocumentClassifier()
        doc_type, conf = await classifier.classify(ctx)
        assert doc_type in DocumentType

    async def test_classifier_name(self):
        classifier = HeuristicDocumentClassifier()
        assert classifier.name() == "heuristic_document_classifier"
