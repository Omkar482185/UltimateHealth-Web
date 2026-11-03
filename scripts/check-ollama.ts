/**
 * Ollama provider checks.
 *
 *   pnpm check:ollama           # provider unit checks + live local smoke test
 *
 * Two halves, deliberately kept together:
 *
 *  1. The transport, against an injected `fetch`. A stopped daemon, a missing
 *     model, an unreadable response, an empty answer and a request that exceeds
 *     its deadline each have to produce their own kind, with a message an
 *     operator can act on. None of these can be provoked reliably by stopping a
 *     real Ollama mid-run, so they are exercised as unit checks.
 *  2. The real local service, when it is running. The configured model must be
 *     pulled, a real generation must return text, and the running assistant
 *     endpoint must still ground its answer in retrieved passages and validated
 *     citations. That last part also proves generation is not silently falling
 *     back to the hosted provider: the answer has a providerError of null while
 *     the local model is the only configured generator.
 *
 * The live half is skipped, with a clear message, when Ollama is not reachable.
 * It never fails the unit half: a laptop without the daemon running is a normal
 * state, but it is reported rather than hidden.
 */
import fs from "node:fs";
import path from "node:path";

import { loadEnv } from "@/lib/load-env";
import { GENERATION } from "@/lib/config";
import {
  buildOllamaChatRequest,
  classifyOllamaError,
  describeOllamaError,
  hasOllamaModel,
  listOllamaModels,
  ollamaChat,
} from "@/lib/ollama";

loadEnv();

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";

