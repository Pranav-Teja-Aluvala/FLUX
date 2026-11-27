# FLUX — Music you can see

FLUX is a browser instrument for turning sound into real-time WebGL environments. Open a local track, enable the microphone, or play **Phase Zero**, the included original synth loop.

![FLUX studio showing Singularity](public/studio.png)

## Listening view

**Desktop audio** starts the listening view. While audio plays, FLUX shows Singularity, the current lyrics when available, and a cropped live video frame or album cover. Press **Escape** or double-click the middle of the screen to bring the controls back. Chromatic remains alongside Singularity in the controls.

The Windows app captures system audio without a Chrome sharing banner. The browser edition uses Chrome's sharing picker and indicator. Choose the music tab so FLUX can frame the video. With the YouTube Link helper, FLUX crops at the player's edges and follows track changes using YouTube chapters or captions. Without it, FLUX can find centered artwork in many dark videos and still use it for color sampling.

On Windows or a linked YouTube tab, FLUX uses a matching title and duration, with the artist checked when provided to load timed lyrics automatically. If a video exposes captions, those can appear in the listening view too. A mix without named chapters, usable track metadata, or captions may have no automatic lyrics. You can still search or load an LRC when the controls are visible.

### YouTube Link for Chrome

Download and extract the helper from the latest release. In Chrome, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the extracted `browser-helper` folder. In YouTube, click the extension icon once to link that tab. Return to the FLUX website, select **Desktop audio**, and share that tab with audio. The helper follows chapter changes while the same tab stays linked.

The helper reads only the YouTube tab you explicitly link. FLUX uses LRCLIB for timed-lyrics matches, which sends song and artist text to that service. Audio, video, and pixel colors stay local.

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

Play music in your usual player, then select **Desktop audio**. The first launch downloads the Electron runtime. FLUX reads metadata and artwork from the active Windows media session, with audio captured from Windows loopback. Audio from other apps using the same output can also affect the visualization. Use **Stop desktop** to stop capture and metadata polling. Turn off **Use image colors** in Studio to keep your chosen palette.

Players decide what they publish to Windows. When a player provides a title but no cover, FLUX displays the title and uses the selected scene palette. The hosted browser build can capture shared audio from a tab or screen when offered by the browser. Windows song detection and cover colors are available in the Windows app.
