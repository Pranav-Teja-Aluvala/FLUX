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

## Windows desktop mode

Use this mode for FLUX to read the current Windows media session and follow its album artwork. Windows 10 version 1809 or later (or Windows 11) and an up-to-date Node installation are required.

~~~sh
npm ci
npm run desktop
~~~

Play music in your usual player, then select **Desktop audio** in FLUX. The first launch downloads the Electron runtime. FLUX reads metadata and artwork from the active Windows media session, with audio captured from Windows loopback. Audio from other apps using the same output can also affect the visualization. Use **Stop desktop** to stop capture and metadata polling. Turn off **Follow album artwork** in Studio to keep your chosen palette.

Players decide what they publish to Windows. When a player provides a title but no cover, FLUX displays the title and uses the selected scene palette. The hosted browser build can capture shared audio from a tab or screen when offered by the browser. Windows song detection and cover colors are available in the Windows app.
