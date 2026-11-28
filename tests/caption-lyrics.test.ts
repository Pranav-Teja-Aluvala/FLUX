import assert from "node:assert/strict";
import test from "node:test";
import { browserCaptionLocale, captionLanguage, captionLanguages } from "../src/caption-language";
import {
  captionFragment, cueParts, matchCaptionLyrics, shortCaption, songCandidates,
  timedCaptionWindow,
} from "../src/caption-lyrics";

const recording = {
  id: 1,
  trackName: "Under Glass",
  artistName: "Fixture",
  albumName: "",
  duration: 45,
  syncedLyrics: "[00:10]Wet leaves gather in the yard\n[00:16]The window sees another morning\n[00:19]Steam covers the glass\n[00:30]Far away from here",
};

test("caption language selection supports the multilingual model and browser locales", () => {
  assert.equal(captionLanguages.length, 100);
  assert.equal(captionLanguage("te"), "te");
  assert.equal(captionLanguage("unknown"), "auto");
  assert.equal(browserCaptionLocale("auto", "es-419"), "es-419");
  assert.equal(browserCaptionLocale("te", "en-US"), "te-IN");
  assert.equal(browserCaptionLocale("zh", "zh-TW"), "zh-TW");
  assert.equal(browserCaptionLocale("jw", "en-US"), "jv-ID");
});

test("non-Latin lyric matching preserves vowel signs and supports scripts without spaces", () => {
  for (const [first, second] of [
    ["ఈ రోజు మనం పాట పాడదాం", "తెల్లవారితే మళ్లీ మనం కలుద్దాం"],
    ["明天早上我们一起去公园", "晚上回家以后大家一起唱歌"],
  ]) {
    const lyrics = { ...recording, syncedLyrics: `[00:10]${first}\n[00:16]${second}` };
    const match = matchCaptionLyrics([lyrics], [{ text: first, time: 20 }, { text: second, time: 27.5 }], 52);
    assert.deepEqual(match?.lines.map((line) => line.text), [first, second]);
  }
  const tokens = timedCaptionWindow({
    start: 0, end: 3, text: "明天<00:01.000>早上",
  }, 1);
  assert.deepEqual(tokens.map(({ text, spaceBefore }) => [text, spaceBefore]), [["明天", false], ["早上", false]]);
});

test("rolling caption snapshots only add new text and remain compact", () => {
  assert.equal(captionFragment("The window sees", "window sees another morning"), "another morning");
  assert.equal(captionFragment("Wet leaves gather", "wet leaves gather"), "");
  assert.equal(
    shortCaption("one two three four five six seven eight nine ten eleven twelve thirteen"),
    "six seven eight nine ten eleven twelve thirteen",
  );
  assert.equal(shortCaption("x".repeat(500)).length, 96);
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

test("long timed captions show a short window that advances on authored timestamps", () => {
  const cue = {
    start: 11, end: 19,
    text: "one two three four five six seven eight <00:14.500>nine ten eleven",
  };
  assert.equal(timedCaptionWindow(cue, 14.4).at(-1)?.text, "eight");
  assert.deepEqual(timedCaptionWindow(cue, 14.5).map((part) => part.text), ["nine", "ten", "eleven"]);
  assert.deepEqual(timedCaptionWindow(cue, 19), []);
});
