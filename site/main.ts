import gsap from "gsap";
import { AudioEngine } from "../src/audio";
import { defaults } from "../src/settings";
import { mountGraphics } from "../src/graphics";
import demo from "../public/phase-zero.wav?url";
import "./gallery";

const play = document.querySelector<HTMLButtonElement>("#play-demo")!;
const live = document.querySelector("#demo-state")!;
const stage = document.querySelector<HTMLElement>(".instrument-stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#visualizer")!;
const modes = [...document.querySelectorAll<HTMLButtonElement>("[data-scene]")];
const engine = new AudioEngine();
const settings = { ...defaults, camera: 0.22, density: 0.72 };
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let scene = 0;
let transition: gsap.core.Timeline | undefined;
let stageInView = true;
const stageObserver = new IntersectionObserver(([entry]) => {
  stageInView = entry.isIntersecting;
});
stageObserver.observe(stage);

try {
  mountGraphics(canvas, engine, () => ({
    scene, settings, reduced: reduced.matches,
    albumColors: ["#5b84bb", "#baadf9", "#e5f2ff"],
  }), () => {}, () => stageInView && !document.hidden);
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
  if (stage.dataset.ready)
    live.textContent = playing ? "Audio reactive" : scene === 5 ? "Press Play to animate Spectrum" : "Ready to play";
}
engine.media.addEventListener("play", syncPlayback);
engine.media.addEventListener("pause", syncPlayback);
async function startDemo() {
  if (play.disabled || !engine.media.paused) return;
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
}
play.addEventListener("click", () => {
  if (engine.media.paused) void startDemo();
  else engine.media.pause();
});
play.hidden = false;
document.querySelector<HTMLElement>("#online-demo")!.hidden = true;

function showScene(next: number) {
  scene = next;
  modes.forEach((mode) => mode.setAttribute("aria-pressed", String(Number(mode.dataset.scene) === next)));
  syncPlayback();
}

if (stage.dataset.ready) {
  const gallerySpectrum = document.querySelector<HTMLButtonElement>("#gallery-spectrum")!;
  gallerySpectrum.hidden = false;
  gallerySpectrum.addEventListener("click", () => {
    transition?.kill();
    transition = undefined;
    gsap.set(canvas, { opacity: 1 });
    showScene(5);
    void startDemo();
    document.querySelector("#demo")?.scrollIntoView({
      behavior: reduced.matches ? "instant" : "smooth",
    });
  });
}

for (const button of modes) {
  button.addEventListener("click", () => {
    const next = Number(button.dataset.scene);
    if (transition || next === scene) return;
    if (reduced.matches) {
      showScene(next);
      return;
    }
    transition = gsap.timeline({ onComplete: () => { transition = undefined; } })
      .to(canvas, { opacity: 0, duration: 0.16, ease: "power2.in" })
      .call(() => showScene(next))
      .to(canvas, { opacity: 1, duration: 0.46, ease: "power3.out" });
  });
}

gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
  gsap.timeline({ defaults: { ease: "power3.out", duration: 0.75 } })
    .from(".instrument", { autoAlpha: 0, scale: 0.94, duration: 1.2 }, 0)
    .from(".hero h1 span", { autoAlpha: 0, y: 26, stagger: 0.08 }, 0.16)
    .from(".hero .kicker, .intro, .hero-actions", { autoAlpha: 0, y: 12, stagger: 0.06 }, 0.32);
});
