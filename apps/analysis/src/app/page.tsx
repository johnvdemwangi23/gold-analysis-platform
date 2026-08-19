"use client";

import { useState } from "react";
import GoldChart from "@/components/GoldChart";

const timeframes = [
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
  "W1",
  "MN1",
] as const;

type Timeframe = (typeof timeframes)[number];

export default function Home() {
  const [timeframe, setTimeframe] = useState<Timeframe>("H4");

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
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          <span className="text-sm text-zinc-400">Platform Online</span>
        </div>
      </header>

      <section className="flex h-[calc(100vh-4rem)]">
        <aside className="w-56 border-r border-white/10 bg-[#0c0f14] p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Markets
          </p>

          <button className="w-full rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-left">
            <div className="font-semibold text-amber-300">XAUUSD</div>
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
              <div className="px-3 py-2">Indicators</div>
              <div className="px-3 py-2">Market Data</div>
              <div className="px-3 py-2">Strategy Research</div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
            <div className="flex items-center gap-4">
              <div>
                <span className="font-semibold">XAUUSD</span>
                <span className="ml-2 text-sm text-zinc-500">
                  Gold Spot / U.S. Dollar
                </span>
              </div>

              <div className="flex gap-1">
                {timeframes.map((item) => (
                  <button
                    key={item}
                    onClick={() => setTimeframe(item)}
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
                <GoldChart timeframe={timeframe} />
              </div>
            </section>

            <aside className="border-l border-white/10 bg-[#0c0f14] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Market Intelligence
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">Instrument</p>
                  <p className="mt-1 font-semibold">XAUUSD</p>
                </div>

                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    Active Timeframe
                  </p>
                  <p className="mt-1 font-semibold">{timeframe}</p>
                </div>

                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    H4 Directional Wick
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Indicator engine pending
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    Fixed Range Volume Profile
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Indicator engine pending
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
