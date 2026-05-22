# Graph Report - remix-of-medusa-erp-blueprint  (2026-05-16)

## Corpus Check
- 258 files · ~284,472 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 999 nodes · 1484 edges · 28 communities detected
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 429 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `toast()` - 57 edges
2. `DocumentPage` - 30 edges
3. `BoundingBox` - 23 edges
4. `PreprocessingPipeline` - 22 edges
5. `InvoiceParser` - 21 edges
6. `TableDetector` - 20 edges
7. `ComplexityScorer` - 17 edges
8. `PaddleOCRProvider` - 17 edges
9. `OCRWord` - 17 edges
10. `parseAutomationText()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `handleScan()` --calls--> `text()`  [INFERRED]
  src/pages/ScanInvoice.tsx → doc-intelligence/app/models/contracts.py
- `stageA_extractRawTextWithLayout()` --calls--> `text()`  [INFERRED]
  supabase/functions/scan-invoice/index.ts → doc-intelligence/app/models/contracts.py
- `stageB_extractStructured()` --calls--> `text()`  [INFERRED]
  supabase/functions/scan-invoice/index.ts → doc-intelligence/app/models/contracts.py
- `handleFileChange()` --calls--> `text()`  [INFERRED]
  src/pages/DataImport.tsx → doc-intelligence/app/models/contracts.py
- `handleAddManualProduct()` --calls--> `toast()`  [INFERRED]
  src/components/dialogs/DebitNoteDialog.tsx → src/hooks/use-toast.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (68): downloadCSV(), downloadCustomerLedger(), downloadSupplierLedger(), paymentStatusBadge(), escapeSQL(), switchTo(), handleSubmit(), if() (+60 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (30): ABC, BaseModel, BoundingBox, DocumentPage, OCRLine, OCRParagraph, OCRTable, OCRWord (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (23): Config, DocumentType, PipelineContext, ProcessedDocument, ProcessingMetadata, OrientationDetector, rotate_image(), DocumentClassifier (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (17): AdaptiveThresholdStep, ContrastEnhanceStep, DenoiseStep, GrayscaleStep, SharpenStep, DeskewStep, PerspectiveCorrectionStep, create_default_preprocessing_pipeline() (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (30): AppLayout(), useAuth(), BaseSettings, BusinessProvider(), useBusiness(), EditPurchaseOrderDialog(), EditSaleDialog(), handleCartUpdate() (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (43): buildConversationMessage(), callAIAssistant(), beginSalesConversation(), clearPrescriptionAttachment(), confirmDraft(), createCustomerFromChat(), extractMobile(), findCustomerByMobile() (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (11): setCustomerName(), setNotes(), handleAddManualProduct(), handleSelectInvoice(), handleTableKeyDown(), removeReturnItem(), reset(), handleAddManualProduct() (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (19): bulkGenerateFingerprints(), checkForDuplicate(), compareProducts(), deepNormalize(), detectDuplicates(), generateProductFingerprintDB(), getDuplicateStats(), normalize() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (12): downloadFile(), escapeHtml(), exportData(), exportToCSV(), exportToJSON(), exportToPDF(), generateFilename(), generateHTMLForPDF() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (6): handleCreateUser(), handleLogin(), parse_document(), InvoiceParser, _make_invoice_page(), TestInvoiceParser

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (16): downloadBillCSV(), downloadBillHTML(), downloadBillPDF(), generateBillCSV(), generateBillHTML(), printBill(), handleBillAction(), downloadConfigurableInvoiceHTML() (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.15
Nodes (17): removeRow(), saveAll(), assertPositiveFactor(), cacheKey(), clearConversionCache(), computeStockImpact(), convertToBase(), describeBaseConversion() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (11): clearSelection(), handleChipKeyDown(), handleKeyDown(), isFieldEmpty(), isRequiredAndEmpty(), shakeAndWarn(), showInlineHint(), handleSelect() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (5): ComplexityScorer, ComplexityScores, _make_image_bytes(), _make_pages(), TestComplexityScorer

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (12): text(), handleFileChange(), handleImport(), parseCSV(), checkHallucination(), detectAnomalies(), extractJSON(), stageA_extractRawTextWithLayout() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.23
Nodes (7): ClassificationError, DocumentIntelligenceError, LayoutError, OCRFailureError, ParsingError, PreprocessingError, Exception

### Community 16 - "Community 16"
Cohesion: 0.21
Nodes (1): KeyboardManagerImpl

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (12): canHijackHorizontalInputNavigation(), findInnerFocusable(), focusCell(), handleGridNavigationKeydown(), isDisabled(), isHTMLElement(), isNavigableCell(), isVisible() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (4): createAlias(), findAlias(), mapToAlias(), suggestAliases()

### Community 19 - "Community 19"
Cohesion: 0.31
Nodes (7): formatShortcut(), getPlatform(), getShortcutDisplay(), isMac(), isPrimaryModifier(), matchesShortcut(), ShortcutHint()

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (5): calculateCorrelation(), createDataSummary(), detectTrends(), generateBasicNarrative(), generateNarrative()

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (6): fetchTableData(), generateBackupSQL(), getLastBackupDate(), rowToInsert(), setLastBackupDate(), BackupSection()

### Community 22 - "Community 22"
Cohesion: 0.32
Nodes (3): evaluateFormula(), generateMockData(), testCalculation()

### Community 23 - "Community 23"
Cohesion: 0.52
Nodes (6): buildHSNSummary(), downloadElectronicsInvoiceHTML(), downloadElectronicsInvoicePDF(), generateElectronicsInvoiceHTML(), numberToWords(), printElectronicsInvoice()

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (1): DocIntelligenceClient

### Community 26 - "Community 26"
Cohesion: 0.47
Nodes (3): focusTarget(), isDisabled(), isElementVisible()

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (2): allocateBatchesFIFO(), batchBaseAvailable()

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): generateLedgerPDF(), numberToWords()

## Knowledge Gaps
- **1 isolated node(s):** `Config`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 16`** (13 nodes): `isTextInputActive()`, `KeyboardManagerImpl`, `.ensureListener()`, `.getActiveScopes()`, `.listRegistered()`, `.notify()`, `.popScope()`, `.pushScope()`, `.register()`, `.__resetForTests()`, `.shouldFireInInputContext()`, `.subscribe()`, `manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (6 nodes): `DocIntelligenceClient.ts`, `DocIntelligenceClient`, `.constructor()`, `.health()`, `.processImage()`, `.processUrl()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (4 nodes): `allocateBatchesFIFO()`, `batchBaseAvailable()`, `getTotalAvailableStock()`, `fifoAllocation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (3 nodes): `generateLedgerPDF()`, `numberToWords()`, `ledgerPdfGenerator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toast()` connect `Community 0` to `Community 5`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 11`, `Community 14`?**
  _High betweenness centrality (0.333) - this node is a cross-community bridge._
- **Why does `handleScan()` connect `Community 0` to `Community 9`, `Community 14`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `text()` connect `Community 14` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Are the 54 inferred relationships involving `toast()` (e.g. with `switchTo()` and `handleParse()`) actually correct?**
  _`toast()` has 54 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `DocumentPage` (e.g. with `ComplexityScorer` and `TableDetector`) actually correct?**
  _`DocumentPage` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `BoundingBox` (e.g. with `TableDetector` and `LayoutReconstructor`) actually correct?**
  _`BoundingBox` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `PreprocessingPipeline` (e.g. with `PreprocessingStep` and `GrayscaleStep`) actually correct?**
  _`PreprocessingPipeline` has 14 INFERRED edges - model-reasoned connections that need verification._