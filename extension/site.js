/*
 * Runs on your Gold platform's Transcripts page. When the YouTube helper has
 * left a transcript waiting, this hands it to the page.
 */
(() => {
  "use strict";

  const MAX_AGE_MS = 10 * 60 * 1000;
  let delivered = false;

  async function deliver() {
    if (delivered) return;

    const { goldPending } = await chrome.storage.local.get("goldPending");

    if (
      !goldPending ||
      typeof goldPending.transcript !== "string" ||
      Date.now() - Number(goldPending.at) > MAX_AGE_MS
    ) {
      return;
    }

    delivered = true;

    window.postMessage(
      {
        type: "gold-extension-transcript",
        payload: {
          transcript: goldPending.transcript,
          title: String(goldPending.title || ""),
          source: String(goldPending.source || ""),
          sourceUrl: goldPending.sourceUrl ? String(goldPending.sourceUrl) : null,
        },
      },
      window.location.origin
    );

    await chrome.storage.local.remove("goldPending");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    if (event.data && event.data.type === "gold-page-ready") {
      void deliver();
    }
  });

  // In case the page was ready before this script loaded.
  window.postMessage({ type: "gold-extension-ping" }, window.location.origin);
})();
