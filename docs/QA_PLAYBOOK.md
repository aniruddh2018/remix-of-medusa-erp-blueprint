# MedikaRP — Manual QA Playbook

End-to-end manual test script. Follow steps in order. Each step has an **Action**, an **Expected result**, and a **Pass/Fail** column for your checklist. Use a fresh browser profile (or incognito) so no cached session bleeds in.

> **Test data conventions**
> - Dummy email: `qa+<yyyymmdd>@medikarp.test` (e.g. `qa+20260713@medikarp.test`)
> - Password: `QaTest!2026`
> - Company: `QA Pharmacy <yyyymmdd>`
> - GSTIN: `29ABCDE1234F1Z5` (state = Karnataka, code 29)
> - Financial year: current India FY (Apr → Mar)
>
> Keep a scratchpad open — copy the invoice numbers, batch numbers, and IDs you create; later steps reference them.

---

## 0. Pre-flight

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 0.1 | Open the preview URL in a fresh incognito window | Landing page loads, no console errors | |
| 0.2 | Open DevTools → Console & Network tabs, keep them open for the whole run | No red errors on landing | |
| 0.3 | Confirm `/robots.txt` and `<title>` are app-specific (not "Lovable App") | Real title + description in `<head>` | |

---

## 1. Auth — Signup, login, logout

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 1.1 | Click **Sign up**, enter dummy email + password | Redirect to onboarding (no email-confirm wall) | |
| 1.2 | Sign out from the top-right menu | Redirected to landing / auth | |
| 1.3 | Sign back in with the same credentials | Lands on onboarding **or** dashboard depending on step 2 progress | |
| 1.4 | Try wrong password once | Inline error, no crash | |
| 1.5 | Trigger **Forgot password**, check that `/reset-password` route exists | Reset page renders (email delivery not testable manually here) | |

---

## 2. Onboarding — Create company

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 2.1 | Fill company name `QA Pharmacy <date>`, business module = **Pharmacy** | Form validates | |
| 2.2 | Add GSTIN `29ABCDE1234F1Z5`, address, phone | State auto-detected = Karnataka | |
| 2.3 | Submit | Full page reload, lands on `/dashboard` | |
| 2.4 | Check top bar | CompanySwitcher shows the new company; FinancialYearSwitcher shows current FY (Apr 20xx – Mar 20xx) | |
| 2.5 | Reload the page | Session persists, still on dashboard | |

---

## 3. Financial Year setup

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 3.1 | Navigate to **Financial Year Admin** | Current FY listed with status `active` | |
| 3.2 | Create a **previous FY** (e.g. Apr 2024 – Mar 2025) with status = `closed`/`historical` | Row appears, active FY unchanged | |
| 3.3 | Toggle **Migration Mode** ON | Badge shows "Migration Mode ON" globally | |
| 3.4 | Switch active FY to the previous one | Sidebar/topbar reflect the switch; dashboard KPIs go to zero (no data yet in that FY) | |
| 3.5 | Switch back to the current FY | KPIs restore | |

---

## 4. Masters — Products, Customers, Suppliers, Doctors

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 4.1 | **Products** → add product `PARA-500` (Paracetamol 500mg), GST 12%, HSN 3004, MRP 20, pack 10 | Row saved, appears in list | |
| 4.2 | Add second product `AMOX-250` (Amoxicillin 250mg), GST 5%, MRP 45 | Saved | |
| 4.3 | Try to add a duplicate `PARA-500` | Duplicate detection banner or blocked | |
| 4.4 | **Customers** → add `QA Customer 1` with phone, credit limit 5000 | Saved | |
| 4.5 | **Suppliers** → add `QA Supplier 1` with GSTIN, state = Karnataka | Saved (intra-state) | |
| 4.6 | Add `QA Supplier 2` with state = Maharashtra | Saved (will trigger IGST later) | |
| 4.7 | **Doctors** → add `Dr. QA Test` | Saved, appears in DoctorSelector | |

---

## 5. Purchase flow (creates stock)

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 5.1 | **Purchases → New PO** for `QA Supplier 1` | Blank PO opens | |
| 5.2 | Add `PARA-500`, qty 100, rate 12, batch `B-PARA-001`, expiry +18 months | Row totals compute; GST split = CGST+SGST 6%+6% | |
| 5.3 | Add `AMOX-250`, qty 50, rate 30, batch `B-AMOX-001`, expiry +12 months | Row totals compute; GST 2.5%+2.5% | |
| 5.4 | Save & post the PO | Invoice number assigned, stock increases | |
| 5.5 | Open **Inventory** | Both batches visible with correct qty | |
| 5.6 | Repeat 5.1–5.4 with `QA Supplier 2` (Maharashtra), qty 20 of `PARA-500`, batch `B-PARA-002` | GST split = **IGST 12%** (not CGST/SGST) | |
| 5.7 | Add a **PO payment** partial ₹500 to Supplier 1 | Supplier ledger shows outstanding = grand total − 500 | |

---

## 6. Sales flow

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 6.1 | **Sales → New Sale** for `QA Customer 1`, doctor = `Dr. QA Test` | Blank invoice opens | |
| 6.2 | Add `PARA-500` qty 10 — check FIFO picks batch `B-PARA-001` first | Batch auto-selected, MRP prefilled | |
| 6.3 | Add `AMOX-250` qty 5 | Row added | |
| 6.4 | Apply 5% bill-level discount | Discount cascades in correct order (item → subtotal → GST → bill) | |
| 6.5 | Save invoice, choose **Cash** payment full | Invoice PDF/preview opens; sequential invoice number | |
| 6.6 | Create a second sale on **credit** to `QA Customer 1`, ₹800 | Overdue/credit customer tab shows outstanding | |
| 6.7 | Open **Counter Sale** mode, run a quick multi-slot sale | Slots switch with keyboard, no data mixing between slots | |

