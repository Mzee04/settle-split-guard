import { describe, expect, it } from "vitest";
import { CLEAN_REVIEW, LAGOS_REVIEW, LEAK_REVIEW } from "./sample";
import type { ServOpinion } from "./types";
import { combineVerdicts } from "./verdict";
import { buildAudit } from "../serv/review";
import { SERV_BASE_URL, SERV_MODEL } from "../serv/prompt";

function opinion(patch: Partial<ServOpinion>): ServOpinion {
  return {
    verdict: "REJECT",
    confidencePercent: 86,
    summary: "Reject.",
    fairness: [],
    disputes: [],
    destinationNotes: [],
    reasonTrail: [
      { step: "Check", because: "See the summary." },
      { step: "Notes", because: "The notes were read." },
      { step: "Recommendation", because: "This is the call." },
    ],
    ...patch,
  };
}

const meta = {
  mode: "live" as const,
  model: SERV_MODEL,
  requestedAt: "2026-11-14T12:00:00.000Z",
  completedAt: "2026-11-14T12:00:01.000Z",
  responseId: "chatcmpl-test",
  usage: null,
  shadowAgent: true,
  promptGuard: true,
  baseURL: SERV_BASE_URL,
};

describe("unsupported hard-fact claims", () => {
  it("does not let a false wrong-network REJECT raise Lagos above WAIT", () => {
    const audit = buildAudit(
      LAGOS_REVIEW,
      opinion({
        summary: "Reject. The payout is on the wrong network.",
        destinationNotes: [{ person: "Member 1", concern: "This is a mainnet address, not chipnet." }],
        fairness: [{ person: "Member 2", amountCents: 6000, reason: "They said they did not stay." }],
        reasonTrail: [
          { step: "Network", because: "The address is a mainnet address, so the network is wrong." },
          { step: "Fairness", because: "Member 2 is still on the hotel." },
          { step: "Recommendation", because: "REJECT because of the wrong network." },
        ],
      }),
      meta,
      new Date("2026-11-14T12:00:00.000Z"),
    );
    expect(audit.policy.verdict).toBe("WAIT");
    expect(audit.serv.opinion.verdict).toBe("REJECT");
    expect(audit.finalVerdict).toBe("WAIT");
    expect(audit.disagreement).toBe(true);
    expect(audit.disagreementReason).toMatch(/unsupported by policy/i);
    expect(audit.reasonTrail.some((step) => step.step === "Unsupported by policy" && /network/.test(step.because))).toBe(true);
    expect(audit.checks.some((check) => check.id === "unsupported-network-0")).toBe(true);
    expect(audit.reasonTrail.at(-1)?.step).toBe("Second opinion");
  });

  it("does not let an invented math failure turn a clean settlement into REJECT", () => {
    const combined = combineVerdicts("SETTLE", "Math clears.", "REJECT", 90, "The cents do not add up.", {
      unsupportedClaims: [
        {
          fact: "math",
          quote: "The cents do not add up.",
          because: "unsupported by policy",
        },
      ],
      servHasNonHardConcern: false,
      policyHasHardFailure: false,
    });
    expect(combined.finalVerdict).toBe("SETTLE");
    expect(combined.disagreement).toBe(true);
    expect(combined.confidencePercent).toBeLessThanOrEqual(55);
  });

  it("lets fairness hold a clean group at WAIT without adopting a false network REJECT", () => {
    const audit = buildAudit(
      CLEAN_REVIEW,
      opinion({
        summary: "Reject. Wrong network, and someone was overcharged.",
        fairness: [{ person: "Member 3", amountCents: 1500, reason: "The power bill was not theirs." }],
        reasonTrail: [
          { step: "Network", because: "Wrong network." },
          { step: "Fairness", because: "Member 3 should not pay the power bill." },
          { step: "Recommendation", because: "REJECT." },
        ],
      }),
      meta,
      new Date("2026-11-14T12:00:00.000Z"),
    );
    expect(audit.policy.verdict).toBe("SETTLE");
    expect(audit.finalVerdict).toBe("WAIT");
    expect(audit.disagreement).toBe(true);
    expect(audit.checks.some((check) => check.title.includes("Unsupported by policy: network"))).toBe(true);
  });

  it("still rejects when the policy itself has a hard math failure", () => {
    const audit = buildAudit(
      LEAK_REVIEW,
      opinion({
        summary: "Reject. The settlement is one cent short, and I also think the network is wrong.",
        reasonTrail: [
          { step: "Math", because: "The cents do not add up; it is one cent short." },
          { step: "Network", because: "Wrong network." },
          { step: "Recommendation", because: "REJECT." },
        ],
      }),
      meta,
      new Date("2026-11-14T12:00:00.000Z"),
    );
    expect(audit.policy.verdict).toBe("REJECT");
    expect(audit.finalVerdict).toBe("REJECT");
    expect(audit.checks.some((check) => check.id === "unsupported-network-0")).toBe(true);
    expect(audit.checks.some((check) => check.id.startsWith("unsupported-math"))).toBe(false);
  });

  it("ignores a confirmation that the chipnet addresses are valid", () => {
    const audit = buildAudit(
      CLEAN_REVIEW,
      opinion({
        verdict: "SETTLE",
        summary: "Settle. The cents add up and every address is valid chipnet.",
        reasonTrail: [
          { step: "Math", because: "The local findings say the cents add up." },
          { step: "Destination", because: "No wrong network and no invalid address." },
          { step: "Recommendation", because: "SETTLE." },
        ],
      }),
      meta,
      new Date("2026-11-14T12:00:00.000Z"),
    );
    expect(audit.finalVerdict).toBe("SETTLE");
    expect(audit.disagreement).toBe(false);
    expect(audit.checks.some((check) => check.id.startsWith("unsupported-"))).toBe(false);
  });
});
