from app.models.contracts import DocumentType, DocumentPage
from app.document_types.invoice.parser import InvoiceParser
from app.document_types.prescription.parser import PrescriptionParser
from app.document_types.receipt.parser import ReceiptParser
from app.document_types.generic.parser import GenericParser
from app.utils.logging import logger


_invoice_parser = InvoiceParser()
_prescription_parser = PrescriptionParser()
_receipt_parser = ReceiptParser()
_generic_parser = GenericParser()


async def parse_document(doc_type: DocumentType, pages: list[DocumentPage]) -> dict:
    parsers = {
        DocumentType.INVOICE: _invoice_parser,
        DocumentType.PRESCRIPTION: _prescription_parser,
        DocumentType.RECEIPT: _receipt_parser,
        DocumentType.GENERIC: _generic_parser,
        DocumentType.UNKNOWN: _generic_parser,
    }
    parser = parsers.get(doc_type, _generic_parser)
    logger.info("parsing_document", type=doc_type.value)
    return parser.parse(pages)
