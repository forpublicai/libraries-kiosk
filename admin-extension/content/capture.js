(() => {
  if (window.__publicpassCaptureInstalled) {
    return;
  }
  window.__publicpassCaptureInstalled = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "collect-storage") {
      try {
        const localEntries = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          localEntries.push([key, localStorage.getItem(key)]);
        }
        const sessionEntries = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const key = sessionStorage.key(i);
          sessionEntries.push([key, sessionStorage.getItem(key)]);
        }
        sendResponse({
          ok: true,
          localStorage: localEntries,
          sessionStorage: sessionEntries
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message ?? "Failed to collect storage" });
      }
      return true;
    }
    return undefined;
  });
})();
