"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

const data: CandlestickData<UTCTimestamp>[] = [
  { time: 1754006400 as UTCTimestamp, open: 3275, high: 3292, low: 3264, close: 3285 },
  { time: 1754020800 as UTCTimestamp, open: 3285, high: 3301, low: 3278, close: 3296 },
  { time: 1754035200 as UTCTimestamp, open: 3296, high: 3305, low: 3281, close: 3288 },
  { time: 1754049600 as UTCTimestamp, open: 3288, high: 3312, low: 3284, close: 3307 },
  { time: 1754064000 as UTCTimestamp, open: 3307, high: 3320, low: 3295, close: 3301 },
  { time: 1754078400 as UTCTimestamp, open: 3301, high: 3316, low: 3292, close: 3311 },
  { time: 1754092800 as UTCTimestamp, open: 3311, high: 3327, low: 3304, close: 3322 },
  { time: 1754107200 as UTCTimestamp, open: 3322, high: 3331, low: 3309, close: 3315 },
  { time: 1754121600 as UTCTimestamp, open: 3315, high: 3328, low: 3302, close: 3308 },
  { time: 1754136000 as UTCTimestamp, open: 3308, high: 3321, low: 3299, close: 3318 },
  { time: 1754150400 as UTCTimestamp, open: 3318, high: 3340, low: 3312, close: 3335 },
  { time: 1754164800 as UTCTimestamp, open: 3335, high: 3344, low: 3320, close: 3327 },
  { time: 1754179200 as UTCTimestamp, open: 3327, high: 3342, low: 3317, close: 3338 },
  { time: 1754193600 as UTCTimestamp, open: 3338, high: 3354, low: 3328, close: 3349 },
  { time: 1754208000 as UTCTimestamp, open: 3349, high: 3361, low: 3335, close: 3342 },
];

export default function GoldChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

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

    const candles = chart.addSeries(CandlestickSeries, {
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

    candles.setData(data);
    chart.timeScale().fitContent();

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
    };
  }, []);

  return <div ref={chartContainerRef} className="h-full min-h-[600px] w-full" />;
}
