import { generateRef } from "@/lib/ref";
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
  ref?: string | null;
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
  ref?: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  transcript: string;
  analysis: TranscriptAnalysis;
}): Promise<{ id: string; ref: string | null }> {
  const base = {
    title: input.title,
    source: input.source,
    source_url: input.sourceUrl,
    transcript: input.transcript,
    analysis: input.analysis,
    bias: input.analysis.goldVerdict.bias,
    confidence: input.analysis.goldVerdict.confidence,
    headline: input.analysis.headline,
  };

  // The ref column is unique. On the rare clash, draw a new reference.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ref = attempt === 0 && input.ref ? input.ref : generateRef();

    try {
      const data = (await request("analyses", {
        method: "POST",
        prefer: "return=representation",
        body: JSON.stringify({ ...base, ref }),
      })) as Row[];

      return { id: data[0].id, ref: data[0].ref ?? ref };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (/duplicate key/i.test(message)) continue;

      if (/ref/i.test(message) && /column/i.test(message)) {
        // Migration 0002 has not been run yet: save without a reference.
        const data = (await request("analyses", {
          method: "POST",
          prefer: "return=representation",
          body: JSON.stringify(base),
        })) as Row[];

        return { id: data[0].id, ref: null };
      }

      throw error;
    }
  }

  throw new Error("Could not create a unique reference.");
}

export async function listAnalyses(limit = 50): Promise<AnalysisListItem[]> {
  const columns = "id,created_at,title,source,source_url,bias,confidence,headline";
  type ListRow = Pick<
    Row,
    | "id"
    | "ref"
    | "created_at"
    | "title"
    | "source"
    | "source_url"
    | "bias"
    | "confidence"
    | "headline"
  >;

  let data: ListRow[];

  try {
    data = (await request(
      `analyses?select=ref,${columns}&order=created_at.desc&limit=${limit}`
    )) as ListRow[];
  } catch {
    // The ref column does not exist until migration 0002 has been run.
    data = (await request(
      `analyses?select=${columns}&order=created_at.desc&limit=${limit}`
    )) as ListRow[];
  }

  return data.map((row) => ({
    id: row.id,
    ref: row.ref ?? null,
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
