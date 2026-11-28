const gallery = document.querySelector<HTMLElement>(".gallery")!;
const slides = [...gallery.querySelectorAll<HTMLElement>(".gallery-slide")];
const controls = gallery.querySelector<HTMLElement>(".gallery-controls")!;
const stage = gallery.querySelector<HTMLElement>(".gallery-stage")!;
const counter = gallery.querySelector<HTMLElement>("#gallery-position")!;
const toggle = gallery.querySelector<HTMLButtonElement>("#gallery-play")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let current = 0;
let playing = !reducedMotion.matches;
let inView = false;
let pointerOver = false;
let timer = 0;

function show(index: number) {
  slides[current].hidden = true;
  current = (index + slides.length) % slides.length;
  slides[current].hidden = false;
  counter.textContent = `${current + 1} / ${slides.length}`;
}

function syncTimer() {
  clearInterval(timer);
  const running = playing && inView && !pointerOver && !document.hidden;
  toggle.textContent = playing ? "Pause slideshow" : "Play slideshow";
  counter.setAttribute("aria-live", running ? "off" : "polite");
  if (running) timer = window.setInterval(() => show(current + 1), 6500);
}

for (const button of controls.querySelectorAll<HTMLButtonElement>("[data-gallery-step]")) {
  button.addEventListener("click", () => {
    playing = false;
    show(current + Number(button.dataset.galleryStep));
    syncTimer();
  });
}
toggle.addEventListener("click", () => {
  playing = !playing;
  syncTimer();
});
stage.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "touch") return;
  pointerOver = true;
  syncTimer();
});
stage.addEventListener("pointerleave", () => {
  pointerOver = false;
  syncTimer();
});
gallery.addEventListener("focusin", (event) => {
  if (event.target === toggle) return;
  playing = false;
  syncTimer();
});
document.addEventListener("visibilitychange", syncTimer);
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) playing = false;
  syncTimer();
});
new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (inView) {
    for (const slide of slides) slide.querySelector("img")!.loading = "eager";
  }
  syncTimer();
}, { threshold: 0.35 }).observe(gallery);
show(0);
controls.hidden = false;
syncTimer();
