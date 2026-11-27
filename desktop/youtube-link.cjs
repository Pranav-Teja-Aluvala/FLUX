const http = require("node:http");
const { createHash } = require("node:crypto");

const extensionId = createHash("sha256")
  .update(Buffer.from(require("../browser-helper/manifest.json").key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
const extensionOrigin = "chrome-extension://" + extensionId;
const PORT = 38147;
const MAX_BODY = 8192;

function decodeLink(data, now) {
  if (!data || typeof data !== "object") return null;
  const {
    title,
    artist,
    caption,
    position,
    duration,
    playing,
    rate,
    sampledAt,
  } = data;
  if (
    typeof title !== "string" ||
    title.length > 220 ||
    typeof artist !== "string" ||
    artist.length > 160 ||
    !Number.isFinite(position) ||
    position < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    position > duration + 2 ||
    !Number.isFinite(sampledAt) ||
    Math.abs(now - sampledAt) > 5000
  )
    return null;
  return {
    title,
    artist,
    album: "",
    cover: null,
    caption: typeof caption === "string" ? caption.slice(0, 800) : "",
    position,
    duration,
    playing: playing === true,
    rate: Number.isFinite(rate) && rate > 0 && rate <= 4 ? rate : 1,
    sampledAt,
    linked: true,
  };
}
function createYouTubeLink(port = PORT) {
  let enabled = false,
    current = null;
  const server = http.createServer((req, res) => {
    const allowed =
      req.headers.host === "127.0.0.1:" + port &&
      req.headers.origin === extensionOrigin;
    if (!allowed || req.url !== "/player") {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", extensionOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    if (!enabled) {
      res.writeHead(409).end();
      return;
    }
    let body = "",
      length = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      length += Buffer.byteLength(chunk);
      if (length > MAX_BODY) {
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!enabled) {
        res.writeHead(409).end();
        return;
      }
      try {
        const message = JSON.parse(body);
        const result = decodeLink(message, Date.now());
        if (!result) {
          res.writeHead(400).end();
          return;
        }
        current = result;
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
  });
  server.on("error", () => {
    current = null;
  });
  server.listen(port, "127.0.0.1");
  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      current = null;
    },
    latest() {
      return enabled && current && Date.now() - current.sampledAt < 3600
        ? current
        : null;
    },
    close() {
      server.close();
    },
  };
}
module.exports = { createYouTubeLink, decodeLink, extensionOrigin, PORT };
