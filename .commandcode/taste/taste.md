# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# ERP Development
- Build keyboard-first ERP systems where all actions work without mouse. Confidence: 0.90
- Implement deterministic focus management with strict navigation flows (Enter=next, Shift+Enter=previous). Confidence: 0.85
- Maintain identical UX patterns between Sales and Purchase modules. Confidence: 0.80
- Follow attached plan files exactly; do not modify plan files, mark todos as in_progress. Confidence: 0.85

# Keyboard Navigation
- Create centralized keyboard manager with reusable hooks for focus control and shortcuts. Confidence: 0.85
- Support Excel-like grid navigation with arrow keys, Enter to edit, Esc to exit. Confidence: 0.80
- Implement focus zones (form, table, sidebar) with Tab between zones, arrows within zones. Confidence: 0.75

# Code Architecture
- Build reusable navigation engines rather than scattered per-component fixes. Confidence: 0.80
- Use semantic HTML and ARIA roles for accessibility compliance. Confidence: 0.70

# Batch & Inventory
- Keep MRP_xxx synthetic batch numbers for products without real batch numbers; never auto-generate expiry dates (expiry must be manually entered or extracted from invoice). Confidence: 0.65

# AI Invoice Extraction
- Do not stuff entire product DB into the extraction prompt; LLM should extract reality from the invoice, not guess from ERP. Confidence: 0.90
- Split extraction into stages: OCR → layout detection → structured extraction → product reconciliation; never use one mega-prompt. Confidence: 0.85
- Validate all LLM-extracted data with Zod schemas (dates, quantities, GST, totals); never trust raw LLM JSON. Confidence: 0.85
- Flag anomalies automatically: GST > 40%, negative quantity, expiry before invoice date, MRP < purchase price. Confidence: 0.80
- Mark extracted values as low confidence if they are not visibly present in the OCR output (hallucination protection). Confidence: 0.80

# Python Services
- Avoid LangChain, LangGraph, and agent frameworks; build with direct library integrations (FastAPI, Pydantic). Confidence: 0.80
- OCR output must preserve spatial data (bounding boxes, coordinates, reading order) — never return raw text blobs. Confidence: 0.70
- Use Fireworks API for LLM calls; hardcode API key in code for testing. Confidence: 0.50

# Workflow
- Use ngrok for exposing local services to the internet (not localtunnel or bore). Confidence: 0.65

# Product Matching
See [product-matching/taste.md](product-matching/taste.md)
