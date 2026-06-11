## What I checked

- Route `/gst-filing` is registered inside `AppLayout` in `src/App.tsx` (line 91), before the `*` NotFound route.
- Sidebar entry "GST Filing" is in `allComplianceMenuItems` in `src/components/layout/AppSidebar.tsx`.
- `/gst-filing` is included in `visiblePages` for all four business types (`pharmacy`, `pharmacy_b2b`, `b2b_electronics`, `general_trading`) in `src/contexts/BusinessContext.tsx`.
- I opened `/gst-filing` in the live preview — it loads correctly (GSTR-1 / 3B / Purchase Register / HSN tabs all render, with GSTIN and state populated).

So the route and page are wired correctly on the latest code. The "Not Found" you saw is almost certainly **stale client state** from the moment just after the files were created.

## Fix

1. **Hard refresh** the preview tab: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac). On the PWA, fully close and reopen the window.
2. If you don't see **GST Filing** in the left sidebar under **Compliance** (between Accounts and Suppliers), open the browser console and report any red error — that would point to an HMR/load issue we can fix.

## If it still 404s after a hard refresh

I'll investigate:
- Service-worker / PWA cache serving an old `index.html` (would add a versioned bypass).
- Any auth/onboarding redirect intercepting the path.
- A build error in `GSTFiling.tsx` or its `services/gst/*` imports preventing the route from registering.

No code changes are proposed yet — confirm whether a hard refresh fixes it, and if not I'll dig in.