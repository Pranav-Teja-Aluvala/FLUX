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
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["link.js"],
  });
  await chrome.action.setBadgeText({ tabId: tab.id, text: "ON" });
  await chrome.action.setBadgeBackgroundColor({
    tabId: tab.id,
    color: "#50684e",
  });
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== "complete" || !youtube(tab.url)) return;
  void chrome.storage.session
    .get("tabId")
    .then((value) => {
      if (value.tabId === tabId)
        return chrome.scripting.executeScript({
          target: { tabId },
          files: ["link.js"],
        });
    })
    .catch(() => {});
});

async function snapshot(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!youtube(tab.url)) return null;
  const [row] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: readPlayer,
  });
  return row?.result ?? null;
}
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (
    message?.type !== "flux:read-player" ||
    !sender.url?.startsWith("https://pranav-teja-aluvala.github.io/FLUX/")
  )
    return false;
  void chrome.storage.session
    .get("tabId")
    .then(({ tabId }) => (typeof tabId === "number" ? snapshot(tabId) : null))
    .then(reply, () => reply(null));
  return true;
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    message?.type !== "flux:push-player" ||
    !sender.tab?.id ||
    !youtube(sender.url)
  )
    return false;
  void (async () => {
    const { tabId } = await chrome.storage.session.get("tabId");
    if (sender.tab.id !== tabId) return false;
    const item = await snapshot(tabId);
    if (item)
      await fetch("http://127.0.0.1:38147/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(1600),
      }).catch(() => {});
    return true;
  })().then(reply, () => reply(true));
  return true;
});
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
  let markerGroups;
  try {
    markerGroups =
      player.getPlayerResponse?.()?.playerOverlays?.playerOverlayRenderer
        ?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar
        ?.multiMarkersPlayerBarRenderer?.markersMap;
  } catch {
    /* The public DOM remains available when the player internals change. */
  }
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
  // Description timestamps often sit in inline spans. Match complete lines.
  const description = document.querySelector(
    "#description-inline-expander #description, #description-inline-expander, #description",
  );
  if (!chapters.length && description)
    for (const line of description.innerText.split("\n")) {
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
  const cueText = Array.from(video.textTracks ?? [])
    .flatMap((track) =>
      Array.from(track.activeCues ?? []).map((cue) => cue.text ?? ""),
    )
    .join(" ")
    .trim();
  const caption =
    cueText ||
    [...player.querySelectorAll(".ytp-caption-segment")]
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
