import type { NetworkId, PolicyReport, ServOpinion } from "./types";

export type HardFact = "network" | "address" | "math";

export type UnsupportedClaim = {
  fact: HardFact;
  quote: string;
  because: string;
};

const FACT_LABEL: Record<HardFact, string> = {
  network: "network",
  address: "address validity",
  math: "math",
};

/** Failure language for facts the deterministic policy already checked. */
export function assertedFacts(text: string, network: NetworkId): HardFact[] {
  const facts: HardFact[] = [];
  if (assertsNetworkFailure(text, network)) facts.push("network");
  if (assertsAddressFailure(text)) facts.push("address");
  if (assertsMathFailure(text)) facts.push("math");
  return facts;
}

export function unsupportedHardClaims(opinion: ServOpinion, policy: PolicyReport, network: NetworkId): UnsupportedClaim[] {
  const snippets = [
    opinion.summary,
    ...opinion.reasonTrail.flatMap((step) => [step.step, step.because]),
    ...opinion.destinationNotes.map((note) => `${note.person}: ${note.concern}`),
    ...opinion.fairness.map((item) => item.reason),
    ...opinion.disputes.map((item) => `${item.quote} ${item.reason}`),
  ];
  const found = new Map<HardFact, string>();
  for (const snippet of snippets) {
    for (const fact of assertedFacts(snippet, network)) {
      if (policySupports(policy, fact) || found.has(fact)) continue;
      found.set(fact, clip(snippet));
    }
  }
  return [...found.entries()].map(([fact, quote]) => ({
    fact,
    quote,
    because: `SERV claimed a ${FACT_LABEL[fact]} problem (“${quote}”). The deterministic policy does not support that claim. It is marked unsupported by policy and does not raise the verdict.`,
  }));
}

export function hasNonHardConcern(opinion: ServOpinion, network: NetworkId): boolean {
  if (opinion.fairness.length > 0) return true;
  if (opinion.disputes.some((item) => item.unresolved)) return true;
  return opinion.destinationNotes.some((note) => assertedFacts(note.concern, network).length === 0 && note.concern.trim().length > 0);
}

function policySupports(policy: PolicyReport, fact: HardFact): boolean {
  return policy.findings.some((finding) => {
    if (!(finding.hard && finding.severity === "fail")) return false;
    if (fact === "math") return finding.check === "math";
    if (fact === "network") return finding.id.startsWith("dest-network");
    return finding.id.startsWith("dest-invalid") || finding.id.startsWith("dest-missing") || finding.id.startsWith("dest-empty");
  });
}

function assertsNetworkFailure(text: string, network: NetworkId): boolean {
  const lower = text.toLowerCase();
  if (hasFailure(lower, /wrong network|network mismatch|incorrect network|unsupported network|network is (?:wrong|invalid|incorrect)/)) {
    return true;
  }
  if (network === "chipnet") {
    return hasFailure(lower, /mainnet address|on mainnet|not chipnet|isn't chipnet|is not chipnet|should be chipnet|bitcoincash:/);
  }
  return hasFailure(lower, /chipnet address|on chipnet|not mainnet|isn't mainnet|is not mainnet|should be mainnet|bchtest:/);
}

function assertsAddressFailure(text: string): boolean {
  return hasFailure(
    text,
    /invalid (?:cash)?addr|not a valid (?:cash)?addr|checksum (?:does not|doesn't|fail|mismatch)|malformed address|address is invalid|addresses are invalid/i,
  );
}

function assertsMathFailure(text: string): boolean {
  return hasFailure(
    text,
    /does not add up|doesn't add up|do not add up|rounding leak|off by \d|off by a cent|balances? (?:do not|don't) sum|sum is not zero|math (?:fails|failure|error|does not)|cents do not (?:match|balance)|one[- ]cent (?:short|leak|off)|not zero-sum|unbalanced/i,
  );
}

/** A "no" or "not" in the words just before the hit cancels it. "No wrong network" is not a claim. */
function hasFailure(text: string, pattern: RegExp): boolean {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(global)) {
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 48), index).toLowerCase();
    if (/\b(no|not|never|without|don't|do not|doesn't|does not)\b/.test(before)) continue;
    return true;
  }
  return false;
}

function clip(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 180 ? `${trimmed.slice(0, 179)}…` : trimmed;
}
