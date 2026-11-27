export type Line = { time: number; text: string };
export function parseLrc(lrc: string): Line[] {
  const offset = Number(lrc.match(/^\[offset:([+-]?\d+)\]/im)?.[1] ?? 0) / 1000;
  const lines: Line[] = [];
  for (const row of lrc.split(/\r?\n/)) {
    const tags = [...row.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const last = tags.at(-1);
    if (!last) continue;
    const text = row.slice(last.index! + last[0].length).trim();
    for (const tag of tags) {
      const seconds = Number(tag[2]);
      if (seconds >= 60) continue;
      lines.push({
        time: Math.max(
          0,
          Number(tag[1]) * 60 +
            seconds +
            Number("0." + (tag[3] ?? "0")) -
            offset,
        ),
        text,
      });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
export function currentLine(lines: Line[], seconds: number) {
  let lo = 0,
    hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].time <= seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
export type LyricsMatch = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics: string;
};
let retryAfter = 0;
export async function findLyrics(
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<LyricsMatch[]> {
  if (Date.now() < retryAfter)
    throw Error("Lyrics search is rate limited. Try again shortly.");
  const q = new URLSearchParams({ track_name: title });
  if (artist) q.set("artist_name", artist);
  const r = await fetch("https://lrclib.net/api/search?" + q, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
    headers: {
      "Lrclib-Client": "FLUX (https://github.com/Pranav-Teja-Aluvala/FLUX)",
    },
  });
  if (r.status === 429) {
    const retry = r.headers.get("Retry-After");
    const deadline = retry && /^\d+$/.test(retry)
      ? Date.now() + Number(retry) * 1000
      : Date.parse(retry ?? "");
    retryAfter = Number.isFinite(deadline) ? deadline : Date.now() + 30_000;
    throw Error(
      "Lyrics search is rate limited. Try again shortly or open an LRC file.",
    );
  }
  if (!r.ok)
    throw Error("Lyrics lookup failed. You can still open a local LRC file.");
  const matches: unknown = await r.json();
  if (!Array.isArray(matches)) throw Error("Unexpected lyrics response.");
  return matches.filter(
    (v) =>
      typeof v?.syncedLyrics === "string" &&
      typeof v.trackName === "string" &&
      typeof v.artistName === "string" &&
      Number.isFinite(v.duration) &&
      parseLrc(v.syncedLyrics).some((line) => line.text),
  );
}

export function cleanYouTubeTitle(title: string) {
  // Remove upload labels while keeping recording qualifiers such as acoustic.
  return title.trim().replace(
    /(?:\s*[([（【]\s*(?:(?:official\s+)?(?:music\s+video|video|audio|lyric(?:s)?\s+video|visuali[sz]er)|official\s+lyrics)\s*[)\]）】])+$/iu,
    "",
  ).trim();
}

export function exactRecording(
  matches: LyricsMatch[],
  title: string,
  artist: string,
  seconds: number,
) {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const key = normalize(title),
    performer = normalize(artist);
  if (!key || !Number.isFinite(seconds) || seconds <= 0) return;
  const plausible = matches.filter(
    (match) =>
      normalize(match.trackName) === key &&
      Math.abs(match.duration - seconds) <= 4,
  );
  if (
    !performer &&
    new Set(plausible.map((match) => normalize(match.artistName))).size !== 1
  )
    return;
  return plausible
    .filter((match) => !performer || normalize(match.artistName) === performer)
    .sort(
      (a, b) => Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds),
    )[0];
}
