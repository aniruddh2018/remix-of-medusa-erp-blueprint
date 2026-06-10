from app.models.contracts import DocumentPage


class ReceiptParser:
    def parse(self, pages: list[DocumentPage]) -> dict:
        all_text = " ".join(w.text for p in pages for w in p.words)
        return {
            "full_text": all_text,
            "status": "placeholder",
            "message": "Receipt parser not yet implemented.",
        }
