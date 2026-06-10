// TypeScript client for Document Intelligence Service
// Use in any Node.js / browser app (not just Supabase Edge Functions)

interface DocIntelligenceClientOptions {
  baseUrl?: string;
  timeout?: number;
}

export class DocIntelligenceClient {
  private baseUrl: string;
  private timeout: number;

  constructor(options: DocIntelligenceClientOptions = {}) {
    this.baseUrl = options.baseUrl || "http://localhost:8000";
    this.timeout = options.timeout || 60000;
  }

  async processImage(
    image: File | Blob,
    documentType: "auto" | "invoice" | "prescription" | "receipt" = "auto"
  ) {
    const formData = new FormData();
    formData.append("file", image);
    formData.append("document_type", documentType);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/documents/process`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`OCR service error: ${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async processUrl(url: string, documentType: "auto" | "invoice" | "prescription" | "receipt" = "auto") {
    const formData = new FormData();
    formData.append("url", url);
    formData.append("document_type", documentType);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/documents/process`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`OCR service error: ${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async health() {
    const response = await fetch(`${this.baseUrl}/documents/health`);
    return response.json();
  }
}

// Usage:
// const client = new DocIntelligenceClient({ baseUrl: "http://localhost:8000" });
// const result = await client.processImage(file, "invoice");
// console.log(result.structured_data.line_items);
