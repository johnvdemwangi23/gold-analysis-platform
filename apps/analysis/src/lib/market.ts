export const timeframes = [
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

export type Timeframe = (typeof timeframes)[number];

export type MarketSnapshot = {
  instrument: string;
  timeframe: Timeframe;
  candleCount: number;
  fetchedAt: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
