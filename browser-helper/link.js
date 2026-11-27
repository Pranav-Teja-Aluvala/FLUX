(() => {
  if (globalThis.fluxLinkTimer) return;
  async function ping() {
    try {
      const active = await chrome.runtime.sendMessage({
        type: "flux:push-player",
      });
      if (active === false) {
        globalThis.fluxLinkTimer = undefined;
        return;
      }
    } catch {
      globalThis.fluxLinkTimer = undefined;
      return;
    }
    globalThis.fluxLinkTimer = setTimeout(ping, 650);
  }
  globalThis.fluxLinkTimer = setTimeout(ping, 0);
})();
