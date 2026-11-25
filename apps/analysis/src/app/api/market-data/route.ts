import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const intervalMap = {
  M1: "1min",
  M5: "5min",
  M15: "15min",
  M30: "30min",
  H1: "1h",
  H4: "4h",
  D1: "1day",
  W1: "1week",
  MN1: "1month",
} as const;

type PlatformInterval = keyof typeof intervalMap;

type TwelveDataValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type TwelveDataResponse = {
  status?: string;
  code?: number;
  message?: string;
  values?: TwelveDataValue[];
  meta?: {
    symbol?: string;
    interval?: string;
  };
};

const intervalSeconds: Record<string, number> = {
  "1min": 60,
  "5min": 300,
  "15min": 900,
  "30min": 1800,
  "1h": 3600,
  "4h": 14400,
};

const newYorkClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/*
 * Spot gold follows the forex week: it closes on Friday at
 * 17:00 New York time and reopens on Sunday at 17:00 New York time.
 * Using New York time keeps this correct through daylight saving changes.
 */
const WEEK_CLOSE_MINUTE = 5 * 1440 + 17 * 60;
const WEEK_OPEN_MINUTE = 17 * 60;

function isMarketClosedAt(unixSeconds: number): boolean {
  const parts = newYorkClock.formatToParts(
    new Date(unixSeconds * 1000)
  );

  const weekday =
    weekdayIndex[
      parts.find((part) => part.type === "weekday")?.value ?? "Mon"
    ] ?? 1;

  const hour = Number(
    parts.find((part) => part.type === "hour")?.value ?? 0
  );

  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0
  );

  const minuteOfWeek = weekday * 1440 + hour * 60 + minute;

  return (
    minuteOfWeek >= WEEK_CLOSE_MINUTE ||
    minuteOfWeek < WEEK_OPEN_MINUTE
  );
}

/*
 * A candle is removed only when its whole period falls inside the
 * weekend closure, so the last candle before the close and the first
 * candle after the open are kept.
 */
function isWeekendCandle(
  startTime: number,
  durationSeconds: number
): boolean {
  return (
    isMarketClosedAt(startTime) &&
    isMarketClosedAt(startTime + durationSeconds - 1)
  );
}

function toUnixTime(datetime: string): number {
  const iso = datetime.includes(" ")
    ? `${datetime.replace(" ", "T")}Z`
    : `${datetime}T00:00:00Z`;

  return Math.floor(new Date(iso).getTime() / 1000);
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "TWELVE_DATA_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const requested =
    request.nextUrl.searchParams.get("interval")?.toUpperCase() ?? "H4";

  if (!(requested in intervalMap)) {
    return Response.json(
      {
        error: "Unsupported timeframe.",
        supported: Object.keys(intervalMap),
      },
      { status: 400 }
    );
  }

  const timeframe = requested as PlatformInterval;
  const providerInterval = intervalMap[timeframe];

  const latestOnly =
    request.nextUrl.searchParams.get("latest") === "1";

  const params = new URLSearchParams({
    symbol: "XAU/USD",
    interval: providerInterval,
    outputsize: latestOnly ? "1" : "300",
    apikey: apiKey,
  });

  if (
    providerInterval.endsWith("min") ||
    providerInterval.endsWith("h")
  ) {
    params.set("timezone", "UTC");
  }

  try {
    const response = await fetch(
      `https://api.twelvedata.com/time_series?${params.toString()}`,
      {
        cache: "no-store",
      }
    );

    const data = (await response.json()) as TwelveDataResponse;

    if (!response.ok || data.status === "error" || !data.values) {
      return Response.json(
        {
          error: data.message ?? "Twelve Data request failed.",
          providerCode: data.code ?? response.status,
        },
        { status: 502 }
      );
    }

    const candles = data.values
      .map((value) => ({
        time: toUnixTime(value.datetime),
        open: Number(value.open),
        high: Number(value.high),
        low: Number(value.low),
        close: Number(value.close),
      }))
      .filter(
        (candle) =>
          Number.isFinite(candle.time) &&
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close)
      )
      .sort((a, b) => a.time - b.time)
      .filter((candle) => {
        const duration = intervalSeconds[providerInterval];

        return !duration || !isWeekendCandle(candle.time, duration);
      });

    return Response.json({
      instrument: "XAUUSD",
      providerSymbol: "XAU/USD",
      timeframe,
      providerInterval,
      timezone: "UTC",
      fetchedAt: new Date().toISOString(),
      candleCount: candles.length,
      candles,
    });
  } catch (error) {
    console.error("Market data request failed:", error);

    return Response.json(
      { error: "Unable to retrieve market data." },
      { status: 500 }
    );
  }
}
