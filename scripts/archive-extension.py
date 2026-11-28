"""Create the Chrome download included in the static GitHub Pages build."""

from hashlib import file_digest
import json
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
source = root / "dist-extension"
destination = root / "dist-pages" / "downloads" / "FLUX-Chrome.zip"
manifest_file = source / "manifest.json"
if not manifest_file.is_file():
    raise SystemExit("Build the Chrome extension before creating its ZIP.")
manifest = json.loads(manifest_file.read_text(encoding="utf-8-sig"))
html = (source / "index.html").read_text(encoding="utf-8")
paths = {
    "LICENSE", "index.html", "manifest.json", "player.js",
    "listening-capture.js", "phase-zero.wav", "favicon.svg",
    "listening/Install-Listening.ps1", "listening/host.py",
    "listening/Launcher.cs", "listening/requirements.txt",
    manifest["background"]["service_worker"],
    *manifest["icons"].values(),
    *(file.relative_to(source).as_posix() for file in (source / "assets").glob("*") if file.is_file()),
}
if manifest["manifest_version"] != 3 or manifest["name"] != "FLUX":
    raise SystemExit("Unexpected extension manifest.")
if not all(path in paths for path in re.findall(r'["\']\./(assets/[^"\']+)', html)):
    raise SystemExit("Built extension HTML refers to missing assets.")
for path in paths:
    if not (source / path).is_file():
        raise SystemExit(f"Extension is missing {path}.")

destination.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        archive.write(source / path, Path("FLUX Chrome Extension") / path)
with ZipFile(destination) as archive:
    if archive.testzip() is not None:
        raise SystemExit("The Chrome extension ZIP failed its integrity check.")
with destination.open("rb") as bundle:
    digest = file_digest(bundle, "sha256").hexdigest()
destination.with_suffix(".zip.sha256").write_text(f"{digest}  {destination.name}\n", encoding="ascii")
print(destination)
