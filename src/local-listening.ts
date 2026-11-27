import { useEffect, useRef, useState } from "react";
import type { Track } from "./desktop";

type ListeningLine = {
  text: string;
  start: number;
  end: number;
  lane: number;
};

type Analysis = {
  sounds: string[];
  lines: ListeningLine[];
};

type Reply =
  | { type: "ready"; protocol: number }
  | { type: "loading"; id: number }
  | { type: "error"; id: number; message: string }
  | ({ type: "analysis"; id: number } & Analysis);

type NativePort = {
  onMessage: { addListener(listener: (reply: Reply) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  postMessage(message: unknown): void;
  disconnect(): void;
};

declare const chrome: {
  runtime?: {
    connectNative?(host: string): NativePort;
    lastError?: { message?: string };
  };
};

export type VoiceMode = 0 | 1 | 2 | 3;
type Status = "off" | "connecting" | "loading" | "listening" | "error";

function encode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function useLocalListening(
  context: AudioContext | undefined,
  stream: MediaStream | undefined,
  mode: VoiceMode,
  sourceKey: string,
  track: Track | null,
) {
  const enabled = mode !== 0;
  const playing = !!track?.playing && !track.buffering;
  const [status, setStatus] = useState<Status>("off");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Analysis>();
  const [attempt, setAttempt] = useState(0);
  const reset = useRef<(() => void) | undefined>(undefined);
  const settings = useRef({ mode, playing });
  settings.current = { mode, playing };
  const priorPlayback = useRef<Track | null>(null);

  useEffect(() => {
    setResult(undefined);
    reset.current?.();
  }, [sourceKey, mode, playing]);

  useEffect(() => {
    const previous = priorPlayback.current;
    priorPlayback.current = track;
    if (
      previous?.videoId !== track?.videoId ||
      previous?.chapterStart !== track?.chapterStart ||
      typeof previous?.position !== "number" ||
      typeof track?.position !== "number"
    ) return;
    const elapsed = ((track.sampledAt ?? 0) - (previous.sampledAt ?? 0)) / 1000;
    const expected = previous.playing && !previous.buffering
      ? elapsed * (previous.rate ?? 1)
      : 0;
    if (Math.abs(track.position - previous.position - expected) > 2.5) {
      setResult(undefined);
      reset.current?.();
    }
  }, [track]);

  useEffect(() => {
    if (!enabled || !context || !stream) {
      setStatus("off");
      return;
    }
    let active = true;
    let failed = false;
    let port: NativePort | undefined;
    let input: MediaStreamAudioSourceNode | undefined;
    let capture: AudioWorkletNode | undefined;
    let mute: GainNode | undefined;
    let serial = 0;
    let generation = 0;
    let pending: { id: number; generation: number } | undefined;
    function stopAudio() {
      reset.current = undefined;
      if (capture) capture.port.onmessage = null;
      input?.disconnect();
      capture?.disconnect();
      mute?.disconnect();
    }
    function fail(message: string) {
      if (!active || failed) return;
      failed = true;
      setError(message);
      setStatus("error");
      stopAudio();
      port?.disconnect();
    }
    async function setup() {
      setError("");
      setStatus("connecting");
      try {
        port = chrome.runtime?.connectNative?.("io.flux.listening");
        if (!port) throw Error("The local FLUX listening companion is unavailable.");
        port.onDisconnect.addListener(() => {
          const detail = chrome.runtime?.lastError?.message;
          fail(detail?.includes("not found") || detail?.includes("forbidden")
            ? "Install the Windows listening companion for this FLUX folder."
            : "The local FLUX listening companion disconnected.");
        });
        port.onMessage.addListener((reply) => {
          if (!active || failed) return;
          if (reply.type === "ready") {
            if (reply.protocol === 1) setStatus("listening");
            else fail("Update the local FLUX listening companion.");
            return;
          }
          if (reply.id !== pending?.id) return;
          if (reply.type === "loading") {
            setStatus("loading");
            return;
          }
          const current = pending.generation === generation;
          pending = undefined;
          if (reply.type === "error") {
            fail(reply.message);
            return;
          }
          if (current && settings.current.playing)
            setResult({ sounds: reply.sounds, lines: reply.lines });
          setStatus("listening");
        });
        port.postMessage({ type: "hello" });
        if (context!.sampleRate !== 44100 && context!.sampleRate !== 48000)
          throw Error("Local listening needs 44.1 or 48 kHz browser audio.");
        await context!.audioWorklet.addModule(
          new URL("listening-capture.js", location.href).href,
        );
        if (!active || failed) return;
        input = context!.createMediaStreamSource(stream!);
        capture = new AudioWorkletNode(context!, "flux-listening-capture");
        mute = context!.createGain();
        mute.gain.value = 0;
        input.connect(capture);
        capture.connect(mute).connect(context!.destination);
        reset.current = () => {
          generation++;
          capture?.port.postMessage("reset");
        };
        capture.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
          if (!active || pending || !settings.current.playing) return;
          const id = ++serial;
          pending = { id, generation };
          try {
            port!.postMessage({
              type: "analyze",
              id,
              voices: settings.current.mode,
              rate: context!.sampleRate,
              audio: encode(data),
            });
          } catch {
            fail("Could not send audio to the local listening companion.");
          }
        };
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : "Could not start local listening.");
      }
    }
    void setup();
    return () => {
      active = false;
      stopAudio();
      port?.disconnect();
    };
  }, [enabled, context, stream, attempt]);

  return { status, error, result, retry: () => setAttempt((value) => value + 1) };
}

export type LocalListening = ReturnType<typeof useLocalListening>;
