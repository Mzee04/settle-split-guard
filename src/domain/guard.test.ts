import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCashaddr, encodeCashaddr, isCashaddrError } from "./cashaddr";
import { checkDestinations } from "./destination";
import { importSettlemany } from "./importGroup";
import { expenseShares, rawBalances } from "./ledger";
import { checkMath } from "./mathCheck";
import { applyTransfers } from "./netting";
import { runPolicy } from "./policy";
import { diffAudits } from "./replay";
import { ADDRESSES, CLEAN_REVIEW, LAGOS_REVIEW, LEAK_REVIEW } from "./sample";
import { allocateCents } from "./split";
import { applyHumanOverride, combineVerdicts, handoffAllowed } from "./verdict";
import { buildServPacket } from "../serv/packet";
import { parseServOpinion } from "../serv/opinion";
import { reviewDemo } from "../serv/review";

describe("cashaddr", () => {
  it("decodes a published mainnet P2PKH vector and round-trips", () => {
    const address = "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a";
    const decoded = decodeCashaddr(address);
    expect(isCashaddrError(decoded)).toBe(false);
    if (isCashaddrError(decoded)) return;
    expect(decoded.network).toBe("mainnet");
    expect(decoded.type).toBe(0);
    expect(decoded.hash).toHaveLength(20);
    expect(encodeCashaddr("bitcoincash", 0, decoded.hash)).toBe(address);
  });

  it("rejects mixed case, a flipped character, and a chipnet address on the wrong check", () => {
    const address = ADDRESSES.amaka;
    expect(isCashaddrError(decodeCashaddr(address.slice(0, 12).toUpperCase() + address.slice(12)))).toBe(true);
    const flipped = `${address.slice(0, -1)}${address.endsWith("w") ? "x" : "w"}`;
    const broken = decodeCashaddr(flipped);
    expect(isCashaddrError(broken)).toBe(true);
    const chipnet = decodeCashaddr(ADDRESSES.amaka);
    const mainnet = decodeCashaddr(ADDRESSES.amakaMainnet);
    expect(isCashaddrError(chipnet)).toBe(false);
    expect(isCashaddrError(mainnet)).toBe(false);
    if (!isCashaddrError(chipnet) && !isCashaddrError(mainnet)) {
      expect(chipnet.network).toBe("chipnet");
      expect(mainnet.network).toBe("mainnet");
    }
  });
});

describe("math integrity", () => {
  it("splits a remainder without leaking a cent", () => {
    const shares = allocateCents(3250, [
      { memberId: "amaka", weight: 1 },
      { memberId: "tunde", weight: 1 },
      { memberId: "seyi", weight: 1 },
      { memberId: "ife", weight: 1 },
    ]);
    expect(shares.reduce((sum, share) => sum + share.cents, 0)).toBe(3250);
    expect(shares.find((share) => share.memberId === "amaka")?.cents).toBe(813);
    expect(shares.find((share) => share.memberId === "tunde")?.cents).toBe(812);
  });

  it("clears the Lagos weekend and keeps Ife on a $60 hotel share", () => {
    const balances = rawBalances(LAGOS_REVIEW.group);
    expect(balances.reduce((sum, balance) => sum + balance.cents, 0)).toBe(0);
    const hotel = LAGOS_REVIEW.group.expenses.find((expense) => expense.id === "hotel");
    expect(hotel).toBeTruthy();
    const shares = expenseShares(hotel!);
    expect(shares.find((share) => share.memberId === "ife")?.cents).toBe(6000);
    const findings = checkMath(LAGOS_REVIEW.group);
    expect(findings.some((finding) => finding.id === "math-ok")).toBe(true);
    expect(findings.some((finding) => finding.hard && finding.severity === "fail")).toBe(false);
  });

  it("rejects a settlement that is one cent short", () => {
    const findings = checkMath(LEAK_REVIEW.group, LEAK_REVIEW.proposedTransfers);
    expect(findings.some((finding) => finding.hard && finding.severity === "fail")).toBe(true);
    const balances = rawBalances(LEAK_REVIEW.group);
    const after = applyTransfers(
      balances.map((balance) => ({ id: balance.memberId, cents: balance.cents })),
      LEAK_REVIEW.proposedTransfers ?? [],
    );
    expect([...after.values()].some((cents) => cents !== 0)).toBe(true);
  });

  it("rejects an amounts split that does not add up", () => {
    const group = structuredClone(CLEAN_REVIEW.group);
    group.expenses[0] = {
      ...group.expenses[0]!,
      splitMode: "amounts",
      parts: [
        { memberId: "ada", amountCents: 30000 },
        { memberId: "bola", amountCents: 30000 },
        { memberId: "chi", amountCents: 29999 },
      ],
    };
    const findings = checkMath(group);
    expect(findings.some((finding) => finding.id.includes("split") && finding.hard)).toBe(true);
  });
});

