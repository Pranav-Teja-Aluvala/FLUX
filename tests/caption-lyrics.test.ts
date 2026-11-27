import assert from "node:assert/strict";
import test from "node:test";
import {
  captionFragment, cueParts, matchCaptionLyrics, shortCaption, songCandidates,
} from "../src/caption-lyrics";

const recording = {
  id: 1,
  trackName: "Under Glass",
  artistName: "Fixture",
  albumName: "",
  duration: 45,
  syncedLyrics: "[00:10]Wet leaves gather in the yard\n[00:16]The window sees another morning\n[00:19]Steam covers the glass\n[00:30]Far away from here",
};

test("rolling caption snapshots only add new text and remain compact", () => {
  assert.equal(captionFragment("The window sees", "window sees another morning"), "another morning");
  assert.equal(captionFragment("Wet leaves gather", "wet leaves gather"), "");
  assert.equal(shortCaption("one two three four five six seven eight nine ten eleven twelve thirteen").split(" ").length, 12);
});

test("caption timestamps confirm a slowed edit and constrain the synced portion", () => {
  assert.deepEqual(songCandidates("Intro x Under Glass Slowed (Fixture)"), ["Intro", "Under Glass"]);
  const observations = [
    { text: "Wet leaves gather in the yard", time: 20 },
    { text: "The window sees another morning", time: 27.5 },
  ];
  const match = matchCaptionLyrics([recording], observations, 52);
  assert.equal(match?.recording.trackName, "Under Glass");
  assert.deepEqual(match?.lines.map((line) => line.time), [20, 27.5, 31.25]);
  assert.equal(matchCaptionLyrics([recording], [observations[0]], 52), undefined);
  assert.equal(matchCaptionLyrics(
    [recording, { ...recording, id: 2, trackName: "Another song" }], observations, 52,
  ), undefined);
});

test("uses WebVTT's authored timing for words or groups", () => {
  assert.deepEqual(cueParts({
    start: 11, end: 14, text: "<c>One</c> <00:11.500>two <00:12.500>three",
  }), [{ time: 11, text: "One " }, { time: 11.5, text: "two " }, { time: 12.5, text: "three" }]);
});
