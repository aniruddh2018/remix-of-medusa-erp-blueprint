import { signAwsRequest } from "./aws-sigv4.ts";

function bucketHost(bucket: string, region: string): string {
  return `${bucket}.s3.${region}.amazonaws.com`;
}

export async function s3PutObject(bucket: string, key: string, body: Uint8Array, contentType: string): Promise<void> {
  const region = Deno.env.get("AWS_REGION");
  if (!region) throw new Error("AWS_REGION not configured");

  const signed = await signAwsRequest({
    method: "PUT",
    host: bucketHost(bucket, region),
    path: `/${key}`,
    region,
    service: "s3",
    headers: { "content-type": contentType },
    body,
  });

  const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body });
  if (!res.ok) throw new Error(`S3 PutObject failed (${res.status}): ${await res.text()}`);
}

export async function s3GetObject(bucket: string, key: string): Promise<string> {
  const region = Deno.env.get("AWS_REGION");
  if (!region) throw new Error("AWS_REGION not configured");

  const signed = await signAwsRequest({
    method: "GET",
    host: bucketHost(bucket, region),
    path: `/${key}`,
    region,
    service: "s3",
    body: "",
  });

  const res = await fetch(signed.url, { method: "GET", headers: signed.headers });
  if (!res.ok) throw new Error(`S3 GetObject failed (${res.status}): ${await res.text()}`);
  return res.text();
}
