const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
} = require("electron");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const path = require("node:path");
const { pickCaptureSource } = require("./source.cjs");

let reader;
let current = null;
let readerError = "";
let firstSample;
let previewKind;
function stopReader() {
  reader?.kill();
  reader = undefined;
  current = null;
  readerError = "";
  firstSample = undefined;
  previewKind = undefined;
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    title: "FLUX",
    width: 1440,
    height: 920,
    backgroundColor: "#101111",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });
  const content = window.webContents;
  let captureId = "";
  const sources = () =>
    desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 0, height: 0 },
    });
  ipcMain.handle("flux:list-sources", async (event) => {
    if (event.sender !== content || process.platform !== "win32") return [];
    return (await sources())
      .filter((source) => source.name !== "FLUX")
      .map(({ id, name }) => ({ id, name }));
  });
  ipcMain.handle("flux:select-source", (event, id) => {
    if (
      event.sender !== content ||
      typeof id !== "string" ||
      (id !== "" && !/^(window|screen):[\d:-]+$/.test(id))
    )
      return false;
    captureId = id;
    return true;
  });
  content.setWindowOpenHandler(() => ({ action: "deny" }));
  content.on("will-navigate", (event) => event.preventDefault());
  content.session.setDisplayMediaRequestHandler(async (request, respond) => {
    if (
      process.platform !== "win32" ||
      !request.userGesture ||
      request.frame !== content.mainFrame
    )
      return respond({});
    try {
      startReader();
      if (!captureId && firstSample) {
        let timer;
        try {
          await Promise.race([
            firstSample,
            new Promise((resolve) => {
              timer = setTimeout(resolve, 1250);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      const source = pickCaptureSource(
        await sources(),
        captureId,
        current,
        String(screen.getPrimaryDisplay().id),
      );
      if (!source) {
        stopReader();
        return respond({});
      }
      previewKind =
        !captureId && source.id.startsWith("screen:")
          ? "automatic-display"
          : "selected-video";
      respond({ video: source, audio: "loopback" });
    } catch {
      stopReader();
      respond({});
    }
  });
  function startReader() {
    if (!reader && !readerError) {
      let ready;
      firstSample = new Promise((resolve) => {
        ready = resolve;
      });
      reader = spawn(
        path.join(
          process.env.SystemRoot || "C:/Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(__dirname, "now-playing.ps1"),
        ],
        { windowsHide: true },
      );
      const child = reader;
      createInterface({ input: child.stdout }).on("line", (line) => {
        if (reader !== child) return;
        try {
          current = JSON.parse(line);
        } catch {
          current = null;
        }
        ready();
      });
      child.stderr.resume();
      child.on("error", () => {
        ready();
        if (reader === child)
          readerError = "Windows media service could not start.";
      });
      child.on("exit", () => {
        ready();
        if (reader === child)
          readerError =
            "Windows media service stopped. Restart Desktop audio to reconnect.";
      });
    }
  }
  ipcMain.handle("flux:now-playing", (event) => {
    if (event.sender !== content || process.platform !== "win32")
      return { track: null };
    startReader();
    return { track: current, error: readerError, previewKind };
  });
  ipcMain.on("flux:stop-reading", (event) => {
    if (event.sender === content) stopReader();
  });
  window.on("closed", stopReader);
  await window.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
