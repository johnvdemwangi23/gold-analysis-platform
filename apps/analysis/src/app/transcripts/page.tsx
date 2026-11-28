"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  AnalysisListItem,
  Direction,
  GoldBias,
  RateOutlook,
  SavedAnalysis,
  SpeakerTone,
  TranscriptAnalysis,
} from "@/lib/analysis";
import { cleanTranscript, parseYouTubeVideoId } from "@/lib/transcript";

const HISTORY_KEY = "gold-platform-analyses-v1";
const ACCESS_CODE_KEY = "gold-platform-access-code";
const STORE_EVENT = "gold-platform-store-change";
const MAX_HISTORY = 15;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 24;
const MIN_CHARS = 200;
const MAX_CHARS = 60000;

function subscribeStore(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORE_EVENT, callback);
  };
}

function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribeStore,
    () => window.localStorage.getItem(key),
    () => null
  );
}

function setStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable or full. The page still works without it.
  }

  window.dispatchEvent(new Event(STORE_EVENT));
}

/*
 * 24 characters from a 31 character alphabet (no 0, O, 1, I or L, which are
 * easy to confuse), shown in six groups of four. That is about 119 bits.
 * Bytes at or above the limit are skipped so every character is equally likely.
 */
function generateAccessCode(): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  const chars: string[] = [];

  while (chars.length < CODE_LENGTH) {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte < limit && chars.length < CODE_LENGTH) {
        chars.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]);
      }
    }
  }

  return (chars.join("").match(/.{4}/g) ?? []).join("-");
}

function parseHistory(raw: string | null): SavedAnalysis[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as SavedAnalysis[]) : [];
  } catch {
    return [];
  }
}

const biasStyle: Record<GoldBias, { label: string; box: string; text: string }> = {
  bullish: {
    label: "Bullish for gold",
    box: "border-emerald-400/30 bg-emerald-400/10",
    text: "text-emerald-300",
  },
  bearish: {
    label: "Bearish for gold",
    box: "border-red-400/30 bg-red-400/10",
    text: "text-red-300",
  },
  neutral: {
    label: "Neutral for gold",
    box: "border-zinc-400/30 bg-zinc-400/10",
    text: "text-zinc-300",
  },
  mixed: {
    label: "Mixed signals",
    box: "border-amber-400/30 bg-amber-400/10",
    text: "text-amber-300",
  },
};

const toneLabel: Record<SpeakerTone, string> = {
  hawkish: "Hawkish",
  slightly_hawkish: "Slightly hawkish",
  neutral: "Neutral",
  slightly_dovish: "Slightly dovish",
  dovish: "Dovish",
  not_applicable: "Not applicable",
};

const rateLabel: Record<RateOutlook, string> = {
  cuts_likely: "Cuts likely",
  on_hold: "On hold",
  hikes_possible: "Hikes possible",
  higher_for_longer: "Higher for longer",
  unclear: "Unclear",
};

