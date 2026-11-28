/*
 * Adds a small panel to YouTube watch pages with two buttons:
 *  - Copy transcript: copies the transcript text to the clipboard.
 *  - Send to Gold: opens your Gold Analysis Platform and fills in the
 *    title, source and transcript for you.
 *
 * It works by opening YouTube's own "Show transcript" panel and reading it,
 * so it runs while the video keeps playing and needs no account or key.
 */
(() => {
  "use strict";

  if (window.__goldTranscriptHelper) return;
  window.__goldTranscriptHelper = true;

  const BOX_ID = "gold-transcript-helper";
  const SITE_URL = "https://gold-analysis-platform-zmo1.vercel.app/transcripts";
  const SEGMENT_SELECTOR =
    "ytd-transcript-segment-renderer, transcript-segment-view-model";

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function currentVideoId() {
    try {
      const url = new URL(location.href);

      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function readSegments() {
    const parts = [];

    document.querySelectorAll(SEGMENT_SELECTOR).forEach((node) => {
      const textNode =
        node.querySelector(".segment-text") ||
        node.querySelector("span.yt-core-attributed-string");
      const text = cleanText(textNode ? textNode.textContent : "");

      if (text) parts.push(text);
    });

    return parts;
  }

  function findTranscriptButton() {
    const direct = document.querySelector(
      "ytd-video-description-transcript-section-renderer button"
    );

    if (direct) return direct;

    const scope = document.querySelector("ytd-watch-metadata") || document;

    return (
      Array.from(scope.querySelectorAll("button")).find((button) =>
        /show transcript/i.test(
          `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`
        )
      ) || null
    );
  }

  async function loadTranscript() {
    if (readSegments().length === 0) {
      let button = findTranscriptButton();

      if (!button) {
        const expand = document.querySelector(
          "#description-inline-expander #expand, ytd-text-inline-expander #expand, #description #expand"
        );

        if (expand) {
          expand.click();
          await wait(600);
          button = findTranscriptButton();
        }
      }

      if (!button) {
        throw new Error(
          'No transcript found. This video may have no captions, or "Show transcript" is missing.'
        );
      }

      button.click();
    }

    // Wait for the segments to appear, then until the count stops growing.
    let last = -1;
    let stable = 0;

    for (let i = 0; i < 48; i += 1) {
      await wait(250);

      const count = readSegments().length;

      if (count > 0 && count === last) {
        stable += 1;
        if (stable >= 2) break;
      } else {
        stable = 0;
      }

      last = count;
    }

    const parts = readSegments();

    if (parts.length === 0) {
      throw new Error("The transcript did not load. Try again in a moment.");
    }

    return parts.join(" ");
  }

  function readVideoDetails() {
    const titleNode =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1.ytd-watch-metadata");
    const channelNode =
      document.querySelector("ytd-watch-metadata ytd-channel-name a") ||
      document.querySelector("#owner ytd-channel-name a");

    const title =
      cleanText(titleNode ? titleNode.textContent : "") ||
      cleanText(document.title.replace(/\s*-\s*YouTube\s*$/i, ""));
    const channel = cleanText(channelNode ? channelNode.textContent : "");
    const id = currentVideoId();

    return {
      title,
      source: channel ? `YouTube: ${channel}` : "YouTube",
      sourceUrl: id ? `https://www.youtube.com/watch?v=${id}` : location.href,
    };
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall back below */
    }

    const area = document.createElement("textarea");

    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();

    const ok = document.execCommand("copy");

    area.remove();

    if (!ok) throw new Error("The browser blocked copying.");
  }

  function buildBox() {
    const box = document.createElement("div");

    box.id = BOX_ID;
    box.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "display:flex",
      "flex-direction:column",
      "gap:6px",
      "width:200px",
      "padding:10px",
      "border-radius:10px",
      "background:#0c0f14",
      "border:1px solid rgba(255,255,255,0.15)",
      "box-shadow:0 6px 24px rgba(0,0,0,0.5)",
      "font:12px/1.4 system-ui,sans-serif",
      "color:#d4d4d8",
    ].join(";");

    const heading = document.createElement("div");

    heading.textContent = "Gold transcript";
    heading.style.cssText = "font-weight:600;color:#fbbf24";

    const status = document.createElement("div");

    status.style.cssText = "min-height:16px;color:#a1a1aa";

    const makeButton = (label, primary) => {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = label;
      button.style.cssText = [
        "cursor:pointer",
        "padding:7px 8px",
        "border-radius:6px",
        "font:600 12px system-ui,sans-serif",
        primary
          ? "background:#fbbf24;color:#111;border:none"
          : "background:transparent;color:#e4e4e7;border:1px solid rgba(255,255,255,0.2)",
      ].join(";");

      return button;
    };

    const copyButton = makeButton("Copy transcript", false);
    const sendButton = makeButton("Send to Gold", true);
    let busy = false;

    const setStatus = (message, isError) => {
      status.textContent = message;
      status.style.color = isError ? "#f87171" : "#a1a1aa";
    };

    const run = async (label, action) => {
      if (busy) return;

      busy = true;
      copyButton.disabled = true;
      sendButton.disabled = true;
      setStatus(label, false);

      try {
        await action();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Something went wrong.", true);
      } finally {
        busy = false;
        copyButton.disabled = false;
        sendButton.disabled = false;
      }
    };

    copyButton.addEventListener("click", () =>
      run("Getting the transcript...", async () => {
        const text = await loadTranscript();

        await copyToClipboard(text);
        setStatus(`Copied ${text.length.toLocaleString("en-US")} characters.`, false);
      })
    );

    sendButton.addEventListener("click", () =>
      run("Getting the transcript...", async () => {
        const transcript = await loadTranscript();
        const details = readVideoDetails();

        await chrome.storage.local.set({
          goldPending: { ...details, transcript, at: Date.now() },
        });

        setStatus("Opening your Gold platform...", false);
        window.open(SITE_URL, "_blank");
      })
    );

    box.append(heading, copyButton, sendButton, status);

    return box;
  }

  function refresh() {
    const existing = document.getElementById(BOX_ID);

    if (currentVideoId()) {
      if (!existing && document.body) document.body.appendChild(buildBox());
    } else if (existing) {
      existing.remove();
    }
  }

  // YouTube changes pages without reloading, so check on its own events too.
  window.addEventListener("yt-navigate-finish", refresh);
  window.setInterval(refresh, 1500);
  refresh();
})();
