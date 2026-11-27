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
  if (view && view.url === url) {
    await chrome.tabs.update(view.id, { active: true });
    await chrome.windows.update(view.windowId, { focused: true });
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
    ].includes(message?.type)
  )
    return false;
  void (async () => {
    const id = Number(new URL(sender.url).searchParams.get("source"));
    if (!Number.isInteger(id) || id <= 0)
      return { error: "Open YouTube, then click FLUX in Chrome’s toolbar." };
    const key = "source-" + id;
    if (!(await chrome.storage.session.get(key))[key])
      return { error: "Click FLUX again on the YouTube tab to reconnect it." };
    const videoTab = await chrome.tabs.get(id).catch(() => null);
    if (!videoTab || !youtube(videoTab.url))
      return {
        error: "The YouTube tab closed. Open a video and click FLUX again.",
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
      message.type === "flux:seek-line"
    ) {
      const seek = message.type === "flux:seek-line";
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
        args: seek ? [true, message.time, message.videoId] : [false, null, null],
        func: async (seek, time, videoId) => {
          const video = document.querySelector(
            "#movie_player video, ytmusic-player video",
          );
          if (!video) return false;
          if (seek) {
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