const directionLabel: Record<Direction, string> = {
  up: "Higher",
  down: "Lower",
  neutral: "Little change",
  unclear: "Unclear",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Card({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      {note && <p className="mt-2 text-xs leading-relaxed text-zinc-400">{note}</p>}
    </div>
  );
}

function ResultView({ analysis }: { analysis: TranscriptAnalysis }) {
  const style = biasStyle[analysis.goldVerdict.bias];

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-5 ${style.box}`}>
        <p className={`text-xs font-semibold uppercase tracking-wider ${style.text}`}>
          {style.label} · {analysis.goldVerdict.confidence} confidence
          {analysis.goldVerdict.horizon ? ` · ${analysis.goldVerdict.horizon}` : ""}
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug">{analysis.headline}</p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          {analysis.goldVerdict.reasoning}
        </p>
      </div>

      {analysis.summary && (
        <div className="rounded-lg border border-white/10 p-4">
          <p className="text-xs text-zinc-500">Summary</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{analysis.summary}</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card
          label="Speaker tone"
          value={toneLabel[analysis.speakerTone]}
          note={analysis.toneNote}
        />
        <Card
          label="Rate outlook"
          value={rateLabel[analysis.rates.outlook]}
          note={analysis.rates.note}
        />
        <Card
          label="US dollar"
          value={directionLabel[analysis.dollar.direction]}
          note={analysis.dollar.note}
        />
        <Card
          label="Real yields"
          value={directionLabel[analysis.realYields.direction]}
          note={analysis.realYields.note}
        />
      </div>

      {analysis.inflationGrowth && (
        <div className="rounded-lg border border-white/10 p-4">
          <p className="text-xs text-zinc-500">Inflation and growth</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            {analysis.inflationGrowth}
          </p>
        </div>
      )}

      {analysis.keyQuotes.length > 0 && (
        <div className="rounded-lg border border-white/10 p-4">
          <p className="text-xs text-zinc-500">Key quotes</p>

          <div className="mt-3 space-y-4">
            {analysis.keyQuotes.map((item, index) => (
              <div key={index} className="border-l-2 border-amber-400/40 pl-3">
                <p className="text-sm italic text-zinc-200">&ldquo;{item.quote}&rdquo;</p>
                {item.whyItMatters && (
                  <p className="mt-1 text-xs text-zinc-400">{item.whyItMatters}</p>
                )}
              </div>
            ))}
          </div>

          {analysis.droppedQuotes > 0 && (
            <p className="mt-3 text-xs text-zinc-600">
              {analysis.droppedQuotes} quote(s) were left out because the exact words
              were not found in your text.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {analysis.risks.length > 0 && (
          <div className="rounded-lg border border-white/10 p-4">
            <p className="text-xs text-zinc-500">What could make this wrong</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-300">
              {analysis.risks.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {analysis.watchNext.length > 0 && (
          <div className="rounded-lg border border-white/10 p-4">
            <p className="text-xs text-zinc-500">Watch next</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-300">
              {analysis.watchNext.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-600">
        This is an analysis of the text you supplied. It is not financial advice.
      </p>
    </div>
  );
}

type AnalysisPayload = {
  transcript: string;
  title: string;
  source: string;
  sourceUrl: string | null;
};

export default function TranscriptsPage() {
  const historyRaw = useStored(HISTORY_KEY);
  const storedCode = useStored(ACCESS_CODE_KEY);

  const history = useMemo(() => parseHistory(historyRaw), [historyRaw]);

  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [current, setCurrent] = useState<TranscriptAnalysis | null>(null);
  const [currentLabel, setCurrentLabel] = useState("");
  const [currentLink, setCurrentLink] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeNote, setYoutubeNote] = useState<string | null>(null);
  const [autoAnalyse, setAutoAnalyse] = useState(true);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [dbItems, setDbItems] = useState<AnalysisListItem[] | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const cleaned = useMemo(() => cleanTranscript(transcript), [transcript]);
  const videoId = parseYouTubeVideoId(youtubeUrl);
  const length = cleaned.length;
  const tooShort = length < MIN_CHARS;
  const tooLong = length > MAX_CHARS;
  const accessCode = storedCode ?? "";
  const missingDetails = title.trim().length < 3 || source.trim().length < 2;

  const loadDb = useCallback(async () => {
    try {
      const response = await fetch("/api/analyses", {
        headers: { "x-access-code": accessCode },
        cache: "no-store",
      });

      if (!response.ok) {
        setDbItems(null);
        return;
      }

      const data = (await response.json()) as { items?: AnalysisListItem[] };

      setDbItems(data.items ?? []);
    } catch {
      setDbItems(null);
    }
  }, [accessCode]);

  useEffect(() => {
    if (accessCode.length < 8) return;

    const timer = window.setTimeout(() => {
      void loadDb();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [accessCode, loadDb]);

  async function fetchYoutube(
    url: string = youtubeUrl,
    auto = false
  ): Promise<AnalysisPayload | null> {
    setYoutubeLoading(true);
    setYoutubeNote(null);
    setError(null);

    try {
      const response = await fetch("/api/youtube-transcript", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-access-code": accessCode,
        },
        body: JSON.stringify({ url }),
      });

      const data = (await response.json()) as {
        error?: string;
        text?: string;
        title?: string;
        channel?: string;
        language?: string;
        autoGenerated?: boolean;
        sourceUrl?: string;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error ?? "Could not get the transcript.");
      }

      const loaded: AnalysisPayload = {
        transcript: data.text,
        title: data.title ?? "",
        source: data.channel ? `YouTube: ${data.channel}` : "YouTube",
        sourceUrl: data.sourceUrl ?? null,
      };

      setTranscript(loaded.transcript);
      setTitle(loaded.title);
      setSource(loaded.source);
      setSourceUrl(loaded.sourceUrl);
      setYoutubeNote(
        `Transcript loaded (${data.language ?? "unknown language"}${
          data.autoGenerated ? ", auto-generated captions" : ""
        }). ${
          auto
            ? "Analysing now."
            : "Check the title and source, then analyse."
        }`
      );

      return loaded;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get the transcript.");
      return null;
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function runLink(url: string) {
    const loaded = await fetchYoutube(url, true);

    if (loaded) {
      await analyze(loaded);
    }
  }

  async function openSaved(id: string, label: string) {
    setError(null);

    try {
      const response = await fetch(`/api/analyses/${id}`, {
        headers: { "x-access-code": accessCode },
        cache: "no-store",
      });

      const data = (await response.json()) as {
        analysis?: TranscriptAnalysis;
        sourceUrl?: string | null;
        error?: string;
      };

      if (!response.ok || !data.analysis) {
        throw new Error(data.error ?? "Could not open this analysis.");
      }

      setCurrent(data.analysis);
      setCurrentLabel(label);
      setCurrentLink(data.sourceUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this analysis.");
    }
  }

  async function deleteSaved(id: string) {
    if (!window.confirm("Delete this saved analysis? This cannot be undone.")) {
      return;
    }

    try {
      await fetch(`/api/analyses/${id}`, {
        method: "DELETE",
        headers: { "x-access-code": accessCode },
      });
    } finally {
      void loadDb();
    }
  }

  function handleGenerateCode() {
    setStored(ACCESS_CODE_KEY, generateAccessCode());
    setShowCode(true);
    setCodeCopied(false);
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(accessCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      setShowCode(true);
    }
  }

  async function analyze(payload?: AnalysisPayload) {
    setLoading(true);
    setError(null);
    setSaveNote(null);

    try {
      const response = await fetch("/api/analyze-transcript", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-access-code": accessCode,
        },
        body: JSON.stringify(payload ?? { transcript, title, source, sourceUrl }),
      });

      const data = (await response.json()) as {
        analysis?: TranscriptAnalysis;
        savedId?: string | null;
        saveError?: string | null;
        error?: string;
      };

      if (!response.ok || !data.analysis) {
        throw new Error(data.error ?? "The analysis failed.");
      }

      if (data.savedId) {
        void loadDb();
      }

      setSaveNote(data.saveError ?? null);

      const label = (payload?.title ?? title).trim();

      const entry: SavedAnalysis = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        title: label,
        source: (payload?.source ?? source).trim(),
        analysis: data.analysis,
      };

      setStored(
        HISTORY_KEY,
        JSON.stringify([entry, ...history].slice(0, MAX_HISTORY))
      );

      setCurrent(data.analysis);
      setCurrentLabel(label);
      setCurrentLink(payload ? payload.sourceUrl : sourceUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function removeEntry(id: string) {
    setStored(HISTORY_KEY, JSON.stringify(history.filter((item) => item.id !== id)));
  }

  return (
    <main className="min-h-screen bg-[#090b0f] text-white">
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-wide">GOLD Analysis Platform</h1>
          <p className="text-xs text-zinc-500">Transcript Analysis</p>
        </div>

        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            Chart
          </Link>
          <span className="rounded-md bg-white/5 px-3 py-1.5 text-white">
            Transcripts
          </span>
        </nav>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[400px_1fr]">
        <section className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-[#0c0f14] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              New analysis
            </p>

            <div className="mt-3 space-y-3">
              <div className="rounded-md border border-white/10 p-3">
                <span className="text-xs text-zinc-400">YouTube link (optional)</span>

                <div className="mt-1 flex gap-2">
                  <input
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                    onPaste={(event) => {
                      const pasted = event.clipboardData.getData("text").trim();

                      if (
                        autoAnalyse &&
                        accessCode &&
                        !youtubeLoading &&
                        !loading &&
                        parseYouTubeVideoId(pasted)
                      ) {
                        void runLink(pasted);
                      }
                    }}
                    placeholder="Paste a YouTube link"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#090b0f] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-400/50"
                  />

                  <button
                    type="button"
                    onClick={() => void fetchYoutube()}
                    disabled={!videoId || !accessCode || youtubeLoading || loading}
                    className="rounded-md border border-white/10 px-3 text-xs text-zinc-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {youtubeLoading ? "Getting..." : "Get transcript"}
                  </button>
                </div>

                <p
                  className={`mt-2 text-xs ${
                    youtubeUrl.trim() && !videoId ? "text-red-400" : "text-zinc-600"
                  }`}
                >
                  {!youtubeUrl.trim()
                    ? "Works with YouTube links only. The button stays off until one is pasted."
                    : !videoId
                      ? "That is not a YouTube link. Only YouTube links are supported."
                      : !accessCode
                        ? "Link recognised. Enter the access code below to turn the button on."
                        : "YouTube link recognised."}
                </p>

                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={autoAnalyse}
                    onChange={(event) => setAutoAnalyse(event.target.checked)}
                    className="accent-amber-400"
                  />
                  Analyse automatically when I paste a link
                </label>

                {youtubeNote && (
                  <p className="mt-2 text-xs text-emerald-400">{youtubeNote}</p>
                )}
              </div>

              <label className="block">
                <span className="text-xs text-zinc-400">
                  Title <span className="text-amber-400">*</span>
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Powell press conference"
                  required
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#090b0f] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-400/50"
                />
              </label>

              <label className="block">
                <span className="text-xs text-zinc-400">
                  Source <span className="text-amber-400">*</span>
                </span>
                <input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="e.g. FOMC, 18 Dec"
                  required
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#090b0f] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-400/50"
                />
              </label>

              <label className="block">
                <span className="text-xs text-zinc-400">
                  Text <span className="text-amber-400">*</span>
                </span>
                <textarea
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                  placeholder="Paste the speech, transcript, statement or article here"
                  rows={14}
                  className="mt-1 w-full resize-y rounded-md border border-white/10 bg-[#090b0f] px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-zinc-600 focus:border-amber-400/50"
                />
              </label>

              <p
                className={`text-xs ${
                  tooLong ? "text-red-400" : "text-zinc-500"
                }`}
              >
                {length.toLocaleString("en-US")} / {MAX_CHARS.toLocaleString("en-US")}{" "}
                characters
                {length > 0 && tooShort ? ` (at least ${MIN_CHARS} needed)` : ""}
              </p>

              <div>
                <span className="text-xs text-zinc-400">
                  Access code <span className="text-amber-400">*</span>
                </span>

                <div className="mt-1 flex gap-2">
                  <input
                    type={showCode ? "text" : "password"}
                    value={accessCode}
                    onChange={(event) => setStored(ACCESS_CODE_KEY, event.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#090b0f] px-3 py-2 font-mono text-xs outline-none placeholder:text-zinc-600 focus:border-amber-400/50"
                  />

                  <button
                    type="button"
                    onClick={() => setShowCode((value) => !value)}
                    className="rounded-md border border-white/10 px-2.5 text-xs text-zinc-300 transition hover:bg-white/5"
                  >
                    {showCode ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/5"
                  >
                    Generate new code
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    disabled={!accessCode}
                    className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {codeCopied ? "Copied" : "Copy"}
                  </button>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                  This must match ANALYSIS_ACCESS_CODE in Vercel. After generating a
                  code, copy it there and redeploy.
                </p>
              </div>

              <button
                onClick={() => void analyze()}
                disabled={loading || tooShort || tooLong || missingDetails || !accessCode}
                className="w-full rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Analysing..." : "Analyse for gold"}
              </button>

              {missingDetails && length > 0 && (
                <p className="text-xs text-zinc-500">
                  Add a title and a source to continue.
                </p>
              )}

              {saveNote && (
                <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                  {saveNote}
                </p>
              )}

              {error && (
                <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0c0f14] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {dbItems !== null ? "Saved in database" : "Saved in this browser"}
            </p>

            {dbItems !== null ? (
              dbItems.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-600">No analyses yet.</p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {dbItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <button
                        onClick={() => openSaved(item.id, item.title)}
                        className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5"
                      >
                        <span className="block truncate text-sm text-zinc-200">
                          {item.title}
                        </span>
                        <span className="block text-xs text-zinc-600">
                          {formatWhen(item.createdAt)} · {biasStyle[item.bias].label}
                        </span>
                      </button>

                      <button
                        onClick={() => deleteSaved(item.id)}
                        title="Delete"
                        className="rounded px-2 py-1 text-xs text-zinc-600 transition hover:bg-white/5 hover:text-red-400"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : history.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-600">No analyses yet.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {history.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCurrent(item.analysis);
                        setCurrentLabel(item.title);
                        setCurrentLink(null);
                      }}
                      className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5"
                    >
                      <span className="block truncate text-sm text-zinc-200">
                        {item.title}
                      </span>
                      <span className="block text-xs text-zinc-600">
                        {formatWhen(item.createdAt)} ·{" "}
                        {biasStyle[item.analysis.goldVerdict.bias].label}
                      </span>
                    </button>

                    <button
                      onClick={() => removeEntry(item.id)}
                      title="Delete"
                      className="rounded px-2 py-1 text-xs text-zinc-600 transition hover:bg-white/5 hover:text-red-400"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          {current ? (
            <div>
              <p className="text-sm text-zinc-500">{currentLabel}</p>
              {currentLink && (
                <a
                  href={currentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-xs text-amber-400/80 hover:text-amber-300"
                >
                  {currentLink}
                </a>
              )}
              <div className="mb-3" />
              <ResultView analysis={current} />
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">
              Paste a Fed speech, press conference or any text that could move gold, then
              press Analyse. The result appears here.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
