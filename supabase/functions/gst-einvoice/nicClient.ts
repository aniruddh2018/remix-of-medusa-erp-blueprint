// Thin client for the NIC e-Invoice / e-Way Bill "direct" API.
//
// Protocol summary (confirmed against NIC's published sandbox docs /
// sample code — see docs/GST_EINVOICING.md for sources and caveats):
//   1. /auth: headers carry client-id / client-secret / gstin. Body carries
//      UserName + RSA(Password) + RSA(AppKey) where AppKey is a random
//      32-byte AES key we generate locally, RSA-encrypted with NIC's
//      published public key (PKCS1v1.5). The response's Data.Sek field is
//      the real session key, AES-ECB-encrypted with our own AppKey — we
//      decrypt it locally to recover the session key ("Sek").
//   2. Every call after that sends its JSON body AES-256-ECB-encrypted
//      (PKCS7) under the Sek, base64-encoded, as `{ Data: "<b64>" }`, with
//      the AuthToken from step 1 as a header. Responses come back the same
//      way and are decrypted with the same Sek.
//
// Endpoint paths and the exact envelope field names beyond /auth are only
// fully confirmed after logging into NIC's own sandbox/prod portal with a
// registered account, so they are stored per-company (gst_einvoice_credentials)
// and editable from Settings rather than hardcoded — see the defaults set
// in the migration and docs/GST_EINVOICING.md for how to correct them.

import { aesEcbEncrypt, aesEcbDecrypt } from "./aes.ts";
import { parseSpkiPublicKey, rsaPkcs1v15Encrypt, bytesToBase64, base64ToBytes } from "./rsa.ts";

export interface NicCredentials {
  env: "sandbox" | "production";
  gstin: string;
  username: string;
  password: string;
  client_id: string;
  client_secret: string;
  public_key_pem: string;
  api_base_url: string;
  auth_path: string;
  generate_irn_path: string;
  cancel_irn_path: string;
  generate_ewb_path: string;
  cancel_ewb_path: string;
  auth_token: string | null;
  sek: string | null; // base64
  token_expiry: string | null; // ISO
}

export interface NicSession {
  authToken: string;
  sek: Uint8Array;
  tokenExpiry: string; // ISO
}

export interface NicEnvelope<T = unknown> {
  Status?: number | string;
  Success?: boolean;
  ErrorDetails?: Array<{ ErrorCode?: string; ErrorMessage?: string }> | unknown;
  Data?: T;
  [key: string]: unknown;
}

function isSessionValid(creds: NicCredentials): NicSession | null {
  if (!creds.auth_token || !creds.sek || !creds.token_expiry) return null;
  const expiry = new Date(creds.token_expiry).getTime();
  if (!expiry || Date.now() > expiry - 2 * 60 * 1000) return null; // 2 min safety margin
  return { authToken: creds.auth_token, sek: base64ToBytes(creds.sek), tokenExpiry: creds.token_expiry };
}

function extractNicError(body: NicEnvelope): string {
  const details = body.ErrorDetails;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((d) => `${(d as { ErrorCode?: string }).ErrorCode ?? ""} ${(d as { ErrorMessage?: string }).ErrorMessage ?? ""}`.trim()).join("; ");
  }
  if (typeof body.Data === "string") return body.Data;
  return "NIC API returned an unsuccessful status with no error detail";
}

function isSuccess(body: NicEnvelope): boolean {
  if (typeof body.Status === "number") return body.Status === 1;
  if (typeof body.Status === "string") return body.Status === "1" || body.Status.toLowerCase() === "success";
  if (typeof body.Success === "boolean") return body.Success;
  return !body.ErrorDetails;
}

