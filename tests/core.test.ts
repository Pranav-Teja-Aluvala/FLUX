import test from "node:test";
import assert from "node:assert/strict";
import { band } from "../src/audio";
import { defaults, parsePreset } from "../src/settings";
test("FFT band isolates a signal at the expected frequency", () => {
  const fft = new Uint8Array(1024);
  fft[6] = 255;
  assert.ok(band(fft, 20, 25, 180) > 0);
  assert.equal(band(fft, 20, 180, 2500), 0);
  assert.equal(band(fft, 20, 2500, 12500), 0);
});
test("preset clamps controls and discards unknown fields", () => {
  const preset = parsePreset({
    version: 1,
    name: " Aurora ",
    scene: 1,
    settings: { density: 4, palette: 1.6, extra: true },
  });
  assert.equal(preset.name, "Aurora");
  assert.equal(preset.settings.density, 1);
  assert.equal(preset.settings.palette, 2);
  assert.equal(preset.settings.bloom, defaults.bloom);
  assert.equal("extra" in preset.settings, false);
});
test("preset refuses unsupported versions and invalid scenes", () => {
  for (const v of [
    null,
    { version: 2 },
    { version: 1, name: "a", scene: 6, settings: {} },
  ])
    assert.throws(() => parsePreset(v));
});
