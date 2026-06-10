// Supabase Edge Function: scan-invoice
// Calls the Document Intelligence OCR service
// File: supabase/functions/scan-invoice/index.ts

interface OCRServiceResponse {
  success: boolean;
  document_type: "invoice" | "prescription" | "receipt" | "generic" | "unknown";
  orientation: number;
  pages: Array<{
    page_number: number;
    width: number;
    height: number;
    words: Array<{
      text: string;
      confidence: number;
      bbox: { x1: number; y1: number; x2: number; y2: number };
      reading_order_index: number;
    }>;
    lines: Array<{
      words: Array<{ text: string; confidence: number; bbox: any }>;
      bbox: { x1: number; y1: number; x2: number; y2: number };
      confidence: number;
      reading_order_index: number;
    }>;
    paragraphs: Array<{
      lines: any[];
      bbox: { x1: number; y1: number; x2: number; y2: number };
    }>;
    tables: Array<{
      rows: string[][];
      header_row: string[];
      bbox: { x1: number; y1: number; x2: number; y2: number };
      confidence: number;
      column_boundaries: number[];
    }>;
  }>;
  structured_data: {
    supplier?: string;
    invoice_number?: string;
    invoice_date?: string;
    gst_numbers?: string[];
    totals?: { total_amount?: number };
    line_items?: Array<{
      name?: string;
      quantity?: string;
      rate?: string;
      amount?: string;
    }>;
  };
  metadata: {
    processing_time_ms: number;
    ocr_confidence_avg: number;
    table_count: number;
    complexity_score: number;
  };
  complexity: {
    blur_score: number;
    rotation_score: number;
    ocr_confidence_penalty: number;
    table_density_score: number;
    overall: number;
  };
  errors: string[];
}

export async function callDocIntelligence(
  imageBase64: string,
  documentType: "auto" | "invoice" | "prescription" = "auto"
): Promise<OCRServiceResponse> {
  const OCR_SERVICE_URL = Deno.env.get("DOC_INTELLIGENCE_URL") || "http://localhost:8000";

  const formData = new FormData();
  const imageBlob = await fetch(`data:image/png;base64,${imageBase64}`).then(r => r.blob());
  formData.append("file", imageBlob, "invoice.png");
  if (documentType !== "auto") {
    formData.append("document_type", documentType);
  }

  const response = await fetch(`${OCR_SERVICE_URL}/documents/process`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OCR service error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

// Usage inside scan-invoice/index.ts:
async function stageA_extractRawTextWithLayout(imageBase64: string) {
  const ocrResult = await callDocIntelligence(imageBase64, "invoice");
  return {
    rawText: ocrResult.pages.flatMap(p => p.lines.map(l => l.words.map(w => w.text).join(" "))).join("\n"),
    layout: {
      lines: ocrResult.pages.flatMap(p => p.lines),
      tables: ocrResult.pages.flatMap(p => p.tables),
      paragraphs: ocrResult.pages.flatMap(p => p.paragraphs),
    },
    metadata: ocrResult.metadata,
    complexity: ocrResult.complexity,
  };
}
