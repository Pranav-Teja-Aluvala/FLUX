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
    id?: string;
  };
};
export const inExtension =
  typeof location !== "undefined" && location.protocol === "chrome-extension:";
const bridgeId = "elkdmnmmhjekdcabldkbngjoohcohimg";
function messageExtension(
  type: string,
  timeoutMs: number,
  data?: Record<string, unknown>,
): Promise<unknown> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage)
    return Promise.resolve(null);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), timeoutMs);
    try {
      chrome.runtime!.sendMessage(
        inExtension ? (chrome.runtime!.id ?? bridgeId) : bridgeId,
        { type, ...data },
        (reply) => {
          clearTimeout(timeout);
          resolve(chrome.runtime?.lastError ? null : reply);
        },
      );
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}
export async function readYouTube(): Promise<{
  track: Track | null;
  sourceError?: string;
}> {
  const reply = await messageExtension("flux:read-player", 1300);
  if (!reply || typeof reply !== "object") return { track: null };
  if (
    inExtension &&
    "sourceError" in reply &&
    typeof reply.sourceError === "string"
  )
    return { track: null, sourceError: reply.sourceError };
  const track = reply as Track;
  return {
    track:
      typeof track.title === "string" && Number.isFinite(track.position)
        ? track
        : null,
  };
}
export class LinkedSourceError extends Error {}

export async function captureLinkedTab(): Promise<MediaStream> {
  const reply = (await messageExtension("flux:start-capture", 3200)) as {
    streamId?: string;
    error?: string;
    sourceError?: string;
  } | null;
  if (reply?.sourceError) throw new LinkedSourceError(reply.sourceError);
  if (!reply?.streamId)
    throw Error(
      reply?.error ||
        (inExtension
          ? "Click FLUX in Chrome’s toolbar on the YouTube tab to reconnect."
          : "Install or update FLUX YouTube Link, then click it once on the YouTube tab."),
    );
  const source = {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: reply.streamId,
    },
  };
  return navigator.mediaDevices.getUserMedia({
    audio: source,
    video: inExtension ? false : source,
  } as MediaStreamConstraints);
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
  return boundedCrop({
    x: (minX - padx) / w,
    y: (minY - pady) / h,
    w: (bw + padx * 2) / w,
    h: (bh + pady * 2) / h,
  });
}

export function boundedCrop(crop: Crop | null | undefined): Crop | null {
  if (
    !crop ||
    ![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite) ||
    crop.w <= 0 ||
    crop.h <= 0
  )
    return null;
  const x = Math.max(0, crop.x),
    y = Math.max(0, crop.y);
  const w = Math.min(1, crop.x + crop.w) - x,
    h = Math.min(1, crop.y + crop.h) - y;
  return w >= 0.05 && h >= 0.05 ? { x, y, w, h } : null;
}

export async function controlYouTube(
  type: "flux:toggle-play" | "flux:seek-line" | "flux:seek-relative" | "flux:enable-player-captions",
  data?: Record<string, unknown>,
) {
  if (!inExtension) return false;
  const result = (await messageExtension(type, 1600, data)) as {
    ok?: boolean;
  } | null;
  return result?.ok === true;
}
