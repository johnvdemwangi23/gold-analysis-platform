"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

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

export default function GoldChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading real XAU/USD H4 data...");
  const [error, setError] = useState<string | null>(null);

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
        vertLines: { color: "#171b22" },
        horzLines: { color: "#171b22" },
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

    let cancelled = false;

    async function loadMarketData() {
      try {
        const response = await fetch("/api/market-data?interval=H4", {
          cache: "no-store",
        });

        const result = (await response.json()) as MarketDataResponse;

        if (!response.ok) {
          throw new Error(result.error ?? "Market data request failed.");
        }

        if (cancelled) return;

        const candles: CandlestickData<UTCTimestamp>[] =
          result.candles.map((candle) => ({
            time: candle.time as UTCTimestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }));

        candleSeries.setData(candles);
        chart.timeScale().fitContent();

        setStatus(
          `${result.instrument} · ${result.timeframe} · ${result.candleCount} real candles`
        );
      } catch (err) {
        if (cancelled) return;

        const message =
          err instanceof Error ? err.message : "Unable to load market data.";

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
      cancelled = true;
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  return (
    <div className="relative h-full min-h-[600px] w-full">
      <div ref={chartContainerRef} className="h-full min-h-[600px] w-full" />

      <div className="pointer-events-none absolute bottom-3 left-4 rounded bg-black/60 px-3 py-1.5 text-xs text-zinc-400">
        {error ? `Error: ${error}` : status}
      </div>
    </div>
  );
}
