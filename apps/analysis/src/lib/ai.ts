/*
 * Sends the analysis request to either Google Gemini (free tier available)
 * or Anthropic Claude, and returns the structured answer.
 *
 * Which one is used:
 *  - AI_PROVIDER=gemini or AI_PROVIDER=anthropic forces a choice.
 *  - Otherwise Anthropic is used when ANTHROPIC_API_KEY is set,
 *    and Gemini when only GEMINI_API_KEY is set.
 */

export type Provider = "gemini" | "anthropic";

export type ModelResult =
  | { ok: true; raw: unknown; model: string; provider: Provider }
  | { ok: false; error: string };

type RequestInput = {
  system: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  userContent: string;
  deadline: number;
};

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const GEMINI_DEFAULT_MODELS = "gemini-3.6-flash,gemini-3.5-flash-lite";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(data: unknown, fallback: string): string {
  if (isRecord(data) && isRecord(data.error)) {
    const message = data.error.message;

    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return fallback;
}

function remaining(deadline: number): number {
  return Math.max(3000, deadline - Date.now());
}

export function pickProvider(): Provider | null {
  const wanted = process.env.AI_PROVIDER?.trim().toLowerCase();
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (wanted === "gemini") return hasGemini ? "gemini" : null;
  if (wanted === "anthropic") return hasAnthropic ? "anthropic" : null;
  if (hasAnthropic) return "anthropic";
  if (hasGemini) return "gemini";

  return null;
}

export function missingKeyMessage(): string {
  const wanted = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (wanted === "gemini") return "GEMINI_API_KEY is not configured.";
  if (wanted === "anthropic") return "ANTHROPIC_API_KEY is not configured.";

  return "No AI key is configured. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in Vercel.";
}

async function callAnthropic(input: RequestInput): Promise<ModelResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system: input.system,
      tools: [
        {
          name: input.toolName,
          description: input.toolDescription,
          input_schema: input.schema,
        },
      ],
      tool_choice: { type: "tool", name: input.toolName },
      messages: [{ role: "user", content: input.userContent }],
    }),
    signal: AbortSignal.timeout(remaining(input.deadline)),
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      error: errorMessage(data, "The analysis service returned an error."),
    };
  }

  const blocks =
    isRecord(data) && Array.isArray(data.content) ? data.content : [];

  const toolBlock = blocks.find(
    (block) => isRecord(block) && block.type === "tool_use"
  );

  return {
    ok: true,
    raw: isRecord(toolBlock) ? toolBlock.input : null,
    model: ANTHROPIC_MODEL,
    provider: "anthropic",
  };
}

type GeminiAttempt =
  | { ok: true; raw: unknown }
  | { ok: false; error: string; status: number };

function geminiBody(
  input: RequestInput,
  format: "current" | "legacy"
): string {
  const generationConfig =
    format === "current"
      ? {
          maxOutputTokens: 12000,
          temperature: 0.2,
          responseFormat: {
            text: { mimeType: "application/json", schema: input.schema },
          },
        }
      : {
          maxOutputTokens: 12000,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: input.schema,
        };

  return JSON.stringify({
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.userContent }] }],
    generationConfig,
  });
}

function readGeminiJson(data: unknown): GeminiAttempt {
  if (isRecord(data) && isRecord(data.promptFeedback)) {
    const reason = data.promptFeedback.blockReason;

    if (typeof reason === "string") {
      return {
        ok: false,
        status: 422,
        error: `Google declined to analyse this text (${reason}).`,
      };
    }
  }

  const candidates =
    isRecord(data) && Array.isArray(data.candidates) ? data.candidates : [];
  const candidate = candidates[0];

  if (!isRecord(candidate)) {
    return { ok: false, status: 502, error: "The analysis came back empty." };
  }

  if (candidate.finishReason === "MAX_TOKENS") {
    return {
      ok: false,
      status: 422,
      error: "The answer was cut off. Try a shorter text.",
    };
  }

  const content = isRecord(candidate.content) ? candidate.content : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];

  const text = parts
    .filter(
      (part): part is Record<string, unknown> =>
        isRecord(part) && typeof part.text === "string" && part.thought !== true
    )
    .map((part) => part.text as string)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return { ok: true, raw: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      status: 502,
      error: "The analysis came back unreadable. Please try again.",
    };
  }
}

async function geminiRequest(
  model: string,
  input: RequestInput
): Promise<GeminiAttempt> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  for (const format of ["current", "legacy"] as const) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: geminiBody(input, format),
      signal: AbortSignal.timeout(remaining(input.deadline)),
    });

    const data: unknown = await response.json();

    if (response.ok) {
      return readGeminiJson(data);
    }

    const message = errorMessage(data, "The analysis service returned an error.");

    // An unknown field means this API version expects the other config style.
    const fieldProblem =
      response.status === 400 && /unknown name|invalid json payload|responseFormat|responseMimeType|responseJsonSchema/i.test(message);

    if (fieldProblem && format === "current") {
      continue;
    }

    return { ok: false, error: message, status: response.status };
  }

  return { ok: false, error: "The analysis service returned an error.", status: 400 };
}

async function callGemini(input: RequestInput): Promise<ModelResult> {
  const models = (process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODELS)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  let lastError = "The analysis service returned an error.";

  for (const model of models) {
    const attempt = await geminiRequest(model, input);

    if (attempt.ok) {
      return { ok: true, raw: attempt.raw, model, provider: "gemini" };
    }

    lastError = attempt.error;

    // Missing model, no access, quota used up or overloaded: try the next model.
    if (![403, 404, 429, 500, 503].includes(attempt.status)) {
      break;
    }
  }

  return { ok: false, error: lastError };
}

export async function runModel(
  provider: Provider,
  input: RequestInput
): Promise<ModelResult> {
  return provider === "gemini" ? callGemini(input) : callAnthropic(input);
}
