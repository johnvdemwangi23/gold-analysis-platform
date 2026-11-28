import { generateRef } from "@/lib/ref";
import type { NewsItem, NewsRun } from "@/lib/newsTypes";
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

/* ---------------------------------------------------------------- news */

type NewsRow = {
  id: string;
  url: string;
  title: string;
  source: string;
  published_at: string;
  relevance: number;
  effect: NewsItem["effect"];
  horizon: NewsItem["horizon"];
  topics: NewsItem["topics"] | null;
  why: string | null;
};

const NEWS_COLUMNS =
  "id,url,title,source,published_at,relevance,effect,horizon,topics,why";

function toNewsItem(row: NewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    source: row.source,
    publishedAt: row.published_at,
    relevance: row.relevance,
    effect: row.effect,
    horizon: row.horizon,
    topics: row.topics ?? [],
    why: row.why ?? "",
  };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export async function recentNewsUrls(days = 4): Promise<Set<string>> {
  const data = (await request(
    `news_items?select=url&fetched_at=gte.${daysAgoIso(days)}&limit=1000`
  )) as { url: string }[];

  return new Set(data.map((row) => row.url));
}

export async function saveNewsItems(
  items: {
    url: string;
    title: string;
    source: string;
    publishedAt: string;
    relevance: number;
    effect: NewsItem["effect"];
    horizon: NewsItem["horizon"];
    topics: NewsItem["topics"];
    why: string;
  }[]
): Promise<void> {
  if (items.length === 0) return;

  await request("news_items?on_conflict=url", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify(
      items.map((item) => ({
        url: item.url,
        title: item.title,
        source: item.source,
        published_at: item.publishedAt,
        relevance: item.relevance,
        effect: item.effect,
        horizon: item.horizon,
        topics: item.topics,
        why: item.why,
      }))
    ),
  });
}

export async function listNews(
  limit = 60,
  minRelevance = 6,
  days = 7
): Promise<NewsItem[]> {
  const data = (await request(
    `news_items?select=${NEWS_COLUMNS}&relevance=gte.${minRelevance}&published_at=gte.${daysAgoIso(
      days
    )}&order=published_at.desc&limit=${limit}`
  )) as NewsRow[];

  return data.map(toNewsItem);
}

export async function recentNewsForContext(limit = 8): Promise<NewsItem[]> {
  const data = (await request(
    `news_items?select=${NEWS_COLUMNS}&relevance=gte.7&published_at=gte.${daysAgoIso(
      3
    )}&order=published_at.desc&limit=${limit}`
  )) as NewsRow[];

  return data.map(toNewsItem);
}

export async function lastNewsRun(): Promise<NewsRun | null> {
  const data = (await request(
    "news_runs?select=ran_at,fetched,added,used_ai,note&order=ran_at.desc&limit=1"
  )) as {
    ran_at: string;
    fetched: number;
    added: number;
    used_ai: boolean;
    note: string | null;
  }[];

  const row = data[0];

  return row
    ? {
        ranAt: row.ran_at,
        fetched: row.fetched,
        added: row.added,
        usedAi: row.used_ai,
        note: row.note,
      }
    : null;
}

export async function recordNewsRun(run: {
  fetched: number;
  added: number;
  usedAi: boolean;
  note: string | null;
}): Promise<void> {
  await request("news_runs", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      fetched: run.fetched,
      added: run.added,
      used_ai: run.usedAi,
      note: run.note,
    }),
  });
}

export async function pruneNews(days = 14): Promise<void> {
  await request(`news_items?fetched_at=lt.${daysAgoIso(days)}`, {
    method: "DELETE",
  });
  await request(`news_runs?ran_at=lt.${daysAgoIso(days)}`, {
    method: "DELETE",
  });
}

/*
 * Used by the status page. Tries to read each table once and reports the
 * result in plain words. It never returns a key or an address.
 */
export async function databaseCheck(): Promise<Record<string, string>> {
  if (!isDatabaseConfigured()) {
    return { analyses: "not configured", news_items: "not configured", news_runs: "not configured" };
  }

  const result: Record<string, string> = {};

  for (const table of ["analyses", "news_items", "news_runs"]) {
    try {
      await request(`${table}?select=id&limit=1`);
      result[table] = "ok";
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed";
      result[table] = message.replace(/https?:\/\/\S+/g, "").slice(0, 160);
    }
  }

  return result;
}
