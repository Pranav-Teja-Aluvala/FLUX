const { app, BrowserWindow, desktopCapturer, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const path = require("node:path");

let reader;
let current = null;
let readerError = "";
function stopReader() {
  reader?.kill();
  reader = undefined;
  current = null;
  readerError = "";
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
      !/^(window|screen):[\d:-]+$/.test(id)
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
      const source = (await sources()).find(
        (item) => item.id === captureId && item.name !== "FLUX",
      );
      respond(source ? { video: source, audio: "loopback" } : {});
    } catch {
      respond({});
    }
  });
  ipcMain.handle("flux:now-playing", (event) => {
    if (event.sender !== content || process.platform !== "win32")
      return { track: null };
    if (!reader && !readerError) {
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
      });
      child.stderr.resume();
      child.on("error", () => {
        if (reader === child)
          readerError = "Windows media service could not start.";
      });
      child.on("exit", () => {
        if (reader === child)
          readerError =
            "Windows media service stopped. Restart Desktop audio to reconnect.";
      });
    }
    return { track: current, error: readerError };
  });
  ipcMain.on("flux:stop-reading", (event) => {
    if (event.sender === content) stopReader();
  });
  window.on("closed", stopReader);
  await window.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
