# Keyboard Navigation Standard

The ERP uses a single engine for Enter / Shift+Enter form navigation:
**`src/hooks/useEnterNavigation.ts`** (with helpers in `src/hooks/enterNav/`).

## The 3 rules every form must follow

1. **Wrap the form/section** in a container with `data-enter-nav` and attach
   `onKeyDown={handler}` from `useEnterNavigation()`.
   ```tsx
   const enterNav = useEnterNavigation(handleSubmit);
   return <div data-enter-nav onKeyDown={enterNav}>...</div>;
   ```
   `<form>` elements are auto-detected as containers — no `data-enter-nav` needed
   if you put the handler on `<form onKeyDown={...}>`.

2. **Mark required fields** so blocked-forward gives shake + inline hint:
   - Native: `required` on the input
   - Wrapper: `<div data-field-required="true">`

3. **For value-bearing custom controls** (chips, comboboxes, custom selectors):
   - `tabIndex={0}`, `role="combobox"` or `role="textbox"`
   - `data-field-value={currentValue}` so empty-detection works
   - Pattern: see `src/components/DrugBrandSearch.tsx` (chip mode)

## Engine behavior

| Key | Action |
|---|---|
| `Enter` | Forward — blocked if required+empty / `data-field-invalid="true"` / `blockForward()` returns msg |
| `Shift+Enter` | Backward — strict reverse DOM order |
| `Backspace` on empty field | Backward |
| `ArrowLeft` / `ArrowRight` on non-text field | Backward / Forward |
| `Enter` on last field | calls `onLastField` (typically Submit) |

## Opting in / out

| Attribute | Effect |
|---|---|
| `data-enter-nav-skip="true"` | Field skipped by engine |
| `data-enter-nav-include="true"` | Button included in nav chain (default: buttons skipped) |
| `data-field-required="true"` | Wrapper marks field as required |
| `data-field-invalid="true"` | Field declares itself invalid (blocks forward) |
| `data-field-error="..."` | Custom error message for shake hint |
| `data-field-value="..."` | Custom value for empty-detection |

## Business-rule guard

Plug rules like "out-of-stock product → refocus product search":

```tsx
const enterNav = useEnterNavigation({
  onLastField: handleAdd,
  blockForward: (field) => {
    if (field.id === "sale-qty" && availableStock <= 0) {
      productSearchRef.current?.focus();
      return "Out of stock — pick another product";
    }
    return null;
  },
});
```

## What NOT to use this for

- **List/grid arrow navigation** (`useTableKeyboardNav`, `data-kb-row`) — different concern
- **Global shortcuts** (`useKeyboardShortcut`, F-keys, Cmd+K) — different concern
- **Inline cell editors** in tables (Enter saves, Escape cancels) — different concern
- **Modal focus traps** (`useFocusTrap`, `FocusContext`) — different concern

## Currently wired

✅ Sales billing + entry row · Counter Sales · Purchase Orders entry row
✅ DrugBrandSearch (chip in nav chain, shake-on-empty)
✅ ConfigurableFormField (all metadata-driven forms)
✅ Customer / Supplier / Product form dialogs (Save button included)
✅ EditSaleDialog / EditPurchaseOrderDialog
✅ RecordPaymentDialog

## Adoption checklist for new forms

- [ ] Container has `data-enter-nav` + `onKeyDown={enterNav}` (or it's a `<form>`)
- [ ] Required fields marked (`required` or `data-field-required="true"`)
- [ ] Custom selectors expose `data-field-value`
- [ ] Submit button has `data-enter-nav-include="true"`
- [ ] Test: Enter advances, Shift+Enter reverses exact order, required-empty shakes, disabled fields auto-skipped
