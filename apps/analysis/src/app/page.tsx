"use client";

import {
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";
import GoldChart from "@/components/GoldChart";
import {
  timeframes,
  type MarketSnapshot,
  type Timeframe,
} from "@/lib/market";

const STORAGE_KEY = "gold-platform-timeframe";
const STORAGE_EVENT = "gold-platform-timeframe-change";

function getStoredTimeframe(): Timeframe {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (saved && timeframes.includes(saved as Timeframe)) {
    return saved as Timeframe;
  }

  return "H4";
}

function getServerTimeframe(): Timeframe {
  return "H4";
}

function subscribeTimeframe(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

function saveTimeframe(timeframe: Timeframe) {
  window.localStorage.setItem(STORAGE_KEY, timeframe);
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function subscribeHydration() {
  return () => {};
}

function getClientHydrationState() {
  return true;
}

function getServerHydrationState() {
  return false;
}

function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatChange(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export default function Home() {
  const timeframe = useSyncExternalStore(
    subscribeTimeframe,
    getStoredTimeframe,
    getServerTimeframe
  );

  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationState,
    getServerHydrationState
  );

  const [marketSnapshot, setMarketSnapshot] =
    useState<MarketSnapshot | null>(null);

  const handleSnapshot = useCallback(
    (snapshot: MarketSnapshot) => {
      setMarketSnapshot(snapshot);
    },
    []
  );

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[#090b0f] text-white">
        <header className="flex h-16 items-center justify-between border-b border-white/10 px-6">
          <div className="space-y-2">
            <div className="h-4 w-44 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-32 animate-pulse rounded bg-white/5" />
          </div>

          <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
        </header>

        <section className="flex h-[calc(100vh-4rem)]">
          <aside className="w-56 border-r border-white/10 bg-[#0c0f14] p-4">
            <div className="mb-4 h-3 w-16 animate-pulse rounded bg-white/10" />
            <div className="h-16 w-full animate-pulse rounded-lg bg-white/5" />

            <div className="mt-8 space-y-3">
              <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
              <div className="h-9 w-full animate-pulse rounded bg-white/5" />
              <div className="h-9 w-full animate-pulse rounded bg-white/5" />
              <div className="h-9 w-full animate-pulse rounded bg-white/5" />
              <div className="h-9 w-full animate-pulse rounded bg-white/5" />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-14 items-center gap-4 border-b border-white/10 px-5">
              <div className="h-4 w-40 animate-pulse rounded bg-white/10" />

              <div className="flex gap-1">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-7 w-9 animate-pulse rounded bg-white/5"
                  />
                ))}
              </div>
            </div>

            <div className="grid flex-1 grid-cols-[1fr_280px]">
              <section className="m-4 overflow-hidden rounded-lg border border-white/10 bg-[#0b0e13] p-4">
                <div className="mb-4 h-4 w-28 animate-pulse rounded bg-white/10" />
                <div className="h-[560px] w-full animate-pulse rounded bg-white/[0.035]" />
              </section>

              <aside className="border-l border-white/10 bg-[#0c0f14] p-4">
                <div className="h-3 w-32 animate-pulse rounded bg-white/10" />

                <div className="mt-4 space-y-3">
                  <div className="h-20 animate-pulse rounded-lg bg-white/5" />
                  <div className="h-20 animate-pulse rounded-lg bg-white/5" />
                  <div className="h-24 animate-pulse rounded-lg bg-white/5" />
                  <div className="h-24 animate-pulse rounded-lg bg-white/5" />
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const activeSnapshot =
    marketSnapshot?.timeframe === timeframe
      ? marketSnapshot
      : null;

  const candleChange = activeSnapshot
    ? activeSnapshot.close - activeSnapshot.open
    : 0;

  const candleChangePercent =
    activeSnapshot && activeSnapshot.open !== 0
      ? (candleChange / activeSnapshot.open) * 100
      : 0;

  const changeClass =
    candleChange > 0
      ? "text-emerald-400"
      : candleChange < 0
        ? "text-red-400"
        : "text-zinc-400";

  return (
    <main className="min-h-screen bg-[#090b0f] text-white">
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-wide">
            GOLD Analysis Platform
          </h1>
          <p className="text-xs text-zinc-500">
            XAUUSD Market Intelligence
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-zinc-400">
            Platform Online
          </span>
        </div>
      </header>

      <section className="flex h-[calc(100vh-4rem)]">
        <aside className="w-56 border-r border-white/10 bg-[#0c0f14] p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Markets
          </p>

          <button className="w-full rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-left">
            <div className="font-semibold text-amber-300">
              XAUUSD
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Gold / US Dollar
            </div>
          </button>

          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Workspace
            </p>

            <div className="space-y-2 text-sm text-zinc-400">
              <div className="rounded-md bg-white/5 px-3 py-2 text-white">
                Chart
              </div>
              <div className="px-3 py-2">Market Data</div>
              <div className="px-3 py-2">Workspace</div>
              <div className="px-3 py-2">Research</div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
            <div className="flex items-center gap-5">
              <div>
                <div>
                  <span className="font-semibold">XAUUSD</span>
                  <span className="ml-2 text-sm text-zinc-500">
                    Gold Spot / U.S. Dollar
                  </span>
                </div>

                {activeSnapshot ? (
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-lg font-semibold">
                      {formatPrice(activeSnapshot.close)}
                    </span>

                    <span className={`text-xs ${changeClass}`}>
                      {formatChange(candleChange)}
                      {"  "}
                      ({formatChange(candleChangePercent)}%)
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 h-4 w-40 animate-pulse rounded bg-white/5" />
                )}
              </div>

              <div className="flex gap-1">
                {timeframes.map((item) => (
                  <button
                    key={item}
                    onClick={() => saveTimeframe(item)}
                    className={`rounded px-2.5 py-1 text-xs transition ${
                      timeframe === item
                        ? "bg-amber-400 text-black"
                        : "text-zinc-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <button className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300">
              Save Workspace
            </button>
          </div>

          <div className="grid flex-1 grid-cols-[1fr_280px]">
            <section className="relative m-4 overflow-hidden rounded-lg border border-white/10 bg-[#0b0e13]">
              <div className="absolute left-4 top-4 z-10 rounded bg-[#0b0e13]/80 px-2 py-1">
                <div className="text-sm font-medium">
                  XAUUSD · {timeframe}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Real market data · UTC
                </div>
              </div>

              <div className="h-full min-h-[600px]">
                <GoldChart
                  timeframe={timeframe}
                  onSnapshot={handleSnapshot}
                />
              </div>
            </section>

            <aside className="border-l border-white/10 bg-[#0c0f14] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Market Intelligence
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    Instrument
                  </p>
                  <p className="mt-1 font-semibold">
                    XAUUSD
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    Active Timeframe
                  </p>
                  <p className="mt-1 font-semibold">
                    {timeframe}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    Candle Count
                  </p>
                  <p className="mt-1 font-semibold">
                    {activeSnapshot
                      ? activeSnapshot.candleCount
                      : "Loading..."}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    Data Source
                  </p>

                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-zinc-300">
                      Twelve Data
                    </span>
                  </div>

                  {activeSnapshot && (
                    <div className="mt-3 space-y-1 text-xs text-zinc-500">
                      <p>
                        Last Fetch{" "}
                        <span className="text-zinc-300">
                          {new Date(
                            activeSnapshot.fetchedAt
                          ).toLocaleTimeString("en-GB", {
                            timeZone: "UTC",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}{" "}
                          UTC
                        </span>
                      </p>

                      <p>
                        Latest Candle{" "}
                        <span className="text-zinc-300">
                          {new Date(
                            activeSnapshot.time * 1000
                          ).toLocaleString("en-GB", {
                            timeZone: "UTC",
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
