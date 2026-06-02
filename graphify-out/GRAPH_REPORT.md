# Graph Report - remix-of-medusa-erp-blueprint  (2026-06-02)

## Corpus Check
- 298 files · ~374,637 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1241 nodes · 1852 edges · 32 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 490 edges (avg confidence: 0.73)
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
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 45|Community 45]]

## God Nodes (most connected - your core abstractions)
1. `toast()` - 60 edges
2. `DocumentPage` - 30 edges
3. `BoundingBox` - 23 edges
4. `PreprocessingPipeline` - 22 edges
5. `String()` - 22 edges
6. `InvoiceParser` - 21 edges
7. `TableDetector` - 20 edges
8. `DocumentPipeline` - 19 edges
9. `PaddleOCRProvider` - 18 edges
10. `ComplexityScorer` - 17 edges

## Surprising Connections (you probably didn't know these)
- `stageC_reconcileProducts()` --calls--> `String()`  [INFERRED]
  supabase/functions/scan-invoice/index.ts → src/components/settings/FormConfigEditor.tsx
- `confirmEntity()` --calls--> `String()`  [INFERRED]
  supabase/functions/migration-staging/index.ts → src/components/settings/FormConfigEditor.tsx
- `text()` --calls--> `String()`  [INFERRED]
  supabase/functions/tally-import/index.ts → src/components/settings/FormConfigEditor.tsx
- `extractGstDetails()` --calls--> `String()`  [INFERRED]
  supabase/functions/tally-import/index.ts → src/components/settings/FormConfigEditor.tsx
