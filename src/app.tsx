import { ExtensionTheater } from "./ExtensionTheater";
import { useLocalCaptions } from "./captions";
import { useLocalListening, type VoiceMode } from "./local-listening";
import {
  boundedCrop,
  contentCrop,
  controlYouTube,
  inExtension,
  LinkedSourceError,
  readYouTube,
  type Crop,
} from "./media-preview";
import {
  coverPalette,
  paletteFromPixels,
  type Track,
  type CoverPalette,
} from "./desktop";
import { Lyrics } from "./LyricPane";
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
  ["Aurora", 0, 1],
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
  scene: scene === 5 ? 5 : 0,
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
  const [scene, setScene] = useState<0 | 5>(0);
  const [settings, setSettings] = useState<Settings>(defaults);
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
  const [desktop, setDesktop] = useState(false);
  const [shared, setShared] = useState<MediaStream>();
  const [audioBlocked, setAudioBlocked] = useState(false);
  useEffect(() => {
    if (!inExtension || !shared || !engine.context) return;
    const context = engine.context;
    const check = () => setAudioBlocked(context.state !== "running");
    check();
    context.addEventListener("statechange", check);
    return () => context.removeEventListener("statechange", check);
  }, [shared, engine]);
  const [captionFallback, setCaptionFallback] = useState(true);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(0);
  const [frameColors, setFrameColors] = useState<CoverPalette>();
  const [visual, setVisual] = useState<"video" | "cover">("video");
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [captureId, setCaptureId] = useState("");
  const [capturePending, setCapturePending] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [captureEnded, setCaptureEnded] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const cropGuide = useRef<Crop | null>(null);
  const [controls, setControls] = useState(false);
  const [controlsHint, setControlsHint] = useState(false);
  const hintTimer = useRef<number | undefined>(undefined);
  function revealControlsHint() {
    setControlsHint(true);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setControlsHint(false), 1700);
  }
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);
  const [browserTrack, setBrowserTrack] = useState<Track | null>(null);
  cropGuide.current = boundedCrop(browserTrack?.crop);
  const sharedAt = useRef(0);
  const captureDock = useRef<HTMLDetailsElement>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const playerTrack = browserTrack ?? track;
  const [thumbnail, setThumbnail] = useState<string>();
  const [thumbnailPalette, setThumbnailPalette] = useState<CoverPalette>();
  const thumbnailId = playerTrack?.videoId;
  const listeningKey = JSON.stringify([
    thumbnailId,
    playerTrack?.chapterStart,
    playerTrack?.title,
    playerTrack?.artist,
  ]);
  const localListening = useLocalListening(
    engine.context,
    shared,
    inExtension ? voiceMode : 0,
    listeningKey,
    playerTrack,
  );
  useEffect(() => {
    setThumbnail(undefined);
    setThumbnailPalette(undefined);
    if (
      !inExtension ||
      !thumbnailId ||
      !/^[a-zA-Z0-9_-]{11}$/.test(thumbnailId)
    )
      return;
    const controller = new AbortController();
    let url: string | undefined;
    async function getArtwork() {
      for (const rendition of ["hq720", "hqdefault"]) {
        const response = await fetch(
          "https://i.ytimg.com/vi/" + thumbnailId + "/" + rendition + ".jpg",
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(3500),
            ]),
          },
        ).catch(() => undefined);
        if (controller.signal.aborted) return;
        if (!response?.ok) continue;
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        const image = new Image();
        image.src = url;
        try {
          await image.decode();
        } catch {
          URL.revokeObjectURL(url);
          url = undefined;
          continue;
        }
        if (controller.signal.aborted) return;
        if (image.width < 160) {
          URL.revokeObjectURL(url);
          url = undefined;
          continue;
        }
        setThumbnail(url);
        const sampler = document.createElement("canvas");
        sampler.width = sampler.height = 48;
        const ctx = sampler.getContext("2d")!;
        ctx.drawImage(image, 0, 0, 48, 48);
        setThumbnailPalette(
          paletteFromPixels(ctx.getImageData(0, 0, 48, 48).data),
        );
        return;
      }
    }
    void getArtwork().catch(() => {});
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [thumbnailId]);
  const speech = useLocalCaptions(
    shared?.getAudioTracks()[0],
    captionFallback && !playerTrack?.caption,
    inExtension ? listeningKey : undefined,
  );
  const [albumColors, setAlbumColors] = useState<CoverPalette>();
  const [followCover, setFollowCover] = useState(true);
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
  const recorderStarting = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null),
    state = useRef({ scene, settings, reduced, albumColors });
  const artwork = inExtension
    ? thumbnailPalette
    : followCover
      ? ((visual === "video" && shared ? frameColors : albumColors) ??
        albumColors)
      : undefined;
  state.current = {
    scene:
      !inExtension && (desktop || mic || playing) && !controls ? 0 : scene,
    settings,
    reduced,
    albumColors: artwork,
  };

  useEffect(() => {
    if (!desktop || !window.fluxDesktop) return;
    const bridge = window.fluxDesktop;
    let stopped = false,
      timer: number,
      initializedPreview = false,
      lastBridgeError = "";
    async function poll() {
      try {
        const result = await bridge.nowPlaying();
        if (stopped) return;
        if (
          !initializedPreview &&
          result.track?.cover &&
          result.previewKind === "automatic-display"
        ) {
          setVisual("cover");
          initializedPreview = true;
        }
        setTrack((prior) =>
          JSON.stringify(prior) === JSON.stringify(result.track)
            ? prior
            : result.track,
        );
        if (result.error && !result.track && result.error !== lastBridgeError) {
          lastBridgeError = result.error;
          setError(result.error);
        }
      } catch (e) {
        if (!stopped) setError(message(e));
        return;
      }
      timer = window.setTimeout(poll, 450);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      bridge.stopReading();
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop || window.fluxDesktop) return;
    let quit = false,
      timer: number,
      misses = 0;
    async function read() {
      const { track: media, sourceError } = await readYouTube();
      if (!quit) {
        if (sourceError) {
          stopDesktop();
          setSourceError(sourceError);
          return;
        }
        misses = media ? 0 : misses + 1;
        if (media || misses >= 3) setBrowserTrack(media);
        timer = window.setTimeout(read, 550);
      }
    }
    void read();
    return () => {
      quit = true;
      clearTimeout(timer);
    };
  }, [desktop]);
  useEffect(() => {
    if (!captureEnded) return;
    let cancelled = false;
    void readYouTube().then(({ sourceError }) => {
      if (!cancelled && sourceError) setSourceError(sourceError);
    });
    return () => {
      cancelled = true;
    };
  }, [captureEnded]);
  const cover = desktop ? track?.cover : undefined;
  useEffect(() => {
    let stale = false;
    setAlbumColors(undefined);
    if (cover)
      void coverPalette(cover).then(
        (colors) => {
          if (!stale) setAlbumColors(colors);
        },
        () => {},
      );
    return () => {
      stale = true;
    };
  }, [cover]);

  function playbackClock() {
    if (!desktop) return engine.media.currentTime;
    if (
      playerTrack &&
      typeof playerTrack.position === "number" &&
      (playerTrack.duration ?? 0) > 0
    ) {
      const age =
        playerTrack.sampledAt && playerTrack.playing && !playerTrack.buffering
          ? Math.min(0.8, Math.max(0, (Date.now() - playerTrack.sampledAt) / 1000))
          : 0;
      const rate =
        typeof playerTrack.rate === "number" && playerTrack.rate > 0
          ? playerTrack.rate
          : 1;
      return Math.max(
        0,
        Math.min(playerTrack.duration!, playerTrack.position + age * rate),
      );
    }
    return inExtension
      ? 0
      : Math.max(0, (performance.now() - sharedAt.current) / 1000);
  }
  const showVideo =
    !inExtension && !!shared && (visual === "video" || !cover) && !cinema;
  useEffect(() => {
    const element = video.current;
    if (!showVideo || !shared || !element) return;
    element.srcObject = shared;
    void element.play().catch(() => {});
    const target = preview.current!;
    const output = target.getContext("2d")!;
    const sample = document.createElement("canvas");
    sample.width = 96;
    sample.height = 54;
    const ctx = sample.getContext("2d", { willReadFrequently: true })!;
    let last = "",
      nextColor = 0,
      lastFrame = 0,
      frame = 0,
      region: Crop | null = null;
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (element.readyState < 2 || !element.videoWidth || now - lastFrame < 38)
        return;
      lastFrame = now;
      const w = element.videoWidth,
        h = element.videoHeight;
      if (now >= nextColor) {
        ctx.drawImage(element, 0, 0, 96, 54);
        region =
          cropGuide.current ??
          contentCrop(ctx.getImageData(0, 0, 96, 54).data, 96, 54);
      }
      const r = region ?? { x: 0, y: 0, w: 1, h: 1 };
      const width = Math.max(1, r.w * w),
        height = Math.max(1, r.h * h);
      const scale = Math.min(1, 600 / Math.max(width, height));
      const tw = Math.max(1, Math.round(width * scale)),
        th = Math.max(1, Math.round(height * scale));
      if (target.width !== tw || target.height !== th) {
        target.width = tw;
        target.height = th;
      }
      output.drawImage(element, r.x * w, r.y * h, width, height, 0, 0, tw, th);
      if (now >= nextColor) {
        ctx.drawImage(target, 0, 0, 96, 54);
        const colors = paletteFromPixels(ctx.getImageData(0, 0, 96, 54).data);
        const signature = colors.join();
        if (signature !== last) {
          last = signature;
          setFrameColors(colors);
        }
        nextColor = now + 1150;
      }
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      element.srcObject = null;
    };
  }, [shared, showVideo]);

  function clearCaptureView() {
    setBrowserTrack(null);
    setShared(undefined);
    setFrameColors(undefined);
    setTrack(null);
  }
  function stopDesktop() {
    engine.stopMic();
    setDesktop(false);
    clearCaptureView();
    setSource("");
  }
  async function refreshSources() {
    if (!window.fluxDesktop?.listSources) return;
    try {
      setSources(await window.fluxDesktop.listSources());
    } catch {
      setError(
        "Could not list capture sources. Open the player and try again.",
      );
    }
  }
  async function desktopAudio() {
    if (desktop) {
      stopDesktop();
      return;
    }
    if (capturePending) return;
    setError("");
    setSourceError("");
    setCaptureEnded(false);
    setCapturePending(true);
    try {
      engine.volume(volume);
      const stream = await engine.desktop(() => {
        stopDesktop();
        if (inExtension) setCaptureEnded(true);
      });
      if (stream) {
        sharedAt.current = performance.now();
        setShared(stream);
        setVisual("video");
        setFrameColors(undefined);
        setMic(false);
        setDesktop(true);
        setControls(false);
        setSource("Shared audio");
        if (captureDock.current) captureDock.current.open = false;
      }
    } catch (e) {
      window.fluxDesktop?.stopReading();
      if (e instanceof LinkedSourceError) setSourceError(e.message);
      else setError(message(e));
    } finally {
      setCapturePending(false);
    }
  }

  const autoConnect = useRef(false);
  useEffect(() => {
    if (
      inExtension &&
      !autoConnect.current &&
      new URLSearchParams(location.search).has("source")
    ) {
      autoConnect.current = true;
      void desktopAudio();
    }
  }, []);

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
    setDesktop(false);
    clearCaptureView();
    setSource(label);
    setControls(false);
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
    if (desktop) {
      if (inExtension) {
        if (!(await controlYouTube("flux:toggle-play")))
          setError("The linked YouTube player is unavailable.");
      } else stopDesktop();
      return;
    }
    if (mic) {
      engine.stopMic();
      setMic(false);
      setSource("");
      return;
    }
    if (!source) return demo();
    try {
      if (engine.media.paused) {
        setControls(false);
        await engine.play();
      } else engine.media.pause();
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
        setDesktop(false);
        clearCaptureView();
        setMic(true);
        setControls(false);
        setSource("Live microphone");
      }
    } catch (e) {
      setError("Microphone: " + message(e));
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.repeat) {
        setControls(true);
        setCinema(false);
        return;
      }
      if (
        inExtension &&
        desktop &&
        !e.defaultPrevented &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        !(
          e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            e.target.closest("input,textarea,select,[role=slider]"))
        )
      ) {
        e.preventDefault();
        // One skip per press keeps messages from queuing when a key is held.
        if (!e.repeat) {
          void controlYouTube("flux:seek-relative", {
            time: e.key === "ArrowLeft" ? -5 : 5,
          }).then((ok) => {
            if (!ok) setError("Could not skip in the linked YouTube video.");
          });
        }
        return;
      }
      if (
        e.repeat ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,button,textarea,select"))
      )
        return;
      if (e.code === "Space") {
        if (inExtension && !desktop) return;
        e.preventDefault();
        void toggle();
      }

      if (e.key.toLowerCase() === "f") {
        if (inExtension) {
          if (document.fullscreenElement)
            void document.exitFullscreen().catch(() => {});
          else
            void document.documentElement.requestFullscreen().catch(() => {});
        } else setCinema((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const update = (key: keyof Settings, value: number) =>
    setSettings((v) => ({ ...v, [key]: value }));
  const apply = (p: Preset) => {
    setSettings(p.settings);
    setScene(p.scene === 5 ? 5 : 0);
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
    if (recorderStarting.current) return;
    if (recorder.current) {
      if (recorder.current.state !== "inactive") recorder.current.stop();
      return;
    }
    let video: MediaStream | undefined;
    recorderStarting.current = true;
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
        if (recorder.current !== recordingEngine) return;
        recorder.current = null;
        setRecording(false);
        const clip = new Blob(chunks, { type: recordingEngine.mimeType });
        if (clip.size <= 1) {
          setError(
            "The browser did not encode a recording. Let it run for a few seconds and try again.",
          );
          return;
        }
        save(
          clip,
          "flux." + (recordingEngine.mimeType.includes("mp4") ? "mp4" : "webm"),
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
    } finally {
      recorderStarting.current = false;
    }
  }
  const listening = (desktop || mic || playing) && (inExtension || !controls);
  const extensionIdle = inExtension && !(desktop || mic || playing);
  const activeScene = listening ? 0 : scene;
  const current = scenes[activeScene];
  return (
    <div
      data-spectrum={inExtension && scene === 5 ? "true" : undefined}
      className={[
        "app",
        inExtension && "extension-app",
        extensionIdle && "extension-idle",
        cinema && "cinema",
        reduced && "reduced",
        listening && "listening",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--accent": artwork?.[2] ?? current[1] } as React.CSSProperties}
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
        <a
          href="./"
          className="wordmark"
          aria-label="FLUX home"
          onClick={(e) => {
            if (window.fluxDesktop) {
              e.preventDefault();
              setCinema(false);
              setPanel(false);
            }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 13h4l3-8 5 15 3-9h5" />
          </svg>
          FLUX
        </a>
        <span className="subtitle">
          {inExtension ? "YouTube listening view" : "Audio visualizer"}
        </span>
        <div className="top-actions">
          <button
            onClick={() => {
              if ((desktop || mic || playing) && !cinema) {
                setControls(false);
                setPanel(false);
              } else setCinema((v) => !v);
            }}
            title={
              desktop || mic || playing
                ? "Hide controls and return to listening"
                : "Cinematic mode (F)"
            }
          >
            ⛶{" "}
            <span>
              {cinema
                ? "Exit cinema"
                : desktop || mic || playing
                  ? "Listening view"
                  : "Cinema"}
            </span>
          </button>
          <button aria-expanded={panel} onClick={() => setPanel((v) => !v)}>
            ≡ <span>Studio</span>
          </button>
        </div>
      </header>
      <main className="workspace">
        {extensionIdle && (
          <section className="extension-welcome" aria-label="Start FLUX">
            <div className="welcome-art" aria-hidden="true"></div>
            <div className="welcome-copy">
              <h1>
                {capturePending
                  ? "Connecting to YouTube…"
                  : captureEnded || sourceError
                    ? "Playback disconnected."
                    : "Play something."}
              </h1>
              <p>
                {sourceError ||
                  (capturePending
                    ? "Keep the source tab open."
                    : "Open a video on YouTube and click FLUX in Chrome’s toolbar.")}
              </p>
              {!capturePending &&
                (!sourceError &&
                new URLSearchParams(location.search).has("source") ? (
                  <button
                    className="desktop-source"
                    onClick={() => void desktopAudio()}
                  >
                    Reconnect
                  </button>
                ) : (
                  <a
                    href="https://www.youtube.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open YouTube ↗
                  </a>
                ))}
            </div>
          </section>
        )}
        {inExtension && desktop && (
          <ExtensionTheater
            scene={scene}
            setScene={setScene}
            key={listeningKey}
            track={playerTrack}
            clock={playbackClock}
            caption={speech.text}
            captionState={speech.state}
            enableCaptions={() => void speech.install()}
            thumbnail={thumbnail}
            accent={thumbnailPalette?.[2]}
            analysis={localListening}
            voiceMode={voiceMode}
            setVoiceMode={(mode) => {
              setVoiceMode(mode);
              if (mode !== 0 && audioBlocked)
                void engine.activate().catch((e) => setError(message(e)));
            }}
            stop={stopDesktop}
            audioBlocked={audioBlocked}
            enableAudio={() =>
              void engine.activate().catch((e) => setError(message(e)))
            }
          />
        )}
        {!inExtension && (
          <Lyrics
            clock={playbackClock}
            track={desktop ? playerTrack : null}
            reading={listening}
            liveCaption={speech.text}
            captionState={speech.state}
            enableCaptions={() => void speech.install()}
            source={source}
            live={desktop}
          />
        )}
        <section
          className="stage"
          aria-label="Audio-reactive environment"
          onDoubleClick={() => setControls(true)}
          onPointerMove={(event) => {
            if (listening && event.pointerType === "mouse")
              revealControlsHint();
          }}
          onPointerDown={(event) => {
            if (listening && event.pointerType !== "mouse")
              revealControlsHint();
          }}
        >
          {listening && !inExtension && (
            <button
              className={
                controlsHint ? "restore-controls revealed" : "restore-controls"
              }
              onClick={() => setControls(true)}
            >
              Show controls
            </button>
          )}
          <canvas ref={canvas} aria-label={current[0] + " visualization"} />
          {!inExtension && (
            <nav className="visual-modes" aria-label="Visualizer">
              <button aria-pressed={scene === 0} onClick={() => setScene(0)}>
                Singularity
              </button>
              <button aria-pressed={scene === 5} onClick={() => setScene(5)}>
                Spectrum
              </button>
            </nav>
          )}
          {!inExtension && scene === 5 && (
            <div
              className="frequency-scale"
              aria-label="Logarithmic frequency axis"
            >
              {[
                ["50 Hz", 1],
                ["100", 13.3],
                ["250", 29.9],
                ["500", 42.4],
                ["1k", 55],
                ["2k", 67.6],
                ["5k", 84.1],
                ["12 kHz", 100],
              ].map(([label, at]) => (
                <span key={label} style={{ left: at + "%" }}>
                  {label}
                </span>
              ))}
            </div>
          )}
          <div className="stage-label" key={scene}>
            <div className="eyebrow">
              <i /> {desktop || mic || playing ? "Live" : "Standby"}
            </div>
            <h1>{current[0]}</h1>
            <p>{current[2]}</p>
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
            {scene === 0 && <span>Drag to orbit</span>}
            {fps > 0 && <span>{fps} FPS</span>}
          </div>
          {graphicsError && (
            <p role="alert" className="graphics-error">
              {graphicsError}
            </p>
          )}
        </section>
        {!inExtension && (
          <aside className="media-pane" aria-label="Now playing video">
            <header className="pane-header">
              <h2>Now playing</h2>
              {desktop && <span className="live-label">Live input</span>}
            </header>
            {shared || cover ? (
              <>
                <figure className="media-frame">
                  {showVideo ? (
                    <>
                      <video
                        ref={video}
                        muted
                        autoPlay
                        playsInline
                        hidden
                        aria-hidden="true"
                      />
                      <canvas
                        ref={preview}
                        aria-label="Cropped live shared video"
                      />
                    </>
                  ) : cover ? (
                    <img src={cover} alt="Current album artwork" />
                  ) : null}
                </figure>
                <div className="media-caption">
                  {playerTrack?.title && <strong>{playerTrack.title}</strong>}
                  {!listening && !playerTrack?.title && (
                    <strong>Shared video</strong>
                  )}
                  {playerTrack?.artist && <span>{playerTrack.artist}</span>}
                </div>
                {shared && cover && (
                  <div className="media-switch">
                    <button
                      aria-pressed={visual === "video"}
                      onClick={() => setVisual("video")}
                    >
                      Video
                    </button>
                    <button
                      aria-pressed={visual === "cover"}
                      onClick={() => setVisual("cover")}
                    >
                      Album art
                    </button>
                  </div>
                )}
                {artwork && (
                  <div
                    className="palette-strip"
                    aria-label="Colors sampled from the image"
                  >
                    {artwork.map((color, i) => (
                      <i key={i} style={{ background: color }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="media-empty">
                <p>
                  {inExtension
                    ? "Play a video on YouTube, then click FLUX in the toolbar."
                    : "Select Desktop audio to start."}
                </p>
              </div>
            )}
          </aside>
        )}
      </main>
      <div className="bottom-dock">
        <details
          className="capture-drawer"
          ref={captureDock}
          onToggle={(e) => {
            if (e.currentTarget.open && !sources.length && !desktop)
              void refreshSources();
          }}
        >
          <summary>
            {desktop ? "Shared video controls" : "Sharing and inputs"}
          </summary>
          <div className="capture-content">
            {!window.fluxDesktop && !inExtension && (
              <a
                href="https://github.com/Pranav-Teja-Aluvala/FLUX#youtube-link-for-chrome"
                target="_blank"
                rel="noreferrer"
              >
                Set up YouTube Link
              </a>
            )}
            <label>
              <input
                type="checkbox"
                checked={captionFallback}
                onChange={(e) => setCaptionFallback(e.target.checked)}
              />{" "}
              On-device caption fallback
            </label>
            {window.fluxDesktop?.listSources && !desktop && (
              <>
                <label>
                  Window or display{" "}
                  <select
                    value={captureId}
                    onChange={async (e) => {
                      const id = e.target.value;
                      if (await window.fluxDesktop?.selectSource(id))
                        setCaptureId(id);
                    }}
                  >
                    <option value="">
                      Automatic player or primary display
                    </option>
                    {sources.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={() => void refreshSources()}>
                  Find windows
                </button>
              </>
            )}
            <button aria-pressed={mic} onClick={() => void microphone()}>
              {mic ? "Stop mic" : "Mic"}
            </button>
            <label>
              <input
                type="checkbox"
                checked={followCover}
                onChange={(e) => setFollowCover(e.target.checked)}
              />{" "}
              Use image colors
            </label>
          </div>
        </details>
        <footer className="transport">
          <div className="track-controls">
            <button
              className="play"
              aria-label={
                desktop
                  ? "Stop desktop capture"
                  : mic
                    ? "Stop microphone"
                    : playing
                      ? "Pause"
                      : "Play"
              }
              onClick={() => void toggle()}
            >
              {desktop || mic ? "■" : playing ? "Ⅱ" : "▶"}
            </button>
            {cover && <img className="album-cover" src={cover} alt="" />}
            <div className="track">
              <span>
                {desktop && playerTrack?.title
                  ? playerTrack.title
                  : source || "No audio selected"}
              </span>
              <span>
                {desktop
                  ? playerTrack?.artist ||
                    (window.fluxDesktop
                      ? "Waiting for a Windows media session"
                      : "Browser capture")
                  : mic
                    ? "MIC INPUT"
                    : playing
                      ? "PLAYING"
                      : source
                        ? "PAUSED"
                        : "LOCAL AUDIO"}
              </span>
            </div>
          </div>
          <div className="input-actions">
            <button
              className="desktop-source"
              aria-pressed={desktop}
              disabled={capturePending}
              title={
                window.fluxDesktop
                  ? "Capture system audio and the playing window or primary display"
                  : "Capture the linked YouTube tab"
              }
              onClick={() => void desktopAudio()}
            >
              {desktop
                ? "Stop desktop"
                : capturePending
                  ? "Connecting…"
                  : inExtension
                    ? "Play linked tab"
                    : "Desktop audio"}
            </button>
            <button
              className="file-source"
              onClick={() => file.current?.click()}
            >
              Open audio
            </button>
            <button className="demo-source" onClick={() => void demo()}>
              Play demo
            </button>
          </div>
          <div className="seek">
            <span>{fmt(position)}</span>
            <input
              aria-label="Seek"
              type="range"
              min="0"
              max={duration || 1}
              step=".01"
              disabled={!duration || mic || desktop}
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
      </div>
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
          <label className="cover-setting">
            <input
              type="checkbox"
              checked={followCover}
              onChange={(e) => setFollowCover(e.target.checked)}
            />{" "}
            Follow image colors
          </label>
          {!window.fluxDesktop && !inExtension && (
            <a
              className="desktop-info"
              href="https://github.com/Pranav-Teja-Aluvala/FLUX#windows-desktop-mode"
              target="_blank"
              rel="noreferrer"
            >
              Windows song and cover setup ↗
            </a>
          )}
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
