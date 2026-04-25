# Keyboard-First System

This ERP is built to be fully operable without a mouse. This document is the
single source of truth for how the keyboard system is wired together, what
shortcuts exist, and how to add new ones correctly.

> **TL;DR for users:** Press `Shift + ?` anywhere to open the searchable
> shortcut reference. Press `Ctrl/Cmd + K` to open the command palette.

---

## 1. Architecture

Three cooperating layers:

| Layer                                      | File                                                    | Role                                                                                     |
| ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Platform abstraction**                   | `src/lib/platform.ts`                                   | Detects OS; maps "primary" modifier to ⌘ on Mac / Ctrl elsewhere. Exports `SHORTCUTS`.   |
| **Keyboard Manager** (singleton)           | `src/lib/keyboard/manager.ts`                           | One window-level listener. Scope stack. Conflict detection. Single dispatch entry point. |
| **Shortcut Catalog**                       | `src/lib/keyboard/shortcuts-registry.ts`                | Human-readable metadata (description, category) for every shortcut — powers help dialog. |

Hooks that talk to this system:

| Hook                                     | Use when                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `useShortcut` _(preferred)_              | Any new shortcut. Auto-registers in help dialog.                               |
| `useScope(name)`                         | Push a scope while a dialog / mode is active so keys can be remapped locally.  |
| `usePlatformShortcut`                    | Legacy — still used in `AppLayout` and pages. Keep working; prefer `useShortcut` for new code. |
| `useKeyboardShortcut`                    | Oldest legacy. Do not use in new code.                                         |
| `useEnterNavigation`                     | Enter / Shift+Enter form traversal with required-field enforcement.            |
| `useFocusTrap`                           | Dialogs — traps Tab inside a container and auto-focuses the first field.       |
| `useKeyboardTable` / `useTableKeyboardNav` | Up/Down/Home/End on table rows.                                              |

---

## 2. Core Principles (enforced)

1.  **Every interactive element is reachable by keyboard.** Semantic HTML
    (`button`, `input`, `a`) + no `tabindex > 0`.
2.  **Visible focus everywhere.** `:focus-visible` CSS in `index.css` puts a
    ring on every focusable element.
3.  **No traps.** `Esc` always closes; `useFocusTrap` only cycles Tab, never
    blocks Escape.
4.  **Consistency.** Shortcuts are declared in `SHORTCUT_CATALOG` and reused —
    not hard-coded ad-hoc.
5.  **Speed-first.** High-frequency workflows (counter sale, purchase entry)
    have dedicated shortcuts and auto-advance between fields.

---

## 3. Navigation Model

### Tab order

Determined purely by DOM order (no positive `tabindex`). `Tab` / `Shift+Tab`
move between **zones**.

### Arrow navigation within a zone

Use the `FocusZone` component for anywhere a group of controls should behave
like a menu/toolbar/grid:

```tsx
<FocusZone orientation="vertical" loop>
  <button data-focus-item>Pay Cash</button>
  <button data-focus-item>Pay UPI</button>
  <button data-focus-item>Pay Card</button>
</FocusZone>
```

For tables, `data-kb-row` + `useKeyboardTable()` handles row nav (already
in use across billing/history tables).

### Skip to content

First Tab stop on every page is a `SkipToContent` link (hidden until
focused) that jumps straight to `#main-content`, bypassing sidebar/header.

---

## 4. Form Workflow (the ERP standard)

Implemented by `useEnterNavigation`. Applied on any form wrapped in
`<form>` or `<div data-enter-nav>`:

| Key              | Behavior                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `Enter`          | Next field. On last field → submit (if `onLastField` provided).                           |
| `Shift + Enter`  | Previous field.                                                                           |
| `ArrowRight/Left`| On non-text fields (comboboxes, radios): forward / backward.                              |
| `Backspace`      | On empty field: previous field.                                                           |
| `Esc`            | Cancel / close dialog.                                                                    |

Forward movement is **blocked** (with a shake + inline hint) when the field
is required and empty, is marked `data-field-invalid="true"`, or a custom
`blockForward` guard returns a message. This eliminates silent failures.

Opt-out: `data-enter-nav-skip="true"` on the field.
Opt-in buttons: `data-enter-nav-include="true"`.

