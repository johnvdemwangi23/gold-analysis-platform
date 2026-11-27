import type {
  AnalysisListItem,
  Confidence,
  GoldBias,
  TranscriptAnalysis,
} from "@/lib/analysis";

/*
 * Talks to Supabase through its REST API with plain fetch, so no extra
 * package is needed. Server use only: it reads the service role key.
 */

type DatabaseConfig = { url: string; key: string };

function getConfig(): DatabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  return url && key ? { url, key } : null;
}

export function isDatabaseConfigured(): boolean {
  return getConfig() !== null;
}

type Row = {
  id: string;
  created_at: string;
  title: string;
  source: string;
  source_url: string | null;
  transcript: string;
  analysis: TranscriptAnalysis;
  bias: GoldBias;
  confidence: Confidence;
  headline: string;
};

async function request(
  path: string,
  init: RequestInit & { prefer?: string } = {}
): Promise<unknown> {
  const config = getConfig();

  if (!config) {
    throw new Error("Database is not configured.");
  }

  const headers: Record<string, string> = {
    apikey: config.key,
    "content-type": "application/json",
  };

  // Legacy service role keys are JWTs and also go in Authorization.
  // New "sb_secret_" keys must only be sent in the apikey header.
  if (config.key.startsWith("eyJ")) {
    headers.authorization = `Bearer ${config.key}`;
  }

  if (init.prefer) {
    headers.prefer = init.prefer;
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: init.method,
    body: init.body,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `Database request failed (${response.status}).`;

    throw new Error(message);
  }

  return data;
}

export async function saveAnalysis(input: {
  title: string;
  source: string;
  sourceUrl: string | null;
  transcript: string;
  analysis: TranscriptAnalysis;
}): Promise<string> {
  const data = (await request("analyses", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      title: input.title,
      source: input.source,
      source_url: input.sourceUrl,
      transcript: input.transcript,
      analysis: input.analysis,
      bias: input.analysis.goldVerdict.bias,
      confidence: input.analysis.goldVerdict.confidence,
      headline: input.analysis.headline,
    }),
  })) as Row[];

  return data[0].id;
}

export async function listAnalyses(limit = 50): Promise<AnalysisListItem[]> {
  const data = (await request(
    `analyses?select=id,created_at,title,source,source_url,bias,confidence,headline&order=created_at.desc&limit=${limit}`
  )) as Pick<
    Row,
    | "id"
    | "created_at"
    | "title"
    | "source"
    | "source_url"
    | "bias"
    | "confidence"
    | "headline"
  >[];

  return data.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    source: row.source,
    sourceUrl: row.source_url,
    bias: row.bias,
    confidence: row.confidence,
    headline: row.headline,
  }));
}

export async function getAnalysis(id: string): Promise<{
  analysis: TranscriptAnalysis;
  title: string;
  source: string;
  sourceUrl: string | null;
  transcript: string;
} | null> {
  const data = (await request(
    `analyses?select=title,source,source_url,transcript,analysis&id=eq.${id}&limit=1`
  )) as Pick<Row, "title" | "source" | "source_url" | "transcript" | "analysis">[];

  const row = data[0];

  return row
    ? {
        analysis: row.analysis,
        title: row.title,
        source: row.source,
        sourceUrl: row.source_url,
        transcript: row.transcript,
      }
    : null;
}

export async function deleteAnalysis(id: string): Promise<void> {
  await request(`analyses?id=eq.${id}`, { method: "DELETE" });
}
