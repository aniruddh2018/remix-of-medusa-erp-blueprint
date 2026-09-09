import { z } from 'zod';

// Wire schema for the browser<->agent real-time relay over AppSync Events.
// Adapted from the reference implementation's common/schemas.ts (MCP config
// dropped — not needed here).
export const SpeechToSpeechEventSchema = z.discriminatedUnion('event', [
  // server -> client (btoc)
  z.object({ direction: z.literal('btoc'), event: z.literal('ready'), data: z.object({}) }),
  z.object({
    direction: z.literal('btoc'), event: z.literal('audioOutput'),
    data: z.object({ blobs: z.array(z.string()), sequence: z.number() }),
  }),
  z.object({
    direction: z.literal('btoc'), event: z.literal('textStart'),
    data: z.object({ id: z.string(), role: z.string(), generationStage: z.string().nullable() }),
  }),
  z.object({
    direction: z.literal('btoc'), event: z.literal('textOutput'),
    data: z.object({ id: z.string(), role: z.string(), content: z.string() }),
  }),
  z.object({
    direction: z.literal('btoc'), event: z.literal('textStop'),
    data: z.object({ id: z.string(), stopReason: z.string() }),
  }),
  z.object({ direction: z.literal('btoc'), event: z.literal('end'), data: z.object({ reason: z.string().optional() }) }),

  // client -> server (ctob)
  z.object({
    direction: z.literal('ctob'), event: z.literal('audioInput'),
    data: z.object({ blobs: z.array(z.string()), sequence: z.number() }),
  }),
  z.object({ direction: z.literal('ctob'), event: z.literal('terminateSession'), data: z.object({}) }),
]);

export type SpeechToSpeechEvent = z.infer<typeof SpeechToSpeechEventSchema>;
export type DispatchEventParams = Omit<SpeechToSpeechEvent, 'direction'>;
