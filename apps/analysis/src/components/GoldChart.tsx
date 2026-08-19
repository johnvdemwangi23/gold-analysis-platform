"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

type Timeframe =
  | "M1"
  | "M5"
  | "M15"
  | "M30"
  | "H1"
  | "H4"
  | "D1"
  | "W1"
  | "MN1";

type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type MarketDataResponse = {
  instrument: string;
  timeframe: string;
  candleCount: number;
  candles: MarketCandle[];
  error?: string;
};

type GoldChartProps = {
  timeframe: Timeframe;
};

type OHLC = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

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

export default function GoldChart({ timeframe }: GoldChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState(
    `Loading XAU/USD ${timeframe} data...`
  );

  const [error, setError] = useState<string | null>(null);
  const [ohlc, setOhlc] = useState<OHLC | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    setError(null);
    setOhlc(null);
    setStatus(`Loading XAU/USD ${timeframe} data...`);

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

    const candleSeries = chart.addSeries(CandlestickSeries, {
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
    });

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

    const controller = new AbortController();

    async function loadMarketData() {
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

        const candles: CandlestickData<UTCTimestamp>[] =
          result.candles.map((candle) => ({
            time: candle.time as UTCTimestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }));

        candleSeries.setData(candles);

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

        const latest = result.candles.at(-1);

        if (latest) {
          setOhlc(latest);
        }

        setStatus(
          `${result.instrument} · ${result.timeframe} · ${result.candleCount} candles`
        );
      } catch (err) {
        if (controller.signal.aborted) return;

        const message =
          err instanceof Error
            ? err.message
            : "Unable to load market data.";

        setError(message);
        setStatus("Market data unavailable");
      }
    }

    loadMarketData();

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    resizeObserver.observe(container);

    return () => {
      controller.abort();
      resizeObserver.disconnect();
      chart.remove();
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
              <span className="text-zinc-200">
                {formatPrice(ohlc.open)}
              </span>
            </span>

            <span>
              <span className="text-zinc-500">H </span>
              <span className="text-zinc-200">
                {formatPrice(ohlc.high)}
              </span>
            </span>

            <span>
              <span className="text-zinc-500">L </span>
              <span className="text-zinc-200">
                {formatPrice(ohlc.low)}
              </span>
            </span>

            <span>
              <span className="text-zinc-500">C </span>
              <span className="text-zinc-200">
                {formatPrice(ohlc.close)}
              </span>
            </span>
          </div>
        </div>
      )}

      <div
        ref={chartContainerRef}
        className="h-full min-h-[600px] w-full"
      />

      <div className="pointer-events-none absolute bottom-3 left-4 rounded bg-black/70 px-3 py-1.5 text-xs text-zinc-400">
        {error ? `Error: ${error}` : status}
      </div>
    </div>
  );
}
