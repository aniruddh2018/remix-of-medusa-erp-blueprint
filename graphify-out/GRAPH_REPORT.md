# Graph Report - remix-of-medusa-erp-blueprint  (2026-05-08)

## Corpus Check
- 179 files · ~212,302 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 571 nodes · 691 edges · 22 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 139 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 27|Community 27]]

## God Nodes (most connected - your core abstractions)
1. `toast()` - 55 edges
2. `parseAutomationText()` - 17 edges
3. `handleSubmit()` - 15 edges
4. `useBusiness()` - 13 edges
5. `KeyboardManagerImpl` - 11 edges
6. `compact()` - 10 edges
7. `resolveSalesDraftSmart()` - 10 edges
8. `useAuth()` - 9 edges
9. `EditSaleDialog()` - 8 edges
10. `useToast()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `handleParse()` --calls--> `toast()`  [INFERRED]
  src/components/QuickTextEntry.tsx → src/hooks/use-toast.ts
- `handleSave()` --calls--> `toast()`  [INFERRED]
  src/components/settings/FormConfigEditor.tsx → src/hooks/use-toast.ts
- `handleReset()` --calls--> `toast()`  [INFERRED]
  src/components/settings/FormConfigEditor.tsx → src/hooks/use-toast.ts
- `handleSubmit()` --calls--> `toast()`  [INFERRED]
  src/components/forms/ProductFormDialog.tsx → src/hooks/use-toast.ts
- `handleAddManualProduct()` --calls--> `toast()`  [INFERRED]
  src/components/dialogs/DebitNoteDialog.tsx → src/hooks/use-toast.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (39): downloadCSV(), downloadCustomerLedger(), downloadSupplierLedger(), paymentStatusBadge(), handleCreateUser(), handleLogin(), switchTo(), handleSubmit() (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (36): AppLayout(), useAuth(), fetchTableData(), generateBackupSQL(), getLastBackupDate(), rowToInsert(), setLastBackupDate(), BackupSection() (+28 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (8): setCustomerName(), setNotes(), handleAddManualProduct(), handleSelectInvoice(), handleTableKeyDown(), removeReturnItem(), reset(), reset()

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (16): downloadBillCSV(), downloadBillHTML(), downloadBillPDF(), generateBillCSV(), generateBillHTML(), printBill(), handleBillAction(), downloadConfigurableInvoiceHTML() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (19): removeRow(), saveAll(), fetchOrderItems(), handleReceive(), assertPositiveFactor(), cacheKey(), clearConversionCache(), computeStockImpact() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.2
Nodes (23): cleanSaleName(), compact(), demandMatch(), executeAutomationDraft(), extractAfterLabel(), extractAmount(), extractCustomerName(), extractEmail() (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (14): escapeSQL(), fetchExpiryItems(), fetchLossSummary(), handleDispose(), openDispose(), handleReset(), handleSave(), String() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.24
Nodes (18): beginSalesConversation(), clearPrescriptionAttachment(), confirmDraft(), createCustomerFromChat(), extractMobile(), findCustomerByMobile(), handlePrescriptionPick(), handleSubmit() (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (11): clearSelection(), handleChipKeyDown(), handleKeyDown(), isFieldEmpty(), isRequiredAndEmpty(), shakeAndWarn(), showInlineHint(), handleSelect() (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (1): KeyboardManagerImpl

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (12): canHijackHorizontalInputNavigation(), findInnerFocusable(), focusCell(), handleGridNavigationKeydown(), isDisabled(), isHTMLElement(), isNavigableCell(), isVisible() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.31
Nodes (7): formatShortcut(), getPlatform(), getShortcutDisplay(), isMac(), isPrimaryModifier(), matchesShortcut(), ShortcutHint()

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (5): handleCartUpdate(), handleClose(), handleConfirm(), handleParse(), updateItem()

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (3): handleAddManualProduct(), handleTableKeyDown(), removeReturnItem()

### Community 14 - "Community 14"
Cohesion: 0.52
Nodes (6): buildHSNSummary(), downloadElectronicsInvoiceHTML(), downloadElectronicsInvoicePDF(), generateElectronicsInvoiceHTML(), numberToWords(), printElectronicsInvoice()

### Community 15 - "Community 15"
Cohesion: 0.43
Nodes (5): deepNormalize(), detectDuplicates(), normalize(), suggestPrimary(), handleAutoMerge()

### Community 17 - "Community 17"
Cohesion: 0.47
Nodes (3): focusTarget(), isDisabled(), isElementVisible()

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (3): handleFileChange(), handleImport(), parseCSV()

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): allocateBatchesFIFO(), batchBaseAvailable()

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (1): handleSubmit()

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (2): handleMerge(), resetState()

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): generateLedgerPDF(), numberToWords()

## Knowledge Gaps
- **Thin community `Community 9`** (13 nodes): `isTextInputActive()`, `KeyboardManagerImpl`, `.ensureListener()`, `.getActiveScopes()`, `.listRegistered()`, `.notify()`, `.popScope()`, `.pushScope()`, `.register()`, `.__resetForTests()`, `.shouldFireInInputContext()`, `.subscribe()`, `manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (4 nodes): `allocateBatchesFIFO()`, `batchBaseAvailable()`, `getTotalAvailableStock()`, `fifoAllocation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (4 nodes): `handleChange()`, `handleSubmit()`, `invalidateProductQueries()`, `ProductFormDialog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (4 nodes): `handleMerge()`, `resetState()`, `toggleProduct()`, `MergeProductsDialog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `generateLedgerPDF()`, `numberToWords()`, `ledgerPdfGenerator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toast()` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 12`, `Community 13`, `Community 15`, `Community 18`, `Community 23`, `Community 25`?**
  _High betweenness centrality (0.288) - this node is a cross-community bridge._
- **Why does `useToast()` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `confirmDraft()` connect `Community 7` to `Community 0`, `Community 5`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 52 inferred relationships involving `toast()` (e.g. with `switchTo()` and `handleParse()`) actually correct?**
  _`toast()` has 52 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `handleSubmit()` (e.g. with `parseAutomationText()` and `resolveSalesDraftSmart()`) actually correct?**
  _`handleSubmit()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `useBusiness()` (e.g. with `BackupSection()` and `AppLayout()`) actually correct?**
  _`useBusiness()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._