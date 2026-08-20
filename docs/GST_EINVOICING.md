# GST e-Invoicing (IRN via NIC direct API) + e-Way Bill

This feature lets a sales invoice in **Sales** be submitted to the government's
GST e-Invoice system to obtain an **IRN** (Invoice Reference Number), a signed
QR code, and — optionally — an **e-Way Bill**, using NIC's direct e-Invoice
API (not a third-party GSP).

## How it works

- **Settings → GST e-Invoicing (IRN via NIC API)** — enter your NIC sandbox or
  production credentials (GSTIN, portal username/password, GSP `client-id` /
  `client-secret`, and the NIC public key PEM). Admin-only.
- **Sales → row menu → the 🖊 e-Invoice icon** — for any B2B invoice (one with
  a customer GSTIN), generate the IRN, then optionally the e-Way Bill with
  transporter/vehicle details. The signed QR code renders inline and is
  embedded on the printed invoice once generated.
- **Test mode** — until credentials are saved, "Generate e-Invoice" produces a
  clearly-labelled mock IRN (prefixed `MOCK`) so the whole flow — generating,
  printing the QR, cancelling within 24h, generating/cancelling an e-Way Bill
  — can be exercised without a live NIC account. Real IRNs activate the
  moment working credentials are saved.
- Every call (mock or real) is written to `gst_einvoice_log` for audit/debugging.

## Where the credentials live

Secrets (`password`, `client_secret`, the NIC public key) are stored in
`gst_einvoice_credentials`, a table with **no RLS policies granted to
`authenticated`** — only the `gst-einvoice` edge function (using the Supabase
service role) can read or write it. The frontend never fetches this table
directly; it only ever calls the edge function's `get_status` /
`save_credentials` actions, and `get_status` never returns a secret field.

## The cryptography

NIC's `/auth` call requires the password and a locally-generated AES app key
to be encrypted with **RSA (PKCS#1 v1.5)** using NIC's published public key;
every call after that encrypts its JSON body with **AES-256 (ECB, PKCS7)**
under the session key NIC returns. Browsers and Deno's Web Crypto API don't
expose either primitive directly (`RSAES-PKCS1-v1_5` encryption and `AES-ECB`
were both deliberately dropped from the standard `SubtleCrypto` surface), so
both are implemented from scratch in:

- [`supabase/functions/gst-einvoice/aes.ts`](../supabase/functions/gst-einvoice/aes.ts) —
  a from-first-principles AES block cipher (128/192/256-bit), verified during
  development against the official FIPS-197 Appendix C.3 AES-256 test vector.
- [`supabase/functions/gst-einvoice/rsa.ts`](../supabase/functions/gst-einvoice/rsa.ts) —
  RSAES-PKCS1-v1_5 encryption via BigInt modular exponentiation, verified
  during development with a full encrypt/decrypt round-trip against a
  generated RSA-2048 keypair.

Both were exercised with real test vectors while building this feature; the
GST e-Invoice JSON *schema* itself (`Version`, `TranDtls`, `SellerDtls`,
`ItemList`, `ValDtls`, …) is GSTN's publicly notified schema v1.1 and is
stable. What is **not independently verified** — because it requires logging
into your own registered NIC sandbox/production account, which this
integration can't do on your behalf — is the exact envelope field names
NIC's response uses beyond `/auth` (e.g. inside the `generate_irn` /
`cancel_irn` / e-Way Bill responses) and the precise current endpoint paths
for your API version. Sources consulted while building this:

- [einv-apisandbox.nic.in — API overview](https://einv-apisandbox.nic.in/api-overview.html)
- [einv-apisandbox.nic.in — FAQs on API](https://einv-apisandbox.nic.in/FaqsonAPI.html)
- [einv-apisandbox.nic.in — C#.NET sample code](https://einv-apisandbox.nic.in/sample-code-in-c-sharp-dot-net.html)
  (confirms the `/auth` path, `client-id`/`client-secret`/`gstin` headers, and
  the `UserName`/`Password`/`AppKey`/`Data`/`AuthToken`/`Sek`/`TokenExpiry`
  field names used in `nicClient.ts`)
- [ClearTax — e-Invoice API FAQs](https://cleartax.in/s/e-invoice-api-faqs)

**Before going live**, log into your own NIC sandbox account, download the
current public key certificate, and confirm the endpoint paths and cancel /
e-Way Bill field names against your account's documentation. All of these are
editable per-company from **Settings → GST e-Invoicing → Advanced: API
endpoints** — no code change needed if NIC's current values differ from the
defaults shipped here. `gst_einvoice_log.response_payload` captures the raw
decrypted response of every call, which is the fastest way to spot a field
name mismatch.

## Database

- `sales_orders` gained `einvoice_*` and `eway_*` status/IRN/QR columns.
- `companies.pincode` / `customers.pincode` were added — mandatory on the
  e-Invoice schema but not previously captured. Fill them in via **Settings →
  GST Filing Setup** / the customer form, or per-invoice in the e-Invoice
  dialog (temporary override, not persisted).
- `gst_einvoice_credentials` — per-company NIC credentials (secrets).
- `gst_einvoice_log` — audit trail of every API call (request/response,
  success/failure, mock/real).
