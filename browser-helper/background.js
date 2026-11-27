function youtube(url) {
  try {
    const host = new URL(url).hostname;
    return host === "www.youtube.com" || host === "music.youtube.com";
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!youtube(tab.url)) return;
  await chrome.storage.session.set({ tabId: tab.id });
  await chrome.action.setBadgeText({ tabId: tab.id, text: "ON" });
  await chrome.action.setBadgeBackgroundColor({
    tabId: tab.id,
    color: "#50684e",
  });
});

chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (
    message?.type !== "flux:read-player" ||
    !sender.url?.startsWith("https://pranav-teja-aluvala.github.io/FLUX/")
  )
    return false;
  void (async () => {
    const { tabId } = await chrome.storage.session.get("tabId");
    if (typeof tabId !== "number") return null;
    const tab = await chrome.tabs.get(tabId);
    if (!youtube(tab.url)) return null;
    const [row] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: readPlayer,
    });
    return row?.result ?? null;
  })().then(reply, () => reply(null));
  return true;
});

function readPlayer() {
  const player = document.querySelector("#movie_player");
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
  const x = clamp(r.left + (r.width - width) / 2, 0, innerWidth),
    y = clamp(r.top + (r.height - height) / 2, 0, innerHeight);
  const crop =
    width > 0 && height > 0
      ? {
          x: x / innerWidth,
          y: y / innerHeight,
          w: Math.min(width, innerWidth - x) / innerWidth,
          h: Math.min(height, innerHeight - y) / innerHeight,
        }
      : null;
  const chapters = [];
  const markerGroups =
    player.getPlayerResponse?.()?.playerOverlays?.playerOverlayRenderer
      ?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar
      ?.multiMarkersPlayerBarRenderer?.markersMap;
  for (const group of markerGroups ?? [])
    for (const entry of group.value?.chapters ?? []) {
      const marker = entry.chapterRenderer;
      const title =
        marker?.title?.simpleText ??
        marker?.title?.runs?.map((run) => run.text).join("") ??
        "";
      const start = Number(marker?.timeRangeStartMillis) / 1000;
      if (title && Number.isFinite(start)) chapters.push({ start, title });
    }
  for (const link of document.querySelectorAll(
    "#description a, ytd-macro-markers-list-item-renderer a",
  )) {
    const stamp = link.textContent.trim();
    if (!/^\d{1,2}(?::\d{2}){1,2}$/.test(stamp)) continue;
    const start = stamp.split(":").reduce((sum, n) => sum * 60 + Number(n), 0);
    const line =
      link.parentElement.innerText
        .split("\n")
        .find((line) => line.includes(stamp)) || "";
    const title = line
      .replace(stamp, "")
      .replace(/^\s*[-–—:|]+\s*/, "")
      .trim();
    if (title.length > 2 && title.length < 160 && start < video.duration)
      chapters.push({ start, title });
  }
  chapters.sort((a, b) => a.start - b.start);
  const chapter = chapters.findLast((item) => item.start <= video.currentTime);
  const next = chapter && chapters.find((item) => item.start > chapter.start);
  const header = document
    .querySelector("h1.ytd-watch-metadata, h1.ytd-video-primary-info-renderer")
    ?.textContent.trim();
  const activeChapter = player
    .querySelector(".ytp-chapter-title-content")
    ?.textContent.trim();
  const name =
    chapter?.title ||
    activeChapter ||
    navigator.mediaSession.metadata?.title ||
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
    (chapter || activeChapter
      ? ""
      : navigator.mediaSession.metadata?.artist || channel);
  const caption = [...player.querySelectorAll(".ytp-caption-segment")]
    .map((el) => el.textContent)
    .join(" ")
    .trim();
  const start = chapter?.start ?? 0;
  return {
    title: pair?.[2] || name,
    artist,
    album: "",
    cover: null,
    playing: !video.paused,
    position: video.currentTime - start,
    duration: (next?.start ?? video.duration) - start,
    sampledAt: Date.now(),
    rate: video.playbackRate,
    crop,
    caption,
  };
}
