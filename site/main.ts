import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AudioEngine } from "../src/audio";
import { defaults } from "../src/settings";
import { mountGraphics } from "../src/graphics";
import demo from "../public/phase-zero.wav?url";

gsap.registerPlugin(ScrollTrigger);

const play = document.querySelector<HTMLButtonElement>("#play-demo")!;
const live = document.querySelector("#demo-state")!;
const stage = document.querySelector<HTMLElement>(".instrument-stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#visualizer")!;
const modes = [...document.querySelectorAll<HTMLButtonElement>("[data-scene]")];
const engine = new AudioEngine();
const settings = { ...defaults, camera: 0.22, density: 0.72 };
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let scene = 0;
let changing = false;

try {
  mountGraphics(canvas, engine, () => ({
    scene, settings, reduced: reduced.matches,
    albumColors: ["#5b84bb", "#baadf9", "#e5f2ff"],
  }), () => {});
  stage.dataset.ready = "true";
  live.textContent = "Ready to play";
  document.querySelector<HTMLElement>(".mode-buttons")!.hidden = false;
} catch {
  live.textContent = "WebGL unavailable · audio demo available";
  modes.forEach((button) => { button.disabled = true; });
}

function syncPlayback() {
  const playing = !engine.media.paused;
  play.replaceChildren(playing ? "Pause demo " : "Play demo ");
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = playing ? "Ⅱ" : "▶";
  play.append(icon);
  play.setAttribute("aria-pressed", String(playing));
  if (stage.dataset.ready) live.textContent = playing ? "Audio reactive" : "Ready to play";
}
engine.media.addEventListener("play", syncPlayback);
engine.media.addEventListener("pause", syncPlayback);
play.addEventListener("click", async () => {
  if (!engine.media.paused) {
    engine.media.pause();
    return;
  }
  play.disabled = true;
  try {
    engine.volume(0.55);
    if (engine.media.src) await engine.play();
    else await engine.load(demo, true);
    if (!reduced.matches) gsap.fromTo(play, { scale: 0.96 }, { scale: 1, duration: 0.24 });
  } catch {
    live.textContent = "Audio could not play. Try again.";
  } finally {
    play.disabled = false;
  }
});
play.hidden = false;
document.querySelector<HTMLElement>("#online-demo")!.hidden = true;

for (const button of modes) {
  button.addEventListener("click", () => {
    const next = Number(button.dataset.scene);
    if (changing || next === scene) return;
    function switchScene() {
      scene = next;
      modes.forEach((mode) => mode.setAttribute("aria-pressed", String(mode === button)));
    }
    if (reduced.matches) {
      switchScene();
      return;
    }
    changing = true;
    gsap.timeline({ onComplete: () => { changing = false; } })
      .to(canvas, { opacity: 0, duration: 0.16, ease: "power2.in" })
      .call(switchScene)
      .to(canvas, { opacity: 1, duration: 0.46, ease: "power3.out" });
  });
}

gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
  gsap.timeline({ defaults: { ease: "power3.out", duration: 0.75 } })
    .from(".instrument", { autoAlpha: 0, scale: 0.94, duration: 1.2 }, 0)
    .from(".hero h1 span", { autoAlpha: 0, y: 26, stagger: 0.08 }, 0.16)
    .from(".hero .kicker, .intro, .hero-actions", { autoAlpha: 0, y: 12, stagger: 0.06 }, 0.32);
  gsap.from(".product-shot", {
    autoAlpha: 0, y: 44, duration: 0.72, ease: "power3.out",
    scrollTrigger: { trigger: ".product-shot", start: "top 86%", once: true },
  });
});
