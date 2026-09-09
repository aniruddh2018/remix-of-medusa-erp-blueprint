// Ported from aws-samples/sample-serverless-nova-sonic-chat
// (useSpeechToSpeech/lib/AudioPlayer.js) to TypeScript, no other changes.
// Plays 24kHz Float32 PCM audio (Nova Sonic's output format) via an
// AudioWorklet, with barge-in support (clear buffered audio on interruption)
// and an AnalyserNode for volume/waveform visualization.
export class AudioPlayer {
  private onAudioPlayedListeners: Array<(samples: Float32Array) => void> = [];
  private initialized = false;
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private workletNode?: AudioWorkletNode;
  private recorderNode?: ScriptProcessorNode;

  addEventListener(event: "onAudioPlayed", callback: (samples: Float32Array) => void) {
    if (event === "onAudioPlayed") this.onAudioPlayedListeners.push(callback);
  }

  async start() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;

    const workletUrl = new URL("/AudioPlayerProcessor.worklet.js", window.location.origin).toString();
    await this.audioContext.audioWorklet.addModule(workletUrl);

    this.workletNode = new AudioWorkletNode(this.audioContext, "audio-player-processor");
    this.workletNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    // ScriptProcessorNode is deprecated but matches the reference implementation's
    // tap for "audio actually played" notifications (used for waveform UI).
    this.recorderNode = this.audioContext.createScriptProcessor(512, 1, 1);
    this.recorderNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      const outputData = event.outputBuffer.getChannelData(0);
      outputData.set(inputData);
      const samples = new Float32Array(outputData.length);
      samples.set(outputData);
      this.onAudioPlayedListeners.forEach((l) => l(samples));
    };

    this.maybeOverrideInitialBufferLength();
    this.initialized = true;
  }

  bargeIn() {
    this.workletNode?.port.postMessage({ type: "barge-in" });
  }

  stop() {
    try { this.audioContext?.close(); } catch { /* ignore */ }
    try { this.analyser?.disconnect(); } catch { /* ignore */ }
    try { this.workletNode?.disconnect(); } catch { /* ignore */ }
    try { this.recorderNode?.disconnect(); } catch { /* ignore */ }
    this.initialized = false;
    this.audioContext = undefined;
    this.analyser = undefined;
    this.workletNode = undefined;
    this.recorderNode = undefined;
  }

  private maybeOverrideInitialBufferLength() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("audioPlayerInitialBufferLength");
    if (value === null) return;
    const bufferLength = parseInt(value, 10);
    if (isNaN(bufferLength)) return;
    this.workletNode?.port.postMessage({ type: "initial-buffer-length", bufferLength });
  }

  playAudio(samples: Float32Array) {
    if (!this.initialized) {
      console.error("AudioPlayer not initialized. Call start() first.");
      return;
    }
    this.workletNode?.port.postMessage({ type: "audio", audioData: samples });
  }

  getSamples(): number[] | null {
    if (!this.initialized || !this.analyser) return null;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    return [...dataArray].map((e) => e / 128 - 1);
  }

  getVolume(): number {
    if (!this.initialized || !this.analyser) return 0;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    const normSamples = [...dataArray].map((e) => e / 128 - 1);
    let sum = 0;
    for (const s of normSamples) sum += s * s;
    return Math.sqrt(sum / normSamples.length);
  }
}