---

## 5. Tables & Grids

Rows with `data-kb-row` + `tabIndex={0}` get:

| Key               | Behavior                                     |
| ----------------- | -------------------------------------------- |
| `↑` / `↓`         | Move row focus                               |
| `Home` / `End`    | First / last row                             |
| `Enter`           | Primary row action                           |
| `E`               | Edit the focused row                         |
| `P`               | Print the focused bill                       |
| `R`               | Receive the focused purchase order           |
| `D`               | Delete the focused row (confirmation still runs) |
| `$` (`Shift + 4`) | Open payment for the focused invoice         |
| `Del`             | Delete focused cart row (inside billing)     |

---

## 6. Modals & Dialogs

All app dialogs wrap their content ref in `useFocusTrap(open, initialFocusRef)`:

- Tab cycles only within the dialog.
- `initialFocusRef` auto-focuses (and selects text) on open.
- `Esc` closes and Radix restores focus to the trigger.

To remap keys while a dialog is open, call `useScope("dialog:my-dialog")` —
shortcuts registered in that scope will shadow global ones for the combo.

---

## 7. Command Palette

`Ctrl/Cmd + K` opens the palette. Fuzzy search + ↑↓ nav + Enter to execute.
New palette commands are added in `src/components/CommandPalette.tsx`.

---

## 8. Error Handling

- Required-field guard in `useEnterNavigation` focuses the offending field
  + shakes it + shows a transient inline hint (`shakeAndWarn`).
- Dialog validation: set `data-field-invalid="true"` and `data-field-error="message"`
  on the wrapper or input; forward Enter will be blocked with that message.
- Toast system (`useToast`) provides persistent feedback for async operations.

---

## 9. Adding a New Shortcut

1.  Add the key combo to `SHORTCUTS` in `src/lib/platform.ts` if it's new.
2.  Add a catalog entry in `src/lib/keyboard/shortcuts-registry.ts` with
    `id`, `description`, `category`. This is what makes it appear in the
    help dialog automatically.
3.  Register a handler in the component that owns the action:

    ```tsx
    useShortcut({
      id: "save-draft",
      callback: saveDraft,
      enabled: isDirty,
    });
    ```

4.  For dialog-local keys, add `scope: "dialog:xyz"` and pair it with
    `useScope("dialog:xyz", open)` on the dialog container.

**Do not** bypass the catalog. Shortcuts that don't appear in help are
invisible to users — and in a keyboard-first app, invisible = broken.

---

## 10. Testing Checklist

Before shipping any new form / dialog / page:

- [ ] Every interactive element reachable via Tab
- [ ] `:focus-visible` ring visible on every stop
- [ ] No `tabindex > 0` anywhere
- [ ] `Esc` closes any open overlay
- [ ] `Enter` advances / submits the form
- [ ] Required fields block forward Enter with a visible hint
- [ ] New shortcuts added to `SHORTCUT_CATALOG`
- [ ] Help dialog (`?`) shows the new entries
- [ ] Manual run: login → billing → checkout → logout without touching the mouse

---

## 11. Complete Shortcut Reference

The runtime source of truth is `SHORTCUT_CATALOG` in
`src/lib/keyboard/shortcuts-registry.ts`. The help dialog (`Shift + ?`) always
shows the current list — refer to it rather than duplicating it here.

Highlights:

### Global
- `Ctrl/⌘ + K` — Command palette
- `Shift + ?` — This help dialog
- `Alt/⌥ + A` — Quick Counter Sale
- `Ctrl/⌘ + S` — Save
- `Ctrl/⌘ + N` — New entry
- `Ctrl/⌘ + F` — Focus search
- `` ` `` — Recover focus to last meaningful field

### Navigation (Alt/⌥ + digit)
- `1` Dashboard · `2` Sales · `3` Purchase Orders
- `4` Inventory · `5` Products · `6` Suppliers

### Billing
- `Alt/⌥ + L` — Jump to first cart row
- `Alt/⌥ + C` — Cycle payment method
- `Alt/⌥ + P` — Change payment type
- `Del` — Remove focused cart row
- `Ctrl/⌘ + Enter` — Force complete sale
