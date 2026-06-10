import re
import re
from datetime import datetime
from typing import Optional
from app.models.contracts import DocumentPage
from app.utils.logging import logger


class InvoiceParser:
    GST_PATTERNS = [
        r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b",
        r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{3}\b",
    ]
    DATE_PATTERNS = [
        r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b",
        r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b",
    ]
    INVOICE_NO_PATTERNS = [
        r"(?:invoice\s*(?:#|no|number)\s*[:\s]+)([A-Za-z0-9\-\/]+)",
        r"(?:inv\s*(?:#|no)\s*[:\s]+)([A-Za-z0-9\-\/]+)",
        r"(?:bill\s*(?:#|no)\s*[:\s]+)([A-Za-z0-9\-\/]+)",
    ]
    AMOUNT_PATTERNS = [
        r"(?:total|grand\s*total|net\s*amount|amount\s*payable)\s*[:=]?\s*[\u20B9Rs\.]*\s*([\d,]+\.?\d*)",
        r"[\u20B9Rs\.]*\s*([\d,]+\.?\d*)",
    ]
    UNIT_PATTERN = re.compile(
        r"(\d+)\s*(?:x\s*(\d+))?\s*(?:MG|GM|KG|ML|LTR|TAB|CAP|INJ|SYP|OINT|CREAM|DROP|UNIT|NOS|PCS|STRIP|VIAL|AMP|BTL)",
        re.IGNORECASE,
    )

    def parse(self, pages: list[DocumentPage]) -> dict:
        all_text = self._all_text(pages)
        lines_text = self._line_texts(pages)
        result = {
            "supplier": self._extract_supplier(lines_text),
            "invoice_number": self._extract_field(all_text, self.INVOICE_NO_PATTERNS),
            "invoice_date": self._extract_date(all_text),
            "gst_numbers": self._extract_gst(all_text),
            "totals": self._extract_totals(lines_text),
            "line_items": self._extract_line_items(pages),
        }
        result["confidence"] = self._compute_confidence(result)
        logger.info("invoice_parsed", fields=list(result.keys()))
        return result

    def _all_text(self, pages: list[DocumentPage]) -> str:
        return " ".join(w.text for p in pages for w in p.words)

    def _line_texts(self, pages: list[DocumentPage]) -> list[str]:
        return [l.text for p in pages for l in p.lines]

    def _extract_supplier(self, lines: list[str]) -> Optional[str]:
        for line in lines[:5]:
            cleaned = line.strip()
            if len(cleaned) > 3 and not any(
                kw in cleaned.lower()
                for kw in ["invoice", "tax", "bill", "gst", "date", "amount", "total", "phone"]
            ):
                return cleaned
        return None

    def _extract_field(self, text: str, patterns: list[str]) -> Optional[str]:
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    def _extract_date(self, text: str) -> Optional[str]:
        for pattern in self.DATE_PATTERNS:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return None

    def _extract_gst(self, text: str) -> list[str]:
        gst_nums = set()
        for pattern in self.GST_PATTERNS:
            for match in re.finditer(pattern, text):
                gst_nums.add(match.group(0))
        return list(gst_nums)

    def _extract_totals(self, lines: list[str]) -> dict:
        totals = {}
        for line in lines:
            lower = line.lower()
            for pattern in self.AMOUNT_PATTERNS:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    amount_str = match.group(1).replace(",", "")
                    try:
                        totals["total_amount"] = float(amount_str)
                    except ValueError:
                        pass
                    break
        return totals

    def _extract_line_items(self, pages: list[DocumentPage]) -> list[dict]:
        items = []
        for page in pages:
            for table in page.tables:
                if table.header_row:
                    items.extend(self._parse_table_rows(table.rows, table.header_row))
        if not items:
            items = self._extract_from_lines(pages)
        return items

    def _parse_table_rows(self, rows: list[list[str]], header: list[str]) -> list[dict]:
        header_lower = [h.lower().strip() for h in header]
        name_idx = self._column_index(header_lower, ["description", "item", "product", "name", "particulars"])
        qty_idx = self._column_index(header_lower, ["qty", "quantity", "pack"])
        rate_idx = self._column_index(header_lower, ["rate", "price", "mrp"])
        amount_idx = self._column_index(header_lower, ["amount", "value", "total", "net"])
        items = []
        for row in rows[1:]:
            item = {}
            if name_idx is not None and name_idx < len(row):
                item["name"] = row[name_idx]
            if qty_idx is not None and qty_idx < len(row):
                item["quantity"] = row[qty_idx]
            if rate_idx is not None and rate_idx < len(row):
                item["rate"] = row[rate_idx]
            if amount_idx is not None and amount_idx < len(row):
                item["amount"] = row[amount_idx]
            if item:
                items.append(item)
        return items

    def _column_index(self, header: list[str], candidates: list[str]) -> Optional[int]:
        for i, col in enumerate(header):
            if any(c in col for c in candidates):
                return i
        return None

    def _extract_from_lines(self, pages: list[DocumentPage]) -> list[dict]:
        items = []
        for page in pages:
            for line in page.lines:
                match = self.UNIT_PATTERN.search(line.text)
                if match:
                    items.append({
                        "name": line.text.strip(),
                        "unit_match": match.group(0),
                    })
        return items

    def _compute_confidence(self, result: dict) -> float:
        score = 0.0
        if result.get("supplier"):
            score += 0.25
        if result.get("invoice_number"):
            score += 0.25
        if result.get("invoice_date"):
            score += 0.15
        if result.get("totals"):
            score += 0.15
        if result.get("line_items"):
            score += 0.20
        return score
