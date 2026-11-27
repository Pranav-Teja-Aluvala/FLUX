function folded(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Only prefer a window whose title contains the reported track title.
function pickCaptureSource(sources, selectedId, track, primaryDisplayId) {
  const eligible = sources.filter(({ name }) => name !== "FLUX");
  const explicit = eligible.find(({ id }) => selectedId && id === selectedId);
  if (explicit) return explicit;
  const title = folded(track?.title);
  const windows = eligible.filter(
    ({ id, name }) =>
      id.startsWith("window:") &&
      title.length >= 4 &&
      (" " + folded(name) + " ").includes(" " + title + " "),
  );
  if (windows.length === 1) return windows[0];
  const displays = eligible.filter(({ id }) => id.startsWith("screen:"));
  return (
    displays.find(({ display_id }) => display_id === primaryDisplayId) ||
    displays[0]
  );
}
module.exports = { pickCaptureSource };
