import pytest
from app.models.contracts import DocumentPage, OCRWord, OCRLine, BoundingBox
from app.document_types.invoice.parser import InvoiceParser


def _make_invoice_page() -> DocumentPage:
    words_data = [
        ("ABC", 0.99, 50, 10, 80, 25),
        ("PHARMA", 0.99, 85, 10, 140, 25),
        ("TAX", 0.98, 200, 30, 230, 45),
        ("INVOICE", 0.98, 235, 30, 290, 45),
        ("Invoice", 0.95, 50, 55, 100, 70),
        ("No:", 0.95, 110, 55, 130, 70),
        ("INV-2024-001", 0.96, 135, 55, 210, 70),
        ("Date:", 0.95, 110, 75, 140, 90),
        ("15/05/2024", 0.96, 145, 75, 210, 90),
        ("GST:", 0.95, 50, 95, 80, 110),
        ("27AABCT1234Q1Z5", 0.97, 85, 95, 210, 110),
        ("Total:", 0.95, 150, 130, 190, 145),
        ("1,100.00", 0.97, 195, 130, 260, 145),
    ]
    words = [
        OCRWord(text=t, confidence=c, bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2))
        for t, c, x1, y1, x2, y2 in words_data
    ]
    lines = []
    for w in words:
        lines.append(OCRLine(words=[w], bbox=w.bbox, confidence=w.confidence))
    return DocumentPage(page_number=1, width=300, height=200, words=words, lines=lines)


class TestInvoiceParser:
    def test_parse_supplier(self):
        page = _make_invoice_page()
        parser = InvoiceParser()
        result = parser._extract_supplier([l.text for l in page.lines])
        assert result is not None and "PHARMA" in result

    def test_parse_invoice_number(self):
        page = _make_invoice_page()
        parser = InvoiceParser()
        all_text = " ".join(w.text for w in page.words)
        inv_no = parser._extract_field(all_text, parser.INVOICE_NO_PATTERNS)
        assert inv_no == "INV-2024-001"

    def test_parse_gst(self):
        page = _make_invoice_page()
        parser = InvoiceParser()
        all_text = " ".join(w.text for w in page.words)
        gst = parser._extract_gst(all_text)
        assert "27AABCT1234Q1Z5" in gst

    def test_parse_totals(self):
        page = _make_invoice_page()
        parser = InvoiceParser()
        totals = parser._extract_totals([l.text for l in page.lines])
        assert totals.get("total_amount") == 1100.0

    def test_full_parse(self):
        page = _make_invoice_page()
        parser = InvoiceParser()
        result = parser.parse([page])
        assert result["supplier"] is not None
        assert result["invoice_number"] == "INV-2024-001"
        assert result.get("gst_numbers")
