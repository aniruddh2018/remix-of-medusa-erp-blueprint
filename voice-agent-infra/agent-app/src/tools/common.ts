import { z, ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ToolContext {
  sessionId: string;
  userId: string;
}

export type ToolDefinition<Input> = {
  readonly name: string;
  readonly description: string;
  readonly schema: ZodType<Input>;
  readonly handler: (input: Input, context: ToolContext) => Promise<string | object>;
};

// Infers Input from `schema` at the call site (via z.infer) instead of
// requiring a hand-written `ToolDefinition<{...}>` annotation that has to be
// kept in sync with the schema by hand — that duplication is exactly what
// caused real type mismatches (optional vs required) across every tool
// before this helper existed. Always define tools with this, never with a
// bare object literal typed against ToolDefinition directly.
export function defineTool<S extends ZodType>(def: {
  name: string;
  description: string;
  schema: S;
  handler: (input: z.infer<S>, context: ToolContext) => Promise<string | object>;
}): ToolDefinition<z.infer<S>> {
  return def;
}

// Nova Sonic's tool spec wants a STRINGIFIED JSON schema (inputSchema.json
// is a string), unlike Bedrock Converse's object-based inputSchema.json —
// confirmed from the reference implementation's tools/common.ts. Building
// this from the same Zod schema used for runtime validation keeps the two
// from drifting apart.
// Deliberately not generic over Input — that's what was tripping up
// TypeScript ("Type instantiation is excessively deep") when called with a
// ToolDefinition<any> from an array. This function only ever touches
// `.schema` to build a JSON schema string; it never needs the Input type.
export function toolSpecFrom(tool: { name: string; description: string; schema: ZodType }) {
  return () => ({
    name: tool.name,
    description: tool.description,
    // A zod/zod-to-json-schema type-checking incompatibility ("Type
    // instantiation is excessively deep") fires here regardless of how this
    // is called — confirmed at runtime (see the session notes) that
    // zodToJsonSchema's actual output is correct; this is a known
    // cross-library type-inference limitation, not a real bug.
    // @ts-expect-error — see comment above
    inputSchema: { json: JSON.stringify(zodToJsonSchema(tool.schema)) },
  });
}
