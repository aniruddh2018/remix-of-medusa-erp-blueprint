import re
from app.models.contracts import DocumentType, PipelineContext
from app.core.classification.provider import DocumentClassifier
from app.utils.logging import logger


class HeuristicDocumentClassifier(DocumentClassifier):
    INVOICE_KEYWORDS = [
        "invoice", "tax invoice", "bill", "gst", "hsn", "sac",
        "quantity", "qty", "rate", "amount", "total", "subtotal",
        "cgst", "sgst", "igst", "supplier", "billing", "ship to",
        "po number", "invoice no", "invoice date", "due date",
        "line item", "unit price", "net amount",
    ]
    PRESCRIPTION_KEYWORDS = ["rx", "prescription", "physician", "doctor", "patient", "dosage", "refill", "dispense"]
    RECEIPT_KEYWORDS = ["receipt", "payment received", "cash", "change due", "tendered"]

    async def classify(self, ctx: PipelineContext) -> tuple[DocumentType, float]:
        if ctx.pages:
            page = ctx.pages[0]
            all_text = " ".join(w.text.lower() for w in page.words)
        else:
            all_text = ""
        scores: dict[DocumentType, float] = {
            DocumentType.INVOICE: self._keyword_score(all_text, self.INVOICE_KEYWORDS),
            DocumentType.PRESCRIPTION: self._keyword_score(all_text, self.PRESCRIPTION_KEYWORDS),
            DocumentType.RECEIPT: self._keyword_score(all_text, self.RECEIPT_KEYWORDS),
            DocumentType.GENERIC: 0.0,
        }
        if all(score == 0.0 for score in scores.values()):
            return DocumentType.UNKNOWN, 0.0
        best_type = max(scores, key=lambda k: scores[k])
        confidence = scores[best_type]
        logger.info("document_classified", type=best_type.value, confidence=round(confidence, 3))
        return best_type, confidence

    def _keyword_score(self, text: str, keywords: list[str]) -> float:
        matches = sum(1 for kw in keywords if kw.lower() in text)
        if matches == 0:
            return 0.0
        return min(1.0, matches / max(len(keywords) * 0.3, 3))

    def name(self) -> str:
        return "heuristic_document_classifier"
