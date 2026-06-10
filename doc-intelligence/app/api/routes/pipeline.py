from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Optional, AsyncGenerator
import httpx
import json
import re
import time
import asyncio
from app.core.pipeline.orchestrator import DocumentPipeline
from app.utils.logging import logger

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

# ═══════════════════════════════════════════════════
# HARDCODED — replace with your actual key
# ═══════════════════════════════════════════════════
FIREWORKS_API_KEY = "fw_CU71eX6DC3Y4ixfTwLeHS8"
FIREWORKS_BASE = "https://api.fireworks.ai/inference/v1"
TEXT_MODEL = "accounts/fireworks/models/kimi-k2p5"
EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5"

_pipeline: Optional[DocumentPipeline] = None


def get_pipeline() -> DocumentPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = DocumentPipeline()
    return _pipeline


def extract_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    return json.loads(cleaned)


async def stage_b_extract(raw_text: str, layout: dict) -> dict:
    """Stage B: LLM structured extraction from OCR text"""
    prompt = f"""You are a purchase invoice data extraction engine. Extract structured data from raw OCR text.

RULES:
- Extract data EXACTLY as it appears in the text. Do NOT guess, correct, or substitute values.
- Extract the product name as written on the invoice — do NOT normalize it.
- For dates, use YYYY-MM-DD format.
- For amounts, use numbers without currency symbols.
- If a field is not present, use null.
- Every line item MUST include raw_text: the exact OCR text span for that row (for verification).

The invoice layout is: {json.dumps(layout)}"""

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{FIREWORKS_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {FIREWORKS_API_KEY}"},
            json={
                "model": TEXT_MODEL,
                "messages": [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": raw_text[:12000]},
                ],
                "tools": [{
                    "type": "function",
                    "function": {
                        "name": "extract_invoice_data",
                        "description": "Extract structured purchase invoice data from raw OCR text",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "supplier_name": {"type": "string"},
                                "supplier_gst": {"type": "string", "nullable": True},
                                "supplier_dl_number": {"type": "string", "nullable": True},
                                "supplier_address": {"type": "string", "nullable": True},
                                "supplier_phone": {"type": "string", "nullable": True},
                                "supplier_email": {"type": "string", "nullable": True},
                                "invoice_number": {"type": "string"},
                                "invoice_date": {"type": "string", "description": "YYYY-MM-DD"},
                                "challan_number": {"type": "string", "nullable": True},
                                "line_items": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "product_name": {"type": "string"},
                                            "batch_number": {"type": "string", "nullable": True},
                                            "expiry_date": {"type": "string", "nullable": True},
                                            "manufacturing_date": {"type": "string", "nullable": True},
                                            "quantity": {"type": "number"},
                                            "free_quantity": {"type": "number", "nullable": True},
                                            "purchase_price": {"type": "number"},
                                            "mrp": {"type": "number"},
                                            "gst_percentage": {"type": "number"},
                                            "discount_percentage": {"type": "number", "nullable": True},
                                            "hsn_code": {"type": "string", "nullable": True},
                                            "total_price": {"type": "number"},
                                            "extraction_confidence": {"type": "number"},
                                            "raw_text": {"type": "string"},
                                        },
                                        "required": ["product_name", "quantity", "purchase_price", "mrp", "gst_percentage", "total_price", "raw_text"],
                                    },
                                },
                                "freight_charges": {"type": "number", "nullable": True},
                                "handling_charges": {"type": "number", "nullable": True},
                                "other_charges": {"type": "number", "nullable": True},
                                "discount_amount": {"type": "number", "nullable": True},
                                "gst_amount": {"type": "number", "nullable": True},
                                "total_amount": {"type": "number"},
                            },
                            "required": ["supplier_name", "invoice_number", "invoice_date", "line_items", "total_amount"],
                        },
                    },
                }],
                "tool_choice": {"type": "function", "function": {"name": "extract_invoice_data"}},
                "max_tokens": 4096,
                "temperature": 0,
            },
        )
        data = resp.json()
        tool_call = data.get("choices", [{}])[0].get("message", {}).get("tool_calls", [{}])
        if not tool_call or not tool_call[0]:
            raise Exception(f"LLM did not return structured data: {json.dumps(data)[:500]}")
        return extract_json(tool_call[0]["function"]["arguments"])


