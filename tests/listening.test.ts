import test from "node:test";
import assert from "node:assert/strict";
import { currentLine, parseLrc } from "../src/lyrics";
import { paletteFromPixels } from "../src/desktop";

test("LRC sorts repeat tags, keeps silence markers, and applies millisecond offset", () => {
  const lines = parseLrc(
    "[ar:Demo]\n[offset:500]\n[00:03.5][00:01.20]First\n[00:06.00]\n[02:99.0]Invalid",
  );
  assert.deepEqual(lines, [
    { time: 0.7, text: "First" },
    { time: 3, text: "First" },
    { time: 5.5, text: "" },
  ]);
  assert.equal(currentLine(lines, 0.5), -1);
  assert.equal(currentLine(lines, 3), 1);
  assert.equal(currentLine(lines, 5.5), 2);
  assert.equal(currentLine(lines, 0.8), 0);
});
test("video palette changes when the dominant pixels change", () => {
  const red = paletteFromPixels(new Uint8ClampedArray([220, 40, 30, 255]));
  const blue = paletteFromPixels(new Uint8ClampedArray([35, 40, 220, 255]));
  assert.equal(red[0], "#dc281e");
  assert.equal(blue[0], "#2328dc");
});

import { boundedCrop, contentCrop } from "../src/media-preview";
test("crop trims clipped edges and rejects bogus regions", () => {
  assert.deepEqual(boundedCrop({ x: -0.25, y: 0.25, w: 0.5, h: 1 }), {
    x: 0,
    y: 0.25,
    w: 0.25,
    h: 0.75,
  });
  assert.equal(boundedCrop({ x: 1.2, y: 0, w: 1, h: 1 }), null);
  assert.equal(boundedCrop({ x: NaN, y: 0, w: 1, h: 1 }), null);
  const data = new Uint8ClampedArray(100 * 100 * 4);
  for (let y = 33; y < 69; y++)
    for (let x = 36; x < 61; x++)
      data.set([230, 30, 130, 255], (y * 100 + x) * 4);
  const crop = contentCrop(data, 100, 100)!;
  assert.ok(
    crop &&
      crop.x < 0.36 &&
      crop.y < 0.33 &&
      crop.x + crop.w > 0.6 &&
      crop.w < 0.5,
  );
});
