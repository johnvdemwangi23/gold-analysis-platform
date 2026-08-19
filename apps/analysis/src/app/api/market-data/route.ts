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

  const params = new URLSearchParams({
    symbol: "XAU/USD",
    interval: providerInterval,
    outputsize: "300",
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
      .sort((a, b) => a.time - b.time);

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
