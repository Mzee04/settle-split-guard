import OpenAI from "openai";
import type { ServOpinion, ServPacket } from "../domain/types";
import { parseServOpinion } from "./opinion";
import { SERV_BASE_URL, SERV_MODEL, SHADOW_HINT, SYSTEM_PROMPT } from "./prompt";
import { VERDICT_SCHEMA } from "./schema";

/** Two retries after the first call. Empty and non-JSON bodies are worth another try. */
export const SERV_MAX_ATTEMPTS = 3;
export const SERV_RETRY_DELAYS_MS = [500, 1500];

export type LiveServResult = {
  opinion: ServOpinion;
  responseId: string | null;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
};

/**
 * Body of the chat completion. SERV strips every `serv_*` tool before the
 * upstream model sees the request, and it forwards `tool_choice` unchanged.
 * Setting `tool_choice` here makes the upstream call fail with
 * "tool_choice is only allowed when tools are specified", because no tools
 * remain. The official SERV tool examples omit `tool_choice`. Structured
 * output stays on `response_format`.
 */
export function servCompletionBody(packet: ServPacket) {
  return {
    model: SERV_MODEL,
    reasoning_effort: "low" as const,
    max_completion_tokens: 1400,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `Review this settlement. Reply with the JSON object only.\n\n${JSON.stringify(packet)}`,
      },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "settlement_verdict",
        strict: true,
        schema: VERDICT_SCHEMA,
      },
    },
    tools: [
      { type: "function" as const, function: { name: "serv_prompt_guard" } },
      {
        type: "function" as const,
        function: {
          name: "serv_shadow_agent",
          description: "Validate the settlement verdict before it is returned.",
          parameters: {
            type: "object",
            properties: {
              hint: { type: "string", default: SHADOW_HINT },
              max_iterations: { type: "integer", default: 2 },
            },
          },
        },
      },
    ],
  };
}

export function isRetryableServFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /empty verdict|did not return JSON|returned a non-object/i.test(error.message);
}

export async function withServContentRetries<T>(
  attempt: () => Promise<T>,
  options?: { sleep?: (ms: number) => Promise<void>; maxAttempts?: number; delays?: number[] },
): Promise<T> {
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options?.maxAttempts ?? SERV_MAX_ATTEMPTS;
  const delays = options?.delays ?? SERV_RETRY_DELAYS_MS;
  let last: Error | null = null;
  for (let index = 0; index < maxAttempts; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
      if (index === maxAttempts - 1 || !isRetryableServFailure(last)) throw last;
      await sleep(delays[index] ?? delays[delays.length - 1] ?? 1500);
    }
  }
  throw last ?? new Error("SERV returned an empty verdict.");
}

/**
 * Server-side SERV Reasoning call. The route handler reads SERV_API_KEY and passes it in.
 * Every request includes a system prompt, a JSON schema, the prompt guard, and the shadow agent.
 */
export async function requestServOpinion(packet: ServPacket, apiKey: string): Promise<LiveServResult> {
  const client = new OpenAI({
    baseURL: SERV_BASE_URL,
    apiKey,
  });
  return withServContentRetries(async () => {
    const completion = await client.chat.completions.create(servCompletionBody(packet), {
      signal: AbortSignal.timeout(28_000),
    });
    const content = completion.choices[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("SERV returned an empty verdict.");
    return {
      opinion: parseServOpinion(content),
      responseId: completion.id ?? null,
      model: completion.model || SERV_MODEL,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens ?? null,
            completionTokens: completion.usage.completion_tokens ?? null,
            totalTokens: completion.usage.total_tokens ?? null,
          }
        : null,
    };
  });
}
