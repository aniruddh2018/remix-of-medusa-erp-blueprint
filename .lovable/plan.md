# Twilio Integration Plan

## Goal
Enable the ERP to **send SMS and WhatsApp messages via Twilio** (invoices, payment reminders, status updates) and **receive inbound SMS/WhatsApp replies** logged to the database — everywhere the current wa.me click-to-chat button exists, plus a bulk-send screen in Settings.

## What gets built

### 1. Connector + secrets
- Link the **Twilio** connector via `standard_connectors--connect`. This exposes `TWILIO_API_KEY` (gateway connection key) + `LOVABLE_API_KEY` automatically — no manual SID/auth-token entry.
- Ask the user for two extras the connector doesn't provide:
  - `TWILIO_SMS_FROM` — Twilio phone number in E.164 (e.g. `+15017122661`)
  - `TWILIO_WHATSAPP_FROM` — WhatsApp sender (e.g. `whatsapp:+14155238886` sandbox or approved number)

### 2. Backend (edge functions)
- **`twilio-send`** (POST, auth required) — body `{ channel: "sms" | "whatsapp", to, templateKey, vars, pdfUrl? }`. Renders the existing WhatsApp template, posts to `https://connector-gateway.lovable.dev/twilio/Messages.json` via Lovable gateway with `application/x-www-form-urlencoded`, returns `{ sid, status }`. Logs to `twilio_messages` table.
- **`twilio-inbound`** (POST, `verify_jwt = false`, public) — Twilio webhook. Parses `From`, `Body`, `MessageSid`, `NumMedia`. Looks up the company by destination number, stores row in `twilio_messages` (direction=`inbound`). Returns empty TwiML `<Response/>`.
- **`twilio-bulk-send`** (POST, auth) — iterates a list of `{ to, vars }`, calls `twilio-send` internally, returns aggregated result.

### 3. Database (`twilio_messages`)
Columns: `id`, `company_id`, `direction` (`outbound`/`inbound`), `channel` (`sms`/`whatsapp`), `to_number`, `from_number`, `body`, `template_key`, `message_sid`, `status`, `error_code`, `error_message`, `related_invoice_id` (nullable FK), `metadata jsonb`, `created_at`.
RLS: company-scoped read/insert for `authenticated`; full access for `service_role` (edge functions write inbound rows). GRANTs included.

### 4. Frontend

| Location | Component | Action |
|---|---|---|
| Overdue Invoices card | `OverdueInvoicesCard.tsx` | Add SMS icon button next to WhatsApp button |
| Sales list rows | wherever `WhatsAppButton` is used in sales | Add sibling `SmsButton` |
| Settings page | new `TwilioSection.tsx` | Show connection status, FROM-number inputs (saved as user-managed secrets), inbound webhook URL to paste into Twilio console, link to a bulk-send dialog and recent message log |
| Settings page | new `BulkSendDialog.tsx` | Pick template, pick recipient set (all overdue customers / all credit customers / paste list), preview, send |

New shared pieces:
- `src/components/SmsButton.tsx` — mirror of `WhatsAppButton` but calls `twilio-send` with `channel: "sms"`.
- `src/hooks/useTwilioSend.ts` — react-query mutation wrapping `supabase.functions.invoke('twilio-send', …)`.
- `src/hooks/useTwilioMessages.ts` — list inbound/outbound history for a company.

### 5. Webhook URL surfaced to user
The Twilio inbound webhook URL is:
`https://moxccblenxbdadzakogw.supabase.co/functions/v1/twilio-inbound`
Settings UI shows it with a copy button and step-by-step ("Paste into Twilio Console → Phone Numbers → Messaging → A message comes in → Webhook").

## Out of scope (explicit)
- Replacing the existing `wa.me` click-to-chat button — kept as a fallback.
- Per-user OAuth (Twilio is workspace-owned credentials, correct for ERP).
- Rate limiting / SMS pumping protection — will recommend enabling it in Twilio console; not enforced client-side.
- Two-way conversation UI (inbound is logged only; no chat thread view yet).

## Order of execution
1. Connect Twilio connector (interactive).
2. Ask user for `TWILIO_SMS_FROM` and `TWILIO_WHATSAPP_FROM` via `add_secret`.
3. DB migration (`twilio_messages` table + grants + RLS).
4. Edge functions `twilio-send`, `twilio-inbound`, `twilio-bulk-send`.
5. Frontend buttons + Settings section.
6. Give user the webhook URL to paste into Twilio Console.

## Technical notes
- All Twilio calls go through `connector-gateway.lovable.dev/twilio/...` — never `api.twilio.com` directly. Account SID is auto-injected by the gateway.
- Body uses `URLSearchParams`, not JSON.
- WhatsApp `To` and `From` must be prefixed `whatsapp:+<E164>`.
- Phone normalization reuses `normalizePhoneForWhatsApp` from `src/lib/whatsapp.ts`.
- Templates reuse `whatsapp_templates` table — same body works for SMS (placeholders re-rendered server-side).
