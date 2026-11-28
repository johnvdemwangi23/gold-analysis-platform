import type { Effect } from "@/lib/analysis";

export type NewsHorizon = "short" | "long" | "both";

export type NewsTopic =
  | "interest rates"
  | "inflation"
  | "bonds"
  | "dollar"
  | "geopolitics"
  | "central banks"
  | "gold demand"
  | "economy"
  | "other";

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  relevance: number;
  effect: Effect;
  horizon: NewsHorizon;
  topics: NewsTopic[];
  why: string;
};

export type NewsRun = {
  ranAt: string;
  fetched: number;
  added: number;
  usedAi: boolean;
  note: string | null;
};
