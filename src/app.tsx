import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AudioEngine } from "./audio";
import {
  defaults,
  parsePreset,
  presets,
  ranges,
  scenes,
  type Settings,
  type Preset,
} from "./settings";
import "./style.css";

const curated: Preset[] = [
  ["Aurora", 1, 1],
  ["Event Horizon", 0, 0],
  ["Solar Flare", 5, 2],
  ["Midnight Ocean", 3, 1],
  ["Cosmic Dust", 4, 3],
  ["Digital Rain", 2, 1],
  ["Acid Dreams", 3, 2],
  ["Supernova", 0, 2],
  ["Monochrome", 5, 3],
  ["Ethereal", 4, 0],
].map(([name, scene, palette], i) => ({
  version: 1,
  name: String(name),
  scene: Number(scene),
  settings: {
    ...defaults,
    palette: Number(palette),
    speed: 0.65 + i * 0.07,
    style: i % 3,
  },
}));
const fmt = (s: number) =>
  Number.isFinite(s)
    ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0")
    : "0:00";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function App() {
  const [engine] = useState(() => new AudioEngine());
  const [scene, setScene] = useState(0),
    [settings, setSettings] = useState<Settings>(defaults);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [panel, setPanel] = useState(false),
    [cinema, setCinema] = useState(false),
    [drag, setDrag] = useState(false);
  const [error, setError] = useState(""),
    [graphicsError, setGraphicsError] = useState(""),
    [fps, setFps] = useState(0),
    [mic, setMic] = useState(false);
  const [source, setSource] = useState(""),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8),
    [recording, setRecording] = useState(false);
  const [library, setLibrary] = useState<Preset[]>([]),
    [name, setName] = useState(""),
    [selected, setSelected] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    spect = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    state = useRef({ scene, settings, reduced });
  state.current = { scene, settings, reduced };

  useEffect(() => {
    let stopped = false,
      cleanup: (() => void) | undefined;
    import("./graphics")
      .then(({ mountGraphics }) => {
        if (!stopped)
          cleanup = mountGraphics(
            canvas.current!,
            engine,
            () => state.current,
            setFps,
          );
      })
      .catch(() => {
        if (!stopped)
          setGraphicsError(
            "WebGL unavailable. Enable hardware acceleration or try another browser.",
          );
      });
    return () => {
      stopped = true;
      cleanup?.();
      engine.dispose();
    };
  }, [engine]);
  useEffect(() => {
    presets()
      .then(setLibrary)
      .catch(() => setError("Local preset storage is unavailable."));
  }, []);
  useEffect(() => {
    const media = engine.media;
    const update = () => {
      setPlaying(!media.paused);
      setPosition(media.currentTime);
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    };
    const failed = () => {
      setError("This audio file could not be decoded. Try WAV, MP3 or OGG.");
      update();
    };
    const events = [
      "timeupdate",
      "durationchange",
      "play",
      "pause",
      "ended",
      "emptied",
    ];
    events.forEach((e) => media.addEventListener(e, update));
    media.addEventListener("error", failed);
    return () => {
      events.forEach((e) => media.removeEventListener(e, update));
      media.removeEventListener("error", failed);
    };
  }, [engine]);
  useEffect(() => {
    let frame = 0;
    const c = spect.current!,
      ctx = c.getContext("2d")!;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const w = c.width,
        h = c.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(c).color;
      for (let i = 0; i < 60; i++) {
        const n = engine.bins[Math.floor(2 + Math.pow(i / 60, 2) * 360)] / 255;
        ctx.globalAlpha = 0.32 + n * 0.68;
        ctx.fillRect(
          (i * w) / 60,
          h - (2 + n * (h - 3)),
          w / 60 - 2,
          2 + n * (h - 3),
        );
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffffff70";
      ctx.beginPath();
      for (let i = 0; i < 100; i++) {
        const y = h * 0.5 + ((engine.wave[i * 20] - 128) / 128) * h * 0.42;
        i ? ctx.lineTo((i * w) / 99, y) : ctx.moveTo(0, y);
      }
      if (engine.bands.energy > 0.008) ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [engine]);
  async function load(value: File | string, label: string) {
    setError("");
    setMic(false);
    setSource(label);
    try {
      engine.volume(volume);
      await engine.load(value, typeof value === "string");
    } catch (e) {
      setError(message(e));
    }
  }
  const demo = () =>
    load(import.meta.env.BASE_URL + "phase-zero.wav", "Phase Zero / FLUX demo");
  async function toggle() {
    if (mic) {
      engine.stopMic();
      setMic(false);
      setSource("");
      return;
    }
    if (!source) return demo();
    try {
      if (engine.media.paused) await engine.play();
      else engine.media.pause();
    } catch (e) {
      setError(message(e));
    }
  }
  async function microphone() {
    if (mic) {
      engine.stopMic();
      setMic(false);
      setSource("");
      return;
    }
    setError("");
    try {
      if (await engine.microphone()) {
        setMic(true);
        setSource("Live microphone");
      }
    } catch (e) {
      setError("Microphone: " + message(e));
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,button,textarea,select"))
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        void toggle();
      }
      if (e.key === "Escape") setCinema(false);
      if (e.key.toLowerCase() === "f") setCinema((v) => !v);
      if (/^[1-6]$/.test(e.key)) setScene(Number(e.key) - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const update = (key: keyof Settings, value: number) =>
    setSettings((v) => ({ ...v, [key]: value }));
  const apply = (p: Preset) => {
    setSettings(p.settings);
    setScene(p.scene);
  };
  const snapshot = (): Preset =>
    parsePreset({
      version: 1,
      name: name.trim() || scenes[scene][0],
      scene,
      settings,
    });
  async function write(next: Preset[]) {
    try {
      setLibrary(await presets(next));
    } catch (e) {
      setError(message(e));
    }
  }
  async function importPreset(f: File) {
    try {
      if (f.size > 64000) throw Error("Preset file is too large.");
      const p = parsePreset(JSON.parse(await f.text()));
      apply(p);
      setName(p.name);
      await write([...library.filter((v) => v.name !== p.name), p]);
    } catch (e) {
      setError(message(e));
    }
  }
  async function record() {
    if (recorder.current) {
      recorder.current.stop();
      recorder.current = null;
      setRecording(false);
      return;
    }
    let video: MediaStream | undefined;
    try {
      await engine.activate();
      video = canvas.current!.captureStream(30);
      const stream = new MediaStream([
        ...video.getVideoTracks(),
        ...engine.capture!.stream.getAudioTracks(),
      ]);
      const recordingEngine = new MediaRecorder(stream),
        chunks: Blob[] = [];
      recordingEngine.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recordingEngine.onstop = () => {
        video?.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setRecording(false);
        if (chunks.length)
          save(
            new Blob(chunks, { type: recordingEngine.mimeType }),
            "flux." +
              (recordingEngine.mimeType.includes("mp4") ? "mp4" : "webm"),
          );
      };
      recordingEngine.onerror = () => {
        recorder.current = null;
        setRecording(false);
        video?.getTracks().forEach((t) => t.stop());
        setError("Recording failed in this browser.");
      };
      recordingEngine.start(300);
      recorder.current = recordingEngine;
      setRecording(true);
    } catch (e) {
      video?.getTracks().forEach((t) => t.stop());
      setError(message(e));
    }
  }
  const current = scenes[scene];
  return (
    <div
      className={cinema ? "app cinema" : "app"}
      style={{ "--accent": current[1] } as React.CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) void load(f, f.name);
      }}
    >
      <header>
        <a href="./" className="wordmark" aria-label="FLUX home">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 13h4l3-8 5 15 3-9h5" />
          </svg>
          FLUX
        </a>
        <span className="subtitle">MUSIC YOU CAN SEE</span>
        <div className="top-actions">
          <button
            onClick={() => setCinema((v) => !v)}
            title="Cinematic mode (F)"
          >
            ⛶ <span>{cinema ? "Exit cinema" : "Cinema"}</span>
          </button>
          <button aria-expanded={panel} onClick={() => setPanel((v) => !v)}>
            ≡ <span>Studio</span>
          </button>
        </div>
      </header>
      <main className="workspace">
        <section className="stage" aria-label="Audio-reactive environment">
          <canvas ref={canvas} aria-label={current[0] + " visualization"} />
          <div className="stage-label" key={scene}>
            <div className="eyebrow">
              <i /> {mic || playing ? "Audio active" : "Standby"}
            </div>
            <h1>{current[0]}</h1>
            <p>{current[2]}</p>
          </div>
          <div className="stage-scale">
            <span>+</span>
            <span>+</span>
            <span>+</span>
          </div>
          <div className="view-tools">
            <button
              disabled={!!graphicsError}
              onClick={() =>
                canvas.current?.toBlob((blob) => {
                  if (blob) save(blob, "flux-" + scene + ".png");
                })
              }
            >
              ↓ PNG
            </button>
            <button
              disabled={
                !!graphicsError ||
                typeof MediaRecorder === "undefined" ||
                !HTMLCanvasElement.prototype.captureStream
              }
              aria-pressed={recording}
              onClick={() => void record()}
            >
              {recording ? "■ Stop" : "● Rec"}
            </button>
          </div>
          <div className="stage-foot">
            <span>
              {scene === 3 ? "PROCEDURAL SURFACE" : "DRAG TO EXPLORE"}
            </span>
            <span>
              {fps ? fps + " FPS" : "WebGL"} ·{" "}
              {String(scene + 1).padStart(2, "0")}/06
            </span>
          </div>
          {graphicsError && (
            <p role="alert" className="graphics-error">
              {graphicsError}
            </p>
          )}
        </section>
        <nav className="environments" aria-label="Environments">
          {scenes.map(([label, accent], i) => (
            <button
              key={label}
              aria-pressed={scene === i}
              style={{ "--scene-color": accent } as React.CSSProperties}
              onClick={() => setScene(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {label}
            </button>
          ))}
        </nav>
      </main>
      <footer className="transport">
        <div className="track-controls">
          <button
            className="play"
            aria-label={mic ? "Stop microphone" : playing ? "Pause" : "Play"}
            onClick={() => void toggle()}
          >
            {mic || playing ? "Ⅱ" : "▶"}
          </button>
          <div className="track">
            <span>{source || "No audio selected"}</span>
            <span>
              {mic
                ? "MIC INPUT"
                : playing
                  ? "PLAYING"
                  : source
                    ? "PAUSED"
                    : "LOCAL AUDIO"}
            </span>
          </div>
          <button onClick={() => file.current?.click()}>↑ Open audio</button>
          <button aria-pressed={mic} onClick={() => void microphone()}>
            {mic ? "Stop mic" : "Mic"}
          </button>
          <button onClick={() => void demo()}>Play demo</button>
        </div>
        <div className="seek">
          <span>{fmt(position)}</span>
          <input
            aria-label="Seek"
            type="range"
            min="0"
            max={duration || 1}
            step=".01"
            disabled={!duration || mic}
            value={Math.min(duration, position)}
            onChange={(e) => {
              engine.media.currentTime = +e.target.value;
              setPosition(+e.target.value);
            }}
          />
          <span>{fmt(duration)}</span>
        </div>
        <canvas
          ref={spect}
          className="spectrum"
          width={240}
          height={38}
          aria-label="Live spectrum and waveform"
        />
        <label className="volume">
          Vol
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={volume}
            onChange={(e) => {
              const v = +e.target.value;
              engine.volume(v);
              setVolume(v);
            }}
          />
        </label>
      </footer>
      <input
        hidden
        ref={file}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void load(f, f.name);
          e.target.value = "";
        }}
      />
      {panel && (
        <aside className="studio" aria-label="Studio settings">
          <div className="panel-title">
            <h2>Studio</h2>
            <button aria-label="Close studio" onClick={() => setPanel(false)}>
              ×
            </button>
          </div>
          <div className="panel-tools">
            <button onClick={() => setSettings(defaults)}>Reset</button>
            <label>
              <input
                type="checkbox"
                checked={reduced}
                onChange={(e) => setReduced(e.target.checked)}
              />{" "}
              Reduced motion
            </label>
          </div>
          <label className="select">
            Palette
            <select
              value={settings.palette}
              onChange={(e) => update("palette", +e.target.value)}
            >
              {["Ember / violet", "Glacier", "Acid sunrise", "Silver"].map(
                (v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </label>
          {scene === 5 && (
            <label className="select">
              Composition
              <select
                value={settings.style}
                onChange={(e) => update("style", +e.target.value)}
              >
                {["Radial", "Rosette", "Offset"].map((v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sliders">
            {ranges.map(([key, label, min, max]) => (
              <label key={key}>
                <span>
                  {label}
                  <output>{settings[key].toFixed(2)}</output>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step=".01"
                  value={settings[key]}
                  onChange={(e) => update(key, +e.target.value)}
                />
              </label>
            ))}
          </div>
          <h3>Presets</h3>
          <label className="select">
            Curated
            <select value="" onChange={(e) => apply(curated[+e.target.value])}>
              <option value="" disabled>
                Choose a preset
              </option>
              {curated.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="select">
            Library
            <select
              value={selected}
              onChange={(e) => {
                const p = library.find((v) => v.name === e.target.value);
                setSelected(e.target.value);
                if (p) {
                  apply(p);
                  setName(p.name);
                }
              }}
            >
              <option value="">Choose a saved preset</option>
              {library.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="select">
            Name
            <input
              value={name}
              maxLength={60}
              placeholder={current[0]}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="preset-actions">
            <button
              onClick={() => {
                const p = snapshot();
                void write([...library.filter((v) => v.name !== p.name), p]);
                setSelected(p.name);
              }}
            >
              Save
            </button>
            <button
              disabled={
                !selected ||
                !name.trim() ||
                selected === name.trim() ||
                library.some((p) => p.name === name.trim())
              }
              onClick={() => {
                const label = name.trim();
                void write(
                  library.map((p) =>
                    p.name === selected ? { ...p, name: label } : p,
                  ),
                );
                setSelected(label);
              }}
            >
              Rename
            </button>
            <button
              disabled={!selected}
              onClick={() => {
                void write(library.filter((p) => p.name !== selected));
                setSelected("");
              }}
            >
              Delete
            </button>
            <button
              onClick={() =>
                save(
                  new Blob([JSON.stringify(snapshot(), null, 2)], {
                    type: "application/json",
                  }),
                  "flux-preset.json",
                )
              }
            >
              Export
            </button>
            <label className="import">
              Import
              <input
                hidden
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importPreset(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </aside>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button aria-label="Dismiss message" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {drag && <div className="drop">Drop audio to play</div>}
    </div>
  );
}
createRoot(document.querySelector("#root")!).render(<App />);
