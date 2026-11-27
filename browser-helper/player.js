function readPlayer() {
  const player = document.querySelector("#movie_player, ytmusic-player");
  const video = player?.querySelector("video");
  if (
    !video ||
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    player.classList.contains("ad-showing")
  )
    return null;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const r = video.getBoundingClientRect();
  const ratio = Math.min(
    r.width / video.videoWidth,
    r.height / video.videoHeight,
  );
  const width = video.videoWidth * ratio,
    height = video.videoHeight * ratio;
  const left = r.left + (r.width - width) / 2,
    top = r.top + (r.height - height) / 2;
  const x = clamp(left, 0, innerWidth),
    y = clamp(top, 0, innerHeight);
  const visibleWidth = clamp(left + width, 0, innerWidth) - x,
    visibleHeight = clamp(top + height, 0, innerHeight) - y;
  const crop =
    visibleWidth > 0 && visibleHeight > 0
      ? {
          x: x / innerWidth,
          y: y / innerHeight,
          w: visibleWidth / innerWidth,
          h: visibleHeight / innerHeight,
        }
      : null;
  const chapters = [];
  const response = playerResponse();
  const markerGroups =
    response?.playerOverlays?.playerOverlayRenderer
      ?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar
      ?.multiMarkersPlayerBarRenderer?.markersMap;
  for (const group of Array.isArray(markerGroups) ? markerGroups : [])
    for (const entry of group.value?.chapters ?? []) {
      const marker = entry.chapterRenderer;
      const title =
        marker?.title?.simpleText ??
        marker?.title?.runs?.map((run) => run.text).join("") ??
        "";
      const start = Number(marker?.timeRangeStartMillis) / 1000;
      if (title && Number.isFinite(start)) chapters.push({ start, title });
    }
  // Description timestamps often sit in inline spans. Match complete lines.
  const description = document.querySelector(
    "#description-inline-expander #description, #description-inline-expander, #description",
  );
  if (!chapters.length && description)
    for (const line of (description.innerText ?? "").split("\n")) {
      const match = line
        .trim()
        .match(/^(\d{1,2}(?::\d{2}){1,2})[\s–—:|.-]+(.{3,159})$/);
      if (!match) continue;
      const start = match[1]
        .split(":")
        .reduce((sum, n) => sum * 60 + Number(n), 0);
      if (start < video.duration)
        chapters.push({ start, title: match[2].trim() });
    }
  chapters.sort((a, b) => a.start - b.start);
  const chapter = chapters.findLast((item) => item.start <= video.currentTime);
  const next = chapter && chapters.find((item) => item.start > chapter.start);
  const header = document
    .querySelector("h1.ytd-watch-metadata, h1.ytd-video-primary-info-renderer")
    ?.textContent.trim();
  function playerResponse() {
    try {
      return player.getPlayerResponse?.();
    } catch {
      return undefined;
    }
  }
  const id = new URL(location.href).searchParams.get("v");
  const details = response?.videoDetails;
  if (id && details?.videoId && details.videoId !== id) return null;
  const metadata = navigator.mediaSession?.metadata;
  const name =
    chapter?.title ||
    metadata?.title ||
    details?.title ||
    header ||
    document.title.replace(/ - YouTube$/, "");
  const pair = name.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  const channel = (
    document.querySelector("#owner #channel-name a")?.textContent || ""
  )
    .trim()
    .replace(/\s+-\s+Topic$/, "");
  const artist =
    pair?.[1] ||
    (chapter ? "" : metadata?.artist || details?.author || channel);
  const activeCue = Array.from(video.textTracks ?? [])
    .filter((track) => track.kind === "captions" || track.kind === "subtitles")
    .flatMap((track) => Array.from(track.activeCues ?? []))
    .findLast((cue) => typeof cue.text === "string" && cue.text.trim());
  const caption =
    activeCue?.text.replace(/<[^>]*>/g, "") ||
    [...player.querySelectorAll(".ytp-caption-segment")]
      .map((el) => el.textContent)
      .join(" ")
      .trim()
      .slice(-500);
  const start = chapter?.start ?? 0;
  return {
    title: pair?.[2] || name,
    videoId: id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : undefined,
    chapterStart: start,
    artist,
    album: "",
    cover: null,
    playing: !video.paused && !video.ended,
    buffering: video.seeking || video.readyState < 3,
    position: video.currentTime - start,
    duration: (next?.start ?? video.duration) - start,
    sampledAt: Date.now(),
    rate: video.playbackRate,
    crop,
    caption,
    captionCue: activeCue && {
      start: activeCue.startTime - start,
      end: activeCue.endTime - start,
      text: activeCue.text.slice(0, 1200),
    },
  };
}
