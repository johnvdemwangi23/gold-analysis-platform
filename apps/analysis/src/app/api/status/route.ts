import { pickProvider } from "@/lib/ai";
import { isDatabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/*
 * Safe status report for troubleshooting. It never returns a key or a full
 * address. It says which build is live, what is configured, and whether the
 * AI service answers a simple request.
 */
export async function GET() {
  const baseRaw = process.env.LLM_BASE_URL?.trim() ?? "";
  const key = (process.env.LLM_API_KEY ?? process.env.MISTRAL_API_KEY ?? "").trim();
  const models = (process.env.LLM_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);

  let host = "";
  let urlProblem: string | null = null;

  if (baseRaw) {
    try {
      const parsed = new URL(baseRaw);
      host = parsed.host;
      if (parsed.protocol !== "https:") urlProblem = "Address does not start with https://";
    } catch {
      urlProblem = "Address is not a valid URL";
    }
  }

  const base = (baseRaw || "https://api.mistral.ai/v1").replace(/\/+$/, "");

  let test: { status?: number; ok?: boolean; error?: string } = {};

  if (!urlProblem && key) {
    try {
      const response = await fetch(`${base}/models`, {
        headers: { authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      test = { status: response.status, ok: response.ok };
    } catch (error) {
      const cause = (error as { cause?: { code?: unknown } }).cause;
      test = {
        error: `${error instanceof Error ? error.name : "Error"}: ${
          error instanceof Error ? error.message : "failed"
        }${cause?.code ? `, ${String(cause.code)}` : ""}`.slice(0, 200),
      };
    }
  }

  return Response.json({
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
    provider: pickProvider(),
    llm: {
      keySet: key.length > 0,
      keyLength: key.length,
      keyLooksLike: key.startsWith("sk-or-") ? "openrouter" : key ? "other" : "none",
      baseUrlSet: baseRaw.length > 0,
      baseUrlHost: host || null,
      baseUrlProblem: urlProblem,
      models,
    },
    geminiKeySet: Boolean(process.env.GEMINI_API_KEY),
    databaseConfigured: isDatabaseConfigured(),
    modelsListTest: test,
  });
}
