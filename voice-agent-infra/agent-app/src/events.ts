// Adapted from aws-samples/sample-serverless-nova-sonic-chat
// (app/src/agent/events.ts) — MCP-related dispatching removed.
import { events, EventsChannel } from 'aws-amplify/data';
import { ModelStreamErrorException } from '@aws-sdk/client-bedrock-runtime';
import { DispatchEventParams, SpeechToSpeechEvent, SpeechToSpeechEventSchema } from './schemas.js';
import { MessageRepository } from './message-repository.js';
import { NovaStream } from './nova-stream.js';
import './amplify.js';
import { AudioEventSequencer } from './audio-sequencer.js';

const MIN_AUDIO_OUTPUT_QUEUE_SIZE = 10;
const MAX_AUDIO_OUTPUT_PER_BATCH = 20;
let audioOutputQueue: string[] = [];
let unprocessedClientEvents: SpeechToSpeechEvent[] = [];
let audioOutputSequence = 0;

export const dispatchEvent = async (channel: EventsChannel, params: DispatchEventParams) => {
  try {
    await channel.publish({ direction: 'btoc', ...params });
  } catch (e) {
    console.log('Failed to publish event (channel may be closed):', params.event);
    console.log(e);
  }
};

// Batch Nova's audio output before sending — unbatched playback is choppy.
const enqueueAudioOutput = async (channel: EventsChannel, audioOutput: string) => {
  audioOutputQueue.push(audioOutput);
  if (audioOutputQueue.length > MIN_AUDIO_OUTPUT_QUEUE_SIZE) {
    const chunksToProcess: string[] = [];
    let processed = 0;
    while (audioOutputQueue.length > 0 && processed < MAX_AUDIO_OUTPUT_PER_BATCH) {
      const chunk = audioOutputQueue.shift();
      if (chunk) {
        chunksToProcess.push(chunk);
        processed += 1;
      }
    }
    await dispatchEvent(channel, { event: 'audioOutput', data: { blobs: chunksToProcess, sequence: audioOutputSequence } });
    audioOutputSequence++;
  }
};

const forcePublishAudioOutput = async (channel: EventsChannel) => {
  const chunksToProcess: string[] = [];
  while (audioOutputQueue.length > 0) {
    const chunk = audioOutputQueue.shift();
    if (chunk) chunksToProcess.push(chunk);
  }
  await dispatchEvent(channel, { event: 'audioOutput', data: { blobs: chunksToProcess, sequence: audioOutputSequence } });
  audioOutputSequence++;
};

export const initializeSubscription = async (channelPath: string, context: { stream?: NovaStream }) => {
  audioOutputQueue = [];
  unprocessedClientEvents = [];
  audioOutputSequence = 0;
  const channel = await events.connect(channelPath);
  let clientInitialized = false;
  console.log(`Connected to event channel ${channelPath}`);

  const sequencer = new AudioEventSequencer((chunks) => {
    context.stream!.enqueueAudioInput(chunks);
  });

  const processEventsFromClient = (event: SpeechToSpeechEvent) => {
    const stream = context.stream;
    if (!stream?.isProcessing) {
      unprocessedClientEvents.push(event);
      return;
    }
    const events = [...unprocessedClientEvents, event];
    for (const e of events) {
      if (e.direction !== 'ctob') continue;
      clientInitialized = true;
      if (e.event === 'audioInput') {
        sequencer.next(e.data.blobs, e.data.sequence);
      } else if (e.event === 'terminateSession') {
        stream.close();
      }
    }
    unprocessedClientEvents = [];
  };

  channel.subscribe({
    next: async (data: { event: unknown }) => {
      const { data: event, error } = SpeechToSpeechEventSchema.safeParse(data.event);
      if (error) {
        console.log(error);
        return;
      }
      processEventsFromClient(event);
    },
    error: console.error,
  });

  // Periodically announce readiness until the client responds.
  const readyAt = Date.now();
  const readyInterval = setInterval(async () => {
    if (Date.now() - readyAt > 60 * 1000) {
      clearInterval(readyInterval);
      return;
    }
    if (clientInitialized) {
      clearInterval(readyInterval);
      return;
    }
    try {
      await dispatchEvent(channel, { event: 'ready', data: {} });
    } catch (error) {
      console.error('Failed to dispatch ready event:', error);
    }
  }, 1000);

  return channel;
};

