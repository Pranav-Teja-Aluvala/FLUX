import {
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  unlink,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dest = resolve(process.argv[2] ?? resolve(root, "dist-extension"));
const build = resolve(root, "dist");
const manifest = JSON.parse(
  await readFile(resolve(root, "extension", "manifest.json"), "utf8"),
);
await mkdir(dest, { recursive: true });
// Prune only our generated hashed bundles when updating an installed folder.
const assets = resolve(dest, "assets");
const currentFiles = new Set(await readdir(resolve(build, "assets")));
await mkdir(assets, { recursive: true });
for (const old of await readdir(assets, { withFileTypes: true })) {
  if (
    old.isFile() &&
    /^(?:index|graphics)-[\w-]+\.(?:js|css)$/.test(old.name) &&
    !currentFiles.has(old.name)
  ) {
    await unlink(resolve(assets, old.name));
  }
}
await cp(build, dest, {
  recursive: true,
});
await copyFile(
  resolve(root, "extension", "background.js"),
  resolve(dest, "background.js"),
);
await copyFile(
  resolve(root, "browser-helper", "player.js"),
  resolve(dest, "player.js"),
);
await copyFile(
  resolve(root, "extension", "manifest.json"),
  resolve(dest, "manifest.json"),
);
const companionFiles = ["Install-Listening.ps1", "Launcher.cs", "host.py", "requirements.txt"];
await mkdir(resolve(dest, "listening"), { recursive: true });
for (const file of companionFiles)
  await copyFile(resolve(root, "listening", file), resolve(dest, "listening", file));
for (const icon of Object.values(manifest.icons)) {
  await copyFile(resolve(root, "extension", icon), resolve(dest, icon));
}
console.log("FLUX " + manifest.version + " extension: " + dest);
