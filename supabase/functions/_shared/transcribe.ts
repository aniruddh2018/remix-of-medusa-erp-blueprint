import { signAwsRequest } from "./aws-sigv4.ts";

async function callTranscribe(target: string, body: Record<string, unknown>): Promise<any> {
  const region = Deno.env.get("AWS_REGION");
  if (!region) throw new Error("AWS_REGION not configured");

  const bodyStr = JSON.stringify(body);
  const signed = await signAwsRequest({
    method: "POST",
    host: `transcribe.${region}.amazonaws.com`,
    path: "/",
    region,
    service: "transcribe",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": `Transcribe.${target}`,
    },
    body: bodyStr,
  });

  const res = await fetch(signed.url, { method: "POST", headers: signed.headers, body: bodyStr });
  if (!res.ok) throw new Error(`Transcribe ${target} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function startTranscriptionJob(params: {
  jobName: string;
  mediaFileUri: string;
  outputBucketName: string;
}): Promise<void> {
  await callTranscribe("StartTranscriptionJob", {
    TranscriptionJobName: params.jobName,
    Media: { MediaFileUri: params.mediaFileUri },
    MediaFormat: "webm",
    IdentifyLanguage: true,
    // Hinglish/code-mixed speech has no dedicated language code — these two
    // are the closest supported options for this app's audience. Known
    // limitation: Transcribe picks one, it doesn't blend them mid-clip.
    LanguageOptions: ["en-IN", "hi-IN"],
    OutputBucketName: params.outputBucketName,
  });
}

export interface TranscriptionJobStatus {
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  failureReason?: string;
}

export async function getTranscriptionJob(jobName: string): Promise<TranscriptionJobStatus> {
  const data = await callTranscribe("GetTranscriptionJob", { TranscriptionJobName: jobName });
  const job = data.TranscriptionJob;
  return { status: job.TranscriptionJobStatus, failureReason: job.FailureReason };
}
