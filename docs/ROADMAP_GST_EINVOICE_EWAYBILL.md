# Roadmap: GST e-Invoice (IRN) + e-Way Bill Integration

Status: planning. Owner: MedikaRP ERP. Last updated: 18 Aug 2026.

## 1. Research summary (current rules)

- **e-Invoicing** = reporting a B2B/export/CN/DN document to an IRP (Invoice Registration Portal),
  which returns **IRN + signed QR + signed invoice JSON + AckNo/AckDt**. The government does not
  generate the invoice; we still print it, but the QR/IRN must appear on the print.
- **IRPs**: NIC IRP (einvoice1/einvoice2.gst.gov.in, sandbox `einv-apisandbox.nic.in`) and private IRPs
  (IRIS IRP `einvoice6.gst.gov.in`, ClearTax, etc.). Direct NIC API access is normally granted via a
  **GSP/ASP**; small taxpayers usually integrate through a GSP.
- **Applicability**: PAN-level aggregate turnover > ₹5 Cr in any FY since 2017-18 → mandatory for B2B,
  exports, SEZ, credit/debit notes. B2C is out of scope (only B2C QR for >₹500 Cr).
- **Reporting time limit**: taxpayers above the notified turnover must report documents within
  **30 days** of document date (7-day rule was deferred/replaced; treat the window as configurable).
- **e-Way Bill** required for consignment value > ₹50,000 (state rules vary for intra-state).
  Can be generated (a) together with IRN, (b) later **by IRN**, or (c) standalone on the EWB API.
- **2026 changes to plan for** (currently *on hold* per GSTN advisory 30/07/2026, but build fields now):
  - `ShipDtls.Gstin` mandatory when Ship-To block is sent; `URP` for unregistered.
  - `ExpShipDtls` gains `Gstin` + `TrdNm`.
  - Bill-to ≠ Ship-to GSTIN; Ship-To state code and PIN must match GSTIN state.
  - Voluntary **EWB Closure** API after delivery.
  - 40% GST rate exists in the rate master; RSP-based HSNs have relaxed `TotItemVal` validation.

## 2. Architecture

```text
Sales invoice saved  ->  einvoice queue row (pending)
                          |
        edge function `gst-einvoice`  --auth-->  GSP/IRP token cache (6h)
                          |                      (sandbox | production)
                 build + validate payload (schema 1.1)
                          |
        IRP: /eicore/v1.03/Invoice        -> IRN, SignedQRCode, AckNo
        IRP: /eiewb/v1.03/ewaybill        -> EWB No, validity
                          |
      persist on sales_orders + einvoice_documents (raw req/resp, errors)
                          |
              PDF/print layer renders QR + IRN + EWB
```

All IRP calls stay server-side in edge functions; credentials live in backend secrets
(`GSP_CLIENT_ID`, `GSP_CLIENT_SECRET`, `IRP_USERNAME`, `IRP_PASSWORD`, `IRP_ENV`). Never in the client.

## 3. Data model (new)

- `einvoice_credentials` — per company: gstin, irp/gsp provider, env, encrypted creds ref, active flag.
- `einvoice_documents` — company_id, doc_type (INV/CRN/DBN), source table + id, status
  (`pending|generated|cancelled|failed`), irn, ack_no, ack_date, signed_qr, signed_invoice,
  error_code, error_message, request_payload, response_payload, attempt_count, financial_year_id.
- `eway_bills` — company_id, einvoice_document_id (nullable), ewb_no, ewb_date, valid_until,
  transporter_id/name, vehicle_no, trans_mode, distance, status (`active|cancelled|closed`), part_b history.
- Extra columns on `sales_orders`: `irn`, `ack_no`, `ack_date`, `ewb_no`, `einvoice_status`.
- Extra columns on `invoice_settings`: `einvoice_enabled`, `einvoice_threshold_amount`,
  `auto_generate_ewb`, `default_transport_mode`, `default_distance_km`.
- `credit_notes` / `debit_notes` reuse `einvoice_documents` via source table + id.

RLS: company-scoped like every other table; credentials readable only by admin/owner roles.

## 4. Phases

### Phase 0 — Prep (0.5 day)
- Confirm company GSTIN, legal name, address, PIN, state code in `invoice_settings`.
- Pick GSP/IRP (NIC direct vs IRIS/ClearTax) and register for sandbox creds.
- Add HSN + GST rate audit: every product needs HSN, rate, and unit code (UQC: `TAB`, `BOX`, `NOS`, `BTL`).

### Phase 1 — Masters & validation (2 days)
- UQC mapping for existing units (STRIP/TAB/BOX → valid UQC codes).
- Add `hsn_code`, `uqc`, GST rate validation to products; blocking pre-flight check UI.
- Party validation: GSTIN checksum + state-code helper (already exists as `gstin_state_code`).

### Phase 2 — Auth + payload builder (3 days)
- Edge function `gst-einvoice`: token fetch/refresh with cache, AES/RSA payload encryption per NIC spec
  (GSP SDK handles this for most providers).
- `src/services/gst/einvoicePayload.ts`: map `sales_orders` + items → schema 1.1
  (`TranDtls`, `DocDtls`, `SellerDtls`, `BuyerDtls`, `DispDtls`, `ShipDtls`, `ItemList`, `ValDtls`).
- Round-off, discount order (Gross → item disc → subtotal disc → GST → bill disc), inclusive-GST
  back-calculation must match our existing billing formula exactly, else error 2194/2234/2235.

### Phase 3 — IRN generate / cancel (2 days)
- Generate IRN on invoice save (async, queued) or on-demand button; duplicate IRN (error 2150) handled
  by fetching existing IRN.
- Cancel IRN within 24h with reason codes; block edits/deletes of an invoice once IRN exists.
- Store signed QR; render on A4 and thermal print via `billPdf.ts` / `billGenerator.ts`.

### Phase 4 — e-Way Bill (3 days)
- EWB-with-IRN (Part A + Part B at generation) and EWB-by-IRN (later, from invoice list).
- Standalone EWB for non-e-invoice movements (delivery challans, branch transfers).
- Part-B vehicle update, EWB cancel (24h), extend validity, and **EWB closure** (feature-flagged, on hold).
- Transporter master (`transporter_id`, mode, distance defaults).

### Phase 5 — Ops & resilience (2 days)
- Retry queue with backoff; failure dashboard listing error code + human message.
- 30-day reporting-window warning on old unreported invoices.
- Audit log of every IRP request/response (already have `erp_audit_logs` pattern).
- Sandbox/production toggle per company + "test IRN" smoke action in Settings.

### Phase 6 — Reconciliation (2 days)
- Get-IRN-by-doc-details sync job to detect out-of-band cancellations.
- GSTR-1 auto-population cross-check report vs our sales register.

## 5. Risks / decisions needed

1. **GSP choice** — direct NIC API needs whitelisted static IP + turnover eligibility; GSP is faster to ship.
2. **Turnover** — if below ₹5 Cr, e-invoice is voluntary; ship e-Way Bill first (Phases 0,1,4).
3. Our discount/GST-inclusive math must be byte-exact with IRP validations, else invoices reject.
4. Credential storage: secrets in backend only; per-company creds encrypted at rest.
5. Once IRN is generated, invoice becomes immutable — needs UI locking + credit-note workflow.

## 6. Suggested build order

`Phase 0 → 1 → 2 → 3 → 4 → 5 → 6`, with Phase 4 pulled forward if e-invoicing is not yet mandatory
for the company.
