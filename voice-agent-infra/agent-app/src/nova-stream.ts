// Adapted from aws-samples/sample-serverless-nova-sonic-chat
// (app/src/agent/nova-stream.ts) — MCP tool support removed (not needed
// here; all tools call directly into Supabase). Protocol details (event
// shapes, audio formats, the 8-minute single-stream limit) are unchanged
// from the reference implementation.
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamCommandOutput,
  InvokeModelWithBidirectionalStreamInput,
} from '@aws-sdk/client-bedrock-runtime';
import { randomUUID } from 'crypto';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { ToolDefinition, toolSpecFrom } from './tools/common.js';

const MAX_AUDIO_INPUT_QUEUE_SIZE = 200;
const modelId = 'amazon.nova-2-sonic-v1:0';
const bedrock = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
  requestHandler: new NodeHttp2Handler({
    requestTimeout: 300000,
    sessionTimeout: 300000,
    disableConcurrentStreams: false,
    maxConcurrentStreams: 1,
  }),
});

/**
 * Handles Bedrock InvokeModelWithBidirectionalStream API streams.
 * https://docs.aws.amazon.com/nova/latest/userguide/input-events.html
 */
export class NovaStream {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly eventQueue: Array<any> = [];
  private readonly audioInputQueue: string[] = [];

  private readonly promptName: string;
  private audioContentId: string;

  private isActive: boolean;
  private isAudioStarted: boolean;
  private isProcessingAudio: boolean;

  private _stream: InvokeModelWithBidirectionalStreamCommandOutput | undefined = undefined;

  constructor(
    private sessionId: string,
    private userId: string,
    private voiceId: string,
    private systemPrompt: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private tools: ToolDefinition<any>[]
  ) {
    this.promptName = randomUUID();
    this.audioContentId = randomUUID();
    this.isAudioStarted = false;
    this.isProcessingAudio = false;
    this.isActive = true;
  }

  public get iterator() {
    if (!this._stream?.body) {
      throw new Error('Nova stream is not open yet!');
    }
    return this._stream.body;
  }

  public get isProcessing() {
    return this.isActive && this.isAudioStarted;
  }

