# Zero-Typing Capture — Development Plan

## Locked decisions (from product discussion)
- **Channel:** in-app first (camera/mic in the PWA). WhatsApp is Phase 5, deferred — same engine, new channel later.
- **Scope:** all business types from day 1 (not pharmacy-only) — generic line-item schema, pharmacy fields layered on top.
- **Risk stance:** always confirm before posting. No auto-post in v1.
- **UX:** intent-first (Sale / Purchase / Expense picked before capture, not inferred).
- **Resolution pipeline:** correction-history → phonetic/trigram → embedding fallback → ask if still ambiguous. Never guess silently.
- **STT:** biased with in-stock product names (boosted, not forced) + LLM text-correction pass using full catalog as reference.
- **Reuse, don't rebuild:** `scan-invoice`, `parse-order-text`, `ai-assistant`, `nl-query`, `generate-product-embeddings`, `embed-text`.

---

## Phase 1 — Data model & backend foundations

**Migration** (`supabase/migrations/<ts>_zero_typing_capture.sql`):
- `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (if not already enabled)
- `products.phonetic_key text` — normalized phonetic form, maintained via trigger on insert/update (custom normalizer tuned for Indian brand patterns, not stock Soundex)
- `capture_queue` — `id, company_id, source_type[photo|voice], transaction_type[sale|purchase|expense], raw_media_url, transcript, extracted_json, corrected_json, status[pending|confirmed|rejected], posted_entry_id, created_by, created_at`
- `voice_correction_history` — `id, company_id, raw_phrase, resolved_product_id, hit_count, last_used_at`
- Storage bucket `captures`, RLS scoped by `company_id` (mirror existing storage bucket patterns in this repo)
- Trigram index on `products.name`, index on `products.phonetic_key`

**Shared resolution module** (`supabase/functions/_shared/resolveProductMention.ts` — new shared file, first of its kind in `supabase/functions/`, so also set up the shared-import convention if one doesn't exist):
- Input: raw mention text + `company_id`
- Runs tiers in order: `voice_correction_history` exact/near match → phonetic+trigram on `products` → embedding similarity (calls existing `embed-text` pattern) → returns `{product_id, confidence, method}` or `{ambiguous: true, candidates: [...]}`
- Used by BOTH photo and voice paths — this is the core reusable piece.

**Edge functions:**
- `capture-photo-entry` (new, forks `scan-invoice`'s OCR call but outputs the generic schema: `line_items[{description, quantity, unit, rate, tax_rate, amount}], party_name, date, payment_mode`) → calls resolution module per line item.
- `capture-voice-entry` (new): fetch in-stock products for company → STT with phrase-hints → LLM correction pass (transcript + catalog names in prompt) → extraction (reuse `parse-order-text` shape) → resolution module per line item.
- Both write a `capture_queue` row and return it to the frontend for review — never post directly.
- `confirm-capture` (new): takes a `capture_queue.id` + corrected/confirmed `line_items` → posts to `sales_orders`/`purchase_orders`/new `expenses` table (check if one exists; add if not) → writes any user corrections into `voice_correction_history` → marks `capture_queue.status = confirmed`.

---

## Phase 2 — Frontend capture UX

- `src/components/capture/QuickCaptureButton.tsx` — global floating action, mounted in `AppLayout`
- `src/components/capture/IntentPicker.tsx` — Sale / Purchase / Expense
- `src/components/capture/PhotoCapture.tsx` — camera input (`<input capture="environment">` for mobile), upload, calls `capture-photo-entry`
- `src/components/capture/VoiceCapture.tsx` — `MediaRecorder` recording UI, upload, calls `capture-voice-entry`
- `src/components/capture/ReviewCard.tsx` — shared by both paths: editable line items, ambiguous lines render a 3-candidate picker instead of a text field, "Confirm & Post" calls `confirm-capture`
- Wire into existing Sales/Purchases pages as an alternate entry point alongside manual forms (not a replacement)

---

## Phase 3 — Resolution pipeline hardening

- Tune bias-list source: switch from "top sold" to "currently in stock" once Phase 1 ships (per earlier discussion — tighter, more relevant subset)
- Confidence thresholds: calibrate what counts as "confident enough to pre-fill" vs "ambiguous" using real pilot data, not guessed numbers
- `voice_correction_history` write-back verified end-to-end (this is the compounding-accuracy mechanic — must work correctly from day one of pilot, not bolted on later)

---

## Phase 4 — Pilot & metrics

- 3–5 pilot companies, mixed business types (per the "all types from day 1" call)
- Track: % confirmed-as-is vs corrected, which resolution tier resolved each line (1/2/3/ambiguous), capture-to-confirm latency
- Use this data to re-tune Phase 3 thresholds before wider rollout

---

## Phase 5 — Deferred: WhatsApp channel

- Reuses `capture_queue`, resolution module, and `confirm-capture` unchanged
- New: `twilio-inbound` wiring, phone-number → company identity mapping, WhatsApp-native confirm UX (buttons/replies instead of the in-app review card)
- Routing model (shared number + lookup vs per-client number) — revisit at that point

---

## Suggested execution order
1. Migration + `resolveProductMention` shared module (foundation everything else depends on)
2. `capture-photo-entry` + `PhotoCapture.tsx` + `ReviewCard.tsx` (photo is lower-risk than voice — ship and validate the review/confirm loop first)
3. `capture-voice-entry` + `VoiceCapture.tsx` (adds STT + biasing on top of a proven resolution/review pipeline)
4. `confirm-capture` posting logic per transaction type
5. Pilot, measure, tune
