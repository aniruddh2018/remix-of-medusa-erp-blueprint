# Graph Report - remix-of-medusa-erp-blueprint  (2026-07-25)

## Corpus Check
- 378 files · ~478,043 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1616 nodes · 2464 edges · 45 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 637 edges (avg confidence: 0.74)
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
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 57|Community 57]]

## God Nodes (most connected - your core abstractions)
1. `toast()` - 80 edges
2. `String()` - 68 edges
3. `DocumentPage` - 30 edges
4. `BoundingBox` - 23 edges
5. `PreprocessingPipeline` - 22 edges
6. `String()` - 22 edges
7. `InvoiceParser` - 21 edges
8. `TableDetector` - 20 edges
9. `DocumentPipeline` - 19 edges
10. `json()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `handleAddManualProduct()` --calls--> `toast()`  [INFERRED]
  src/components/dialogs/DebitNoteDialog.tsx → /Users/apple/Downloads/ERP/remix-of-medusa-erp-blueprint/src/hooks/use-toast.ts
- `handleAddManualProduct()` --calls--> `toast()`  [INFERRED]
  src/components/dialogs/CreditNoteDialog.tsx → /Users/apple/Downloads/ERP/remix-of-medusa-erp-blueprint/src/hooks/use-toast.ts
- `toast()` --calls--> `importChallanItems()`  [INFERRED]
  /Users/apple/Downloads/ERP/remix-of-medusa-erp-blueprint/src/hooks/use-toast.ts → src/pages/PurchaseOrders.tsx
- `stageC_reconcileProducts()` --calls--> `String()`  [INFERRED]
  supabase/functions/scan-invoice/index.ts → src/pages/GSTFiling.tsx
- `stageC_reconcileProducts()` --calls--> `String()`  [INFERRED]
  supabase/functions/scan-invoice/index.ts → /Users/apple/Downloads/ERP/remix-of-medusa-erp-blueprint/src/components/settings/FormConfigEditor.tsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (86): downloadCSV(), downloadSupplierLedger(), downloadUnifiedLedger(), handleSubmit(), paymentStatusBadge(), handleUnlock(), run(), handleKey() (+78 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (65): callAIAssistant(), extractItem(), parseSaltHeader(), formatDate(), String(), String(), calculateQualityMetrics(), detectAnomalies() (+57 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (37): BaseModel, ComplexityScorer, BoundingBox, ComplexityScores, Config, DocumentPage, OCRLine, OCRParagraph (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (41): ABC, DocumentType, PipelineContext, ProcessedDocument, ProcessingMetadata, OrientationDetector, rotate_image(), parse_document() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (37): AppLayout(), useAuth(), BaseSettings, BusinessProvider(), EditPurchaseOrderDialog(), EditSaleDialog(), useFocus(), useModuleFocus() (+29 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (27): handleCreateUser(), handleLogin(), closeFinancialYear(), importLedgersFromCsv(), mergeLedgers(), openFinancialYear(), handleClose(), handleFile() (+19 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (27): text(), parseTallyMasters(), DocIntelligenceClient, suggestFieldMappings(), parseCSV(), parseCSVLine(), parseCSVText(), parseExcel() (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (17): AdaptiveThresholdStep, ContrastEnhanceStep, DenoiseStep, GrayscaleStep, SharpenStep, DeskewStep, PerspectiveCorrectionStep, create_default_preprocessing_pipeline() (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (23): createAlias(), findAlias(), mapToAlias(), suggestAliases(), bulkGenerateFingerprints(), checkForDuplicate(), compareProducts(), deepNormalize() (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (20): download(), run(), downloadFile(), escapeHtml(), exportData(), exportToCSV(), exportToJSON(), exportToPDF() (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (11): setCustomerName(), setNotes(), handleAddManualProduct(), handleSelectInvoice(), handleTableKeyDown(), removeReturnItem(), reset(), handleAddManualProduct() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (28): fingerprintOf(), importMargMasterRows(), normName(), num(), str(), detectForm(), getOrCreateSupplier(), importMargPurchases() (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (18): downloadBillCSV(), downloadBillHTML(), downloadBillPDF(), generateBillCSV(), generateBillHTML(), printBill(), handleBillAction(), downloadConfigurableInvoiceHTML() (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (23): cleanSaleName(), compact(), demandMatch(), executeAutomationDraft(), extractAfterLabel(), extractAmount(), extractCustomerName(), extractEmail() (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (14): submit(), switchTo(), reload(), closeAndOpenFinancialYear(), fyNameFromStart(), getActiveFinancialYear(), listFinancialYears(), computeCurrentFyLabel() (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (15): clearSelection(), handleChipKeyDown(), handleKeyDown(), isFieldEmpty(), isRequiredAndEmpty(), shakeAndWarn(), showInlineHint(), deleteTemplate() (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (16): classifyGroupType(), classifyLedgerRoles(), confirmImport(), createImportSession(), fromDbSession(), getImportSession(), rollbackImport(), stageGroups() (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (18): bulkSyncCustomersToLedgers(), bulkSyncSuppliersToLedgers(), syncCustomerToLedger(), syncSupplierToLedger(), importMargParties(), loadCustomers(), loadSuppliers(), pick() (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.15
Nodes (17): removeRow(), saveAll(), assertPositiveFactor(), cacheKey(), clearConversionCache(), computeStockImpact(), convertToBase(), describeBaseConversion() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (14): emit(), resetMargImport(), runMargImport(), downloadUnmatched(), purchaseUnmatchedToCsv(), reset(), isBillNo(), isDate() (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (17): csv(), ddmmyyyy(), downloadBlob(), esc(), exportGSTR1CSV(), exportGSTR1JSON(), exportGSTR1PDF(), exportGSTR3BCSV() (+9 more)

### Community 21 - "Community 21"
Cohesion: 0.48
Nodes (13): childText(), classifyLedger(), extractGstDetails(), extractLedgerGstin(), extractLedgerMailing(), parseFullLedger(), parseGodown(), parseGroup() (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (6): ClassificationError, DocumentIntelligenceError, LayoutError, OCRFailureError, ParsingError, PreprocessingError

### Community 23 - "Community 23"
Cohesion: 0.24
Nodes (11): coerceSqlValue(), detectAndParse(), extractBadColumn(), findClosingParen(), normaliseJsonShape(), parseSqlDump(), runRecovery(), splitSqlValues() (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.21
Nodes (1): KeyboardManagerImpl

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (12): canHijackHorizontalInputNavigation(), findInnerFocusable(), focusCell(), handleGridNavigationKeydown(), isDisabled(), isHTMLElement(), isNavigableCell(), isVisible() (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.24
Nodes (10): dateRule(), emailRule(), getEntityRules(), getRowErrors(), getRowStatus(), gstRule(), numberRule(), phoneRule() (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (6): postTransaction(), assertWritableFy(), FinancialYearLockedError, FinancialYearNotFoundError, isFinancialYearWritable(), resolveFinancialYear()

### Community 28 - "Community 28"
Cohesion: 0.27
Nodes (9): escapeHtml(), generateBillPdfBlob(), renderBillHtml(), uploadBillPdfAndGetUrl(), buildWhatsAppUrl(), normalizePhoneForWhatsApp(), openWhatsApp(), renderWhatsAppTemplate() (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.35
Nodes (10): cleanHeader(), cleanProductName(), extractAttributes(), isHeaderRow(), isItemRow(), mergeMargFiles(), num(), parseSheet() (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (3): createManualVoucher(), fromDbVoucher(), getVoucherById()

### Community 31 - "Community 31"
Cohesion: 0.47
Nodes (10): buildGSTR1(), buildGSTR3B(), buildHSNSummary(), buildPurchaseRegister(), emptyHsn(), emptyRate(), lineCompute(), r2() (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (7): escapeSQL(), fetchTableData(), generateBackupSQL(), getLastBackupDate(), rowToInsert(), setLastBackupDate(), BackupSection()

### Community 33 - "Community 33"
Cohesion: 0.31
Nodes (7): formatShortcut(), getPlatform(), getShortcutDisplay(), isMac(), isPrimaryModifier(), matchesShortcut(), ShortcutHint()

### Community 34 - "Community 34"
Cohesion: 0.27
Nodes (5): calculateCorrelation(), createDataSummary(), detectTrends(), generateBasicNarrative(), generateNarrative()

### Community 35 - "Community 35"
Cohesion: 0.32
Nodes (3): evaluateFormula(), generateMockData(), testCalculation()

### Community 36 - "Community 36"
Cohesion: 0.46
Nodes (7): isBillNo(), isDate(), parseCustomer(), parseDate(), parseExpiry(), parseItem(), parseMargSalesFile()

### Community 37 - "Community 37"
Cohesion: 0.52
Nodes (6): buildHSNSummary(), downloadElectronicsInvoiceHTML(), downloadElectronicsInvoicePDF(), generateElectronicsInvoiceHTML(), numberToWords(), printElectronicsInvoice()

### Community 39 - "Community 39"
Cohesion: 0.47
Nodes (3): focusTarget(), isDisabled(), isElementVisible()

### Community 40 - "Community 40"
Cohesion: 0.6
Nodes (5): deleteDb(), openLegacyDb(), readAll(), runLegacyOfflineDump(), triggerDownload()

### Community 44 - "Community 44"
Cohesion: 0.6
Nodes (3): analyseDemand(), arimaForecast(), movingAverageForecast()

### Community 45 - "Community 45"
Cohesion: 0.9
Nodes (4): importMargDoctorMap(), KEY(), loadDoctors(), UP()

### Community 47 - "Community 47"
Cohesion: 0.67
Nodes (2): allocateBatchesFIFO(), batchBaseAvailable()

### Community 54 - "Community 54"
Cohesion: 0.67
Nodes (2): isMigrationModeOn(), KEY()

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (2): generateLedgerPDF(), numberToWords()

## Knowledge Gaps
- **2 isolated node(s):** `Config`, `Full pipeline: OCR → Extract → Validate (no Supabase)`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (13 nodes): `isTextInputActive()`, `KeyboardManagerImpl`, `.ensureListener()`, `.getActiveScopes()`, `.listRegistered()`, `.notify()`, `.popScope()`, `.pushScope()`, `.register()`, `.__resetForTests()`, `.shouldFireInInputContext()`, `.subscribe()`, `manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (4 nodes): `allocateBatchesFIFO()`, `batchBaseAvailable()`, `getTotalAvailableStock()`, `fifoAllocation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (4 nodes): `useMigrationMode.ts`, `isMigrationModeOn()`, `KEY()`, `useMigrationMode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (3 nodes): `generateLedgerPDF()`, `numberToWords()`, `ledgerPdfGenerator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toast()` connect `Community 0` to `Community 4`, `Community 5`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 14`, `Community 18`, `Community 23`, `Community 28`?**
  _High betweenness centrality (0.287) - this node is a cross-community bridge._
- **Why does `String()` connect `Community 1` to `Community 32`, `Community 0`, `Community 3`, `Community 6`, `Community 11`, `Community 14`, `Community 16`, `Community 17`, `Community 19`, `Community 20`, `Community 21`, `Community 23`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.263) - this node is a cross-community bridge._
- **Why does `str()` connect `Community 11` to `Community 1`, `Community 3`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 77 inferred relationships involving `toast()` (e.g. with `handleClick()` and `handleClick()`) actually correct?**
  _`toast()` has 77 INFERRED edges - model-reasoned connections that need verification._
- **Are the 67 inferred relationships involving `String()` (e.g. with `stageC_reconcileProducts()` and `executeImport()`) actually correct?**
  _`String()` has 67 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `DocumentPage` (e.g. with `._build_page()` and `.test_detect_table_region()`) actually correct?**
  _`DocumentPage` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `BoundingBox` (e.g. with `._union_bbox()` and `._union_bbox()`) actually correct?**
  _`BoundingBox` has 21 INFERRED edges - model-reasoned connections that need verification._