def stage_c_validate(extracted: dict) -> dict:
    """Stage C: Basic validation and anomaly detection"""
    anomalies = []
    items = extracted.get("line_items", [])

    for i, item in enumerate(items):
        gst = item.get("gst_percentage", 0)
        if isinstance(gst, (int, float)) and gst > 40:
            anomalies.append({"line": i, "type": "high_gst", "detail": f"GST {gst}%"})

        qty = item.get("quantity", 0)
        if isinstance(qty, (int, float)) and qty < 0:
            anomalies.append({"line": i, "type": "negative_qty", "detail": f"Qty {qty}"})

        mrp = item.get("mrp", 0)
        price = item.get("purchase_price", 0)
        if isinstance(mrp, (int, float)) and isinstance(price, (int, float)) and mrp > 0 and price > 0 and mrp < price:
            anomalies.append({"line": i, "type": "mrp_below_cost", "detail": f"MRP {mrp} < Price {price}"})

    validation_errors = []
    if not extracted.get("supplier_name"):
        validation_errors.append("Missing supplier_name")
    if not extracted.get("invoice_number"):
        validation_errors.append("Missing invoice_number")
    if not extracted.get("invoice_date"):
        validation_errors.append("Missing invoice_date")
    if not items:
        validation_errors.append("No line items found")

    return {
        "anomalies": anomalies,
        "validation_errors": validation_errors,
        "passed": len(validation_errors) == 0,
    }


