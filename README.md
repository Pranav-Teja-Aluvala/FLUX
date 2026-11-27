# FLUX — Music you can see

FLUX is a browser instrument for turning sound into real-time WebGL environments. Open a local track, enable the microphone, or play **Phase Zero**, the included original synth loop.

![FLUX studio showing Singularity](public/studio.png)

## Studio

- **Singularity** expands a GPU particle sphere with bass and scatters particles with treble.
- **Dreamscape** shifts procedural terrain using bass and midrange.
- **Hyperspace** accelerates through geometric rings and changes their color on detected beats.
- **Liquid** warps an iridescent domain with a fragment shader.
- **Constellation** deforms connected stars and changes connection reach with midrange.
- **Chromatic** maps FFT bins to instanced radial geometry. Its three compositions live in Studio.

Open **Studio** for palette, motion, sensitivity and render controls. Custom presets are stored on the device in IndexedDB and can be exchanged as versioned JSON. Use **1–6** to pick a scene, **Space** for playback, and **F** or **Escape** for cinematic mode. Drag the stage in the spatial scenes. Use **PNG** or **Rec** to capture the stage. Video includes audio where supported. Stop microphone input after use from the transport controls.

## Development

Requires Node 22.12+ (or Node 24).

~~~sh
npm ci
npm run dev
npm test
npm run build
~~~

React and TypeScript handle the studio controls. Three.js and GLSL render outside React's render cycle. The audio engine reuses FFT and waveform buffers, estimates beat onsets from a rolling bass baseline, and never routes the microphone to the speakers. The graphics chunk loads on demand and reduces pixel ratio and point count when frame rate drops. Audio and presets are processed locally. Serve the build over HTTPS for microphone input.

Beat detection is approximate. Capture formats depend on browser codecs. Reduced motion freezes automatic camera and procedural travel while preserving the connection to live sound. There is no requirement to upload audio or sign in.

To regenerate the original demo, run the Python standard-library script from the repository root.

~~~sh
python generate-demo.py
~~~
