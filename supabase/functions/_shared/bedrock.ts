// Shared AWS Bedrock Converse API client — plain REST, no SDK. Converse is
// provider-agnostic on Bedrock (same request/response shape for Anthropic,
// Meta/Llama, Amazon Nova, etc.), so this one helper covers whichever model
// a function is configured for. Auth is a Bedrock API key via
// AWS_BEARER_TOKEN_BEDROCK (Bearer token, no IAM SigV4 signing needed) +
// AWS_REGION — both set as Supabase secrets.
//
// Deliberately not using the AWS SDK: (a) AWS SDK v3's Deno/npm-specifier
// compatibility and this project's known esm.sh reliability issues (see the
// removed _shared/claude.ts) aren't worth it when Converse is one plain
// POST with a bearer token, and (b) it works identically for any model on
// Bedrock without a provider-specific SDK.
// Llama 4 Scout isn't invocable by its bare model ID on Bedrock — it only
// supports on-demand throughput via a cross-region inference profile.
// "us." matches our AWS_REGION (us-east-1).
export const BEDROCK_MODEL = "us.meta.llama4-scout-17b-instruct-v1:0";

export interface ConverseToolSpec {
  name: string;
  description: string;
  inputSchema: { json: Record<string, unknown> };
}

export interface ConverseContentBlock {
  text?: string;
  toolUse?: { toolUseId: string; name: string; input: Record<string, unknown> };
}

export interface ConverseResponse {
  output: { message: { role: string; content: ConverseContentBlock[] } };
  stopReason: string;
}

export const NOVA_EMBEDDING_MODEL = "amazon.nova-2-multimodal-embeddings-v1:0";
export const EMBEDDING_DIMENSION = 1024;

// Asymmetric embedding: index-time (catalog) and query-time (incoming text
// being matched against the catalog) use different purposes so the vector
// space is optimized for retrieval — see Nova's embeddingPurpose docs.
export type EmbeddingPurpose = "GENERIC_INDEX" | "TEXT_RETRIEVAL";

export async function embedText(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
  const bearerToken = Deno.env.get("AWS_BEARER_TOKEN_BEDROCK");
  if (!bearerToken) throw new Error("AWS_BEARER_TOKEN_BEDROCK not configured");
  const region = Deno.env.get("AWS_REGION");
  if (!region) throw new Error("AWS_REGION not configured");

  const res = await fetch(`https://bedrock-runtime.${region}.amazonaws.com/model/${NOVA_EMBEDDING_MODEL}/invoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      taskType: "SINGLE_EMBEDDING",
      singleEmbeddingParams: {
        embeddingPurpose: purpose,
        embeddingDimension: EMBEDDING_DIMENSION,
        text: { truncationMode: "END", value: text },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bedrock embedding failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const embedding = data.embeddings?.[0]?.embedding;
  if (!embedding) throw new Error("No embedding returned");
  return embedding;
}

export async function callBedrockConverse(params: {
  system?: string;
  messages: { role: "user" | "assistant"; content: { text: string }[] }[];
  tools?: ConverseToolSpec[];
  forceToolName?: string;
  maxTokens?: number;
}): Promise<ConverseResponse> {
  const bearerToken = Deno.env.get("AWS_BEARER_TOKEN_BEDROCK");
  if (!bearerToken) throw new Error("AWS_BEARER_TOKEN_BEDROCK not configured");
  const region = Deno.env.get("AWS_REGION");
  if (!region) throw new Error("AWS_REGION not configured");

  const body: Record<string, unknown> = {
    messages: params.messages,
    inferenceConfig: { maxTokens: params.maxTokens ?? 4096 },
  };
  if (params.system) body.system = [{ text: params.system }];
  if (params.tools?.length) {
    body.toolConfig = {
      tools: params.tools.map((t) => ({ toolSpec: t })),
      ...(params.forceToolName ? { toolChoice: { tool: { name: params.forceToolName } } } : {}),
    };
  }

  const res = await fetch(`https://bedrock-runtime.${region}.amazonaws.com/model/${BEDROCK_MODEL}/converse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err: any = new Error(`Bedrock Converse failed (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}
