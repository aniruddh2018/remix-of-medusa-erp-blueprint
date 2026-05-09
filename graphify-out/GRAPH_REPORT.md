# Graph Report - remix-of-medusa-erp-blueprint  (2026-05-09)

## Corpus Check
- 189 files · ~236,930 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 647 nodes · 796 edges · 25 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 159 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `toast()` - 55 edges
2. `parseAutomationText()` - 18 edges
3. `handleSubmit()` - 14 edges
4. `useBusiness()` - 13 edges
5. `KeyboardManagerImpl` - 11 edges
6. `compact()` - 10 edges
7. `resolveSalesDraftSmart()` - 10 edges
8. `useAuth()` - 9 edges
9. `buildConversationMessage()` - 9 edges
10. `String()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `buildInsightResponse()` --calls--> `toLocaleString()`  [INFERRED]
  supabase/functions/ai-assistant/index.ts → src/pages/QueryEngine.tsx
- `handleParse()` --calls--> `toast()`  [INFERRED]
  src/components/QuickTextEntry.tsx → src/hooks/use-toast.ts
- `handleSave()` --calls--> `toast()`  [INFERRED]
  src/components/settings/FormConfigEditor.tsx → src/hooks/use-toast.ts
- `handleReset()` --calls--> `toast()`  [INFERRED]
  src/components/settings/FormConfigEditor.tsx → src/hooks/use-toast.ts
- `handleAddManualProduct()` --calls--> `toast()`  [INFERRED]
  src/components/dialogs/DebitNoteDialog.tsx → src/hooks/use-toast.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (44): downloadCSV(), downloadCustomerLedger(), downloadSupplierLedger(), paymentStatusBadge(), handleCreateUser(), handleLogin(), switchTo(), handleSubmit() (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (32): AppLayout(), useAuth(), BusinessProvider(), useBusiness(), EditPurchaseOrderDialog(), EditSaleDialog(), useFocus(), useModuleFocus() (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (11): setCustomerName(), setNotes(), handleAddManualProduct(), handleSelectInvoice(), handleTableKeyDown(), removeReturnItem(), reset(), handleAddManualProduct() (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (16): downloadBillCSV(), downloadBillHTML(), downloadBillPDF(), generateBillCSV(), generateBillHTML(), printBill(), handleBillAction(), downloadConfigurableInvoiceHTML() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (19): removeRow(), saveAll(), fetchOrderItems(), handleReceive(), assertPositiveFactor(), cacheKey(), clearConversionCache(), computeStockImpact() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.19
Nodes (24): applySmartSalesSelection(), cleanSaleName(), compact(), demandMatch(), executeAutomationDraft(), extractAfterLabel(), extractAmount(), extractCustomerName() (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.19
Nodes (20): buildConversationMessage(), callAIAssistant(), beginSalesConversation(), clearPrescriptionAttachment(), confirmDraft(), createCustomerFromChat(), extractMobile(), findCustomerByMobile() (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (18): escapeSQL(), openDispose(), downloadFile(), escapeHtml(), exportData(), exportToCSV(), exportToJSON(), exportToPDF() (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (4): executeNLQuery(), getQueryHistory(), handleExecuteQuery(), loadHistory()

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (11): clearSelection(), handleChipKeyDown(), handleKeyDown(), isFieldEmpty(), isRequiredAndEmpty(), shakeAndWarn(), showInlineHint(), handleSelect() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.2
Nodes (9): buildHistoryText(), buildInsightResponse(), buildQueryResponse(), buildSchemaContext(), buildSystemPrompt(), callLLM(), getMaxRows(), validateSQL() (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (1): KeyboardManagerImpl

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (12): canHijackHorizontalInputNavigation(), findInnerFocusable(), focusCell(), handleGridNavigationKeydown(), isDisabled(), isHTMLElement(), isNavigableCell(), isVisible() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.31
Nodes (7): formatShortcut(), getPlatform(), getShortcutDisplay(), isMac(), isPrimaryModifier(), matchesShortcut(), ShortcutHint()

### Community 14 - "Community 14"
Cohesion: 0.27
Nodes (5): calculateCorrelation(), createDataSummary(), detectTrends(), generateBasicNarrative(), generateNarrative()

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (6): fetchTableData(), generateBackupSQL(), getLastBackupDate(), rowToInsert(), setLastBackupDate(), BackupSection()

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (5): handleCartUpdate(), handleClose(), handleConfirm(), handleParse(), updateItem()

### Community 17 - "Community 17"
Cohesion: 0.32
Nodes (3): evaluateFormula(), generateMockData(), testCalculation()

### Community 18 - "Community 18"
Cohesion: 0.52
Nodes (6): buildHSNSummary(), downloadElectronicsInvoiceHTML(), downloadElectronicsInvoicePDF(), generateElectronicsInvoiceHTML(), numberToWords(), printElectronicsInvoice()

### Community 19 - "Community 19"
Cohesion: 0.43
Nodes (5): deepNormalize(), detectDuplicates(), normalize(), suggestPrimary(), handleAutoMerge()

### Community 21 - "Community 21"
Cohesion: 0.47
Nodes (3): focusTarget(), isDisabled(), isElementVisible()

### Community 22 - "Community 22"
Cohesion: 0.5
Nodes (3): handleFileChange(), handleImport(), parseCSV()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (2): allocateBatchesFIFO(), batchBaseAvailable()

### Community 29 - "Community 29"
Cohesion: 0.5
Nodes (1): fetchInventory()

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (2): generateLedgerPDF(), numberToWords()

## Knowledge Gaps
- **Thin community `Community 11`** (13 nodes): `isTextInputActive()`, `KeyboardManagerImpl`, `.ensureListener()`, `.getActiveScopes()`, `.listRegistered()`, `.notify()`, `.popScope()`, `.pushScope()`, `.register()`, `.__resetForTests()`, `.shouldFireInInputContext()`, `.subscribe()`, `manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (4 nodes): `allocateBatchesFIFO()`, `batchBaseAvailable()`, `getTotalAvailableStock()`, `fifoAllocation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (4 nodes): `baseUnitsFor()`, `fetchInventory()`, `getStockStatus()`, `Inventory.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (3 nodes): `generateLedgerPDF()`, `numberToWords()`, `ledgerPdfGenerator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toast()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 16`, `Community 19`, `Community 22`, `Community 29`?**
  _High betweenness centrality (0.279) - this node is a cross-community bridge._
- **Why does `confirmDraft()` connect `Community 6` to `Community 0`, `Community 5`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `useToast()` connect `Community 1` to `Community 0`, `Community 15`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Are the 52 inferred relationships involving `toast()` (e.g. with `switchTo()` and `handleParse()`) actually correct?**
  _`toast()` has 52 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parseAutomationText()` (e.g. with `handleRegexFallback()` and `handleSubmit()`) actually correct?**
  _`parseAutomationText()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `handleSubmit()` (e.g. with `buildConversationMessage()` and `parseAutomationText()`) actually correct?**
  _`handleSubmit()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `useBusiness()` (e.g. with `BackupSection()` and `AppLayout()`) actually correct?**
  _`useBusiness()` has 12 INFERRED edges - model-reasoned connections that need verification._