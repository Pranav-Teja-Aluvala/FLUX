import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function worklet() {
  const packets: ArrayBuffer[] = [];
  class AudioWorkletProcessor {
    port = {
      onmessage: () => {},
      postMessage: (packet: ArrayBuffer) => packets.push(packet),
    };
  }
  type Capture = AudioWorkletProcessor & {
    process(inputs: Float32Array[][]): boolean;
  };
  let capture: Capture | undefined;
  runInNewContext(
    readFileSync(new URL("../public/listening-capture.js", import.meta.url), "utf8"),
    {
      AudioWorkletProcessor,
      sampleRate: 2,
      registerProcessor: (
        _name: string,
        Processor: new () => Capture,
      ) => {
        capture = new Processor();
      },
    },
  );
  assert.ok(capture);
  return { capture, packets };
}

test("listening worklet sends clipped interleaved stereo in five-second packets", () => {
  const { capture, packets } = worklet();
  capture.process([[new Float32Array(8)]]);
  assert.equal(packets.length, 0);
  capture.process([[Float32Array.of(2, -2), Float32Array.of(0.5, 0)]]);
  assert.equal(packets.length, 1);
  const samples = new Int16Array(packets[0]);
  assert.equal(samples.length, 20);
  assert.deepEqual([...samples.slice(-4)], [32767, 16384, -32767, 0]);
});

test("seeking discards partial audio and duplicates a mono input", () => {
  const { capture, packets } = worklet();
  capture.process([[Float32Array.of(1, 1, 1)]]);
  capture.port.onmessage();
  capture.process([[new Float32Array(9)]]);
  assert.equal(packets.length, 0);
  capture.process([[Float32Array.of(0.5)]]);
  assert.deepEqual(
    [...new Int16Array(packets[0])],
    [...Array(18).fill(0), 16384, 16384],
  );
});
