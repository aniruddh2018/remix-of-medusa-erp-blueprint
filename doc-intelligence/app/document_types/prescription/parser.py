from app.models.contracts import DocumentPage
from app.utils.logging import logger


class PrescriptionParser:
    def parse(self, pages: list[DocumentPage]) -> dict:
        logger.warning("prescription_parser_placeholder")
        return {
            "status": "placeholder",
            "message": "Prescription parser not yet implemented. Designed for future handwriting OCR integration.",
            "medicine_blocks": self._placeholder_medicine_blocks(pages),
            "dosage_sections": [],
            "doctor_info": None,
            "patient_info": None,
        }

    def _placeholder_medicine_blocks(self, pages: list[DocumentPage]) -> list[dict]:
        blocks = []
        for page in pages:
            for para in page.paragraphs:
                text = " ".join(l.text for l in para.lines)
                blocks.append({
                    "text": text,
                    "bbox": {
                        "x1": para.bbox.x1,
                        "y1": para.bbox.y1,
                        "x2": para.bbox.x2,
                        "y2": para.bbox.y2,
                    },
                })
        return blocks
