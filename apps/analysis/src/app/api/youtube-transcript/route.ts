import type { NextRequest } from "next/server";
import { checkAccess } from "@/lib/access";
import { parseYouTubeVideoId } from "@/lib/transcript";
import { parseCaptionXml } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * Fetches the caption track of a public YouTube video.
 * Only the video ID is taken from the link. The server never requests
 * the address the user typed, so it cannot be pointed at other sites.
 *
 * YouTube sometimes refuses requests that come from cloud servers. When
 * that happens the route says so and the transcript can be pasted instead.
 */

// Public key that YouTube's own web pages ship to every visitor.
const INNERTUBE_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const CLIENT_VERSION = "20.10.38";

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chooseTrack(tracks: CaptionTrack[]): CaptionTrack {
  const english = tracks.filter((track) => track.languageCode.startsWith("en"));
  const pool = english.length > 0 ? english : tracks;

  return pool.find((track) => track.kind !== "asr") ?? pool[0];
}

function readTracks(player: Record<string, unknown>): CaptionTrack[] {
  const captions = isRecord(player.captions) ? player.captions : {};
  const renderer = isRecord(captions.playerCaptionsTracklistRenderer)
    ? captions.playerCaptionsTracklistRenderer
    : {};
  const list = Array.isArray(renderer.captionTracks) ? renderer.captionTracks : [];

  const tracks: CaptionTrack[] = [];

  for (const item of list) {
    if (
      isRecord(item) &&
      typeof item.baseUrl === "string" &&
      typeof item.languageCode === "string"
    ) {
      tracks.push({
        baseUrl: item.baseUrl,
        languageCode: item.languageCode,
        kind: typeof item.kind === "string" ? item.kind : undefined,
      });
    }
  }

  return tracks;
}

function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com"))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const denied = checkAccess(request);

  if (denied) return denied;

  let link = "";

  try {
    const body: unknown = await request.json();

    link = isRecord(body) && typeof body.url === "string" ? body.url : "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const videoId = parseYouTubeVideoId(link);

  if (!videoId) {
    return Response.json(
      { error: "That is not a YouTube link." },
      { status: 400 }
    );
  }

  try {
    const playerResponse = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": `com.google.android.youtube/${CLIENT_VERSION} (Linux; U; Android 14) gzip`,
          "accept-language": "en-US,en;q=0.9",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: CLIENT_VERSION,
              androidSdkVersion: 34,
              hl: "en",
              gl: "US",
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const player: unknown = await playerResponse.json();

    if (!isRecord(player)) {
      throw new Error("Unexpected response from YouTube.");
    }

    const status = isRecord(player.playabilityStatus)
      ? player.playabilityStatus
      : {};

    const tracks = readTracks(player);

    if (tracks.length === 0) {
      if (status.status && status.status !== "OK") {
        const reason =
          typeof status.reason === "string" ? status.reason : "unavailable";

        return Response.json(
          {
            error: `YouTube would not share this video from the server (${reason}). Open the video, copy its transcript and paste it below.`,
          },
          { status: 502 }
        );
      }

      return Response.json(
        { error: "This video has no captions, so there is no transcript to get." },
        { status: 404 }
      );
    }

    const track = chooseTrack(tracks);

    if (!isYouTubeUrl(track.baseUrl)) {
      throw new Error("Unexpected caption address.");
    }

    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.delete("fmt");

    const captionResponse = await fetch(captionUrl, {
      headers: {
        "user-agent": `com.google.android.youtube/${CLIENT_VERSION} (Linux; U; Android 14) gzip`,
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    const xml = await captionResponse.text();
    const text = parseCaptionXml(xml).join(" ");

    if (!captionResponse.ok || !text) {
      return Response.json(
        {
          error:
            "YouTube returned an empty transcript. Open the video, copy its transcript and paste it below.",
        },
        { status: 502 }
      );
    }

    const details = isRecord(player.videoDetails) ? player.videoDetails : {};

    return Response.json({
      videoId,
      title: typeof details.title === "string" ? details.title : "",
      channel: typeof details.author === "string" ? details.author : "",
      language: track.languageCode,
      autoGenerated: track.kind === "asr",
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      text,
    });
  } catch (error) {
    console.error("YouTube transcript failed:", error);

    return Response.json(
      {
        error:
          "Could not reach YouTube from the server. Open the video, copy its transcript and paste it below.",
      },
      { status: 502 }
    );
  }
}
