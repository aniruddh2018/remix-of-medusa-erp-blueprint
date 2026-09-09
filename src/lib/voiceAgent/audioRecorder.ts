// Ported from aws-samples/sample-serverless-nova-sonic-chat
// (useSpeechToSpeech/lib/AudioRecorder.js) to TypeScript, no other changes.
// Captures mic audio via an AudioWorklet, downsamples to 16kHz mono PCM
// (Nova Sonic's required input format), delivers Int16 chunks via callback.
const TARGET_SAMPLE_RATE = 16000;

export type AudioErrorType = "NotAllowedError" | "PermissionDeniedError" | "WorkletError" | "InitializationError" | string;

export class AudioRecorder {
  private onAudioRecordedListeners: Array<(data: Int16Array) => void> = [];
  private onErrorListeners: Array<(err: { type: AudioErrorType; message: string; originalError?: unknown }) => void> = [];
  private initialized = false;
  private isMuted = false;
  private audioContext?: AudioContext;
  private audioStream?: MediaStream;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: AudioWorkletNode;

  addEventListener(event: "onAudioRecorded", cb: (data: Int16Array) => void): void;
  addEventListener(event: "onError", cb: (err: { type: AudioErrorType; message: string; originalError?: unknown }) => void): void;
  addEventListener(event: string, cb: any) {
    if (event === "onAudioRecorded") this.onAudioRecordedListeners.push(cb);
    else if (event === "onError") this.onErrorListeners.push(cb);
  }

  async start(): Promise<boolean> {
    try {
      const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");
      this.audioContext = new AudioContext({ sampleRate: !isFirefox ? TARGET_SAMPLE_RATE : undefined });

      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (error: any) {
        const errorType = error?.name || "UnknownError";
        const message = error?.message || "Failed to access microphone";
        this.onErrorListeners.forEach((l) => l({ type: errorType, message, originalError: error }));
        return false;
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.audioStream);

      try {
        const workletUrl = new URL("/AudioRecorderProcessor.worklet.js", window.location.origin).toString();
        await this.audioContext.audioWorklet.addModule(workletUrl);
      } catch (error) {
        this.onErrorListeners.forEach((l) => l({ type: "WorkletError", message: "Failed to load audio worklet", originalError: error }));
        this.cleanup();
        return false;
      }

      this.workletNode = new AudioWorkletNode(this.audioContext, "audio-recorder-processor");
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === "audio") {
          let audioData: Int16Array = event.data.audioData;
          if (this.isMuted) audioData = new Int16Array(audioData.length).fill(0);
          this.onAudioRecordedListeners.forEach((l) => l(audioData));
        }
      };

      this.workletNode.port.postMessage({
        type: "start",
        sourceSampleRate: this.audioContext.sampleRate,
        targetSampleRate: TARGET_SAMPLE_RATE,
      });

      this.initialized = true;
      return true;
    } catch (error) {
      this.onErrorListeners.forEach((l) => l({ type: "InitializationError", message: "Failed to initialize audio recorder", originalError: error }));
      this.cleanup();
      return false;
    }
  }

  private cleanup() {
    try { this.workletNode?.disconnect(); } catch { /* ignore */ }
    try { this.sourceNode?.disconnect(); } catch { /* ignore */ }
    try { this.audioStream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { this.audioContext?.close(); } catch { /* ignore */ }
    this.initialized = false;
    this.audioContext = undefined;
    this.audioStream = undefined;
    this.sourceNode = undefined;
    this.workletNode = undefined;
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  stop() {
    if (this.initialized) {
      this.workletNode?.port.postMessage({ type: "stop" });
      this.cleanup();
    }
  }
}