  private createAsyncIterator() {
    const eventQueue = this.eventQueue;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
          try {
            while (eventQueue.length === 0 && this.isActive) {
              await new Promise((s) => setTimeout(s, 100));
            }
            const nextEvent = eventQueue.shift();
            if (!nextEvent) return { value: undefined, done: true };
            if (nextEvent.event.sessionEnd) this.isActive = false;
            if (!nextEvent.event.audioInput) console.log(JSON.stringify(nextEvent));
            return {
              value: { chunk: { bytes: new TextEncoder().encode(JSON.stringify(nextEvent)) } },
              done: false,
            };
          } catch (e) {
            console.error('Error in asyncIterator', e);
            return { value: undefined, done: true };
          }
        },
      }),
      return: async () => ({ value: undefined, done: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw: async (error: any) => {
        console.error(error);
        throw error;
      },
    };
  }

  /**
   * @param previousChatHistory Sorted by createdAt ASC. Provide when resuming a session.
   */
  public async open(
    previousChatHistory: { content: string; role: string }[]
  ): Promise<InvokeModelWithBidirectionalStreamCommandOutput> {
    this.enqueueSessionStart();
    this.enqueuePromptStart(this.voiceId);
    this.enqueueSystemPrompt(this.systemPrompt);

    const history = this.sliceChatHistory(previousChatHistory);
    history.forEach((chat) => this.enqueueChatHistory(chat.content, chat.role));
    this.enqueueAudioStart();

    const asyncIterator = this.createAsyncIterator();
    const response = await bedrock.send(
      new InvokeModelWithBidirectionalStreamCommand({ modelId, body: asyncIterator })
    );
    this._stream = response;
    return response;
  }

  private sliceChatHistory(chatHistory: { content: string; role: string }[]): { content: string; role: string }[] {
    // Each message < 1024 chars, total < 40,960 chars. First message must be
    // USER, last message must not be USER (trailing dangling user turn).
    if (!chatHistory || chatHistory.length === 0) return [];

    const MAX_MESSAGE_LENGTH = 1024;
    const MAX_TOTAL_LENGTH = 40960;

    const concatenated: { content: string; role: string }[] = [];
    for (const msg of chatHistory) {
      const last = concatenated[concatenated.length - 1];
      if (last && last.role.toUpperCase() === msg.role.toUpperCase()) {
        last.content += ' ' + msg.content;
      } else {
        concatenated.push({ ...msg });
      }
    }

    const truncated = concatenated.map((c) => ({
      ...c,
      content: c.content.length > MAX_MESSAGE_LENGTH ? c.content.substring(0, MAX_MESSAGE_LENGTH) : c.content,
    }));

    const result: { content: string; role: string }[] = [];
    let totalLength = 0;
    for (let i = truncated.length - 1; i >= 0; i--) {
      const msg = truncated[i];
      if (totalLength + msg.content.length > MAX_TOTAL_LENGTH) break;
      result.unshift(msg);
      totalLength += msg.content.length;
    }

    while (result.length > 0 && result[0].role.toUpperCase() === 'ASSISTANT') {
      const removed = result.shift()!;
      totalLength -= removed.content.length;
    }
    while (result.length > 0 && result[result.length - 1].role.toUpperCase() === 'USER') {
      result.pop();
    }
    return result;
  }

  public close() {
    const promptName = this.promptName;
    this.eventQueue.push({ event: { contentEnd: { promptName, contentName: this.audioContentId } } });
    this.eventQueue.push({ event: { promptEnd: { promptName } } });
    this.eventQueue.push({ event: { sessionEnd: {} } });
    this._stream = undefined;
    this.isAudioStarted = false;
  }

  public enqueueSessionStart() {
    this.eventQueue.push({
      event: { sessionStart: { inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 1 } } },
    });
  }

  public enqueuePromptStart(voiceId: string) {
    const promptName = this.promptName;
    this.eventQueue.push({
      event: {
        promptStart: {
          promptName,
          textOutputConfiguration: { mediaType: 'text/plain' },
          audioOutputConfiguration: {
            audioType: 'SPEECH', encoding: 'base64', mediaType: 'audio/lpcm',
            sampleRateHertz: 24000, sampleSizeBits: 16, channelCount: 1, voiceId,
          },
          ...(this.tools.length > 0
            ? {
                toolUseOutputConfiguration: { mediaType: 'application/json' },
                toolConfiguration: { tools: this.tools.map((tool) => ({ toolSpec: toolSpecFrom(tool)() })) },
              }
            : {}),
        },
      },
    });
  }

  public enqueueSystemPrompt(prompt: string) {
    const promptName = this.promptName;
    const contentName = randomUUID();
    this.eventQueue.push({
      event: {
        contentStart: {
          promptName, contentName, type: 'TEXT', interactive: false, role: 'SYSTEM',
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    });
    this.eventQueue.push({ event: { textInput: { promptName, contentName, content: prompt } } });
    this.eventQueue.push({ event: { contentEnd: { promptName, contentName } } });
  }

  private enqueueChatHistory(content: string, role: string): void {
    const promptName = this.promptName;
    const contentName = randomUUID();
    this.eventQueue.push({
      event: {
        contentStart: {
          promptName, contentName, type: 'TEXT', interactive: false,
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    });
    this.eventQueue.push({ event: { textInput: { promptName, contentName, content, role: role.toUpperCase() } } });
    this.eventQueue.push({ event: { contentEnd: { promptName, contentName } } });
  }

  private enqueueToolResult(toolUseId: string, result: string) {
    const promptName = this.promptName;
    const contentName = randomUUID();
    this.eventQueue.push({
      event: {
        contentStart: {
          promptName, contentName, interactive: false, type: 'TOOL', role: 'TOOL',
          toolResultInputConfiguration: {
            toolUseId, type: 'TEXT', textInputConfiguration: { mediaType: 'text/plain' },
          },
        },
      },
    });
    this.eventQueue.push({ event: { toolResult: { promptName, contentName, content: result } } });
    this.eventQueue.push({ event: { contentEnd: { promptName, contentName } } });
  }

  public enqueueAudioStart() {
    const promptName = this.promptName;
    this.audioContentId = randomUUID();
    this.eventQueue.push({
      event: {
        contentStart: {
          promptName, contentName: this.audioContentId, type: 'AUDIO', interactive: true, role: 'USER',
          audioInputConfiguration: {
            audioType: 'SPEECH', encoding: 'base64', mediaType: 'audio/lpcm',
            sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1,
          },
        },
      },
    });
    this.isAudioStarted = true;
  }

  public enqueueAudioInput(audioInputBase64Array: string[]) {
    if (!this.isAudioStarted || !this.isActive) return;
    for (const chunk of audioInputBase64Array) this.audioInputQueue.push(chunk);
    while (this.audioInputQueue.length - MAX_AUDIO_INPUT_QUEUE_SIZE > 0) this.audioInputQueue.shift();
    if (!this.isProcessingAudio) {
      this.isProcessingAudio = true;
      this.processAudioQueue();
    }
  }

  private async processAudioQueue() {
    while (this.audioInputQueue.length > 0 && this.isAudioStarted && this.isActive) {
      const audioChunk = this.audioInputQueue.shift();
      this.eventQueue.push({
        event: { audioInput: { promptName: this.promptName, contentName: this.audioContentId, content: audioChunk } },
      });
    }
    if (this.isAudioStarted) {
      setTimeout(() => this.processAudioQueue(), 0);
    } else {
      this.isProcessingAudio = false;
    }
  }

  private async executeTool(toolName: string, input: string) {
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(input);
    } catch {
      return `Input must be valid JSON: ${input}`;
    }

    const tool = this.tools.find((t) => t.name === toolName);
    if (!tool) return `Cannot find tool ${toolName}`;
    const { data, error } = tool.schema.safeParse(parsedInput);
    if (error) return `Input validation error: ${JSON.stringify(error)}`;
    try {
      const result = await tool.handler(data, { sessionId: this.sessionId, userId: this.userId });
      return typeof result === 'string' ? JSON.stringify({ result }) : JSON.stringify(result);
    } catch (e) {
      return `Error executing tool ${toolName}: ${e}`;
    }
  }

  public async executeToolAndSendResult(toolUseId: string, toolName: string, input: string) {
    const res = await this.executeTool(toolName, input);
    this.enqueueToolResult(toolUseId, res);
    return res;
  }
}