@router.post("/scan-stream")
async def scan_invoice_stream(file: UploadFile = File(...)):
    """Full pipeline with SSE progress streaming"""

    async def sse_event(event_type: str, data: dict) -> str:
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    async def event_generator() -> AsyncGenerator[str, None]:
        if FIREWORKS_API_KEY == "YOUR_FIREWORKS_API_KEY_HERE":
                yield await sse_event("error", {"msg": "Set FIREWORKS_API_KEY in pipeline.py", "stage": "config"})
                return

        image_bytes = await file.read()
        yield await sse_event("log", {
            "stage": "start", "msg": f"Received {file.filename} ({len(image_bytes)} bytes)", "level": "info"
        })

        pipeline = get_pipeline()
        timing = {}

        # ── Stage A: OCR ──
        yield await sse_event("stage", {"stage": "A", "status": "active", "label": "OCR"})
        yield await sse_event("log", {
            "stage": "A", "msg": "Starting PaddleOCR pipeline (orientation → preprocess → OCR → layout → classify → parse)", "level": "info"
        })
        t0 = time.time()
        try:
            doc = await pipeline.process(image_bytes)
            timing["stage_a_ocr_ms"] = round((time.time() - t0) * 1000)

            word_count = sum(len(p.words) for p in (doc.pages or []))
            line_count = sum(len(p.lines) for p in (doc.pages or []))
            table_count = sum(len(p.tables) for p in (doc.pages or []))
            conf_avg = doc.metadata.ocr_confidence_avg if doc.metadata else 0

            yield await sse_event("log", {
                "stage": "A", "msg": f"OCR complete: {word_count} words, {line_count} lines, {table_count} tables, {conf_avg:.1%} avg confidence", "level": "info",
                "metrics": {"words": word_count, "lines": line_count, "tables": table_count, "confidence": round(conf_avg, 3)}
            })

            raw_text = "\n".join(
                " ".join(w.text for w in line.words)
                for page in (doc.pages or [])
                for line in (page.lines or [])
            )

            yield await sse_event("log", {
                "stage": "A", "msg": f"Assembled raw text: {len(raw_text)} characters", "level": "info"
            })

            layout = {
                "document_type": str(doc.document_type.value) if doc.document_type else "unknown",
                "tables": [{"header_row": t.header_row, "rows": t.rows} for t in
                           (doc.pages[0].tables if doc.pages and doc.pages[0].tables else [])],
                "table_count": table_count,
                "page_count": len(doc.pages or []),
                "ocr_confidence_avg": conf_avg,
                "complexity": doc.complexity.model_dump() if doc.complexity else {},
                "heuristic_supplier": doc.structured_data.get("supplier") if doc.structured_data else None,
                "heuristic_invoice_number": doc.structured_data.get("invoice_number") if doc.structured_data else None,
                "heuristic_line_items": doc.structured_data.get("line_items", []) if doc.structured_data else [],
            }

            yield await sse_event("stage", {"stage": "A", "status": "done", "label": "OCR", "elapsed_ms": timing["stage_a_ocr_ms"]})
        except Exception as e:
            logger.error("stage_a_failed", error=str(e))
            yield await sse_event("stage", {"stage": "A", "status": "fail", "label": "OCR"})
            yield await sse_event("error", {"msg": f"OCR failed: {e}", "stage": "A"})
            return

        if not raw_text.strip():
            yield await sse_event("error", {"msg": "No text extracted from image", "stage": "A"})
            return

        # ── Stage B: LLM Extraction ──
        yield await sse_event("stage", {"stage": "B", "status": "active", "label": "LLM Extract"})
        yield await sse_event("log", {
            "stage": "B", "msg": f"Sending {len(raw_text[:12000])} chars to {TEXT_MODEL} with function calling", "level": "info"
        })
        t0 = time.time()
        try:
            extracted = await stage_b_extract(raw_text, layout)
            timing["stage_b_llm_ms"] = round((time.time() - t0) * 1000)
            item_count = len(extracted.get("line_items", []))
            yield await sse_event("log", {
                "stage": "B", "msg": f"LLM extracted: supplier={extracted.get('supplier_name','?')}, invoice={extracted.get('invoice_number','?')}, {item_count} line items, total=₹{extracted.get('total_amount','?')}", "level": "info",
                "metrics": {"supplier": extracted.get("supplier_name"), "invoice": extracted.get("invoice_number"), "items": item_count, "total": extracted.get("total_amount")}
            })
            yield await sse_event("stage", {"stage": "B", "status": "done", "label": "LLM Extract", "elapsed_ms": timing["stage_b_llm_ms"]})
        except Exception as e:
            logger.error("stage_b_failed", error=str(e))
            yield await sse_event("stage", {"stage": "B", "status": "fail", "label": "LLM Extract"})
            yield await sse_event("error", {"msg": f"LLM extraction failed: {e}", "stage": "B", "raw_text_preview": raw_text[:500]})
            return

        # ── Stage C: Validation ──
        yield await sse_event("stage", {"stage": "C", "status": "active", "label": "Validate"})
        t0 = time.time()
        validation = stage_c_validate(extracted)
        timing["stage_c_validation_ms"] = round((time.time() - t0) * 1000)

        anom_count = len(validation.get("anomalies", []))
        err_count = len(validation.get("validation_errors", []))
        passed = validation.get("passed", False)

        if passed:
            yield await sse_event("log", {"stage": "C", "msg": f"Validation PASSED (no schema errors)", "level": "info"})
        else:
            yield await sse_event("log", {"stage": "C", "msg": f"Validation FAILED: {err_count} schema errors", "level": "warn", "errors": validation.get("validation_errors")})
        if anom_count:
            yield await sse_event("log", {"stage": "C", "msg": f"Anomalies detected: {anom_count}", "level": "warn", "anomalies": validation.get("anomalies")})

        yield await sse_event("stage", {"stage": "C", "status": "done", "label": "Validate", "elapsed_ms": timing["stage_c_validation_ms"]})

        total_ms = sum(timing.values())
        yield await sse_event("log", {
            "stage": "done", "msg": f"Pipeline complete in {total_ms}ms (A:{timing['stage_a_ocr_ms']}ms + B:{timing['stage_b_llm_ms']}ms + C:{timing['stage_c_validation_ms']}ms)", "level": "info"
        })

        yield await sse_event("result", {
            "success": True,
            **extracted,
            "validation": validation,
            "ocr_metadata": {
                "document_type": layout["document_type"],
                "ocr_confidence_avg": layout["ocr_confidence_avg"],
                "raw_text_length": len(raw_text),
                "tables_found": layout["table_count"],
            },
            "timing": timing,
            "raw_text": raw_text[:2000],
        })

    async def safe_generator():
        try:
            async for event in event_generator():
                yield event
        except Exception as e:
            logger.error("pipeline_stream_failed", error=str(e))
            yield await sse_event("error", {"msg": str(e), "stage": "internal"})

    return StreamingResponse(
        safe_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/scan")
async def scan_invoice(file: UploadFile = File(...)):
    """Full pipeline: OCR → Extract → Validate (no Supabase)"""
    if FIREWORKS_API_KEY == "YOUR_FIREWORKS_API_KEY_HERE":
        return JSONResponse({"error": "Set FIREWORKS_API_KEY in pipeline.py"}, status_code=500)

    image_bytes = await file.read()
    pipeline = get_pipeline()
    timing = {}

    # ── Stage A: OCR ──
    import time
    t0 = time.time()
    try:
        doc = await pipeline.process(image_bytes)
        timing["stage_a_ocr_ms"] = round((time.time() - t0) * 1000)

        raw_text = "\n".join(
            " ".join(w.text for w in line.words)
            for page in (doc.pages or [])
            for line in (page.lines or [])
        )
        layout = {
            "document_type": str(doc.document_type.value) if doc.document_type else "unknown",
            "tables": [{"header_row": t.header_row, "rows": t.rows} for t in
                       (doc.pages[0].tables if doc.pages and doc.pages[0].tables else [])],
            "table_count": sum(len(p.tables) for p in (doc.pages or [])),
            "page_count": len(doc.pages or []),
            "ocr_confidence_avg": doc.metadata.ocr_confidence_avg if doc.metadata else 0,
            "complexity": doc.complexity.model_dump() if doc.complexity else {},
            "heuristic_supplier": doc.structured_data.get("supplier") if doc.structured_data else None,
            "heuristic_invoice_number": doc.structured_data.get("invoice_number") if doc.structured_data else None,
            "heuristic_line_items": doc.structured_data.get("line_items", []) if doc.structured_data else [],
        }
    except Exception as e:
        logger.error("stage_a_failed", error=str(e))
        return JSONResponse({"error": f"Stage A (OCR) failed: {e}", "stage": "A"}, status_code=500)

    if not raw_text.strip():
        return JSONResponse({"error": "No text extracted from image", "stage": "A"}, status_code=422)

    # ── Stage B: LLM Extraction ──
    t0 = time.time()
    try:
        extracted = await stage_b_extract(raw_text, layout)
        timing["stage_b_llm_ms"] = round((time.time() - t0) * 1000)
    except Exception as e:
        logger.error("stage_b_failed", error=str(e))
        return JSONResponse({
            "error": f"Stage B (LLM extraction) failed: {e}",
            "stage": "B",
            "raw_text_preview": raw_text[:500],
        }, status_code=500)

    # ── Stage C: Validation ──
    t0 = time.time()
    validation = stage_c_validate(extracted)
    timing["stage_c_validation_ms"] = round((time.time() - t0) * 1000)

    return {
        "success": True,
        **extracted,
        "validation": validation,
        "ocr_metadata": {
            "document_type": layout["document_type"],
            "ocr_confidence_avg": layout["ocr_confidence_avg"],
            "raw_text_length": len(raw_text),
            "tables_found": layout["table_count"],
        },
        "timing": timing,
        "raw_text": raw_text[:2000],
    }
