# Grid Keyboard Navigation

This module provides ERP-style keyboard movement for dense data entry grids.

## Files

- `src/lib/keyboard/grid-navigation.ts`
- `src/hooks/useGridKeyboardNavigation.ts`

## Supported Keys

- `ArrowUp` / `ArrowDown`: move row
- `ArrowLeft` / `ArrowRight`: move cell (respects text cursor while editing)
- `Enter`: next cell
- `Shift+Enter`: previous cell
- `Esc`: close callback (`onEscape`)
- `Ctrl+/` or `Cmd+/`: command palette callback (`onCommandPalette`)

## Smart Behavior

- Skips hidden / disabled / read-only controls
- Works with dynamic rows (DOM is re-evaluated on each keypress)
- Prevents browser scroll while navigating
- Auto-scrolls focused cell/row into view
- Adds active highlight class (`kb-active-cell`)

## Markup Contract

Use these data attributes:

- Grid container: `data-kb-grid`
- Each row: `data-kb-row`
- Each focusable cell: `data-kb-cell`
- Optional explicit target inside cell: `data-kb-focus`
- Optional skip cell: `data-kb-skip="true"`

## Integration

```tsx
const { gridRef } = useGridKeyboardNavigation({
  onEscape: () => setDialogOpen(false),
  onCommandPalette: () => setCommandPaletteOpen(true),
});

return (
  <div data-kb-grid ref={gridRef}>
    <div data-kb-row>
      <div data-kb-cell><input /></div>
      <div data-kb-cell><input /></div>
    </div>
  </div>
);
```

## Key Mapping Override

You can override keys:

```tsx
useGridKeyboardNavigation({
  keyMap: {
    next: "Tab",
    prev: "Tab",
  },
});
```
