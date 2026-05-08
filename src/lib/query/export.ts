import type { ExportFormat } from "@/types/queryEngine";

/**
 * Export Library for ERP Query Engine
 * Provides CSV, PDF, and JSON export functionality
 */

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Export data to CSV format
 * @param data - Array of data objects
 * @param columns - Column names (optional, will use keys if not provided)
 * @param filename - Filename for download
 * @returns CSV string
 */
export function exportToCSV(
  data: any[],
  columns?: string[],
  filename?: string
): string {
  if (!data || data.length === 0) {
    throw new Error("No data to export");
  }

  // Get columns from data if not provided
  const exportColumns = columns || Object.keys(data[0]);
  
  // Create CSV content
  const csvRows: string[] = [];
  
  // Add header row
  csvRows.push(exportColumns.join(","));
  
  // Add data rows
  data.forEach((row) => {
    const values = exportColumns.map((col) => {
      const value = row[col];
      // Handle null/undefined values
      if (value === null || value === undefined) {
        return "";
      }
      // Convert to string and escape commas and quotes
      const stringValue = String(value);
      if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(","));
  });
  
  // Add UTF-8 BOM for Excel compatibility
  const csvContent = "\uFEFF" + csvRows.join("\n");
  
  // Trigger download if filename is provided
  if (filename) {
    downloadFile(csvContent, filename, "text/csv");
  }
  
  return csvContent;
}

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Export data to JSON format
 * @param data - Array of data objects
 * @param filename - Filename for download
 * @param pretty - Whether to format JSON with indentation
 * @returns JSON string
 */
export function exportToJSON(
  data: any[],
  filename?: string,
  pretty: boolean = true
): string {
  if (!data || data.length === 0) {
    throw new Error("No data to export");
  }
  
  const jsonString = pretty 
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
  
  // Trigger download if filename is provided
  if (filename) {
    downloadFile(jsonString, filename, "application/json");
  }
  
  return jsonString;
}

// ============================================================================
// PDF Export (Simplified)
// ============================================================================

/**
 * Export data to PDF format (basic implementation)
 * @param data - Array of data objects
 * @param columns - Column names
 * @param title - Document title
 * @param filename - Filename for download
 * @returns Promise that resolves when PDF is generated
 */
export async function exportToPDF(
  data: any[],
  columns: string[],
  title: string = "Query Results",
  filename?: string
): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error("No data to export");
  }
  
  // Generate HTML content that can be opened in browser and printed to PDF
  const htmlContent = generateHTMLForPDF(data, columns, title);
  
  const pdfFilename = filename || `${title.replace(/\s+/g, "_")}.html`;
  
  downloadFile(htmlContent, pdfFilename, "text/html");
}

/**
 * Generate HTML content for PDF export
 */
