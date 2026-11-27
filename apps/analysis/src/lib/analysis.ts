export type GoldBias = "bullish" | "bearish" | "neutral" | "mixed";

export type Confidence = "low" | "medium" | "high";

export type SpeakerTone =
  | "hawkish"
  | "slightly_hawkish"
  | "neutral"
  | "slightly_dovish"
  | "dovish"
  | "not_applicable";

export type Direction = "up" | "down" | "neutral" | "unclear";

export type RateOutlook =
  | "cuts_likely"
  | "on_hold"
  | "hikes_possible"
  | "higher_for_longer"
  | "unclear";

export type TranscriptAnalysis = {
  headline: string;
  summary: string;
  speakerTone: SpeakerTone;
  toneNote: string;
  rates: { outlook: RateOutlook; note: string };
  dollar: { direction: Direction; note: string };
  realYields: { direction: Direction; note: string };
  inflationGrowth: string;
  goldVerdict: {
    bias: GoldBias;
    confidence: Confidence;
    horizon: string;
    reasoning: string;
  };
  keyQuotes: { quote: string; whyItMatters: string }[];
  risks: string[];
  watchNext: string[];
  droppedQuotes: number;
};

export type AnalysisRequest = {
  transcript: string;
  title?: string;
  source?: string;
  sourceUrl?: string;
};

export type SavedAnalysis = {
  id: string;
  createdAt: string;
  title: string;
  source: string;
  analysis: TranscriptAnalysis;
};

export type AnalysisListItem = {
  id: string;
  createdAt: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  bias: GoldBias;
  confidence: Confidence;
  headline: string;
};
