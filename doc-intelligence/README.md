# Document Intelligence Service

Local-first OCR and document processing service for pharmacy invoices, handwritten prescriptions, receipts, and medical documents.

## Architecture

```
UPLOAD → PREPROCESS → ORIENTATION → CLASSIFY → OCR → LAYOUT → PARSE → STRUCTURED DATA
```

## Prerequisites

- Python 3.11+
- pip

## Local Setup

```bash
cd doc-intelligence

# Create virtual environment
python3 -m venv venv

# Activate (macOS/Linux)
source venv/bin/activate

# Activate (Windows)
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env

# Start the service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### `POST /documents/process`

Process a document image.

**Input**: multipart/form-data
- `file` (file upload) OR `url` (image URL)
- `document_type` (optional): `auto|invoice|prescription|receipt|generic`

**Response**: JSON with OCR words, lines, paragraphs, tables, and structured data.

```bash
curl -X POST http://localhost:8000/documents/process \
  -F "file=@invoice.jpg" \
  -F "document_type=auto"
```

### `GET /documents/health`

Health check endpoint.

## Project Structure

```
doc-intelligence/
├── app/
│   ├── main.py                          # FastAPI entry point
│   ├── api/routes/documents.py          # API routes
│   ├── config/settings.py               # Environment config
│   ├── models/contracts.py              # Pydantic data contracts
│   ├── core/
│   │   ├── preprocessing/               # Image filters & geometry
│   │   │   ├── step.py                  # PreprocessingStep interface
│   │   │   ├── filters.py               # Grayscale, denoise, sharpen, etc.
│   │   │   ├── geometry.py              # Deskew, perspective correction
│   │   │   └── pipeline.py              # Composable preprocessing pipeline
│   │   ├── orientation/detector.py      # Hough-line based orientation detection
│   │   ├── ocr/
│   │   │   ├── provider.py              # OCRProvider interface
│   │   │   ├── paddle_provider.py       # PaddleOCR implementation
│   │   │   ├── handwriting_provider.py  # Handwriting OCR placeholder
│   │   │   └── factory.py               # Provider factory
│   │   ├── layout/
│   │   │   ├── provider.py              # LayoutReconstructionProvider interface
│   │   │   ├── reconstructor.py         # Paragraph & reading order
│   │   │   └── spatial_provider.py      # Spatial layout provider
│   │   ├── tables/detector.py           # Table region detection & extraction
│   │   ├── classification/
│   │   │   ├── provider.py              # DocumentClassifier interface
│   │   │   └── heuristic.py             # Keyword-based classifier
│   │   └── pipeline/
│   │       ├── orchestrator.py          # Full pipeline orchestration
│   │       └── complexity.py            # Image complexity scoring
│   ├── document_types/
│   │   ├── dispatcher.py                # Routes to correct parser
│   │   ├── invoice/parser.py            # Invoice field extraction
│   │   ├── prescription/parser.py       # Prescription placeholder
│   │   ├── receipt/parser.py            # Receipt placeholder
│   │   └── generic/parser.py            # Generic fallback parser
│   └── utils/
│       ├── logging.py                   # Structured logging
│       ├── errors.py                    # Error hierarchy
│       ├── image_io.py                  # Image conversion utilities
│       └── timing.py                    # Performance timing
├── SupabaseIntegration.ts               # Supabase Edge Function caller
├── DocIntelligenceClient.ts             # TypeScript client library
├── requirements.txt
├── .env.example
└── README.md
```

## Key Design Principles

1. **OCR is infrastructure, not business logic** — No ERP concepts leak into the OCR layer
2. **Preserve geometry before semantics** — Every token carries coordinates and confidence
3. **Layout reconstruction before interpretation** — Spatial structure before field extraction
4. **Explicit contracts over implicit structures** — Pydantic models at every boundary
5. **Deterministic processing before AI inference** — Heuristics, then ML

## Configuration

All configuration via environment variables (prefix `DOCINTEL_`). See `.env.example`.
