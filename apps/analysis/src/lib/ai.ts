/*
 * Sends the analysis request to one of three services and returns the
 * structured answer:
 *  - "llm": any OpenAI-style chat service (Mistral by default, which has a
 *    free plan). Set LLM_API_KEY, and optionally LLM_BASE_URL and LLM_MODEL.
 *  - "gemini": Google Gemini (needs a project with API access).
 *  - "anthropic": Anthropic Claude (paid).
 *
 * Which one is used:
 *  - AI_PROVIDER=llm (or mistral), gemini or anthropic forces a choice.
 *  - Otherwise the first key found wins, in this order:
 *    ANTHROPIC_API_KEY, LLM_API_KEY (or MISTRAL_API_KEY), GEMINI_API_KEY.
 */

export type Provider = "gemini" | "anthropic" | "llm";

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
const LLM_DEFAULT_BASE_URL = "https://api.mistral.ai/v1";
const LLM_DEFAULT_MODELS = "mistral-small-latest";

function llmKey(): string {
  return (
    process.env.LLM_API_KEY?.trim() ||
    process.env.MISTRAL_API_KEY?.trim() ||
    ""
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(data: unknown, fallback: string): string {
  if (isRecord(data)) {
    const nested = isRecord(data.error) ? data.error.message : undefined;

    for (const message of [nested, data.message, data.detail]) {
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    }

    if (Array.isArray(data.detail)) {
      const first = data.detail[0];

      if (isRecord(first) && typeof first.msg === "string" && first.msg.trim()) {
        return first.msg.trim();
      }
    }
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function remaining(deadline: number): number {
  return Math.max(3000, deadline - Date.now());
}

function wantedProvider(): "gemini" | "anthropic" | "llm" | null {
  const wanted = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (wanted === "gemini" || wanted === "anthropic") return wanted;
  if (wanted === "llm" || wanted === "mistral" || wanted === "openai") {
    return "llm";
  }

  return null;
}

export function pickProvider(): Provider | null {
  const wanted = wantedProvider();
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasLlm = Boolean(llmKey());

  if (wanted === "gemini") return hasGemini ? "gemini" : null;
  if (wanted === "anthropic") return hasAnthropic ? "anthropic" : null;
  if (wanted === "llm") return hasLlm ? "llm" : null;
  if (hasAnthropic) return "anthropic";
  if (hasLlm) return "llm";
  if (hasGemini) return "gemini";

  return null;
}

export function missingKeyMessage(): string {
  const wanted = wantedProvider();

  if (wanted === "gemini") return "GEMINI_API_KEY is not configured.";
  if (wanted === "anthropic") return "ANTHROPIC_API_KEY is not configured.";
  if (wanted === "llm") return "LLM_API_KEY is not configured.";

  return "No AI key is configured. Add LLM_API_KEY (Mistral has a free plan), GEMINI_API_KEY or ANTHROPIC_API_KEY in Vercel.";
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

type LlmMode = "json_schema" | "json_object" | "plain";

type LlmAttempt =
  | { ok: true; raw: unknown }
  | { ok: false; error: string; status: number };

function llmBody(input: RequestInput, model: string, mode: LlmMode): string {
  // The schema is also written into the prompt, so models that ignore
  // response_format still know the exact shape to return.
  const system = `${input.system}

The JSON object must match this JSON Schema:
${JSON.stringify(input.schema)}`;

  const responseFormat =
    mode === "json_schema"
      ? {
          type: "json_schema",
          json_schema: {
            name: input.toolName,
            strict: false,
            schema: input.schema,
          },
        }
      : mode === "json_object"
        ? { type: "json_object" }
        : undefined;

  return JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input.userContent },
    ],
    temperature: 0.2,
    max_tokens: 8000,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });
}

function readLlmJson(data: unknown): LlmAttempt {
  const choices =
    isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
  const choice = choices[0];

  if (!isRecord(choice)) {
    return { ok: false, status: 502, error: "The analysis came back empty." };
  }

  if (choice.finish_reason === "length") {
    return {
      ok: false,
      status: 422,
      error: "The answer was cut off. Try a shorter text.",
    };
  }

  const message = isRecord(choice.message) ? choice.message : {};
  const content = message.content;
  let text = "";

  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    // Some models return a list of chunks. Keep the text ones, skip thinking.
    text = content
      .filter(
        (chunk): chunk is Record<string, unknown> =>
          isRecord(chunk) && chunk.type === "text" && typeof chunk.text === "string"
      )
      .map((chunk) => chunk.text as string)
      .join("");
  }

  text = text
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

function llmFriendlyError(status: number, message: string): string {
  if (status === 401) {
    return "The AI service rejected the key (401). Check LLM_API_KEY in Vercel.";
  }

  if (status === 429) {
    return `The AI service is busy or the free limit was reached (429). Wait a minute and try again. ${message}`.trim();
  }

  return message;
}

async function llmRequest(
  baseUrl: string,
  model: string,
  input: RequestInput
): Promise<LlmAttempt> {
  const modes: LlmMode[] = ["json_schema", "json_object", "plain"];
  let last: LlmAttempt = {
    ok: false,
    status: 400,
    error: "The analysis service returned an error.",
  };

  for (const mode of modes) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${llmKey()}`,
      },
      body: llmBody(input, model, mode),
      signal: AbortSignal.timeout(remaining(input.deadline)),
    });

    const data = await readJson(response);

    if (response.ok) {
      return readLlmJson(data);
    }

    const message = errorMessage(
      data,
      "The analysis service returned an error."
    );

    last = {
      ok: false,
      status: response.status,
      error: llmFriendlyError(response.status, message),
    };

    // A 400 or 422 usually means this response_format is not accepted.
    // Try a plainer one before giving up.
    if (response.status !== 400 && response.status !== 422) {
      return last;
    }
  }

  return last;
}

async function callLlm(input: RequestInput): Promise<ModelResult> {
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || LLM_DEFAULT_BASE_URL)
    .replace(/\/+$/, "");

  const models = (process.env.LLM_MODEL?.trim() || LLM_DEFAULT_MODELS)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  let lastError = "The analysis service returned an error.";

  for (const model of models) {
    const attempt = await llmRequest(baseUrl, model, input);

    if (attempt.ok) {
      return { ok: true, raw: attempt.raw, model, provider: "llm" };
    }

    lastError = attempt.error;

    // Missing model, no access, quota used up or overloaded: try the next model.
    if (![403, 404, 429, 500, 502, 503].includes(attempt.status)) {
      break;
    }
  }

  return { ok: false, error: lastError };
}

export async function runModel(
  provider: Provider,
  input: RequestInput
): Promise<ModelResult> {
  if (provider === "gemini") return callGemini(input);
  if (provider === "llm") return callLlm(input);

  return callAnthropic(input);
}
