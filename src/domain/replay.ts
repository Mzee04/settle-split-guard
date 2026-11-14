import type { AuditRecord, Finding } from "./types";

export type AuditDiff = {
  hashChanged: boolean;
  verdictHeld: boolean;
  verdictBefore: AuditRecord["finalVerdict"];
  verdictAfter: AuditRecord["finalVerdict"];
  flipped: { id: string; title: string; before: string; after: string }[];
};

export function diffAudits(before: AuditRecord, after: AuditRecord): AuditDiff {
  const prior = new Map(before.checks.map((check) => [check.id, check]));
  const next = new Map(after.checks.map((check) => [check.id, check]));
  const ids = new Set([...prior.keys(), ...next.keys()]);
  const flipped: AuditDiff["flipped"] = [];
  for (const id of ids) {
    const left = prior.get(id);
    const right = next.get(id);
    const leftLabel = label(left);
    const rightLabel = label(right);
    if (leftLabel === rightLabel) continue;
    flipped.push({
      id,
      title: right?.title ?? left?.title ?? id,
      before: leftLabel,
      after: rightLabel,
    });
  }
  flipped.sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    hashChanged: before.inputsHash !== after.inputsHash,
    verdictHeld: before.finalVerdict === after.finalVerdict,
    verdictBefore: before.finalVerdict,
    verdictAfter: after.finalVerdict,
    flipped,
  };
}

function label(finding: Finding | undefined): string {
  if (!finding) return "absent";
  return `${finding.severity}${finding.hard ? "/hard" : ""}`;
}
