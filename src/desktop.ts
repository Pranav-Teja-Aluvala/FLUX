export type Track = {
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  playing: boolean;
};
declare global {
  interface Window {
    fluxDesktop?: {
      nowPlaying(): Promise<{ track: Track | null; error?: string }>;
      stopReading(): void;
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
  const { data } = ctx.getImageData(0, 0, 48, 48);
  const bins = new Map<
    number,
    { rgb: number[]; count: number; score: number }
  >();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 224) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]],
      hi = Math.max(...rgb),
      lo = Math.min(...rgb);
    if (hi < 23 || lo > 243) continue;
    const key = (rgb[0] >> 5) * 64 + (rgb[1] >> 5) * 8 + (rgb[2] >> 5);
    let bin = bins.get(key);
    if (!bin) {
      bin = { rgb: [0, 0, 0], count: 0, score: 0 };
      bins.set(key, bin);
    }
    bin.count++;
    bin.score += 0.2 + (hi - lo) / 155;
    rgb.forEach((v, k) => (bin.rgb[k] += v));
  }
  const sorted = [...bins.values()]
    .sort((a, b) => b.score - a.score)
    .map((b) => b.rgb.map((v) => v / b.count));
  if (!sorted.length) return ["#7c8292", "#e8e9f2", "#9da4ba"];
  const main = sorted[0];
  const distance = (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
  const rival =
    sorted.find((v) => distance(v, main) > 8500) ??
    main.map((v) => v * 0.5 + 115);
  const light =
    sorted.find((v) => distance(v, rival) > 5000 && distance(v, main) > 5000) ??
    main.map((v) => v * 0.29 + 177);
  const hex = (rgb: number[]) => {
    const factor = Math.max(1, 146 / Math.max(1, ...rgb));
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