describe("destination and policy", () => {
  it("flags the Lagos lookalike and a new payout without failing the math", () => {
    const policy = runPolicy(LAGOS_REVIEW);
    expect(policy.verdict).toBe("WAIT");
    expect(policy.hardFailures).toHaveLength(0);
    expect(policy.findings.some((finding) => finding.id.startsWith("dest-lookalike-amaka"))).toBe(true);
    expect(policy.findings.some((finding) => finding.id === "dest-new-amaka")).toBe(true);
  });

  it("hard-rejects an invalid cashaddr and a mainnet address on chipnet", () => {
    const invalid = checkDestinations(
      LAGOS_REVIEW.group,
      "chipnet",
      LAGOS_REVIEW.receivers.map((receiver) =>
        receiver.memberId === "amaka" ? { ...receiver, address: `${ADDRESSES.amaka}qq` } : receiver,
      ),
      ["amaka"],
    );
    expect(invalid.some((finding) => finding.id === "dest-invalid-amaka" && finding.hard)).toBe(true);

    const wrongNetwork = checkDestinations(
      LAGOS_REVIEW.group,
      "chipnet",
      LAGOS_REVIEW.receivers.map((receiver) =>
        receiver.memberId === "tunde" ? { ...receiver, address: ADDRESSES.amakaMainnet } : receiver,
      ),
      ["amaka"],
    );
    expect(wrongNetwork.some((finding) => finding.id === "dest-network-tunde" && finding.hard)).toBe(true);
  });
});

describe("verdict combiner", () => {
  it("turns SERV SETTLE into REJECT when a hard rule fails, and says the evaluators disagree", () => {
    const combined = combineVerdicts("REJECT", "A hard rule failed: one cent.", "SETTLE", 91, "Settle.");
    expect(combined.finalVerdict).toBe("REJECT");
    expect(combined.disagreement).toBe(true);
    expect(combined.confidencePercent).toBe(40);
    expect(combined.disagreementReason).toMatch(/SERV said SETTLE/);
  });

  it("holds a destination warning at WAIT when SERV says SETTLE", () => {
    const combined = combineVerdicts("WAIT", "Lookalike payout.", "SETTLE", 80, "Settle.");
    expect(combined.finalVerdict).toBe("WAIT");
    expect(combined.disagreement).toBe(true);
    expect(combined.confidencePercent).toBe(55);
  });

  it("keeps SERV's WAIT when the policy is clean, and agrees when both say SETTLE", () => {
    const waited = combineVerdicts("SETTLE", "Clean.", "WAIT", 70, "Wait for the chat.");
    expect(waited.finalVerdict).toBe("WAIT");
    expect(waited.disagreement).toBe(true);
    expect(waited.confidencePercent).toBe(70);
    const agreed = combineVerdicts("SETTLE", "Clean.", "SETTLE", 88, "Settle.");
    expect(agreed.finalVerdict).toBe("SETTLE");
    expect(agreed.disagreement).toBe(false);
    expect(handoffAllowed({ finalVerdict: "SETTLE", humanOverride: null })).toBe(true);
  });

  it("lets a person override WAIT and refuses to override REJECT", () => {
    const waited = reviewDemo(LAGOS_REVIEW, new Date("2026-11-14T12:00:00.000Z"));
    expect(waited.finalVerdict).toBe("WAIT");
    expect(handoffAllowed(waited)).toBe(false);
    const overridden = applyHumanOverride(waited, {
      name: "Amaka Osei",
      reason: "Ife confirmed the hotel in person after the chat.",
      at: "2026-11-14T12:05:00.000Z",
    });
    expect(overridden.humanOverride?.name).toBe("Amaka Osei");
    expect(handoffAllowed(overridden)).toBe(true);
    const leaked = reviewDemo(LEAK_REVIEW, new Date("2026-11-14T12:00:00.000Z"));
    expect(() => applyHumanOverride(leaked, { name: "Ada", reason: "Ignore the cent and ship it.", at: "2026-11-14T12:06:00.000Z" })).toThrow(/WAIT/);
  });
});