export const processResponseStream = async (
  channel: EventsChannel,
  stream: NovaStream,
  sessionId: string,
  invokedAt: number
): Promise<{ state: 'success' | 'error' | 'resume' }> => {
  const messageRepository = new MessageRepository();
  const startedAt = Date.now();
  // Nova Sonic's single stream is capped around 8 minutes — resume within a
  // randomized window so many concurrent sessions don't all hit the
  // boundary at once.
  const willResumeIn = Math.floor(Math.random() * 90 + 360);

  const contents: { [key: string]: { role: string; content: string; isFinal: boolean } } = {};
  const toolUses: { [key: string]: { toolUseId: string; content: string; toolName: string } } = {};

  for await (const event of stream.iterator) {
    try {
      if (!event.chunk?.bytes) continue;
      const jsonResponse = JSON.parse(new TextDecoder().decode(event.chunk.bytes));

      if (jsonResponse.event?.audioOutput) {
        await enqueueAudioOutput(channel, jsonResponse.event.audioOutput.content);
      } else if (jsonResponse.event?.contentEnd?.type === 'AUDIO') {
        await forcePublishAudioOutput(channel);
      } else if (jsonResponse.event?.contentStart?.type === 'TEXT') {
        let generationStage: string | null = null;
        if (jsonResponse.event.contentStart.additionalModelFields) {
          generationStage = JSON.parse(jsonResponse.event.contentStart.additionalModelFields).generationStage;
        }
        contents[jsonResponse.event.contentStart.contentId] = {
          role: jsonResponse.event.contentStart.role?.toLowerCase(),
          content: '',
          isFinal: generationStage === 'FINAL',
        };
        await dispatchEvent(channel, {
          event: 'textStart',
          data: { id: jsonResponse.event.contentStart.contentId, role: jsonResponse.event.contentStart.role?.toLowerCase(), generationStage },
        });
      } else if (jsonResponse.event?.textOutput) {
        const content = jsonResponse.event.textOutput.content || '';
        const existing = contents[jsonResponse.event.textOutput.contentId];
        if (content !== '{ "interrupted" : true }' && existing) existing.content += content;
        await dispatchEvent(channel, {
          event: 'textOutput',
          data: { id: jsonResponse.event.textOutput.contentId, role: jsonResponse.event.textOutput.role?.toLowerCase(), content },
        });
      } else if (jsonResponse.event?.contentEnd?.type === 'TEXT') {
        const existing = contents[jsonResponse.event.contentEnd.contentId];
        await dispatchEvent(channel, {
          event: 'textStop',
          data: { id: jsonResponse.event.contentEnd.contentId, stopReason: jsonResponse.event.contentEnd.stopReason },
        });
        if (existing?.isFinal && existing.content) {
          // Speculative content isn't saved — it might not actually be spoken.
          await messageRepository.saveMessage(sessionId, {
            role: existing.role,
            content: existing.content.replaceAll('  ', ' ').trim(),
          });
          if (existing.role === 'assistant' && jsonResponse.event.contentEnd.stopReason === 'END_TURN') {
            if (Date.now() - startedAt > 1000 * willResumeIn) {
              return { state: 'resume' };
            }
          }
        }
      } else if (jsonResponse.event?.toolUse) {
        toolUses[jsonResponse.event.toolUse.contentId] = {
          toolUseId: jsonResponse.event.toolUse.toolUseId,
          toolName: jsonResponse.event.toolUse.toolName,
          content: jsonResponse.event.toolUse.content,
        };
      } else if (jsonResponse.event?.contentEnd?.type === 'TOOL') {
        const toolUse = toolUses[jsonResponse.event.contentEnd.contentId];
        if (toolUse) await stream.executeToolAndSendResult(toolUse.toolUseId, toolUse.toolName, toolUse.content);
      }
    } catch (e) {
      console.error('Error in processResponseStream', e);
      if (!(e instanceof ModelStreamErrorException)) return { state: 'error' };
    }
  }
  return { state: 'success' };
};
