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
export async function findLyrics(
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<LyricsMatch[]> {
  const q = new URLSearchParams({ track_name: title });
  if (artist) q.set("artist_name", artist);
  const r = await fetch("https://lrclib.net/api/search?" + q, { signal });
  if (r.status === 429)
    throw Error(
      "Lyrics search is rate limited. Try again shortly or open an LRC file.",
    );
  if (!r.ok)
    throw Error("Lyrics lookup failed. You can still open a local LRC file.");
  const matches: LyricsMatch[] = await r.json();
  return matches
    .filter(
      (v) =>
        typeof v.syncedLyrics === "string" &&
        parseLrc(v.syncedLyrics).some((line) => line.text),
    )
    .slice(0, 8);
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
  if (!key || !performer || !Number.isFinite(seconds) || seconds <= 0) return;
  return matches
    .filter(
      (match) =>
        normalize(match.trackName) === key &&
        normalize(match.artistName) === performer &&
        Math.abs(match.duration - seconds) <= 4,
    )
    .sort(
      (a, b) => Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds),
    )[0];
}
