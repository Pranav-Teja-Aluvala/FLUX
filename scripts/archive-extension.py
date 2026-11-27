"""Create the Chrome download included in the static GitHub Pages build."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
source = root / "dist-extension"
destination = root / "dist-pages" / "downloads" / "FLUX-Chrome.zip"
if not (source / "manifest.json").is_file():
    raise SystemExit("Build the Chrome extension before creating its ZIP.")
destination.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_file():
            archive.write(file, Path("FLUX Chrome Extension") / file.relative_to(source))
with ZipFile(destination) as archive:
    if archive.testzip() is not None:
        raise SystemExit("The Chrome extension ZIP failed its integrity check.")
print(destination)
