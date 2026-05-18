/**
 * Stable per-browser device id.
 *
 * Stored in localStorage (survives across logouts; tied to the physical
 * browser profile). Sent up as `device_id` on every mutation so the server
 * can attribute writes and conflicts to a specific device.
 */
const KEY = "medikarp_device_id";

function uuidv4(): string {
  // Use crypto.randomUUID when available (HTTPS / localhost / modern browsers).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? crypto).getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceShortId(): string {
  return getDeviceId().slice(0, 8);
}
