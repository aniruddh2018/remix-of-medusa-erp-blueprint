// Shared Claude (Anthropic, via AWS Bedrock) client for all edge functions.
// Replaces the old ai.gateway.lovable.dev (Gemini) calls. Auth is via
// standard AWS credential env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
// optionally AWS_SESSION_TOKEN) — set as Supabase secrets — auto-detected by
// the underlying AWS SDK the Mantle client wraps.
// esm.sh's on-the-fly type-declaration bundler has proven unreliable for
// this package across several version/transitive-dep combinations (500s on
// bedrock-sdk's own index.d.mts and on its default @anthropic-ai/sdk
// transitive dep). The runtime .mjs resolves fine regardless — only the
// .d.mts bundling is flaky — so types come from the local ambient shim
// instead, and only the actual JS is fetched remotely.
// @deno-types="./anthropic-bedrock.d.ts"
import { AnthropicBedrockMantle } from "https://esm.sh/@anthropic-ai/bedrock-sdk@0.33.3?deps=@anthropic-ai/sdk@0.68.0";

export const CLAUDE_MODEL = "anthropic.claude-haiku-4-5";

export function getClaudeClient() {
  const region = Deno.env.get("AWS_REGION");
  if (!region) throw new Error("AWS_REGION not configured");
  return new AnthropicBedrockMantle({ awsRegion: region });
}
