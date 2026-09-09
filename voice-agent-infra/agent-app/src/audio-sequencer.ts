// AppSync Events doesn't guarantee delivery order matches publish order.
// This reorders audio chunks by sequence number before handing them to a
// processor. Adapted from the reference implementation's common/events.ts.
export class AudioEventSequencer {
  private lastProcessedSequence = -1;
  private inputQueue: { [key: number]: string[] } = {};

  public constructor(private processor: (chunks: string[]) => void) {}

  public next(chunks: string[], sequence: number) {
    let seq = sequence;
    if (seq <= this.lastProcessedSequence) return; // duplicate/stale

    this.inputQueue[seq] = chunks;

    let processNow = false;
    if (seq === this.lastProcessedSequence + 1) {
      processNow = true;
    } else if (seq - this.lastProcessedSequence > 2) {
      // a sequence has been missing too long — give up waiting for it
      processNow = true;
    }

    if (processNow) {
      while (seq in this.inputQueue) {
        this.processor(this.inputQueue[seq]);
        delete this.inputQueue[seq];
        this.lastProcessedSequence = seq;
        seq++;
      }
    }
  }
}
