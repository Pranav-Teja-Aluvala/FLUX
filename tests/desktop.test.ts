import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { exactRecording } from "../src/lyrics";
const { pickCaptureSource } = createRequire(import.meta.url)(
  "../desktop/source.cjs",
);
test("desktop capture prefers the unique playing window and falls back to the primary display", () => {
  const sources = [
    { id: "screen:0:0", name: "Display A", display_id: "52" },
    { id: "screen:1:0", name: "Display B", display_id: "93" },
    { id: "window:42:0", name: "FLUX" },
    { id: "window:44:0", name: "Album Song - Google Chrome" },
  ];
  assert.equal(
    pickCaptureSource(sources, "", { title: "Album Song" }, "93").id,
    "window:44:0",
  );
  assert.equal(pickCaptureSource(sources, "", null, "93").id, "screen:1:0");
  assert.equal(
    pickCaptureSource(sources, "screen:0:0", { title: "Album Song" }, "93").id,
    "screen:0:0",
  );
  assert.equal(
    pickCaptureSource(sources, "window:42:0", null, "93").id,
    "screen:1:0",
  );
});
test("automatic lyrics select only a matching recording and skip a long mix", () => {
  const recording = {
    id: 1,
    trackName: "Album Song",
    artistName: "An Artist",
    albumName: "A",
    duration: 191,
    syncedLyrics: "[00:00]Test",
  };
  assert.equal(
    exactRecording([recording], "Album Song", "An Artist", 192),
    recording,
  );
  assert.equal(
    exactRecording([recording], "Album Song", "An Artist", 1900),
    undefined,
  );
  assert.equal(
    exactRecording([recording], "Album Song", "Another Artist", 191),
    undefined,
  );
});

test("automatic matching with a missing artist needs an unambiguous title and duration", () => {
  const match = {
    id: 1,
    trackName: "Song",
    artistName: "First Musician",
    albumName: "",
    duration: 120,
    syncedLyrics: "[00:00]Line",
  };
  assert.equal(exactRecording([match], "Song", "", 120), match);
  assert.equal(
    exactRecording(
      [match, { ...match, artistName: "Second Musician" }],
      "Song",
      "",
      120,
    ),
    undefined,
  );
});
