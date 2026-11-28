"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Effect } from "@/lib/analysis";
import type { NewsItem, NewsRun } from "@/lib/newsTypes";

const effectStyle: Record<Effect, { label: string; chip: string }> = {
  positive: {
    label: "Positive for gold",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  negative: {
    label: "Negative for gold",
    chip: "border-red-400/30 bg-red-400/10 text-red-300",
  },
  mixed: {
    label: "Mixed",
    chip: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  neutral: {
    label: "Neutral",
    chip: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
  },
};

const horizonLabel = {
  short: "Short term",
  long: "Long term",
  both: "Short and long term",
} as const;

type Filter = "all" | Effect;

// The page refreshes the news by itself when the last update is older than this.
const STALE_MS = 3 * 60 * 60 * 1000;
// How often an open page checks again.
const CHECK_EVERY_MS = 15 * 60 * 1000;

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));

  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;

  return `${Math.round(minutes / 1440)}d ago`;
}

export default function NewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [lastRun, setLastRun] = useState<NewsRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async (): Promise<{ ok: boolean; lastRanAt: string | null }> => {
    try {
      const response = await fetch("/api/news", { cache: "no-store" });
      const data = (await response.json()) as {
        items?: NewsItem[];
        lastRun?: NewsRun | null;
        error?: string;
      };

      setItems(data.items ?? []);
      setLastRun(data.lastRun ?? null);
      setError(response.ok ? null : (data.error ?? "Could not load news."));

      return { ok: response.ok, lastRanAt: data.lastRun?.ranAt ?? null };
    } catch {
      setError("Could not load news.");

      return { ok: false, lastRanAt: null };
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshNow = useCallback(
    async (automatic: boolean) => {
      setRefreshing(true);
      setNote(null);
      if (!automatic) setError(null);

      try {
        const response = await fetch("/api/news/refresh", { method: "POST" });
        const data = (await response.json()) as {
          ok: boolean;
          skipped?: boolean;
          reason?: string;
          added?: number;
          usedAi?: boolean;
          note?: string | null;
          error?: string;
        };

        if (!data.ok) {
          setError(data.error ?? "The news update failed.");
        } else if (data.skipped) {
          if (!automatic) {
            setNote(`${data.reason ?? "Updated recently."} Try again in a while.`);
          }
        } else {
          setNote(
            `${automatic ? "Updated automatically." : "Update finished."} ${data.added ?? 0} relevant item(s) added.${
              data.usedAi
                ? ""
                : " The AI filter was unavailable, so simple keyword rules were used."
            }`
          );
        }

        await load();
      } catch {
        setError("The news update failed.");
      } finally {
        setRefreshing(false);
      }
    },
    [load]
  );

  // Load the list, and refresh it automatically when it is out of date.
  // This runs when the page opens and again every 15 minutes while it stays open.
  useEffect(() => {
    let cancelled = false;

    async function cycle() {
      const state = await load();

      if (cancelled || !state.ok) return;

      const stale = !state.lastRanAt || Date.now() - Date.parse(state.lastRanAt) > STALE_MS;

      if (stale) await refreshNow(true);
    }

    const first = window.setTimeout(() => void cycle(), 0);
    const repeat = window.setInterval(() => void cycle(), CHECK_EVERY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(repeat);
    };
  }, [load, refreshNow]);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.effect === filter)),
    [items, filter]
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "positive", label: "Positive" },
    { id: "negative", label: "Negative" },
    { id: "mixed", label: "Mixed" },
  ];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Gold news</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Headlines likely to move gold. Updates automatically, about five times a day.{" "}
            {lastRun ? `Last update ${timeAgo(lastRun.ranAt)}.` : "No update yet."}
          </p>
        </div>

        <button
          onClick={() => void refreshNow(false)}
          disabled={refreshing}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {refreshing ? "Updating..." : "Update now"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === item.id
                ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                : "border-white/10 text-zinc-400 hover:bg-white/5"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {note && (
        <p className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
          {note}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-zinc-600">Loading...</p>
        ) : shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">
            No gold news yet. The page collects headlines by itself, or press Update now.
          </div>
        ) : (
          shown.map((item) => {
            const style = effectStyle[item.effect];

            return (
              <article key={item.id} className="rounded-lg border border-white/10 bg-[#0c0f14] p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full border px-2 py-0.5 ${style.chip}`}>
                    {style.label}
                  </span>
                  <span className="text-zinc-500">{horizonLabel[item.horizon]}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-zinc-500">Impact {item.relevance}/10</span>
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block text-sm font-medium leading-snug text-zinc-100 hover:text-amber-300"
                >
                  {item.title}
                </a>

                {item.why && (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">{item.why}</p>
                )}

                <p className="mt-2 text-xs text-zinc-600">
                  {item.source} · {timeAgo(item.publishedAt)}
                  {item.topics.length > 0 ? ` · ${item.topics.join(", ")}` : ""}
                </p>
              </article>
            );
          })
        )}
      </div>

      <p className="mt-6 text-xs text-zinc-600">
        Headlines and links come from Google News. The impact notes are written by an AI from the
        headline alone, so treat them as a quick guide. This is not financial advice.
      </p>
    </div>
  );
}
