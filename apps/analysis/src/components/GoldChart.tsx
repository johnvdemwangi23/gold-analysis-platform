"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type {
  MarketSnapshot,
  Timeframe,
} from "@/lib/market";

type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type MarketDataResponse = {
  instrument: string;
  timeframe: Timeframe;
  candleCount: number;
  fetchedAt: string;
  candles: MarketCandle[];
  error?: string;
};

type GoldChartProps = {
  timeframe: Timeframe;
  onSnapshot: (snapshot: MarketSnapshot) => void;
  onUpdatingChange: (updating: boolean) => void;
};

type OHLC = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const marketDataCache = new Map<
  Timeframe,
  MarketDataResponse
>();

const CACHE_TTL_MS = 15000;

const WORKSPACE_STORAGE_KEY =
  "gold-platform-workspace-v1";

const SAVE_WORKSPACE_EVENT =
  "gold-platform-save-workspace";


function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatUtc(time: number) {
  return new Date(time * 1000).toLocaleString("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function GoldChart({
  timeframe,
  onSnapshot,
  onUpdatingChange,
}: GoldChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<
    ReturnType<typeof createChart> | null
  >(null);

  const candleSeriesRef = useRef<
    ISeriesApi<"Candlestick"> | null
  >(null);

  const initializedRangeRef =
    useRef<Timeframe | null>(null);

  const [status, setStatus] = useState(
    `Loading XAU/USD ${timeframe} data...`
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ohlc, setOhlc] = useState<OHLC | null>(null);

  /*
   * Create the chart only once.
   * Timeframe changes no longer destroy/recreate it.
   */
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,

      layout: {
        background: {
          type: ColorType.Solid,
          color: "#0b0e13",
        },
        textColor: "#8b93a7",
      },

      grid: {
        vertLines: {
          color: "#171b22",
        },
        horzLines: {
          color: "#171b22",
        },
      },

      rightPriceScale: {
        borderColor: "#222831",
      },

      timeScale: {
        borderColor: "#222831",
        timeVisible: true,
        secondsVisible: false,
      },

      crosshair: {
        vertLine: {
          color: "#687080",
          width: 1,
          labelBackgroundColor: "#222831",
        },
        horzLine: {
          color: "#687080",
          width: 1,
          labelBackgroundColor: "#222831",
        },
      },
    });

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",

        priceFormat: {
          type: "price",
          precision: 2,
          minMove: 0.01,
        },
      }
    );

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    chart.subscribeCrosshairMove((param) => {
      const item = param.seriesData.get(candleSeries);

      if (
        item &&
        "open" in item &&
        "high" in item &&
        "low" in item &&
        "close" in item &&
        typeof item.time === "number"
      ) {
        setOhlc({
          time: item.time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();

      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  /*
   * Only replace the candle data when timeframe changes.
   */
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;

    if (!chart || !candleSeries) return;

    const controller = new AbortController();

    function displayResult(result: MarketDataResponse) {
      const candles: CandlestickData<UTCTimestamp>[] =
        result.candles.map((candle) => ({
          time: candle.time as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));

      candleSeries.setData(candles);

      if (initializedRangeRef.current !== timeframe) {
        let restored = false;

        try {
          const raw =
            window.localStorage.getItem(
              WORKSPACE_STORAGE_KEY
            );

          if (raw) {
            const saved = JSON.parse(raw) as {
              timeframe?: Timeframe;
              visibleRange?: {
                from?: number;
                to?: number;
              };
            };

            if (
              saved.timeframe === timeframe &&
              saved.visibleRange &&
              typeof saved.visibleRange.from === "number" &&
              typeof saved.visibleRange.to === "number"
            ) {
              chart.timeScale().setVisibleLogicalRange({
                from: saved.visibleRange.from,
                to: saved.visibleRange.to,
              });

              restored = true;
            }
          }
        } catch {
          // Ignore malformed local workspace data.
        }

        if (!restored) {
          const visibleBars =
            timeframe === "MN1"
              ? 120
              : timeframe === "W1"
                ? 156
                : timeframe === "D1"
                  ? 180
                  : 200;

          const firstVisible = Math.max(
            0,
            candles.length - visibleBars
          );

          chart.timeScale().setVisibleLogicalRange({
            from: firstVisible,
            to: candles.length + 4,
          });
        }

        initializedRangeRef.current = timeframe;
      }

      const latest = result.candles.at(-1);

      if (latest) {
        setOhlc(latest);

        onSnapshot({
          instrument: result.instrument,
          timeframe,
          candleCount: result.candleCount,
          fetchedAt: result.fetchedAt,
          time: latest.time,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
        });
      }

      setStatus(
        `${result.instrument} · ${result.timeframe} · ${result.candleCount} candles`
      );
    }

    async function loadMarketData() {
      setError(null);

      const cached = marketDataCache.get(timeframe);

      /*
       * If this timeframe has never been loaded,
       * immediately remove the previous timeframe.
       * This prevents stale candles remaining visible
       * while the new request is in progress.
       */
      if (!cached) {
        candleSeries.setData([]);
        setOhlc(null);
        setStatus(`Loading XAU/USD ${timeframe} data...`);
      }

      /*
       * Display previously loaded data immediately.
       */
      if (cached) {
        displayResult(cached);

        const age =
          Date.now() -
          new Date(cached.fetchedAt).getTime();

        /*
         * If cache is still fresh, no network wait is needed.
         */
        if (age < CACHE_TTL_MS) {
          setLoading(false);
          onUpdatingChange(false);
          return;
        }
      }

      /*
       * Only show transition state when we do not
       * already have this timeframe cached.
       */
      setLoading(!cached);
      onUpdatingChange(true);

      try {
        const response = await fetch(
          `/api/market-data?interval=${timeframe}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result =
          (await response.json()) as MarketDataResponse;

        if (!response.ok) {
          throw new Error(
            result.error ?? "Market data request failed."
          );
        }

        marketDataCache.set(timeframe, result);

        if (!controller.signal.aborted) {
          displayResult(result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        const message =
          err instanceof Error
            ? err.message
            : "Unable to load market data.";

        setError(message);
        setStatus("Market data unavailable");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          onUpdatingChange(false);
        }
      }
    }

    loadMarketData();

    const refreshMs =
      timeframe === "D1" ||
      timeframe === "W1" ||
      timeframe === "MN1"
        ? 300000
        : 120000;

    async function refreshLatestCandle() {
      if (document.visibilityState !== "visible") {
        return;
      }

      onUpdatingChange(true);

      try {
        const response = await fetch(
          `/api/market-data?interval=${timeframe}&latest=1`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result =
          (await response.json()) as MarketDataResponse;

        if (!response.ok) {
          throw new Error(
            result.error ?? "Latest candle refresh failed."
          );
        }

        const latest = result.candles.at(-1);

        if (!latest || controller.signal.aborted) {
          return;
        }

        const candleSeries = candleSeriesRef.current;

        if (!candleSeries) {
          return;
        }

        candleSeries.update({
          time: latest.time as UTCTimestamp,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
        });

        const cached = marketDataCache.get(timeframe);

        let mergedCandles = cached
          ? [...cached.candles]
          : [];

        const lastCached =
          mergedCandles.at(-1);

        if (
          lastCached &&
          lastCached.time === latest.time
        ) {
          mergedCandles[
            mergedCandles.length - 1
          ] = latest;
        } else {
          mergedCandles.push(latest);

          if (mergedCandles.length > 300) {
            mergedCandles =
              mergedCandles.slice(-300);
          }
        }

        const merged: MarketDataResponse = {
          ...result,
          candleCount: mergedCandles.length,
          candles: mergedCandles,
        };

        marketDataCache.set(
          timeframe,
          merged
        );

        setOhlc(latest);

        onSnapshot({
          instrument: result.instrument,
          timeframe,
          candleCount: mergedCandles.length,
          fetchedAt: result.fetchedAt,
          time: latest.time,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
        });

        setStatus(
          `${result.instrument} · ${timeframe} · ${mergedCandles.length} candles`
        );
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(
          "Latest candle refresh failed:",
          err
        );
      } finally {
        if (!controller.signal.aborted) {
          onUpdatingChange(false);
        }
      }
    }

    const refreshTimer =
      window.setInterval(
        refreshLatestCandle,
        refreshMs
      );

    return () => {
      window.clearInterval(refreshTimer);
      controller.abort();
    };
  }, [timeframe, onSnapshot, onUpdatingChange]);

  useEffect(() => {
    function saveWorkspace() {
      const chart = chartRef.current;

      if (!chart) {
        return;
      }

      const visibleRange =
        chart.timeScale().getVisibleLogicalRange();

      if (!visibleRange) {
        return;
      }

      const savedAt =
        new Date().toISOString();

      window.localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          timeframe,
          visibleRange: {
            from: visibleRange.from,
            to: visibleRange.to,
          },
          savedAt,
        })
      );

      window.dispatchEvent(
        new CustomEvent(
          "gold-platform-workspace-saved",
          {
            detail: { savedAt },
          }
        )
      );
    }

    window.addEventListener(
      SAVE_WORKSPACE_EVENT,
      saveWorkspace
    );

    return () => {
      window.removeEventListener(
        SAVE_WORKSPACE_EVENT,
        saveWorkspace
      );
    };
  }, [timeframe]);

  return (
    <div className="relative h-full min-h-[600px] w-full">
      {ohlc && (
        <div className="pointer-events-none absolute left-4 top-16 z-20 rounded-md bg-[#0b0e13]/90 px-3 py-2 text-xs backdrop-blur">
          <div className="mb-1 text-zinc-500">
            {formatUtc(ohlc.time)} UTC
          </div>

          <div className="flex gap-4">
            <span>
              <span className="text-zinc-500">O </span>
              {formatPrice(ohlc.open)}
            </span>

            <span>
              <span className="text-zinc-500">H </span>
              {formatPrice(ohlc.high)}
            </span>

            <span>
              <span className="text-zinc-500">L </span>
              {formatPrice(ohlc.low)}
            </span>

            <span>
              <span className="text-zinc-500">C </span>
              {formatPrice(ohlc.close)}
            </span>
          </div>
        </div>
      )}

      <div
        ref={chartContainerRef}
        className="h-full min-h-[600px] w-full"
      />

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-[#0b0e13]">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
              backgroundSize: "80px 60px",
            }}
          />

          <div className="absolute inset-x-10 bottom-16 top-24 flex items-end gap-3 opacity-25">
            {[38, 55, 44, 70, 52, 84, 61, 73, 48, 66, 78, 57, 86, 69, 76].map(
              (height, index) => (
                <div
                  key={index}
                  className="flex-1 animate-pulse rounded-sm bg-white/20"
                  style={{ height: `${height}%` }}
                />
              )
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-4 rounded bg-black/70 px-3 py-1.5 text-xs text-zinc-400">
        {error ? `Error: ${error}` : status}
      </div>
    </div>
  );
}
