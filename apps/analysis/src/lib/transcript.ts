/*
 * Copying a transcript from YouTube puts a timestamp at the start of each
 * line, and the spoken form ("42 minutes, 34 seconds") glued to the text.
 * Example: "42:3442 minutes, 34 secondson the industry."
 * Only timestamps at the start of a line are removed, so a time mentioned
 * inside a sentence is left alone.
 */
const LINE_START_TIMESTAMP =
  /^[ \t]*(?:\d{1,2}:)?\d{1,2}:\d{2}[ \t]*(?:\d+ hours?,? ?)?(?:\d+ minutes?,? ?)?(?:\d+ seconds?)?[ \t]*/gm;

export function cleanTranscript(input: string): string {
  const text = input.replace(/\r\n?/g, "\n");
  const withoutStamps = text.replace(LINE_START_TIMESTAMP, "");

  if (withoutStamps !== text) {
    return withoutStamps
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/*
 * Returns the video ID for a YouTube link, or null for anything else.
 * Only youtube.com, m.youtube.com, music.youtube.com and youtu.be count.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) return null;

  let url: URL;

  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];

    return VIDEO_ID.test(id) ? id : null;
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v") ?? "";

      return VIDEO_ID.test(id) ? id : null;
    }

    const match = url.pathname.match(
      /^\/(?:live|shorts|embed|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/
    );

    if (match) return match[1];
  }

  return null;
}
