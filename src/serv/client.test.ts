import { describe, expect, it } from "vitest";
import type { ServPacket } from "../domain/types";
import { SERV_RETRY_DELAYS_MS, servCompletionBody, withServContentRetries } from "./client";
import { SHADOW_HINT, SYSTEM_PROMPT } from "./prompt";
import { VERDICT_SCHEMA } from "./schema";

const packet: ServPacket = {
  network: "chipnet",
  groupName: "Flat",
  people: [{ alias: "Member 1", balanceCents: 100 }],
  expenses: [],
  transfers: [],
  localFindings: [],
  notes: "",
  addressesIncluded: false,
  namesPseudonymized: true,
};

describe("SERV request shape", () => {
  const body = servCompletionBody(packet);

  it("omits tool_choice because SERV strips serv_* tools before forwarding", () => {
    expect(body).not.toHaveProperty("tool_choice");
    expect(JSON.stringify(body)).not.toContain("tool_choice");
    const forwarded = body.tools.filter((tool) => !tool.function.name.startsWith("serv_"));
    expect(forwarded).toEqual([]);
  });

  it("keeps the prompt guard, the shadow agent, and a strict JSON schema", () => {
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(body.messages[0]?.content.length).toBeGreaterThan(0);
    expect(body.messages[1]?.role).toBe("user");
    expect(body.messages[1]?.content).toContain("Member 1");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "settlement_verdict", strict: true, schema: VERDICT_SCHEMA },
    });
    expect(body.tools.map((tool) => tool.function.name)).toEqual(["serv_prompt_guard", "serv_shadow_agent"]);
    const shadow = body.tools[1]?.function;
    expect(shadow?.parameters).toMatchObject({
      type: "object",
      properties: {
        hint: { type: "string", default: SHADOW_HINT },
        max_iterations: { type: "integer", default: 2 },
      },
    });
    expect(SHADOW_HINT.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("temperature");
  });
});

describe("SERV content retries", () => {
  it("retries an empty body and a non-JSON body, then accepts JSON", async () => {
    const sleeps: number[] = [];
    const seen = ["", "not json", '{"ok":true}'];
    let calls = 0;
    const value = await withServContentRetries(
      async () => {
        const content = seen[calls] ?? "";
        calls += 1;
        if (!content.trim()) throw new Error("SERV returned an empty verdict.");
        try {
          return JSON.parse(content) as { ok: boolean };
        } catch {
          throw new Error("SERV did not return JSON.");
        }
      },
      { sleep: async (ms) => { sleeps.push(ms); }, delays: SERV_RETRY_DELAYS_MS },
    );
    expect(value).toEqual({ ok: true });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([500, 1500]);
  });

  it("stops after two retries when every body is empty", async () => {
    let calls = 0;
    await expect(
      withServContentRetries(
        async () => {
          calls += 1;
          throw new Error("SERV returned an empty verdict.");
        },
        { sleep: async () => {}, maxAttempts: 3 },
      ),
    ).rejects.toThrow(/empty verdict/);
    expect(calls).toBe(3);
  });

  it("does not retry an upstream rejection", async () => {
    let calls = 0;
    await expect(
      withServContentRetries(
        async () => {
          calls += 1;
          throw new Error("400 Invalid value for 'tool_choice'");
        },
        { sleep: async () => { throw new Error("should not sleep"); } },
      ),
    ).rejects.toThrow(/tool_choice/);
    expect(calls).toBe(1);
  });
});