/** Authenticate against NIC and return a fresh session, reusing a cached one if still valid. */
export async function authenticate(creds: NicCredentials): Promise<NicSession> {
  const cached = isSessionValid(creds);
  if (cached) return cached;

  if (!creds.public_key_pem) throw new Error("NIC public key (public_key_pem) is not configured");
  if (!creds.username || !creds.password) throw new Error("NIC username/password are not configured");
  if (!creds.client_id || !creds.client_secret) throw new Error("NIC client-id/client-secret are not configured");

  const pub = await parseSpkiPublicKey(creds.public_key_pem);
  const appKey = crypto.getRandomValues(new Uint8Array(32));

  const encryptedPassword = bytesToBase64(rsaPkcs1v15Encrypt(pub, new TextEncoder().encode(creds.password)));
  const encryptedAppKey = bytesToBase64(rsaPkcs1v15Encrypt(pub, appKey));

  const url = creds.api_base_url.replace(/\/$/, "") + creds.auth_path;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "client-id": creds.client_id,
      "client-secret": creds.client_secret,
      "gstin": creds.gstin,
      "username": creds.username,
    },
    body: JSON.stringify({
      UserName: creds.username,
      Password: encryptedPassword,
      AppKey: encryptedAppKey,
      ForceRefreshAccessToken: false,
    }),
  });

  const raw = await res.text();
  let body: NicEnvelope;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`NIC /auth returned a non-JSON response (HTTP ${res.status}): ${raw.slice(0, 300)}`);
  }
  if (!res.ok || !isSuccess(body)) throw new Error(`NIC /auth failed: ${extractNicError(body)}`);

  const data = body.Data as { AuthToken?: string; Sek?: string; TokenExpiry?: string } | undefined;
  if (!data?.AuthToken || !data?.Sek) throw new Error("NIC /auth response missing AuthToken/Sek");

  const sek = aesEcbDecrypt(appKey, base64ToBytes(data.Sek));

  // TokenExpiry format varies by NIC API version; fall back to the
  // documented validity window (1h sandbox / 6h production) if unparsable.
  let expiryIso: string;
  const parsed = data.TokenExpiry ? new Date(data.TokenExpiry) : null;
  if (parsed && !isNaN(parsed.getTime())) {
    expiryIso = parsed.toISOString();
  } else {
    const minutes = creds.env === "production" ? 6 * 60 : 60;
    expiryIso = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }

  return { authToken: data.AuthToken, sek, tokenExpiry: expiryIso };
}

/** POST a Sek-encrypted payload to one of the authenticated NIC endpoints. */
export async function callAuthenticated<TReq, TRes>(
  creds: NicCredentials,
  session: NicSession,
  path: string,
  payload: TReq,
): Promise<{ ok: true; data: TRes; raw: NicEnvelope } | { ok: false; error: string; raw: unknown }> {
  const url = creds.api_base_url.replace(/\/$/, "") + path;
  const encrypted = bytesToBase64(aesEcbEncrypt(session.sek, new TextEncoder().encode(JSON.stringify(payload))));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "client-id": creds.client_id,
      "client-secret": creds.client_secret,
      "gstin": creds.gstin,
      "username": creds.username,
      "AuthToken": session.authToken,
    },
    body: JSON.stringify({ Data: encrypted }),
  });

  const rawText = await res.text();
  let body: NicEnvelope;
  try {
    body = JSON.parse(rawText);
  } catch {
    return { ok: false, error: `Non-JSON response (HTTP ${res.status}): ${rawText.slice(0, 300)}`, raw: rawText };
  }

  if (!res.ok || !isSuccess(body)) {
    return { ok: false, error: extractNicError(body), raw: body };
  }

  try {
    const decryptedText = typeof body.Data === "string"
      ? new TextDecoder().decode(aesEcbDecrypt(session.sek, base64ToBytes(body.Data)))
      : JSON.stringify(body.Data);
    const data = JSON.parse(decryptedText) as TRes;
    return { ok: true, data, raw: body };
  } catch (e) {
    return { ok: false, error: `Failed to decrypt/parse NIC response: ${(e as Error).message}`, raw: body };
  }
}
