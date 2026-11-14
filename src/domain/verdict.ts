import type { UnsupportedClaim } from "./claims";
import type { AuditRecord, HumanOverride, Verdict } from "./types";

const RANK: Record<Verdict, number> = { SETTLE: 0, WAIT: 1, REJECT: 2 };

export type CombinedVerdict = {
  finalVerdict: Verdict;
  disagreement: boolean;
  disagreementReason: string | null;
  confidencePercent: number;
  finalSummary: string;
};

export type CombineOptions = {
  unsupportedClaims?: UnsupportedClaim[];
  /** Fairness, an unresolved dispute, or a destination note that is not a hard fact. */
  servHasNonHardConcern?: boolean;
  policyHasHardFailure?: boolean;
};

/**
 * The final verdict is the more cautious of SERV and the deterministic policy.
 * SERV cannot overrule a failed hard rule, and a destination warning holds the
 * group at WAIT even if the model says SETTLE.
 * An unsupported network, address, or math claim does not raise the verdict.
 * Fairness and disputes can still hold it at WAIT.
 */
export function combineVerdicts(
  policyVerdict: Verdict,
  policySummary: string,
  servVerdict: Verdict,
  servConfidence: number,
  servSummary: string,
  options: CombineOptions = {},
): CombinedVerdict {
  const unsupported = options.unsupportedClaims ?? [];
  const effectiveServ = servVerdictAfterUnsupportedClaims(
    servVerdict,
    policyVerdict,
    unsupported.length > 0,
    options.servHasNonHardConcern === true,
    options.policyHasHardFailure === true,
  );
  const blocked = RANK[servVerdict] > RANK[effectiveServ];
  const disagreement = policyVerdict !== effectiveServ || blocked;
  const finalVerdict = RANK[policyVerdict] >= RANK[effectiveServ] ? policyVerdict : effectiveServ;
  let confidencePercent = clamp(servConfidence);
  if (disagreement && RANK[finalVerdict] > RANK[servVerdict]) {
    confidencePercent = finalVerdict === "REJECT" ? Math.min(confidencePercent, 40) : Math.min(confidencePercent, 55);
  }
  if (blocked) confidencePercent = Math.min(confidencePercent, 55);
  const claimList = unsupported.map((claim) => claim.fact).join(", ");
  const disagreementReason = blocked
    ? `SERV said ${servVerdict}, citing ${claimList || "a hard fact"} the deterministic checks do not support. That claim is unsupported by policy and does not raise the verdict. The policy said ${policyVerdict}. The final verdict is ${finalVerdict}.`
    : disagreement
      ? `SERV said ${servVerdict}. The deterministic policy said ${policyVerdict}. The final verdict is ${finalVerdict}, the more cautious of the two. A model cannot overrule a failed hard rule.`
      : null;
  const finalSummary = disagreement ? `${servSummary} Second opinion: ${policySummary}` : servSummary;
  return { finalVerdict, disagreement, disagreementReason, confidencePercent, finalSummary };
}

/**
 * Drop a stricter SERV verdict when it rests on a network, address, or math
 * claim the policy does not support. Other concerns can still reach WAIT.
 */
export function servVerdictAfterUnsupportedClaims(
  servVerdict: Verdict,
  policyVerdict: Verdict,
  hasUnsupportedClaim: boolean,
  servHasNonHardConcern: boolean,
  policyHasHardFailure: boolean,
): Verdict {
  if (!hasUnsupportedClaim || policyHasHardFailure) return servVerdict;
  if (RANK[servVerdict] <= RANK[policyVerdict]) return servVerdict;
  const cap: Verdict = servHasNonHardConcern ? "WAIT" : policyVerdict;
  return RANK[servVerdict] > RANK[cap] ? cap : servVerdict;
}

export function handoffAllowed(record: Pick<AuditRecord, "finalVerdict" | "humanOverride">): boolean {
  if (record.finalVerdict === "SETTLE") return true;
  if (record.finalVerdict === "WAIT" && record.humanOverride) return true;
  return false;
}

export function applyHumanOverride(
  record: AuditRecord,
  override: { name: string; reason: string; at: string },
): AuditRecord {
  if (record.finalVerdict !== "WAIT") {
    throw new Error("A human override is only recorded when the verdict is WAIT. REJECT stays closed.");
  }
  const name = override.name.trim();
  const reason = override.reason.trim();
  if (name.length < 2) throw new Error("Write the name of the person who is overriding.");
  if (reason.length < 8) throw new Error("Write a short reason. The audit has to show why a person continued.");
  const humanOverride: HumanOverride = { at: override.at, name, reason, from: "WAIT" };
  return { ...record, humanOverride };
}

export function settlemanyHandoff(groupId: string): string {
  return `https://mzee04.github.io/settlemany/#/group/${encodeURIComponent(groupId)}`;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