**Keyboard/UX checks during 6.x**
- Enter navigates forward, Shift+Enter back
- Backtick (\`) recovers focus after modal close
- Numeric fields accept empty string & backspace
- F12 opens the calculator, Tab transfers value

---

## 7. Returns — Credit note & Debit note

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 7.1 | From the cash sale in 6.5, create a **Credit Note** returning 2 units of `PARA-500` | Inventory qty restored, customer ledger credited | |
| 7.2 | From the Supplier 1 PO, create a **Debit Note** for 5 units of `AMOX-250` | Supplier ledger debited, stock reduced | |

---

## 8. Payments & Ledgers

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 8.1 | **Accounts** → receipt ₹500 against Customer 1's credit invoice | Outstanding drops | |
| 8.2 | Open **Ledger view** for Customer 1 | Debit/credit rows match sales + receipts; running balance correct | |
| 8.3 | Open Supplier 1 ledger | Purchases + payments + debit note reconcile | |

---

## 9. Reports

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 9.1 | **Reports → Sales register** for today | Both sales appear, totals match | |
| 9.2 | **Reports → GST R1** for current period | Intra-state (CGST/SGST) and inter-state (IGST) rows separated | |
| 9.3 | **Reports → GST R3B** | Output tax matches invoice sums | |
| 9.4 | **Reports → Stock summary** | Opening + inward − outward = closing for each batch | |
| 9.5 | **Doctor Reports** → `Dr. QA Test` | Prescribed items list matches sale 6.5 | |
| 9.6 | Export any report as PDF | PDF opens, correct company header + GSTIN | |

---

## 10. Financial Year isolation

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 10.1 | Switch active FY to the previous FY | Sales, Purchases, Reports, Accounts pages all show **empty** (no cross-year bleed) | |
| 10.2 | Inventory page in old FY | Current stock still visible (inventory is not FY-scoped) | |
| 10.3 | Switch back to current FY | All data reappears | |
| 10.4 | Open a product's **Inventory History** dialog | Sales, Purchases, and **Openings** tabs render | |

---

## 11. MARG Migration (hierarchical import)

Use the sample MARG CSVs in `test-data/` or a minimal 3-row CSV per step.

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 11.1 | **Data Import → MARG Migration** | Vertical stepper: Products → Parties → Doctors → Stock → Purchases → Sales; only step 1 unlocked | |
| 11.2 | Complete step 1 (Products), click **Mark done** | Step 2 unlocks, step 1 gets green check | |
| 11.3 | Try clicking step 4 while step 2 not done | Step is locked, click does nothing | |
| 11.4 | Complete Parties → skip optional Doctors → import Stock in current FY | All fine | |
| 11.5 | Switch to **previous FY**, verify Stock step is hidden/disabled | Correct — stock only in active FY | |
| 11.6 | Import Purchases in previous FY, then run **Reconciliation** from FY Admin | Leftover stock posted as opening balance on FY end date; visible in product history "Openings" tab | |
| 11.7 | Click **Reset progress** | Stepper resets, first step re-opens | |

---

## 12. Access control & multi-tenancy

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 12.1 | Sign up a **second** dummy user, create a **second** company | Different company_id | |
| 12.2 | From user 2's session, try to load user 1's invoice URL directly | Blocked / 404 — RLS holds | |
| 12.3 | As user 1, invite user 2 as staff to company 1 | User 2 sees company 1 in CompanySwitcher | |
| 12.4 | Confirm staff role cannot access **Admin** or **Financial Year Admin** | Route hidden or shows access-denied | |

---

## 13. Backup, offline, misc

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 13.1 | **Settings → Backup** → download local SQL backup | .sql file downloads | |
| 13.2 | Kill network in DevTools, try to save an in-progress sale | Auto-save draft warns; on reconnect, draft recoverable | |
| 13.3 | Sign out while offline | Navigates to landing without hanging | |
| 13.4 | Command palette (Ctrl/Cmd+K) | Opens, navigates to any module | |
| 13.5 | Keyboard shortcuts dialog (`?`) | Lists shortcuts | |

---

## 14. Regression watch-list (quick sanity after any deploy)

1. Login → dashboard KPIs load < 3s
2. New sale → PDF preview → print
3. New purchase → stock reflected in Inventory
4. FY switch → data isolation holds
5. Reports → GST R1 opens
6. No console errors on any page visited

---

## 15. Teardown

| # | Action | Expected | P/F |
|---|--------|----------|-----|
| 15.1 | Note down the dummy company IDs, invoice numbers, and user emails you created | Recorded in your run log | |
| 15.2 | If a super-admin account is available, delete the dummy companies from the Super Admin dashboard | Companies removed, associated data cascades | |
| 15.3 | Delete the two dummy auth users (Cloud → Users) | Users removed | |

---

### Bug report template

When a step fails, log:

```
Step:            <e.g. 6.4>
Env:             preview | published | localhost
User / company:  qa+20260713@medikarp.test / QA Pharmacy 20260713
FY:              2026-27 (active)
Expected:        …
Actual:          …
Console errors:  <paste>
Network 4xx/5xx: <paste>
Screenshot:      <link>
Repro steps:     1) … 2) … 3) …
Severity:        blocker | major | minor | cosmetic
```
