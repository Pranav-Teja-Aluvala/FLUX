importScripts("player.js");

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
  if (!sender.url?.startsWith("https://pranav-teja-aluvala.github.io/FLUX/"))
    return false;
  if (message?.type === "flux:read-player") {
    void chrome.storage.session
      .get("tabId")
      .then(({ tabId }) => (typeof tabId === "number" ? snapshot(tabId) : null))
      .then(reply, () => reply(null));
    return true;
  }
  if (
    message?.type !== "flux:start-capture" ||
    typeof sender.tab?.id !== "number" ||
    sender.frameId !== 0
  )
    return false;
  void (async () => {
    const { tabId } = await chrome.storage.session.get("tabId");
    if (typeof tabId !== "number")
      return {
        error: "Open your music tab and click the FLUX YouTube Link icon once.",
      };
    const source = await chrome.tabs.get(tabId).catch(() => null);
    if (!source || !youtube(source.url))
      return { error: "Link the YouTube tab you want to play." };
    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId,
        consumerTabId: sender.tab.id,
      });
      return { streamId };
    } catch {
      return {
        error:
          "Chrome could not start this tab. Stop any existing share, then click the FLUX helper on the YouTube tab again.",
      };
    }
  })().then(reply, () => reply({ error: "Could not reach the linked tab." }));
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
