import { useEffect, useRef, useState } from "react";
type Availability =
  "available" | "downloadable" | "downloading" | "unavailable";
type CaptionState =
  "idle" | "preparing" | "downloadable" | "listening" | "unavailable";
type SpeechResults = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};
type Recognizer = {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResults) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track: MediaStreamTrack): void;
  abort(): void;
};
type SpeechEngine = {
  new (): Recognizer;
  available(options: {
    langs: string[];
    processLocally: boolean;
  }): Promise<Availability>;
  install(options: {
    langs: string[];
    processLocally: boolean;
  }): Promise<boolean>;
};
const speechOptions = (language: string) => ({
  langs: [language], processLocally: true,
});
function getSpeech() {
  const ambient = window as Window & {
    SpeechRecognition?: SpeechEngine;
    webkitSpeechRecognition?: SpeechEngine;
  };
  const engine = ambient.SpeechRecognition ?? ambient.webkitSpeechRecognition;
  return engine &&
    typeof engine.available === "function" &&
    typeof engine.install === "function"
    ? engine
    : undefined;
}
export function useLocalCaptions(
  track: MediaStreamTrack | undefined,
  enabled: boolean,
  sourceKey?: string,
  language = "en-US",
) {
  const [text, setText] = useState(""),
    [state, setState] = useState<CaptionState>("idle"),
    [reload, setReload] = useState(0);
  const activeLanguage = useRef(language);
  activeLanguage.current = language;
  useEffect(() => {
    setText("");
    if (!track || !enabled) {
      setState("idle");
      return;
    }
    const engine = getSpeech();
    if (!engine) {
      setState("unavailable");
      return;
    }
    let done = false,
      restart = 0,
      expire = 0,
      recognizer: Recognizer | undefined;
    setState("preparing");
    function start() {
      if (done || track?.readyState !== "live") return;
      try {
        recognizer!.start(track);
      } catch {
        done = true;
        setState("unavailable");
      }
    }
    void engine.available(speechOptions(language)).then(
      (availability) => {
        if (done) return;
        if (availability !== "available") {
          setState(
            availability === "downloadable" || availability === "downloading"
              ? "downloadable"
              : "unavailable",
          );
          return;
        }
        recognizer = new engine();
        // Never fall back to a server recognition session.
        if (!("processLocally" in recognizer)) {
          setState("unavailable");
          return;
        }
        recognizer.processLocally = true;
        recognizer.lang = language;
        recognizer.continuous = true;
        recognizer.interimResults = true;
        recognizer.onresult = (event) => {
          if (done) return;
          const result =
            event.results[event.results.length - 1]?.[0]?.transcript.trim();
          if (result) {
            setText(result);
            window.clearTimeout(expire);
            expire = window.setTimeout(() => setText(""), 5200);
          }
        };
        recognizer.onerror = (event) => {
          if (!done && event.error !== "no-speech") {
            done = true;
            setText("");
            setState("unavailable");
          }
        };
        recognizer.onend = () => {
          if (!done) restart = window.setTimeout(start, 420);
        };
        setState("listening");
        start();
      },
      () => {
        if (!done) setState("unavailable");
      },
    );
    return () => {
      done = true;
      clearTimeout(restart);
      clearTimeout(expire);
      if (recognizer) {
        recognizer.onresult = recognizer.onerror = recognizer.onend = null;
        try {
          recognizer.abort();
        } catch {}
      }
    };
  }, [track, enabled, reload, sourceKey, language]);
  async function install() {
    const engine = getSpeech();
    if (!engine) return;
    setState("preparing");
    const installed = await engine.install(speechOptions(language)).catch(() => false);
    if (activeLanguage.current !== language) return;
    if (installed) setReload((v) => v + 1);
    else setState("unavailable");
  }
  return { text, state, install };
}
