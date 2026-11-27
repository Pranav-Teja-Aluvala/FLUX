import { cleanYouTubeTitle, parseLrc, type Line, type LyricsMatch } from "./lyrics";

export type CaptionCue = { start: number; end: number; text: string };
type Sample = { time: number; text: string };

function words(text: string) {
  return text.toLowerCase().normalize("NFKC").replace(/[’']/g, "")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function songCandidates(title: string) {
  const cleaned = cleanYouTubeTitle(title)
    .replace(/\s*[([][^)\]]+[)\]]\s*$/u, "")
    .replace(/\s+(?:slowed(?:\s*(?:\+|and)\s*reverb)?|sped up|mashup|edit|nightcore)\s*$/iu, "");
  return [...new Set(cleaned.split(/\s+(?:x|vs\.?|×)\s+/iu).map((part) => part.trim()))]
    .filter((part) => part.length > 2 && part !== title)
    .slice(0, 3);
}

export function captionFragment(previous: string, incoming: string) {
  const before = previous.trim().split(/\s+/);
  const after = incoming.trim().split(/\s+/);
  const maximum = Math.min(before.length, after.length, 80);
  for (let overlap = maximum; overlap > 0; overlap--) {
    if (words(before.slice(-overlap).join(" ")).join(" ") ===
        words(after.slice(0, overlap).join(" ")).join(" "))
      return after.slice(overlap).join(" ");
  }
  return incoming.trim();
}

export function shortCaption(text: string) {
  return text.trim().split(/\s+/).slice(-12).join(" ");
}

export function cueParts(cue: CaptionCue) {
  const pieces = cue.text.split(/<((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})>/g);
  const parts = [];
  for (let index = 0; index < pieces.length; index += 2) {
    const time = index === 0
      ? cue.start
      : pieces[index - 1].split(":").reduce((seconds, value) => seconds * 60 + Number(value), 0);
    const text = pieces[index].replace(/<[^>]*>/g, "");
    if (text && time >= cue.start && time < cue.end) parts.push({ time, text });
  }
  return parts;
}

export type CaptionMatch = {
  recording: LyricsMatch;
  lines: Line[];
  from: number;
  until: number;
  score: number;
};

export function matchCaptionLyrics(
  candidates: LyricsMatch[],
  samples: Sample[],
  duration: number,
): CaptionMatch | undefined {
  const observations = samples.map(({ text, time }) => ({ key: words(text).join(" "), time }));
  let best: CaptionMatch | undefined;
  let alternate: CaptionMatch | undefined;
  for (const recording of candidates) {
    const original = parseLrc(recording.syncedLyrics);
    const anchors = original.flatMap((line) => {
      const tokens = words(line.text);
      if (tokens.length < 4 || new Set(tokens).size < 4) return [];
      const key = tokens.join(" ");
      return observations
        .filter((cue) => (" " + cue.key + " ").includes(" " + key + " "))
        .map((cue) => ({ key, catalog: line.time, video: cue.time }));
    }).slice(-36);
    for (const first of anchors) {
      for (const last of anchors) {
        if (last.key === first.key || last.catalog - first.catalog < 5) continue;
        const scale = (last.video - first.video) / (last.catalog - first.catalog);
        if (scale < 0.72 || scale > 1.5) continue;
        const offset = first.video - first.catalog * scale;
        const score = new Set(anchors.filter(
          (anchor) => Math.abs(anchor.video - (anchor.catalog * scale + offset)) <= 1.5,
        ).map((anchor) => anchor.key)).size;
        const better = !best || score > best.score ||
          (recording.id === best.recording.id && score === best.score &&
            last.video - first.video > best.until - best.from);
        const contender = best && recording.id !== best.recording.id &&
          score >= best.score && (!alternate || score > alternate.score);
        if (!better && !contender) continue;
        const lines = original.map((line) => ({ ...line, time: line.time * scale + offset }))
          .filter((line) => line.time >= Math.max(0, first.video - 2) &&
            line.time < Math.min(duration, last.video + 4));
        if (!lines.length) continue;
        const match = { recording, lines, from: first.video, until: last.video, score };
        if (better) {
          if (best && best.recording.id !== recording.id) alternate = best;
          best = match;
        } else if (contender) {
          alternate = match;
        }
      }
    }
  }
  if (best && alternate && best.score === alternate.score &&
      words(best.recording.trackName).join(" ") !== words(alternate.recording.trackName).join(" "))
    return undefined;
  return best;
}
