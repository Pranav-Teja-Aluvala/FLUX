import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import gsap from "gsap";
import type { Track } from "./desktop";
import {
  cleanYouTubeTitle,
  currentLine,
  exactRecording,
  findLyrics,
  parseLrc,
  type Line,
  type LyricsMatch,
} from "./lyrics";
import {
  captionFragment, matchCaptionLyrics, shortCaption, songCandidates, timedCaptionWindow,
} from "./caption-lyrics";
import { controlYouTube } from "./media-preview";
import type { LocalListening, VoiceMode } from "./local-listening";

function stamp(t: number) {
  return Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
}
export function ExtensionTheater({
  scene,
  setScene,
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
  analysis,
  voiceMode,
  setVoiceMode,
}: {
  scene: 0 | 5;
  setScene: (scene: 0 | 5) => void;
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
  analysis: LocalListening;
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
}) {
  const [exactLines, setLines] = useState<Line[]>([]),
    [looking, setLooking] = useState(false),
    [position, setPosition] = useState(0);
  const [commandError, setCommandError] = useState("");
  const [lookupFailed, setLookupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [liveCaption, setLiveCaption] = useState("");
  const [following, setFollowing] = useState(true);
  const [preferLocal, setPreferLocal] = useState(false);
  const [observations, setObservations] = useState<{ time: number; text: string }[]>([]);
  const [candidates, setCandidates] = useState<LyricsMatch[]>([]);
  const [lookupComplete, setLookupComplete] = useState(false);
  const lastYouTubeCue = useRef("");
  const scroll = useRef<HTMLDivElement>(null),
    highlight = useRef<HTMLButtonElement>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const title = cleanYouTubeTitle(track?.title ?? ""),
    artist = track?.artist ?? "",
    duration = Math.round(track?.duration ?? 0);
  const cue = track?.caption || caption;
  const nativeCue = track?.captionCue;
  const cueStart = nativeCue?.start;
  const samplePosition = track?.position;
  const youtubeCaption = track?.caption;
  const hasObservations = observations.length > 0;
  const captionMatch = useMemo(
    () => matchCaptionLyrics(candidates, observations, duration),
    [candidates, observations, duration],
  );
  const activeMatch = captionMatch && position >= captionMatch.from - 2 && position <= captionMatch.until + 4
    ? captionMatch : undefined;
  const lines = exactLines.length ? exactLines : activeMatch?.lines ?? exactLines;
  const identified = !exactLines.length ? activeMatch?.recording : undefined;
  const index = currentLine(lines, position);
  const localLines = voiceMode ? analysis.result?.lines.slice(-3) ?? [] : [];
  const showSynced = lines.length > 0 && !(preferLocal && localLines.length);
  const timedParts = nativeCue ? timedCaptionWindow(nativeCue, position) : [];
  const visibleCaption = nativeCue && (position < nativeCue.start || position >= nativeCue.end)
    ? "" : liveCaption;
  const lyricHeading = showSynced
    ? "Lyrics"
    : localLines.length
      ? "Local captions"
      : (visibleCaption || timedParts.length) ? "Live captions" : "Lyrics";
  useEffect(() => {
    setLines([]);
    setLookupComplete(false);
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
        if (!request.signal.aborted) {
          setLooking(false);
          setLookupComplete(true);
        }
      });
    return () => request.abort();
  }, [title, artist, duration, attempt]);
  useEffect(() => {
    if (lookupComplete && !exactLines.length && !hasObservations && track?.videoId)
      void controlYouTube("flux:enable-player-captions");
  }, [lookupComplete, exactLines.length, hasObservations, track?.videoId]);
  useEffect(() => {
    setCandidates([]);
    if (!title || !lookupComplete || !hasObservations || exactLines.length) return;
    const request = new AbortController();
    const hints = songCandidates(title);
    if (!hints.length && artist) hints.push(title);
    void (async () => {
      const results = new Map<number, LyricsMatch>();
      for (const [index, hint] of hints.entries()) {
        if (index) await new Promise((resolve) => setTimeout(resolve, 300));
        if (request.signal.aborted) return;
        try {
          for (const result of await findLyrics(hint, "", request.signal)) {
            results.set(result.id, result);
          }
        } catch {
          break;
        }
        if (request.signal.aborted) return;
        setCandidates([...results.values()]);
      }
    })();
    return () => request.abort();
  }, [title, artist, lookupComplete, hasObservations, exactLines.length]);
  useEffect(() => {
    if (!youtubeCaption) {
      lastYouTubeCue.current = "";
      return;
    }
    if (lastYouTubeCue.current === youtubeCaption || samplePosition === undefined) return;
    const fragment = cueStart === undefined
      ? captionFragment(lastYouTubeCue.current, youtubeCaption)
      : youtubeCaption;
    lastYouTubeCue.current = youtubeCaption;
    if (fragment && youtubeCaption.split(/\s+/).length >= 4)
      setObservations((previous) => [...previous.slice(-11), {
        time: cueStart ?? samplePosition, text: youtubeCaption,
      }]);
  }, [youtubeCaption, cueStart, samplePosition]);
  useEffect(() => {
    const tick = () => setPosition(clockRef.current());
    tick();
    const timer = window.setInterval(tick, 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const panel = scroll.current,
      row = highlight.current;
    if (!panel || !row || !following) return;
    const target = () => Math.max(0, row.offsetTop + row.offsetHeight / 2 -
      panel.clientHeight * 0.43);
    const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const motion = gsap.to(panel, {
      scrollTop: target(), duration: reduced ? 0 : 0.68, ease: "power3.out",
      overwrite: true,
    });
    let width = panel.clientWidth;
    let height = panel.clientHeight;
    const resize = new ResizeObserver(() => {
      if (panel.clientWidth === width && panel.clientHeight === height) return;
      width = panel.clientWidth;
      height = panel.clientHeight;
      motion.kill();
      panel.scrollTop = target();
    });
    resize.observe(panel);
    return () => {
      motion.kill();
      resize.disconnect();
    };
  }, [index, lines, showSynced, following]);
  function browseLyrics() {
    if (!following) return;
    if (scroll.current) gsap.killTweensOf(scroll.current);
    setFollowing(false);
  }
  useEffect(() => {
    if (!cue) {
      const expire = window.setTimeout(() => setLiveCaption(""), 1600);
      return () => clearTimeout(expire);
    }
    setLiveCaption(shortCaption(cue));
  }, [cue]);
  async function seek(time: number) {
    if (!track?.videoId) return;
    setCommandError("");
    if (
      await controlYouTube("flux:seek-line", {
        videoId: track.videoId,
        time: time + (track.chapterStart ?? 0),
      })
    ) setFollowing(true);
    else setCommandError("Could not seek the linked video.");
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
        <button
          className="theater-spectrum"
          aria-pressed={scene === 5}
          onClick={() => setScene(scene === 5 ? 0 : 5)}
        >
          Spectrum
        </button>
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
          <h2>{lyricHeading}</h2>
          {showSynced && !following && (
            <button className="theater-follow" onClick={() => setFollowing(true)}>
              Follow lyrics
            </button>
          )}
          <details className="theater-analysis">
            <summary>Audio analysis</summary>
            <div className="theater-analysis-menu">
              <label>
                Local audio analysis
                <select
                  value={voiceMode}
                  onChange={(event) =>
                    setVoiceMode(Number(event.target.value) as VoiceMode)
                  }
                >
                  <option value={0}>Off</option>
                  <option value={1}>Vocals and backing</option>
                  <option value={2}>Two overlapping speakers</option>
                  <option value={3}>Three overlapping speakers</option>
                </select>
              </label>
              {voiceMode !== 0 && lines.length > 0 && (
                <label className="theater-caption-choice">
                  <input type="checkbox" checked={preferLocal} onChange={(event) => setPreferLocal(event.target.checked)} />
                  Show local captions
                </label>
              )}
            </div>
          </details>
          {voiceMode !== 0 && (
            <div className="theater-sounds" role="status">
              {analysis.status === "error"
                ? <><span>{analysis.error}</span><button onClick={analysis.retry}>Retry audio analysis</button></>
                : analysis.status === "loading"
                  ? "Loading local models…"
                  : analysis.status === "connecting"
                    ? "Connecting local models…"
                    : analysis.status === "listening" && !analysis.result && track?.playing
                      ? "Analyzing audio…"
                      : (analysis.result?.sounds ?? []).map((sound) => (
                          <span className="theater-sound" key={sound}>({sound})</span>
                        ))}
            </div>
          )}
        </header>
        {showSynced ? (
          <div
            className="theater-lyric-scroll"
            ref={scroll}
            aria-label="Synced lyrics"
            tabIndex={0}
            onWheel={browseLyrics}
            onTouchMove={browseLyrics}
            onKeyDown={(event) => {
              if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key))
                browseLyrics();
            }}
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
                        <span className="theater-lyric-text">{line.text}</span>
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
        ) : localLines.length ? (
          <div className="theater-cues theater-local-cues" aria-live="polite">
            {localLines.map((line, index) => {
              const overlaps = localLines.some((other) =>
                other.lane !== line.lane &&
                Math.min(line.end, other.end) - Math.max(line.start, other.start) > 0.15,
              );
              return (
                <div key={`${line.lane}-${line.start}`}>
                  {voiceMode > 1 && (
                    <span>(Voice {line.lane}{overlaps ? " · overlapping" : ""})</span>
                  )}
                  <p data-current={index === localLines.length - 1}>{line.text}</p>
                </div>
              );
            })}
          </div>
        ) : (timedParts.length || visibleCaption) ? (
          <div className="theater-live-caption" aria-live={timedParts.length ? "off" : "polite"}>
            <p>
              {timedParts.length ? timedParts.map((part, index) => (
                <span key={index} data-spoken={part.time <= position}>
                  {index ? " " : ""}{part.text}
                </span>
              )) : visibleCaption}
            </p>
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
            <strong>{identified?.trackName ?? (title || "YouTube")}</strong>
            {(identified?.artistName || artist) && <span>{identified?.artistName || artist}</span>}
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
