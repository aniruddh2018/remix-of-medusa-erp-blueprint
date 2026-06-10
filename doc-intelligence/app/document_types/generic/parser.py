from app.models.contracts import DocumentPage


class GenericParser:
    def parse(self, pages: list[DocumentPage]) -> dict:
        lines = [l.text for p in pages for l in p.lines]
        words = [w.text for p in pages for w in p.words]
        return {
            "full_text": " ".join(words),
            "lines": lines,
            "word_count": len(words),
            "line_count": len(lines),
        }
