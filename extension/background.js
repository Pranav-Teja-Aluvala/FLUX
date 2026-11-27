importScripts("player.js");

function youtube(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      ["www.youtube.com", "music.youtube.com"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const sourceId = youtube(tab.url) ? tab.id : null;
  if (sourceId !== null)
    await chrome.storage.session.set({ ["source-" + sourceId]: true });
  const page = chrome.runtime.getURL("index.html");
  const url = sourceId === null ? page : page + "?source=" + sourceId;
  const { viewId } = await chrome.storage.session.get("viewId");
  const view =
    typeof viewId === "number"
      ? await chrome.tabs.get(viewId).catch(() => null)
      : null;
  if (view?.url?.startsWith(page) && (sourceId === null || view.url === url)) {
    await chrome.tabs.update(view.id, { active: true });
    await chrome.windows.update(view.windowId, { focused: true });
    if (sourceId !== null) {
      const captures = await chrome.tabCapture.getCapturedTabs();
      const attached = captures.some(
        ({ tabId, status }) =>
          tabId === sourceId && (status === "active" || status === "pending"),
      );
      if (!attached) await chrome.tabs.reload(view.id);
    }
    return;
  }
  if (view && view.url?.startsWith(page)) {
    await chrome.tabs.update(view.id, { active: true, url });
    return;
  }
  const created = await chrome.tabs.create({ url });
  await chrome.storage.session.set({ viewId: created.id });
});

chrome.tabs.onRemoved.addListener(
  (id) => void chrome.storage.session.remove("source-" + id),
);

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const page = chrome.runtime.getURL("index.html");
  const senderUrl = sender.url?.split("?")[0];
  if (
    senderUrl !== page ||
    sender.frameId !== 0 ||
    typeof sender.tab?.id !== "number"
  )
    return false;
  if (
    ![
      "flux:read-player",
      "flux:start-capture",
      "flux:toggle-play",
      "flux:seek-line",
      "flux:seek-relative",
    ].includes(message?.type)
  )
    return false;
  void (async () => {
    const id = Number(new URL(sender.url).searchParams.get("source"));
    if (!Number.isInteger(id) || id <= 0)
      return { error: "Open YouTube, then click FLUX in Chrome’s toolbar." };
    const key = "source-" + id;
    const videoTab = await chrome.tabs.get(id).catch(() => null);
    if (!videoTab)
      return { sourceError: "The linked YouTube tab closed." };
    if (!youtube(videoTab.url) || !(await chrome.storage.session.get(key))[key])
      return {
        sourceError: "The linked tab left YouTube or needs to be linked again.",
      };
    if (message.type === "flux:read-player") {
      const [sample] = await chrome.scripting.executeScript({
        target: { tabId: id },
        world: "MAIN",
        func: readPlayer,
      });
      return sample?.result ?? null;
    }
    if (
      message.type === "flux:toggle-play" ||
      message.type === "flux:seek-line" ||
      message.type === "flux:seek-relative"
    ) {
      const seek = message.type === "flux:seek-line";
      const relative = message.type === "flux:seek-relative";
      if (relative && message.time !== -5 && message.time !== 5)
        return { ok: false };
      if (
        seek &&
        (!Number.isFinite(message.time) ||
          typeof message.videoId !== "string" ||
          !/^[a-zA-Z0-9_-]{11}$/.test(message.videoId))
      )
        return { ok: false };
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: id },
        world: "MAIN",
        args: [
          message.type,
          seek || relative ? message.time : null,
          seek ? message.videoId : null,
        ],
        func: async (type, time, videoId) => {
          const video = document.querySelector(
            "#movie_player video, ytmusic-player video",
          );
          if (!video) return false;
          if (type === "flux:seek-relative") {
            if (video.closest(".ad-showing")) return false;
            let start = 0;
            let end = video.duration;
            // Live streams only support skipping within the DVR window.
            if (!Number.isFinite(end)) {
              const range = video.seekable.length - 1;
              if (range < 0) return false;
              start = video.seekable.start(range);
              end = video.seekable.end(range);
            }
            video.currentTime = Math.max(
              start,
              Math.min(end, video.currentTime + time),
            );
          } else if (type === "flux:seek-line") {
            if (
              new URL(location.href).searchParams.get("v") !== videoId ||
              !Number.isFinite(video.duration) ||
              video.closest(".ad-showing")
            )
              return false;
            video.currentTime = Math.max(0, Math.min(video.duration, time));
          } else if (video.paused) {
            await video.play();
          } else video.pause();
          return true;
        },
      });
      return { ok: result?.result === true };
    }
    try {
      return {
        streamId: await chrome.tabCapture.getMediaStreamId({
          targetTabId: id,
          consumerTabId: sender.tab.id,
        }),
      };
    } catch {
      return {
        error:
          "Chrome could not capture this tab. Stop any other share of it, then click FLUX on YouTube again.",
      };
    }
  })().then(reply, () => reply({ error: "Could not read the YouTube tab." }));
  return true;
});
