# FLUX — Music you can see

FLUX is a browser instrument for turning sound into real-time WebGL environments. Open a local track, enable the microphone, or play **Phase Zero**, the included original synth loop.

## Standalone Chrome extension

Build the extension with `npm ci` and `npm run extension`, or use the supplied prebuilt folder. Open `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked** and select the folder containing `manifest.json`. On a YouTube video, click **FLUX** in the toolbar. FLUX opens its own tab and plays the captured audio there. Closing FLUX releases the capture and restores playback to the source tab.

The extension opens a lyrics-first theater with the video thumbnail as its backdrop and Singularity colored by the artwork. The compact footer shows the track, progress, and playback controls. The linked tab supplies audio, track metadata, timing, and available captions. Click a timed lyric to seek the source. **Space** toggles playback and **F** switches fullscreen.

FLUX removes YouTube upload labels such as “Official Video” before looking up the recording on LRCLIB. It keeps alternate-version labels and checks the duration before displaying timed lyrics. Use **Retry lyrics** if the service is temporarily unavailable. When a recording has no match, FLUX can use the player’s captions or on-device captioning on supported Chrome setups.

For an existing unpacked installation, refresh the same folder through Chrome’s extension page and accept the thumbnail host permission.

[Browser and Windows versions are documented below.](#listening-view)

## Listening view

**Desktop audio** starts the listening view. FLUX shows the cropped video or cover on the left, Singularity in the middle, and current lyrics on the right. Press **Escape** or use **Show controls** to return to the dock.

- **Chrome** uses FLUX YouTube Link to capture the linked tab. This uses Chrome's extension tab capture, without the screen-sharing banner. Chrome keeps its tab capture indicator. If you have an existing screen share from an older version, stop that share before using Desktop audio.
- **Windows** uses Windows system audio capture, and the same helper can provide the linked tab's song, chapter, and playback position.

### YouTube Link for Chrome

Download and extract **FLUX-YouTube-Link.zip** from the latest release. In Chrome, open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked** with the extracted `browser-helper` folder. If you already installed it, replace the old folder contents, reload the extension, and approve its new tab-capture permission. Click the helper icon on the music tab once, then select **Desktop audio** in FLUX. The helper follows the linked tab as it plays, pauses, seeks, or changes tracks.

FLUX first uses the matching timed lyrics from LRCLIB. If those are unavailable, it displays captions from the linked YouTube player or on-device speech recognition, when supported. The first on-device session might require an English language pack. Select **Enable on-device captions** if prompted. These generated captions can mishear sung words, particularly over loud instruments. Audio and video stay on your device. Only song metadata is sent to the lyrics lookup.

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

Players decide what they publish to Windows. When a player provides a title but no cover, FLUX displays the title and uses the selected scene palette. The hosted browser build captures a linked YouTube tab through the helper. Windows song detection and cover colors are available in the Windows app.
