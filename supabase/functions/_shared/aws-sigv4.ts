// Minimal AWS SigV4 request signer using Deno's built-in Web Crypto API —
// no AWS SDK dependency (consistent with the rest of this codebase's
// Bedrock integration, and avoids the esm.sh reliability issues hit with
// npm SDK packages earlier). Needed because S3 and Transcribe, unlike
// Bedrock, don't support the simpler Bearer-token API-key auth — see
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in capture-voice-entry.
async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data) as BufferSource);
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

export async function signAwsRequest(params: {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  headers?: Record<string, string>;
  body: string | Uint8Array;
  queryParams?: Record<string, string>;
}): Promise<SignedRequest> {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not configured");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const query = params.queryParams ?? {};
  const canonicalQuery = Object.keys(query).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join("&");

  const bodyHash = await sha256Hex(params.body);

  // Normalize ALL header keys to lowercase up front — SigV4 requires the
  // canonical-request headers to exactly match (name + value) what's
  // actually sent, or AWS rejects with SignatureDoesNotMatch.
  const normalizedHeaders: Record<string, string> = { host: params.host };
  for (const [k, v] of Object.entries(params.headers ?? {})) normalizedHeaders[k.toLowerCase()] = v;
  normalizedHeaders["x-amz-date"] = amzDate;
  normalizedHeaders["x-amz-content-sha256"] = bodyHash;

  const sortedHeaderKeys = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${normalizedHeaders[k].trim()}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    params.method,
    params.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, params.region);
  const kService = await hmac(kRegion, params.service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${params.host}${params.path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;

  return {
    url,
    headers: { ...normalizedHeaders, authorization },
  };
}
