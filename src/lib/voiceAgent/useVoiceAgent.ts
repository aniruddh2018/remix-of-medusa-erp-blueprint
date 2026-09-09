// Hands-free voice agent hook — browser side of the Nova Sonic pipeline.
// Adapted from aws-samples/sample-serverless-nova-sonic-chat's
// useSpeechToSpeech/index.ts for this app's stack:
//   - session start goes through the `start-voice-session` Supabase Edge
//     Function (forwards the caller's own Supabase JWT to AgentCore) instead
//     of a Next.js server action
//   - AppSync Events auth uses `oidc` mode with a Supabase access token as
//     the bearer, instead of Cognito `userPool` mode
//   - no MCP config, no chat-history persistence hook — kept to what this
//     app's Chat page actually needs
import { useCallback, useRef, useState } from "react";
import { Amplify } from "aws-amplify";
import { events, type EventsChannel } from "aws-amplify/data";
import { decodeJWT } from "aws-amplify/auth";
import { supabase } from "@/integrations/supabase/client";
import { AudioPlayer } from "./audioPlayer";
import { AudioRecorder } from "./audioRecorder";
import { AudioEventSequencer } from "./audioSequencer";
import { SpeechToSpeechEventSchema, type DispatchEventParams } from "./schemas";

const NAMESPACE = import.meta.env.VITE_VOICE_EVENT_NAMESPACE as string;
const MIN_AUDIO_CHUNKS_PER_BATCH = 10;
const MAX_AUDIO_CHUNKS_PER_BATCH = 20;

let amplifyConfigured = false;
function ensureAmplifyConfigured() {
  if (amplifyConfigured) return;
  amplifyConfigured = true;

  const tokenCache: { updatedAt: number; token: string } = { updatedAt: 0, token: "" };

  Amplify.configure(
    {
      API: {
        Events: {
          endpoint: `${import.meta.env.VITE_VOICE_EVENT_API_ENDPOINT}/event`,
          region: import.meta.env.VITE_VOICE_AWS_REGION as string,
          defaultAuthMode: "oidc",
        },
      },
    },
    {
      Auth: {
        tokenProvider: {
          getTokens: async () => {
            // Cache to avoid a Supabase session fetch on every publish.
            if (tokenCache.updatedAt > Date.now() - 1000 * 10) {
              return { accessToken: decodeJWT(tokenCache.token) };
            }
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) throw new Error("No active Supabase session");
            tokenCache.updatedAt = Date.now();
            tokenCache.token = token;
            return { accessToken: decodeJWT(token) };
          },
        },
      },
    }
  );
}

const arrayBufferToBase64 = (buffer: ArrayBufferLike) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const base64ToFloat32Array = (base64String: string) => {
  const binaryString = atob(base64String);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 32768.0;
  return float32Array;
};

export interface VoiceMessage {
  id: string;
  role: string;
  text: string;
}

