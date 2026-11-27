import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Track } from "./desktop";
import {
  cleanYouTubeTitle,
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
  caption,
  captionState,
  enableCaptions,
  thumbnail,
  accent,
  stop,
  audioBlocked,
  enableAudio,
}: {
  track: Track | null;
  clock: () => number;
  caption: string;
  captionState: string;
  enableCaptions: () => void;
  thumbnail?: string;
  accent?: string;
  stop: () => void;
  audioBlocked: boolean;
  enableAudio: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]),
    [looking, setLooking] = useState(false),
    [position, setPosition] = useState(0);
  const [commandError, setCommandError] = useState("");
  const [lookupFailed, setLookupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [captionRows, setCaptionRows] = useState<string[]>([]);
  const scroll = useRef<HTMLDivElement>(null),
    highlight = useRef<HTMLButtonElement>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const title = cleanYouTubeTitle(track?.title ?? ""),
    artist = track?.artist ?? "",
    duration = Math.round(track?.duration ?? 0);
  const cue = track?.caption || caption;
  const index = currentLine(lines, position);
  useEffect(() => {
    setLines([]);
    setLooking(false);
    setLookupFailed(false);
    if (!title || !duration) return;
    const request = new AbortController();
    setLooking(true);
    findLyrics(title, artist, request.signal)
      .then(
        (matches) => {
          if (request.signal.aborted) return;
          const match = exactRecording(matches, title, artist, duration);
          if (match) setLines(parseLrc(match.syncedLyrics));
        },
        () => {
          if (!request.signal.aborted) setLookupFailed(true);
        },
      )
      .finally(() => {
        if (!request.signal.aborted) setLooking(false);
      });
    return () => request.abort();
  }, [title, artist, duration, attempt]);
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
    if (!cue) {
      const expire = window.setTimeout(() => setCaptionRows([]), 2800);
      return () => clearTimeout(expire);
    }
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
    <section
      className="extension-theater"
      aria-label="FLUX listening"
      style={
        accent ? ({ "--track-accent": accent } as CSSProperties) : undefined
      }
    >
      {thumbnail && <img className="theater-backdrop" src={thumbnail} alt="" />}
      <div className="theater-shade" />
      <header className="theater-brand">
        <span className="theater-wordmark">FLUX</span>
        {track && (
          <span
            className="theater-state"
            data-playing={track.playing && !track.buffering}
          >
            {track.buffering ? "Buffering" : track.playing ? "Playing" : "Paused"}
          </span>
        )}
      </header>
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
              {!track
                ? "Waiting for a video in the linked YouTube tab."
                : looking
                  ? "Finding synced lyrics…"
                  : captionState === "listening"
                    ? "Listening for live captions…"
                    : captionState === "preparing"
                      ? "Preparing live captions…"
                      : lookupFailed
                        ? "Lyrics lookup is temporarily unavailable."
                        : "No timed lyrics found for this recording."}
            </p>
            {captionState === "downloadable" && !looking && (
              <button onClick={enableCaptions}>Enable live captions</button>
            )}
            {lookupFailed && !looking && (
              <button onClick={() => setAttempt((value) => value + 1)}>
                Retry lyrics
              </button>
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
        {track && (
          <div className="theater-time">
            <span>{stamp(Math.max(0, position))}</span>
            <progress
              aria-label="Song progress"
              value={Math.min(duration, Math.max(0, position))}
              max={duration || 1}
            />
            <span>{stamp(duration)}</span>
          </div>
        )}
        <div className="theater-actions">
          {audioBlocked && <button onClick={enableAudio}>Enable audio</button>}
          {track && (
            <button
              className="theater-play"
              onClick={() => void togglePlay()}
              aria-label={track.playing ? "Pause video" : "Play video"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {track.playing ? (
                  <path d="M7 5h3v14H7zm7 0h3v14h-3z" />
                ) : (
                  <path d="M8 5v14l11-7z" />
                )}
              </svg>
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
