import { checkDestinations } from "./destination";
import { rawBalances } from "./ledger";
import { checkMath } from "./mathCheck";
import type { PolicyReport, ReviewInput, Verdict } from "./types";

/** Deterministic second opinion. It does not read the chat. Disputes belong to SERV. */
export function runPolicy(input: ReviewInput): PolicyReport {
  const math = checkMath(input.group, input.proposedTransfers);
  let creditorIds: string[] = [];
  if (!math.some((finding) => finding.hard && finding.severity === "fail")) {
    creditorIds = rawBalances(input.group)
      .filter((balance) => balance.cents > 0)
      .map((balance) => balance.memberId);
  } else {
    creditorIds = input.receivers.map((receiver) => receiver.memberId);
  }
  const destination = checkDestinations(input.group, input.network, input.receivers, creditorIds);
  const findings = [...math, ...destination];
  const hardFailures = findings.filter((finding) => finding.hard && finding.severity === "fail").map((finding) => finding.title);
  let verdict: Verdict = "SETTLE";
  if (hardFailures.length > 0) verdict = "REJECT";
  else if (findings.some((finding) => finding.severity === "warn" || finding.severity === "fail")) verdict = "WAIT";
  const summary =
    verdict === "SETTLE"
      ? "Math clears and every creditor payout is a known address on the selected network."
      : verdict === "WAIT"
        ? `No hard rule failed. Warnings still need a person to look: ${findings
            .filter((finding) => finding.severity === "warn")
            .map((finding) => finding.title)
            .join("; ")}.`
        : `A hard rule failed: ${hardFailures.join("; ")}.`;
  return { verdict, findings, hardFailures, summary };
}
