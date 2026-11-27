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
  if (!["flux:read-player", "flux:start-capture"].includes(message?.type))
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
