import { useEffect, useRef, useState } from "react";
import type { Track } from "./desktop";
import {
  currentLine,
  exactRecording,
  findLyrics,
  parseLrc,
  type Line,
} from "./lyrics";
import { controlYouTube } from "./media-preview";

function stamp(t: number) {
  return Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
}
export function ExtensionTheater({
  track,
  clock,
  active,
  caption,
  captionState,
  enableCaptions,
  thumbnail,
  stop,
  audioBlocked,
  enableAudio,
}: {
  track: Track | null;
  clock: () => number;
  active: boolean;
  caption: string;
  captionState: string;
  enableCaptions: () => void;
  thumbnail?: string;
  stop: () => void;
  audioBlocked: boolean;
  enableAudio: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]),
    [looking, setLooking] = useState(false),
    [position, setPosition] = useState(0);
  const [commandError, setCommandError] = useState("");
  const [captionRows, setCaptionRows] = useState<string[]>([]);
  const scroll = useRef<HTMLDivElement>(null),
    highlight = useRef<HTMLButtonElement>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const title = track?.title ?? "",
    artist = track?.artist ?? "",
    duration = Math.round(track?.duration ?? 0);
  const cue = track?.caption || caption;
  const index = currentLine(lines, position);
  useEffect(() => {
    setLines([]);
    setLooking(false);
    setCaptionRows([]);
    if (!active || !title || !duration) return;
    const request = new AbortController();
    setLooking(true);
    findLyrics(title, artist, request.signal)
      .then(
        (matches) => {
          if (request.signal.aborted) return;
          const match = exactRecording(matches, title, artist, duration);
          if (match) setLines(parseLrc(match.syncedLyrics));
        },
        () => {},
      )
      .finally(() => {
        if (!request.signal.aborted) setLooking(false);
      });
    return () => request.abort();
  }, [active, title, artist, duration]);
  useEffect(() => {
    const tick = () => setPosition(clockRef.current());
    tick();
    const timer = window.setInterval(tick, 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const panel = scroll.current,
      row = highlight.current;
    if (!panel || !row) return;
    panel.scrollTo({
      top: row.offsetTop - panel.clientHeight * 0.43 + row.offsetHeight / 2,
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [index, lines]);
  useEffect(() => {
    if (!cue) return;
    setCaptionRows((previous) => {
      const latest = previous.at(-1);
      if (latest === cue) return previous;
      return latest && (cue.startsWith(latest) || latest.startsWith(cue))
        ? [...previous.slice(0, -1), cue]
        : [...previous.slice(-2), cue];
    });
  }, [cue]);
  async function seek(time: number) {
    if (!track?.videoId) return;
    setCommandError("");
    if (
      !(await controlYouTube("flux:seek-line", {
        videoId: track.videoId,
        time: time + (track.chapterStart ?? 0),
      }))
    )
      setCommandError("Could not seek the linked video.");
  }
  async function togglePlay() {
    setCommandError("");
    if (!(await controlYouTube("flux:toggle-play")))
      setCommandError("The linked YouTube tab is unavailable.");
  }
  return (
    <section className="extension-theater" aria-label="FLUX listening">
      {thumbnail && <img className="theater-backdrop" src={thumbnail} alt="" />}
      <div className="theater-shade" />
      <div className="theater-copy">
        <header className="theater-lyrics-title">
          <h2>
            {lines.length
              ? "Lyrics"
              : captionRows.length
                ? "Live captions"
                : "Lyrics"}
          </h2>
        </header>
        {lines.length ? (
          <div
            className="theater-lyric-scroll"
            ref={scroll}
            aria-label="Synced lyrics"
          >
            <ol>
              {lines.map((line, i) =>
                line.text ? (
                  <li key={i} data-current={i === index} data-past={i < index}>
                    {track?.videoId ? (
                      <button
                        ref={i === index ? highlight : undefined}
                        aria-current={i === index ? "true" : undefined}
                        onClick={() => void seek(line.time)}
                      >
                        {line.text}
                      </button>
                    ) : (
                      <button
                        ref={i === index ? highlight : undefined}
                        aria-current={i === index ? "true" : undefined}
                        disabled
                      >
                        {line.text}
                      </button>
                    )}
                  </li>
                ) : null,
              )}
            </ol>
          </div>
        ) : captionRows.length ? (
          <div className="theater-cues" aria-live="polite">
            {captionRows.map((line, i) => (
              <p key={i} data-current={i === captionRows.length - 1}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <div className="theater-empty" role="status">
            <p>
              {looking
                ? "Finding the timed recording…"
                : captionState === "listening"
                  ? "Listening for captions…"
                  : "Lyrics aren’t available for this recording."}
            </p>
            {captionState === "downloadable" && !looking && (
              <button onClick={enableCaptions}>Enable live captions</button>
            )}
          </div>
        )}
      </div>
      <footer className="theater-transport">
        <div className="theater-track">
          {thumbnail && <img src={thumbnail} alt="" />}
          <div>
            <strong>{title || "YouTube"}</strong>
            {artist && <span>{artist}</span>}
          </div>
        </div>
        <div className="theater-time" aria-label="Song progress">
          <span>{stamp(Math.max(0, position))}</span>
          <progress
            value={Math.min(duration, Math.max(0, position))}
            max={duration || 1}
          />
          <span>{stamp(duration)}</span>
        </div>
        <div className="theater-actions">
          {audioBlocked && <button onClick={enableAudio}>Enable audio</button>}
          {track && (
            <button
              onClick={() => void togglePlay()}
              aria-label={track.playing ? "Pause video" : "Play video"}
            >
              {track.playing ? "Ⅱ" : "▶"}
            </button>
          )}
          <button onClick={stop}>Disconnect</button>
        </div>
      </footer>
      {commandError && (
        <p className="theater-command-error" role="alert">
          {commandError}
        </p>
      )}
    </section>
  );
}
