class ListeningCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(Math.round(sampleRate * 5) * 2);
    this.offset = 0;
    this.port.onmessage = () => { this.offset = 0; };
  }

  process(inputs) {
    const [left, right = left] = inputs[0] ?? [];
    if (!left) return true;
    for (let i = 0; i < left.length; i++) {
      this.samples[this.offset++] = pcm(left[i]);
      this.samples[this.offset++] = pcm(right[i]);
      if (this.offset === this.samples.length) {
        const bytes = this.samples.buffer;
        this.port.postMessage(bytes, [bytes]);
        this.samples = new Int16Array(this.offset);
        this.offset = 0;
      }
    }
    return true;
  }
}

function pcm(value) {
  return Math.round(Math.max(-1, Math.min(1, value)) * 32767);
}

registerProcessor("flux-listening-capture", ListeningCapture);
