import type { Crop } from "./media-preview";
export type Track = {
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  playing: boolean;
  buffering?: boolean;
  position?: number;
  sampledAt?: number;
  duration?: number;
  rate?: number;
  crop?: Crop | null;
  caption?: string;
  linked?: boolean;
  videoId?: string;
  chapterStart?: number;
};
declare global {
  interface Window {
    fluxDesktop?: {
      nowPlaying(): Promise<{
        track: Track | null;
        error?: string;
        previewKind?: "automatic-display" | "selected-video";
      }>;
      stopReading(): void;
      listSources(): Promise<{ id: string; name: string }[]>;
      selectSource(id: string): Promise<boolean>;
    };
  }
}
export type CoverPalette = [string, string, string];
export async function coverPalette(uri: string): Promise<CoverPalette> {
  if (!/^data:image\/(jpeg|png|webp|bmp|gif);base64,/.test(uri))
    throw Error("Unsupported artwork");
  const image = new Image();
  image.src = uri;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0, 48, 48);
  return paletteFromPixels(ctx.getImageData(0, 0, 48, 48).data);
}

export function paletteFromPixels(data: Uint8ClampedArray): CoverPalette {
  const bins = new Map<
    number,
    { rgb: number[]; count: number; score: number }
  >();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 224) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]],
      hi = Math.max(...rgb),
      lo = Math.min(...rgb);
    if (hi < 35 || lo > 246) continue;
    const key = (rgb[0] >> 5) * 64 + (rgb[1] >> 5) * 8 + (rgb[2] >> 5);
    let bin = bins.get(key);
    if (!bin) {
      bin = { rgb: [0, 0, 0], count: 0, score: 0 };
      bins.set(key, bin);
    }
    bin.count++;
    bin.score += 0.13 + Math.pow((hi - lo) / 255, 0.78) * 1.8;
    rgb.forEach((v, k) => (bin.rgb[k] += v));
  }
  const sorted = [...bins.values()]
    .sort((a, b) => b.score - a.score)
    .map((b) => b.rgb.map((v) => v / b.count));
  if (!sorted.length) return ["#7c8292", "#e8e9f2", "#9da4ba"];
  const main = sorted[0];
  const distance = (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
  const chroma = (v: number[]) => Math.max(...v) - Math.min(...v);
  const rival =
    sorted.find(
      (v) => distance(v, main) > 7800 && (chroma(main) < 29 || chroma(v) > 35),
    ) ?? main.map((v) => v * 0.72 + 48);
  const light = main.map((v, i) => (v + rival[i]) * 0.26 + 110);
  const hex = (rgb: number[]) => {
    const factor = Math.max(1, 152 / Math.max(1, ...rgb));
    return (
      "#" +
      rgb
        .map((v) =>
          Math.min(255, Math.round(v * factor))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  };
  return [hex(main), hex(rival), hex(light)];
}
