/**
 * Stores an encrypted snapshot of the user's profile + roles in IndexedDB
 * so the app can boot when Supabase is unreachable.
 *
 * Layout in `auth_cache`:
 *   key="salt"    → ciphertext holds the raw salt bytes; iv unused
 *   key="session" → AES-GCM ciphertext of CachedSession JSON
 */
import { offlineDb } from "../db";
import { deriveKey, encryptJson, decryptJson, randomBytes, SALT_LEN } from "./crypto";

export interface CachedSession {
  user_id: string;
  email: string;
  full_name: string | null;
  company_id: string | null;
  roles: string[];
  cached_at: number;
  /** Max age (ms) the cache is considered usable offline. Default 30d. */
  ttl_ms: number;
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_BUF = new ArrayBuffer(0);

export async function hasOfflineCache(): Promise<boolean> {
  const [salt, sess] = await Promise.all([
    offlineDb.auth_cache.get("salt"),
    offlineDb.auth_cache.get("session"),
  ]);
  return Boolean(salt && sess);
}

/** Has the user finished PIN setup? Same predicate as `hasOfflineCache` today. */
export const isPinConfigured = hasOfflineCache;

async function getOrCreateSalt(): Promise<ArrayBuffer> {
  const existing = await offlineDb.auth_cache.get("salt");
  if (existing) return existing.ciphertext;
  const salt = randomBytes(SALT_LEN).buffer as ArrayBuffer;
  await offlineDb.auth_cache.put({
    key: "salt",
    ciphertext: salt,
    iv: EMPTY_BUF,
    updated_at: Date.now(),
  });
  return salt;
}

async function getSalt(): Promise<ArrayBuffer | null> {
  const row = await offlineDb.auth_cache.get("salt");
  return row?.ciphertext ?? null;
}

export async function setOfflinePin(pin: string, session: CachedSession): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4–8 digits");
  const salt = await getOrCreateSalt();
  const key = await deriveKey(pin, salt);
  const { ciphertext, iv } = await encryptJson(key, {
    ...session,
    ttl_ms: session.ttl_ms ?? DEFAULT_TTL_MS,
  });
  await offlineDb.auth_cache.put({
    key: "session",
    ciphertext,
    iv,
    updated_at: Date.now(),
  });
}

/** Refresh the encrypted snapshot using the same PIN. No-op if PIN not set. */
export async function refreshOfflineSession(pin: string, session: CachedSession): Promise<boolean> {
  if (!(await hasOfflineCache())) return false;
  await setOfflinePin(pin, session);
  return true;
}

export async function unlockOfflineSession(pin: string): Promise<CachedSession> {
  const salt = await getSalt();
  const sess = await offlineDb.auth_cache.get("session");
  if (!salt || !sess) throw new Error("No offline session stored");
  const key = await deriveKey(pin, salt);
  const data = await decryptJson<CachedSession>(key, sess.ciphertext, sess.iv);
  if (Date.now() - data.cached_at > data.ttl_ms) {
    throw new Error("Offline session expired — please sign in online");
  }
  return data;
}

export async function clearOfflineSession(): Promise<void> {
  await offlineDb.auth_cache.clear();
}
