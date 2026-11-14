import { describe, expect, it } from "vitest";
import type { ServPacket } from "../domain/types";
import { SHADOW_HINT, SYSTEM_PROMPT } from "./prompt";
import { VERDICT_SCHEMA } from "./schema";
import { servCompletionBody } from "./client";

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
  });
});
