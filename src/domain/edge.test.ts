import { describe, expect, it } from "vitest";
import { ADDRESSES } from "./sample";
import { importSettlemany } from "./importGroup";
import { checkMath } from "./mathCheck";
import { MAX_SETTLE_CENTS, amountInputError, parseUsdToCents } from "./money";
import type { Group } from "./ledger";
import type { ReviewInput } from "./types";
import { explainServFailure } from "../serv/errors";
import { reviewDemo } from "../serv/review";

function review(group: Group): ReviewInput {
  return {
    network: "chipnet",
    group,
    receivers: group.members.map((member) => ({ memberId: member.id, address: member.address })),
    notes: "",
    pseudonymize: true,
    includeAddresses: false,
  };
}

describe("thin ledgers", () => {
  it("rejects an empty group, one person, and a group with no expenses", () => {
    const empty = review({ id: "empty", name: "Empty", members: [], expenses: [] });
    const one = review({
      id: "one",
      name: "Just Maya",
      members: [{ id: "maya", name: "Maya Chen", address: ADDRESSES.maya }],
      expenses: [],
    });
    const quiet = review({
      id: "quiet",
      name: "No bills",
      members: [
        { id: "maya", name: "Maya Chen", address: ADDRESSES.maya },
        { id: "kenji", name: "Kenji Sato", address: ADDRESSES.kenji },
      ],
      expenses: [],
    });
    for (const input of [empty, one, quiet]) {
      const audit = reviewDemo(input, new Date("2026-11-14T12:00:00.000Z"));
      expect(audit.finalVerdict).toBe("REJECT");
      expect(audit.checks.some((check) => check.id === "math-empty" && check.hard)).toBe(true);
      expect(audit.checks.some((check) => /owed money/.test(check.title))).toBe(false);
    }
  });

  it("refuses an amount that is no longer an exact cent", () => {
    const group: Group = {
      id: "huge",
      name: "Huge",
      members: [
        { id: "maya", name: "Maya Chen", address: ADDRESSES.maya },
        { id: "kenji", name: "Kenji Sato", address: ADDRESSES.kenji },
      ],
      expenses: [
        {
          id: "bill",
          memo: "Bill",
          payerId: "maya",
          amountCents: MAX_SETTLE_CENTS + 1,
          currency: "USD",
          usdCents: MAX_SETTLE_CENTS + 1,
          splitMode: "equal",
          parts: [{ memberId: "maya" }, { memberId: "kenji" }],
        },
      ],
    };
    const findings = checkMath(group);
    expect(findings.some((finding) => finding.id === "math-expense-bill-size" && finding.hard)).toBe(true);
    expect(parseUsdToCents("10000000.01")).toBeNull();
    expect(amountInputError("10000000.01")).toMatch(/10,000,000/);
    expect(amountInputError("32.50")).toBeNull();
    expect(amountInputError("12.")).toBeNull();
    expect(amountInputError("nope")).toMatch(/dollars and cents/);
  });
});

describe("import errors", () => {
  it("rejects invalid JSON and a bare share link", () => {
    expect(importSettlemany("{").ok).toBe(false);
    expect(importSettlemany("not json").ok).toBe(false);
    const link = importSettlemany("https://mzee04.github.io/settlemany/#/group/lisbon-weekend");
    expect(link.ok).toBe(false);
    if (!link.ok) expect(link.error).toMatch(/localStorage|settlemany\.v1/);
  });
});

describe("SERV failure messages", () => {
  it("explains timeout, a rejected key, rate limiting, and server errors without the raw body", () => {
    expect(explainServFailure(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })).message).toMatch(/too long/);
    const denied = explainServFailure(Object.assign(new Error("401 Incorrect API key sk-secret"), { status: 401 }));
    expect(denied.status).toBe(401);
    expect(denied.message).toMatch(/rejected the API key/);
    expect(denied.message).not.toMatch(/sk-secret/);
    expect(explainServFailure(Object.assign(new Error("429 slow down"), { status: 429 })).message).toMatch(/limiting/);
    expect(explainServFailure(Object.assign(new Error("<html>bad gateway</html>"), { status: 502 })).message).toMatch(/server error/);
    expect(explainServFailure(Object.assign(new Error("<html>bad gateway</html>"), { status: 502 })).message).not.toMatch(/<html>/);
    expect(explainServFailure(new Error("SERV returned an empty verdict.")).message).toMatch(/empty or not JSON/);
    expect(explainServFailure(new Error("SERV did not return JSON.")).message).toMatch(/demo mode/);
  });
});
