import OpenAI from "openai";
import type { ServOpinion, ServPacket } from "../domain/types";
import { parseServOpinion } from "./opinion";
import { SERV_BASE_URL, SERV_MODEL, SHADOW_HINT, SYSTEM_PROMPT } from "./prompt";
import { VERDICT_SCHEMA } from "./schema";

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
 * Server-side SERV Reasoning call. The route handler reads SERV_API_KEY and passes it in.
 * Every request includes a system prompt, a JSON schema, the prompt guard, and the shadow agent.
 */
export async function requestServOpinion(packet: ServPacket, apiKey: string): Promise<LiveServResult> {
  const client = new OpenAI({
    baseURL: SERV_BASE_URL,
    apiKey,
  });
  const completion = await client.chat.completions.create(
    {
      model: SERV_MODEL,
      reasoning_effort: "low",
      max_completion_tokens: 1400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Review this settlement. Reply with the JSON object only.\n\n${JSON.stringify(packet)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "settlement_verdict",
          strict: true,
          schema: VERDICT_SCHEMA,
        },
      },
      tools: [
        { type: "function", function: { name: "serv_prompt_guard" } },
        {
          type: "function",
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
      tool_choice: "none",
    },
    { signal: AbortSignal.timeout(28_000) },
  );
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("SERV returned an empty verdict.");
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
}
