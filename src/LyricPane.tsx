import { useEffect, useRef, useState } from "react";
import {
  currentLine,
  exactRecording,
  findLyrics,
  parseLrc,
  type Line,
  type LyricsMatch,
} from "./lyrics";
import type { Track } from "./desktop";

export function Lyrics({
  clock,
  track,
  source,
  live,
  reading,
  liveCaption,
  captionState,
  enableCaptions,
}: {
  clock: () => number;
  track: Track | null;
  source: string;
  live: boolean;
  reading: boolean;
  liveCaption: string;
  captionState: string;
  enableCaptions: () => void;
}) {
  const [title, setTitle] = useState(""),
    [artist, setArtist] = useState("");
  const [matches, setMatches] = useState<LyricsMatch[]>([]),
    [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState(""),
    [active, setActive] = useState(-1);
  const [caption, setCaption] = useState(""),
    [offset, setOffset] = useState(0);
  const [view, setView] = useState(true);
  const activeLine = useRef<HTMLLIElement>(null),
    request = useRef<AbortController>(null);
  const selectors = useRef({ clock, lines, offset });
  selectors.current = { clock, lines, offset };
  const trackTitle = track?.title ?? "";
  const trackArtist = track?.artist ?? "";
  const trackDuration = Math.round(track?.duration ?? 0);
  const localLrc = useRef<HTMLInputElement>(null);
  const sourceGeneration = useRef(0);
  useEffect(() => {
    sourceGeneration.current++;
    request.current?.abort();
    setLines([]);
    setMatches([]);
    setActive(-1);
    setCaption("");
    setOffset(0);
    setStatus("");
    setView(true);
    setTitle(trackTitle);
    setArtist(trackArtist);
  }, [source, trackTitle, trackArtist]);
  useEffect(() => {
    if (!live || !trackTitle || !trackDuration) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus("Finding timed lyrics for this song…");
    void findLyrics(trackTitle, trackArtist, controller.signal).then(
      (matches) => {
        if (controller.signal.aborted) return;
        const match = exactRecording(
          matches,
          trackTitle,
          trackArtist,
          trackDuration,
        );
        if (match)
          useLyrics(
            match.syncedLyrics,
            match.trackName + " · " + match.artistName,
          );
        else
          setStatus(
            "No exact timed match. You can search for the individual song or open an LRC file.",
          );
      },
      (error) => {
        if (!controller.signal.aborted)
          setStatus(error instanceof Error ? error.message : String(error));
      },
    );
    return () => controller.abort();
  }, [live, source, trackTitle, trackArtist, trackDuration]);
  useEffect(() => {
    const update = () => {
      const v = selectors.current;
      setActive(currentLine(v.lines, v.clock() + v.offset));
    };
    update();
    const timer = window.setInterval(update, 120);
    return () => {
      clearInterval(timer);
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    const row = activeLine.current;
    const scroll = row?.closest(".lyric-scroll");
    if (row && scroll)
      scroll.scrollTop +=
        row.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top -
        scroll.clientHeight * 0.28;
  }, [active, view]);
  function useLyrics(data: string, label: string) {
    request.current?.abort();
    const parsed = parseLrc(data);
    if (!parsed.some((v) => v.text)) {
      setStatus("This file has no timed lyric lines.");
      return;
    }
    setLines(parsed);
    setCaption(label);
    setOffset(0);
    setStatus("");
    setMatches([]);
    setView(false);
  }
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus("Looking up timed lyrics…");
    setMatches([]);
    try {
      const results = await findLyrics(
        title.trim(),
        artist.trim(),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setMatches(results);
      setStatus(
        results.length
          ? "Choose the recording you’re listening to."
          : "No timed lyrics found. Try the exact song title or open an LRC file.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setStatus(e instanceof Error ? e.message : String(e));
    }
  }
  if (reading && view)
    return (
      <section className="lyrics-pane" aria-label="Live lyrics">
        {track?.caption || liveCaption ? (
          <div>
            <span className="caption-label">Live captions</span>
            <p className="live-caption">{track?.caption || liveCaption}</p>
          </div>
        ) : captionState === "downloadable" && !status.startsWith("Finding") ? (
          <div className="caption-choice">
            <p className="lyrics-wait">
              Timed lyrics unavailable for this recording.
            </p>
            <button onClick={enableCaptions}>Enable on-device captions</button>
          </div>
        ) : (
          <p className="lyrics-wait">
            {status.startsWith("Finding")
              ? "Finding synced lyrics…"
              : captionState === "listening"
                ? "Listening for captions…"
                : captionState === "preparing"
                  ? "Loading on-device captions…"
                  : "No synced lyrics or captions available"}
          </p>
        )}
      </section>
    );

  return (
    <section className="lyrics-pane" aria-label="Live lyrics">
      <header className="pane-header">
        <h2>Lyrics</h2>
        {lines.length > 0 && (
          <button onClick={() => setView((v) => !v)}>
            {view ? "Show lyrics" : "Change"}
          </button>
        )}
      </header>
      {caption && <p className="lyric-caption">{caption}</p>}
      {view ? (
        <div className="lyrics-setup">
          <p>
            {live && !track?.title
              ? "Enter the song playing in your shared video."
              : "Find a timed recording or open your own LRC."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <label>
              Song
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
              />
            </label>
            <label>
              Artist
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                maxLength={160}
              />
            </label>
            <button type="submit" disabled={!title.trim()}>
              Find lyrics
            </button>
          </form>
          <button
            type="button"
            className="file-label"
            onClick={() => localLrc.current?.click()}
          >
            Open LRC
          </button>
          <input
            ref={localLrc}
            type="file"
            accept=".lrc,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              if (file.size > 200000) {
                setStatus("That LRC file is too large.");
                return;
              }
              const generation = sourceGeneration.current;
              try {
                const text = await file.text();
                if (generation === sourceGeneration.current)
                  useLyrics(text, file.name);
              } catch {
                if (generation === sourceGeneration.current)
                  setStatus("Could not read the LRC file.");
              }
            }}
          />
          <p role="status">{status}</p>
          {!!matches.length && (
            <ul className="lyric-matches">
              {matches.map((match) => (
                <li key={match.id}>
                  <button
                    onClick={() =>
                      useLyrics(
                        match.syncedLyrics,
                        match.trackName + " · " + match.artistName,
                      )
                    }
                  >
                    {match.trackName}
                    <small>
                      {match.artistName} · {Math.floor(match.duration / 60)}:
                      {String(Math.round(match.duration % 60)).padStart(2, "0")}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a
            className="lyric-provider"
            href="https://lrclib.net"
            target="_blank"
            rel="noreferrer"
          >
            Search by LRCLIB ↗
          </a>
        </div>
      ) : (
        <>
          {live && (!track?.duration || track.duration <= 0) && (
            <p className="lyric-hint">Click a line as you hear it to sync.</p>
          )}
          <div className="lyric-scroll">
            <ol>
              {lines.map((line, i) =>
                line.text ? (
                  <li
                    key={i}
                    ref={i === active ? activeLine : undefined}
                    aria-current={i === active ? "true" : undefined}
                  >
                    <button
                      title="Match this line to the current playback position"
                      onClick={() => setOffset(line.time - clock())}
                    >
                      {line.text}
                    </button>
                  </li>
                ) : null,
              )}
            </ol>
          </div>
          <div className="lyric-sync">
            <button
              aria-label="Lyrics half a second earlier"
              onClick={() => setOffset((v) => v + 0.5)}
            >
              Earlier
            </button>
            <button
              aria-label="Reset lyrics timing"
              onClick={() => setOffset(0)}
            >
              {(-offset).toFixed(1)} s
            </button>
            <button
              aria-label="Lyrics half a second later"
              onClick={() => setOffset((v) => v - 0.5)}
            >
              Later
            </button>
          </div>
        </>
      )}
    </section>
  );
}