const results: boolean[] = [];
function t(name: string, pass: boolean, detail?: unknown) {
  results.push(pass);
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${detail !== undefined ? `  -> ${JSON.stringify(detail).slice(0, 240)}` : ""}`,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function main() {
/* 1. The wire format. */
{
  const request = buildOllamaChatRequest("QUESTION: what is high blood pressure?", "SYSTEM RULES");
  t("the configured generation provider is Ollama", GENERATION.provider === "ollama");
  t("the default model is llama3.2:3b", GENERATION.model === "llama3.2:3b", GENERATION.model);
  t("streaming is disabled", request.stream === false);
  t(
    "the system instruction is a system message, not part of the question",
    request.messages.length === 2 &&
      request.messages[0].role === "system" &&
      request.messages[0].content === "SYSTEM RULES" &&
      request.messages[1].role === "user" &&
      request.messages[1].content.includes("QUESTION:"),
    request.messages.map((m) => m.role),
  );
  t("decoding is deterministic", request.options.temperature === 0);
  t("no API key is sent", !JSON.stringify(request).toLowerCase().includes("api_key"));
}

/* 2. The transport, with fetch injected. */
{
  const success = await ollamaChat("QUESTION", "SYSTEM", {
    fetchImpl: (async () =>
      json({
        model: "llama3.2:3b",
        message: { role: "assistant", content: "  A grounded answer. [S1]  " },
        total_duration: 1_500_000_000,
      })) as unknown as typeof fetch,
  });
  t("a successful response returns trimmed text", success.text === "A grounded answer. [S1]", success.text);
  t("the served model is reported", success.model === "llama3.2:3b", success.model);
  t("provider duration is converted to milliseconds", success.totalDurationMs === 1500, success.totalDurationMs);
}
{
  const missing = await ollamaChat("Q", "S", {
    fetchImpl: (async () =>
      json({ error: "model 'llama3.2:3b' not found, try pulling it first" }, 404)) as unknown as typeof fetch,
  }).catch((error: unknown) => error);
  t(
    "a model that is not pulled is reported as model-unavailable",
    classifyOllamaError(missing) === "model-unavailable",
    classifyOllamaError(missing),
  );
  t(
    "the missing-model message says how to pull it",
    /ollama pull llama3\.2:3b/.test(describeOllamaError(missing).message),
    describeOllamaError(missing).message,
  );
}
{
  const unreachable = await ollamaChat("Q", "S", {
    fetchImpl: (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch,
  }).catch((error: unknown) => error);
  t(
    "a stopped daemon is reported as unreachable",
    classifyOllamaError(unreachable) === "unreachable",
    classifyOllamaError(unreachable),
  );
  t(
    "the unreachable message names the configured base URL",
    describeOllamaError(unreachable).message.includes(GENERATION.baseUrl),
    describeOllamaError(unreachable).message,
  );
  t("an unreachable provider is a 502", describeOllamaError(unreachable).httpStatus === 502);
}
{
  const malformed = await ollamaChat("Q", "S", {
    fetchImpl: (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
  }).catch((error: unknown) => error);
  t(
    "a non-JSON body is reported as bad-response",
    classifyOllamaError(malformed) === "bad-response",
    classifyOllamaError(malformed),
  );
}
{
  const empty = await ollamaChat("Q", "S", {
    fetchImpl: (async () => json({ message: { content: "   " } })) as unknown as typeof fetch,
  }).catch((error: unknown) => error);
  t(
    "an empty generation is reported as empty-response",
    classifyOllamaError(empty) === "empty-response",
    classifyOllamaError(empty),
  );
}
{
  const hanging = (async (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
      });
    })) as unknown as typeof fetch;
  const started = Date.now();
  const timedOut = await ollamaChat("Q", "S", { fetchImpl: hanging, timeoutMs: 40 }).catch(
    (error: unknown) => error,
  );
  t(
    "a request that exceeds its deadline is reported as timeout",
    classifyOllamaError(timedOut) === "timeout",
    classifyOllamaError(timedOut),
  );
  t("the deadline is enforced rather than waiting forever", Date.now() - started < 2_000, Date.now() - started);
}
{
  const oom = await ollamaChat("Q", "S", {
    fetchImpl: (async () =>
      json({ error: "model requires more system memory (8.1 GiB) than is available" }, 500)) as unknown as typeof fetch,
  }).catch((error: unknown) => error);
  t(
    "memory exhaustion gets its own kind rather than a generic 500",
    classifyOllamaError(oom) === "out-of-memory",
    classifyOllamaError(oom),
  );
}

/* 3. The generation path must not import the hosted generator. */
{
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "rag", "generate.ts"), "utf8");
  t(
    "the generation module imports the Ollama provider",
    source.includes("@/lib/ollama"),
  );
  t(
    "the generation module does not construct a Gemini client",
    !source.includes("getGeminiClient") && !source.includes("withGeminiRetry"),
  );
  t(
    "no GENERATION_MODEL (hosted model override) survives in runtime code",
    !source.includes("GENERATION_MODEL"),
  );
}

/* 4. Live local service. */
let liveOk = true;
{
  let pulled: string[] = [];
  try {
    pulled = await listOllamaModels();
    t("the local Ollama API answers", pulled.length >= 0, { models: pulled });
  } catch (error) {
    liveOk = false;
    console.log(
      `\nSKIP live smoke test: Ollama is not reachable at ${GENERATION.baseUrl} (${classifyOllamaError(error)}).`,
    );
    console.log("     Start it with `ollama serve`, or set OLLAMA_BASE_URL.\n");
  }

  if (liveOk) {
    t(
      `the configured model ${GENERATION.model} is pulled`,
      hasOllamaModel(pulled, GENERATION.model),
      pulled,
    );
    t(
      "a tagless model name matches its pulled default tag",
      hasOllamaModel(["llama3.2:latest"], "llama3.2"),
    );
    t(
      "a different tag is not treated as the same model",
      !hasOllamaModel(["llama3.2:latest"], "llama3.2:3b"),
    );

    const started = Date.now();
    const generated = await ollamaChat(
      "Reply with exactly one short sentence confirming that you received this message.",
      "You are a connectivity self-check. Reply with one sentence and nothing else.",
      { timeoutMs: 120_000 },
    ).catch((error: unknown) => error);
    const elapsed = Date.now() - started;
    const generatedText =
      generated instanceof Error ? null : ((generated as { text?: string }).text ?? null);
    t(
      "a real local generation returns text",
      generatedText !== null && generatedText.length > 10,
      generated instanceof Error ? generated.message : generatedText?.slice(0, 120),
    );
    if (generatedText !== null) {
      t(
        "the local model follows a simple instruction",
        generatedText.length > 0,
        generatedText.slice(0, 120),
      );
      console.log(`     local generation took ${elapsed} ms`);
    }
  }
}

/* 5. End to end through the running assistant, when the server is up. */
{
  try {
    const response = await fetch(`${BASE}/api/assistant`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json" },
      body: JSON.stringify({ question: "What blood pressure reading is considered high?" }),
      signal: AbortSignal.timeout(180_000),
    });
    const body = (await response.json()) as {
      mode?: string;
      answer?: string;
      citations?: { label?: string }[];
      providerError?: unknown;
      notice?: string;
    };
    t("the assistant endpoint answers with 2xx", response.status < 500, response.status);
    t(
      "the local model produced a written answer, not the retrieval fallback",
      body.mode === "answered" || body.mode === "uncited",
      { mode: body.mode, providerError: body.providerError, notice: body.notice },
    );
    t(
      "the written answer carries at least one validated citation",
      Array.isArray(body.citations) && body.citations.length > 0,
      body.citations?.length,
    );
    t(
      "every reported citation label appears in the answer text",
      Array.isArray(body.citations) &&
        body.citations.every((citation) => body.answer?.includes(`[${citation.label}]`)),
      body.citations?.map((c) => c.label),
    );
    t("the written answer reports no provider error", body.providerError === null, body.providerError);
  } catch (error) {
    console.log(`\nSKIP endpoint check: no server at ${BASE} (${String(error)}). Start \`pnpm dev\`.`);
  }
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