function generateHTMLForPDF(
  data: any[],
  columns: string[],
  title: string
): string {
  const rows = data.map((row) => {
    const cells = columns.map((col) => {
      const value = row[col] !== null && row[col] !== undefined ? String(row[col]) : "";
      return `<td>${escapeHtml(value)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  
  const headers = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .meta { margin-bottom: 20px; color: #666; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        Generated on ${new Date().toLocaleString()}<br>
        Total records: ${data.length}
      </div>
      <table>
        <thead>
          <tr>${headers}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Download file to user's computer
 * @param content - File content (string or Blob)
 * @param filename - Filename
 * @param mimeType - MIME type
 */
function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType: string
): void {
  const blob = typeof content === "string" 
    ? new Blob([content], { type: mimeType })
    : content;
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Generate filename based on query and timestamp
 * @param query - Original query
 * @param format - Export format
 * @param timestamp - Optional timestamp
 * @returns Generated filename
 */
export function generateFilename(
  query: string,
  format: ExportFormat,
  timestamp?: Date
): string {
  const ts = timestamp || new Date();
  const dateStr = ts.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = ts.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS
  
  // Sanitize query text
  const queryText = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 30);
  
  const extension = format === "csv" ? "csv" : format === "pdf" ? "pdf" : "json";
  
  return `query_${queryText}_${dateStr}_${timeStr}.${extension}`;
}

// ============================================================================
// Advanced Export Features
// ============================================================================

/**
 * Export data with custom formatting options
 */
export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  includeHeaders?: boolean;
  dateFormat?: string;
  numberFormat?: {
    decimals?: number;
    thousandsSeparator?: string;
  };
  filterColumns?: string[];
  maxRows?: number;
}

/**
 * Advanced export function with multiple options
 */
export async function exportData(
  data: any[],
  options: ExportOptions
): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error("No data to export");
  }
  
  // Apply filters
  let filteredData = data;
  if (options.maxRows && options.maxRows > 0) {
    filteredData = data.slice(0, options.maxRows);
  }
  
  // Apply column filtering
  let columns = options.filterColumns;
  if (!columns && filteredData.length > 0) {
    columns = Object.keys(filteredData[0]);
  }
  
  // Format data
  const formattedData = filteredData.map((row) => {
    const formattedRow: any = {};
    columns?.forEach((col) => {
      let value = row[col];
      
      // Apply number formatting
      if (typeof value === "number" && options.numberFormat) {
        value = formatNumber(value, options.numberFormat);
      }
      
      // Apply date formatting
      if (value instanceof Date || (typeof value === "string" && !isNaN(Date.parse(value)))) {
        value = formatDate(value, options.dateFormat);
      }
      
      formattedRow[col] = value;
    });
    return formattedRow;
  });
  
  // Generate filename if not provided
  const filename = options.filename || generateFilename("query", options.format);
  
  // Export based on format
  switch (options.format) {
    case "csv":
      exportToCSV(formattedData, columns, filename);
      break;
    case "json":
      exportToJSON(formattedData, filename);
      break;
    case "pdf":
      await exportToPDF(formattedData, columns || [], "Query Results", filename);
      break;
    case "excel":
      // For Excel export, you would use a library like xlsx
      throw new Error("Excel export not implemented yet");
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

/**
 * Format number with specified options
 */
function formatNumber(
  num: number,
  options: NonNullable<ExportOptions["numberFormat"]>
): string {
  const { decimals = 2, thousandsSeparator = "," } = options;
  
  const fixed = num.toFixed(decimals);
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  
  return parts.join(".");
}

/**
 * Format date with specified format
 */
function formatDate(
  date: Date | string,
  format?: string
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return String(date);
  }
  
  if (!format) {
    return d.toLocaleDateString();
  }
  
  // Token-based replacement to avoid mm/MM collision
  const tokens: Record<string, string> = {
    "YYYY": d.getFullYear().toString(),
    "MM": (d.getMonth() + 1).toString().padStart(2, "0"),
    "DD": d.getDate().toString().padStart(2, "0"),
    "HH": d.getHours().toString().padStart(2, "0"),
    "mm": d.getMinutes().toString().padStart(2, "0"),
    "ss": d.getSeconds().toString().padStart(2, "0"),
  };
  
  let result = format;
  // Replace longest tokens first to avoid partial matches
  for (const token of Object.keys(tokens).sort((a, b) => b.length - a.length)) {
    result = result.replace(token, tokens[token]);
  }
  return result;
}

/**
 * Create shareable link for query results
 * @param query - Original query
 * @param options - Query options
 * @returns Shareable URL
 */
export function createShareableLink(
  query: string,
  options?: {
    includeAnalysis?: boolean;
    format?: "table" | "chart";
    maxRows?: number;
  }
): string {
  const baseUrl = window.location.origin + "/query";
  const params = new URLSearchParams();
  
  params.set("q", query);
  if (options?.includeAnalysis) {
    params.set("analysis", "true");
  }
  if (options?.format) {
    params.set("format", options.format);
  }
  if (options?.maxRows) {
    params.set("maxRows", options.maxRows.toString());
  }
  
  return `${baseUrl}?${params.toString()}`;
}
