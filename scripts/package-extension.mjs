import { copyFile, cp, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dest = resolve(process.argv[2] ?? resolve(root, "dist-extension"));
const build = resolve(root, "dist");
const manifest = JSON.parse(
  await readFile(resolve(root, "extension", "manifest.json"), "utf8"),
);
await mkdir(dest, { recursive: true });
await cp(build, dest, {
  recursive: true,
  filter: (path) => !path.endsWith("studio.png"),
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
for (const icon of Object.values(manifest.icons)) {
  await copyFile(resolve(root, "extension", icon), resolve(dest, icon));
}
console.log("FLUX " + manifest.version + " extension: " + dest);
