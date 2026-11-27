import { useEffect, useRef, useState } from "react";
import {
  currentLine,
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
}: {
  clock: () => number;
  track: Track | null;
  source: string;
  live: boolean;
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
  const trackKey = track?.title + "|" + track?.artist;
  useEffect(() => {
    request.current?.abort();
    setLines([]);
    setMatches([]);
    setActive(-1);
    setCaption("");
    setOffset(0);
    setStatus("");
    setView(true);
    setTitle(track?.title ?? "");
    setArtist(track?.artist ?? "");
  }, [source, trackKey]);
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
          <label className="file-label">
            Open LRC
            <input
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
                try {
                  useLyrics(await file.text(), file.name);
                } catch {
                  setStatus("Could not read the LRC file.");
                }
              }}
            />
          </label>
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
