export type Bands = {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  beat: number;
};
export function band(
  data: Uint8Array,
  hzPerBin: number,
  low: number,
  high: number,
) {
  const start = Math.max(1, Math.ceil(low / hzPerBin)),
    end = Math.min(data.length, Math.ceil(high / hzPerBin));
  let total = 0;
  for (let i = start; i < end; i++) total += (data[i] / 255) ** 2;
  return Math.sqrt(total / Math.max(1, end - start));
}
export class AudioEngine {
  readonly media = new Audio();
  readonly bins = new Uint8Array(1024);
  readonly wave = new Uint8Array(2048).fill(128);
  readonly bands: Bands = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
  context?: AudioContext;
  capture?: MediaStreamAudioDestinationNode;
  private analyser?: AnalyserNode;
  private mic?: MediaStreamAudioSourceNode;
  private gain?: GainNode;
  private level = 1;
  private url?: string;
  private mean = 0;
  private lastBeat = 0;
  private sourceRequest = 0;
  constructor() {
    this.media.loop = false;
    this.media.preload = "metadata";
  }
  async activate() {
    if (!this.context) {
      const c = (this.context = new AudioContext()),
        a = (this.analyser = c.createAnalyser());
      a.fftSize = 2048;
      a.minDecibels = -88;
      a.maxDecibels = -15;
      this.gain = c.createGain();
      this.gain.gain.value = this.level;
      this.capture = c.createMediaStreamDestination();
      const file = c.createMediaElementSource(this.media);
      file.connect(this.gain);
      file.connect(a);
      this.gain.connect(c.destination);
      this.gain.connect(this.capture);
    }
    await this.context.resume();
  }
  volume(value: number) {
    this.level = value;
    if (this.gain) this.gain.gain.value = value;
  }
  stopMic() {
    this.sourceRequest++;
    this.mic?.disconnect();
    this.mic?.mediaStream.getTracks().forEach((track) => track.stop());
    this.mic = undefined;
  }
  async microphone() {
    const request = ++this.sourceRequest;
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("Microphone requires HTTPS and a supported browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      await this.activate();
      if (request !== this.sourceRequest) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.stopMic();
      this.media.pause();
      this.mic = this.context!.createMediaStreamSource(stream);
      this.mic.connect(this.analyser!);
      this.mic.connect(this.capture!);
      return true;
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }
  async load(src: File | string, loop = false) {
    this.stopMic();
    this.media.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = typeof src === "string" ? undefined : URL.createObjectURL(src);
    this.media.src = this.url ?? (src as string);
    this.media.loop = loop;
    await this.play();
  }
  async play() {
    await this.activate();
    await this.media.play();
  }
  sample(smoothing: number, now: number) {
    const a = this.analyser,
      b = this.bands;
    if (!a) return b;
    a.smoothingTimeConstant = smoothing;
    a.getByteFrequencyData(this.bins);
    a.getByteTimeDomainData(this.wave);
    const hz = this.context!.sampleRate / a.fftSize;
    b.bass = band(this.bins, hz, 25, 180);
    b.mid = band(this.bins, hz, 180, 2500);
    b.treble = band(this.bins, hz, 2500, 12500);
    let energy = 0;
    for (let i = 0; i < this.wave.length; i += 4)
      energy += ((this.wave[i] - 128) / 128) ** 2;
    b.energy = Math.sqrt(energy / (this.wave.length / 4));
    this.mean += (b.bass - this.mean) * 0.045;
    b.beat *= 0.9;
    if (
      b.bass > 0.18 &&
      b.bass > this.mean * 1.31 &&
      now - this.lastBeat > 240
    ) {
      this.lastBeat = now;
      b.beat = 1;
    }
    return b;
  }
  dispose() {
    this.stopMic();
    this.media.pause();
    this.media.removeAttribute("src");
    this.media.load();
    if (this.url) URL.revokeObjectURL(this.url);
    void this.context?.close();
  }
}