export function useVoiceAgent() {
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const channelRef = useRef<EventsChannel | null>(null);
  const audioInputQueue = useRef<string[]>([]);
  const audioInputSequenceRef = useRef(0);
  const isRecordingRef = useRef(false);
  const stoppedRef = useRef(false);

  const dispatchEvent = async (channel: EventsChannel, params: DispatchEventParams) => {
    await channel.publish({ direction: "ctob", ...params });
  };

  const processAudioInput = useCallback(async () => {
    if (stoppedRef.current) return;
    if (audioInputQueue.current.length > MIN_AUDIO_CHUNKS_PER_BATCH && channelRef.current) {
      const chunksToProcess: string[] = [];
      let processed = 0;
      while (audioInputQueue.current.length > 0 && processed < MAX_AUDIO_CHUNKS_PER_BATCH) {
        const chunk = audioInputQueue.current.shift();
        if (chunk) { chunksToProcess.push(chunk); processed++; }
      }
      await dispatchEvent(channelRef.current, {
        event: "audioInput",
        data: { blobs: chunksToProcess, sequence: audioInputSequenceRef.current },
      });
      audioInputSequenceRef.current++;
    }
    setTimeout(() => processAudioInput(), 0);
  }, []);

  const startRecording = async () => {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    if (!audioPlayerRef.current || !audioRecorderRef.current) {
      throw new Error("Audio not initialized");
    }

    await audioPlayerRef.current.start();
    const success = await audioRecorderRef.current.start();
    if (!success) throw new Error("Microphone failed to start");

    processAudioInput();
  };

  const stopRecording = async () => {
    stoppedRef.current = true;
    isRecordingRef.current = false;
    audioRecorderRef.current?.stop();
    audioRecorderRef.current = null;
    audioPlayerRef.current?.stop();
    audioPlayerRef.current = null;
  };

  const closeSession = useCallback(async (_reason?: string) => {
    await stopRecording();
    if (channelRef.current) {
      try { await dispatchEvent(channelRef.current, { event: "terminateSession", data: {} }); } catch { /* ignore */ }
      channelRef.current.close();
      channelRef.current = null;
    }
    setIsActive(false);
    setIsLoading(false);
    setIsMuted(false);
  }, []);

  const connectToAppSync = async (sessionId: string, userId: string) => {
    const channel = await events.connect(`/${NAMESPACE}/user/${userId}/${sessionId}`);
    channelRef.current = channel;

    const sequencer = new AudioEventSequencer((chunks) => {
      while (chunks.length > 0) {
        const chunk = chunks.shift();
        if (chunk) audioPlayerRef.current?.playAudio(base64ToFloat32Array(chunk));
      }
    });

    channel.subscribe({
      next: (data: { event: unknown }) => {
        const { data: event, error } = SpeechToSpeechEventSchema.safeParse(data.event);
        if (error || event.direction !== "btoc") return;

        if (event.event === "ready") {
          startRecording()
            .then(() => { setIsActive(true); setIsLoading(false); })
            .catch((e: Error) => { setErrorMessage(e.message); closeSession(e.message); });
        } else if (event.event === "end") {
          closeSession(event.data.reason);
        } else if (event.event === "audioOutput") {
          sequencer.next(event.data.blobs, event.data.sequence);
        } else if (event.event === "textStart") {
          setMessages((prev) => [...prev, { id: event.data.id, role: event.data.role, text: "" }]);
        } else if (event.event === "textOutput") {
          setMessages((prev) =>
            prev.map((m) => (m.id === event.data.id ? { ...m, text: m.text + event.data.content } : m))
          );
        } else if (event.event === "textStop") {
          if (event.data.stopReason === "INTERRUPTED") audioPlayerRef.current?.bargeIn();
        }
      },
      error: (e: unknown) => console.error("AppSync Events channel error", e),
    });
  };

  const initAudio = async () => {
    audioPlayerRef.current = new AudioPlayer();
    audioInputQueue.current = [];
    audioInputSequenceRef.current = 0;
    stoppedRef.current = false;

    const recorder = new AudioRecorder();
    recorder.addEventListener("onAudioRecorded", (audioData: Int16Array) => {
      audioInputQueue.current.push(arrayBufferToBase64(audioData.buffer));
    });
    recorder.addEventListener("onError", (err) => {
      if (err.type === "NotAllowedError" || err.type === "PermissionDeniedError") {
        setErrorMessage("Microphone access denied. Please grant permission to use voice.");
        closeSession(err.type);
      }
    });
    audioRecorderRef.current = recorder;
  };

  const startSession = useCallback(async (voiceId = "matthew") => {
    if (isActive || isLoading) return;
    ensureAmplifyConfigured();
    setMessages([]);
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("start-voice-session", { body: { voiceId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { sessionId, userId } = data as { sessionId: string; userId: string };

      await connectToAppSync(sessionId, userId);
      await initAudio();
    } catch (e: unknown) {
      const message = (e as any)?.context?.json ? await (e as any).context.json().catch(() => null) : null;
      setErrorMessage(message?.error || (e instanceof Error ? e.message : "Failed to start voice session"));
      setIsLoading(false);
    }
  }, [isActive, isLoading]);

  const toggleMute = useCallback(() => {
    if (!audioRecorderRef.current) return false;
    const muted = audioRecorderRef.current.toggleMute();
    setIsMuted(muted);
    return muted;
  }, []);

  return { messages, isActive, isLoading, isMuted, errorMessage, startSession, closeSession, toggleMute };
}
