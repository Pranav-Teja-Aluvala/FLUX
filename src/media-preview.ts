import type { Track } from "./desktop";

export type Crop = { x: number; y: number; w: number; h: number };
declare const chrome: {
  runtime?: {
    sendMessage(
      id: string,
      message: unknown,
      done: (result: unknown) => void,
    ): void;
    lastError?: unknown;
  };
};
const bridgeId = "elkdmnmmhjekdcabldkbngjoohcohimg";
export function readYouTube(): Promise<Track | null> {
  if (
    typeof chrome === "undefined" ||
    !chrome.runtime?.sendMessage ||
    !bridgeId
  )
    return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      chrome.runtime!.sendMessage(
        bridgeId,
        { type: "flux:read-player" },
        (reply) => {
          if (chrome.runtime?.lastError || !reply || typeof reply !== "object")
            return resolve(null);
          const item = reply as Track;
          resolve(
            typeof item.title === "string" && typeof item.position === "number"
              ? item
              : null,
          );
        },
      );
    } catch {
      resolve(null);
    }
  });
}
export function contentCrop(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Crop | null {
  const left = Math.floor(w * 0.17),
    right = Math.ceil(w * 0.83),
    top = Math.floor(h * 0.17),
    bottom = Math.ceil(h * 0.83);
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0,
    hits = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const i = (y * w + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const hi = Math.max(r, g, b),
        lo = Math.min(r, g, b);
      if (hi < 49 || (hi - lo < 38 && hi < 95)) continue;
      hits++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const bw = maxX - minX + 1,
    bh = maxY - minY + 1;
  if (
    hits < 25 ||
    bw < w * 0.14 ||
    bh < h * 0.18 ||
    bw > w * 0.59 ||
    bh > h * 0.59 ||
    hits / bw / bh < 0.15
  )
    return null;
  const padx = Math.ceil(bw * 0.15),
    pady = Math.ceil(bh * 0.15);
  return {
    x: Math.max(0, minX - padx) / w,
    y: Math.max(0, minY - pady) / h,
    w: Math.min(w, bw + padx * 2) / w,
    h: Math.min(h, bh + pady * 2) / h,
  };
}