describe("recorded reviews", () => {
  it("waits on the Lagos sample, settles the flat, and rejects the one-cent leak over SERV", () => {
    const lagos = reviewDemo(LAGOS_REVIEW, new Date("2026-11-14T12:00:00.000Z"));
    expect(lagos.serv.mode).toBe("demo-recorded");
    expect(lagos.serv.opinion.verdict).toBe("WAIT");
    expect(lagos.policy.verdict).toBe("WAIT");
    expect(lagos.finalVerdict).toBe("WAIT");
    expect(lagos.disagreement).toBe(false);
    expect(lagos.serv.opinion.fairness[0]).toMatchObject({ person: "Member 2", amountCents: 6000 });
    expect(lagos.packet.notes).toContain(lagos.serv.opinion.disputes[0]!.quote);
    expect(lagos.packet.notes).not.toMatch(/Amaka|Ife|Tunde|Seyi/);
    expect(JSON.stringify(lagos.packet)).not.toContain("bchtest:");
    expect(lagos.reasonTrail.at(-1)?.step).toBe("Second opinion");

    const clean = reviewDemo(CLEAN_REVIEW, new Date("2026-11-14T12:00:00.000Z"));
    expect(clean.finalVerdict).toBe("SETTLE");
    expect(clean.serv.mode).toBe("demo-recorded");
    expect(handoffAllowed(clean)).toBe(true);

    const leak = reviewDemo(LEAK_REVIEW, new Date("2026-11-14T12:00:00.000Z"));
    expect(leak.serv.opinion.verdict).toBe("SETTLE");
    expect(leak.policy.verdict).toBe("REJECT");
    expect(leak.finalVerdict).toBe("REJECT");
    expect(leak.disagreement).toBe(true);
    expect(leak.confidencePercent).toBeLessThanOrEqual(40);
    expect(handoffAllowed(leak)).toBe(false);
  });

  it("replays the same inputs as the same verdict and shows what flips when the chat changes", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const first = reviewDemo(LAGOS_REVIEW, now);
    const replay = reviewDemo(LAGOS_REVIEW, now);
    const same = diffAudits(first, replay);
    expect(same.hashChanged).toBe(false);
    expect(same.verdictHeld).toBe(true);
    expect(same.flipped).toHaveLength(0);

    const edited = reviewDemo(
      { ...LAGOS_REVIEW, notes: "Amaka: Everyone agreed. Please settle.", receivers: LAGOS_REVIEW.group.members.map((member) => ({ memberId: member.id, address: member.address })) },
      now,
    );
    const diff = diffAudits(first, edited);
    expect(diff.hashChanged).toBe(true);
    expect(edited.serv.mode).toBe("demo-stand-in");
    expect(edited.finalSummary.toLowerCase()).toContain("stand-in");
    expect(diff.flipped.length).toBeGreaterThan(0);
  });
});

describe("import and privacy boundary", () => {
  it("reads a Settlemany localStorage blob and rejects a bare share link", () => {
    const blob = {
      network: "chipnet",
      groups: [CLEAN_REVIEW.group],
    };
    const imported = importSettlemany(JSON.stringify(blob));
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.value.groups[0]?.name).toBe("Flat 4B, March");
      expect(imported.value.network).toBe("chipnet");
    }
    const link = importSettlemany("https://mzee04.github.io/settlemany/#/group/demo-eko-atlantic");
    expect(link.ok).toBe(false);
  });

  it("keeps the API key out of client code", () => {
    const root = path.resolve(__dirname, "../..");
    const files = walk(path.join(root, "src"));
    const allowed = new Set([
      path.normalize("src/serv/client.ts"),
      path.normalize("src/app/api/review/route.ts"),
      path.normalize("src/app/api/health/route.ts"),
    ]);
    const leaks = files.filter((file) => {
      if (file.endsWith(".test.ts")) return false;
      const relative = path.normalize(path.relative(root, file));
      if (allowed.has(relative)) return false;
      const text = readFileSync(file, "utf8");
      return text.includes("SERV_API_KEY") || text.includes("NEXT_PUBLIC_SERV");
    });
    expect(leaks).toEqual([]);
  });

  it("parses a schema-shaped SERV payload and rejects prose", () => {
    const opinion = parseServOpinion(
      JSON.stringify({
        verdict: "WAIT",
        confidencePercent: 0.64,
        summary: "Wait for the hotel line.",
        fairness: [{ person: "Member 2", amountCents: 6000, reason: "They said they did not stay." }],
        disputes: [],
        destinationNotes: [],
        reasonTrail: [{ step: "Fairness", because: "The hotel tick contradicts the note." }],
      }),
    );
    expect(opinion.confidencePercent).toBe(64);
    expect(opinion.verdict).toBe("WAIT");
    expect(() => parseServOpinion("The model decided to settle.")).toThrow(/JSON/);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("packet pseudonyms", () => {
  it("uses stable Member numbers and can include addresses when asked", () => {
    const hidden = buildServPacket(LAGOS_REVIEW, []);
    expect(hidden.legend.map((item) => `${item.memberId}:${item.alias}`)).toEqual([
      "amaka:Member 1",
      "ife:Member 2",
      "seyi:Member 3",
      "tunde:Member 4",
    ]);
    const shown = buildServPacket({ ...LAGOS_REVIEW, includeAddresses: true }, []);
    expect(shown.packet.people.find((person) => person.alias === "Member 1")?.payoutAddress).toBe(ADDRESSES.amakaLookalike);
  });
});