- `text()` --calls--> `handleScan()`  [INFERRED]
  doc-intelligence/app/models/contracts.py → src/pages/ScanInvoice.tsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (64): downloadCSV(), downloadSupplierLedger(), downloadUnifiedLedger(), paymentStatusBadge(), handleCreateUser(), handleLogin(), switchTo(), handleSubmit() (+56 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (28): BaseModel, BoundingBox, DocumentPage, OCRLine, OCRParagraph, OCRTable, OCRWord, TableDetector (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (40): AppLayout(), useAuth(), escapeSQL(), fetchTableData(), generateBackupSQL(), getLastBackupDate(), rowToInsert(), setLastBackupDate() (+32 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (34): Config, DocumentType, PipelineContext, ProcessedDocument, ProcessingMetadata, OrientationDetector, rotate_image(), parse_document() (+26 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (34): formatDate(), String(), calculateQualityMetrics(), dateRule(), detectAnomalies(), emailRule(), getEntityRules(), getRowErrors() (+26 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (17): AdaptiveThresholdStep, ContrastEnhanceStep, DenoiseStep, GrayscaleStep, SharpenStep, DeskewStep, PerspectiveCorrectionStep, create_default_preprocessing_pipeline() (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (23): text(), suggestFieldMappings(), parseCSV(), parseCSVLine(), parseCSVText(), parseExcel(), parseFile(), parseJSON() (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (42): buildConversationMessage(), callAIAssistant(), beginSalesConversation(), clearPrescriptionAttachment(), confirmDraft(), createCustomerFromChat(), extractMobile(), findCustomerByMobile() (+34 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (27): closeFinancialYear(), importLedgersFromCsv(), mergeLedgers(), openFinancialYear(), bulkSyncCustomersToLedgers(), bulkSyncSuppliersToLedgers(), syncCustomerToLedger(), syncSupplierToLedger() (+19 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (11): setCustomerName(), setNotes(), handleAddManualProduct(), handleSelectInvoice(), handleTableKeyDown(), removeReturnItem(), reset(), handleAddManualProduct() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (19): bulkGenerateFingerprints(), checkForDuplicate(), compareProducts(), deepNormalize(), detectDuplicates(), generateProductFingerprintDB(), getDuplicateStats(), normalize() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (13): downloadFile(), escapeHtml(), exportData(), exportToCSV(), exportToJSON(), exportToPDF(), generateFilename(), generateHTMLForPDF() (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (15): clearSelection(), handleChipKeyDown(), handleKeyDown(), isFieldEmpty(), isRequiredAndEmpty(), shakeAndWarn(), showInlineHint(), deleteTemplate() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (16): downloadBillCSV(), downloadBillHTML(), downloadBillPDF(), generateBillCSV(), generateBillHTML(), printBill(), handleBillAction(), downloadConfigurableInvoiceHTML() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (16): classifyGroupType(), classifyLedgerRoles(), confirmImport(), createImportSession(), fromDbSession(), getImportSession(), rollbackImport(), stageGroups() (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (17): removeRow(), saveAll(), assertPositiveFactor(), cacheKey(), clearConversionCache(), computeStockImpact(), convertToBase(), describeBaseConversion() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (5): ComplexityScorer, ComplexityScores, _make_image_bytes(), _make_pages(), TestComplexityScorer

### Community 17 - "Community 17"
Cohesion: 0.48
Nodes (13): childText(), classifyLedger(), extractGstDetails(), extractLedgerGstin(), extractLedgerMailing(), parseFullLedger(), parseGodown(), parseGroup() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (6): ClassificationError, DocumentIntelligenceError, LayoutError, OCRFailureError, ParsingError, PreprocessingError

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (4): ABC, DocumentClassifier, LayoutReconstructionProvider, name()

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (1): KeyboardManagerImpl

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (12): canHijackHorizontalInputNavigation(), findInnerFocusable(), focusCell(), handleGridNavigationKeydown(), isDisabled(), isHTMLElement(), isNavigableCell(), isVisible() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (4): createAlias(), findAlias(), mapToAlias(), suggestAliases()

### Community 24 - "Community 24"
Cohesion: 0.31
Nodes (7): formatShortcut(), getPlatform(), getShortcutDisplay(), isMac(), isPrimaryModifier(), matchesShortcut(), ShortcutHint()

### Community 25 - "Community 25"
Cohesion: 0.27
Nodes (5): calculateCorrelation(), createDataSummary(), detectTrends(), generateBasicNarrative(), generateNarrative()

### Community 26 - "Community 26"
Cohesion: 0.24
Nodes (3): createManualVoucher(), fromDbVoucher(), getVoucherById()

### Community 27 - "Community 27"
Cohesion: 0.32
Nodes (3): evaluateFormula(), generateMockData(), testCalculation()

### Community 28 - "Community 28"
Cohesion: 0.52
Nodes (6): buildHSNSummary(), downloadElectronicsInvoiceHTML(), downloadElectronicsInvoicePDF(), generateElectronicsInvoiceHTML(), numberToWords(), printElectronicsInvoice()

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (1): DocIntelligenceClient

### Community 31 - "Community 31"
Cohesion: 0.47
Nodes (3): focusTarget(), isDisabled(), isElementVisible()

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (2): allocateBatchesFIFO(), batchBaseAvailable()

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (2): generateLedgerPDF(), numberToWords()

## Knowledge Gaps
- **2 isolated node(s):** `Config`, `Full pipeline: OCR → Extract → Validate (no Supabase)`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 20`** (13 nodes): `isTextInputActive()`, `KeyboardManagerImpl`, `.ensureListener()`, `.getActiveScopes()`, `.listRegistered()`, `.notify()`, `.popScope()`, `.pushScope()`, `.register()`, `.__resetForTests()`, `.shouldFireInInputContext()`, `.subscribe()`, `manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (6 nodes): `DocIntelligenceClient.ts`, `DocIntelligenceClient`, `.constructor()`, `.health()`, `.processImage()`, `.processUrl()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (4 nodes): `allocateBatchesFIFO()`, `batchBaseAvailable()`, `getTotalAvailableStock()`, `fifoAllocation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (3 nodes): `generateLedgerPDF()`, `numberToWords()`, `ledgerPdfGenerator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toast()` connect `Community 0` to `Community 2`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 13`, `Community 15`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **Why does `String()` connect `Community 4` to `Community 0`, `Community 2`, `Community 6`, `Community 7`, `Community 14`, `Community 17`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `text()` connect `Community 6` to `Community 0`, `Community 8`, `Community 3`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Are the 57 inferred relationships involving `toast()` (e.g. with `switchTo()` and `handleParse()`) actually correct?**
  _`toast()` has 57 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `DocumentPage` (e.g. with `ComplexityScorer` and `TableDetector`) actually correct?**
  _`DocumentPage` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `BoundingBox` (e.g. with `TableDetector` and `LayoutReconstructor`) actually correct?**
  _`BoundingBox` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `PreprocessingPipeline` (e.g. with `PreprocessingStep` and `GrayscaleStep`) actually correct?**
  _`PreprocessingPipeline` has 14 INFERRED edges - model-reasoned connections that need verification._