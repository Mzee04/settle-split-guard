import type { Finding, ServOpinion, ServPacket, Verdict } from "../domain/types";

export function parseServOpinion(content: string): ServOpinion {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    throw new Error("SERV did not return JSON.");
  }
  if (!value || typeof value !== "object") throw new Error("SERV returned a non-object.");
  const row = value as Record<string, unknown>;
  const verdict = row.verdict;
  if (verdict !== "SETTLE" && verdict !== "WAIT" && verdict !== "REJECT") {
    throw new Error("SERV verdict was not SETTLE, WAIT, or REJECT.");
  }
  if (typeof row.summary !== "string" || row.summary.trim().length === 0) {
    throw new Error("SERV summary was empty.");
  }
  const trail = parseTrail(row.reasonTrail);
  if (trail.length === 0) throw new Error("SERV reason trail was empty.");
  return {
    verdict,
    confidencePercent: parseConfidence(row.confidencePercent),
    summary: clip(row.summary, 700),
    fairness: parseFairness(row.fairness),
    disputes: parseDisputes(row.disputes),
    destinationNotes: parseNotes(row.destinationNotes),
    reasonTrail: trail,
  };
}

export function opinionFindings(opinion: ServOpinion): Finding[] {
  const findings: Finding[] = [];
  if (opinion.fairness.length === 0) {
    findings.push({
      id: "fairness-none",
      check: "fairness",
      severity: "pass",
      hard: false,
      title: "No one flagged as overcharged",
      detail: "The reasoning pass did not name a person, an amount, and a reason to hold a share back.",
    });
  }
  opinion.fairness.forEach((item, index) => {
    findings.push({
      id: `fairness-${index}`,
      check: "fairness",
      severity: "warn",
      hard: false,
      title: `${item.person} may be overcharged`,
      detail: item.reason,
      person: item.person,
      amountCents: item.amountCents,
    });
  });
  const unresolved = opinion.disputes.filter((item) => item.unresolved);
  if (unresolved.length === 0) {
    findings.push({
      id: "dispute-none",
      check: "dispute",
      severity: "pass",
      hard: false,
      title: "No unresolved dispute in the notes",
      detail: opinion.disputes.length
        ? "The notes mention earlier friction, and the reasoning pass marked it resolved."
        : "Nothing in the pasted notes reads as an open denial or a promise to pay later.",
    });
  }
  opinion.disputes.forEach((item, index) => {
    findings.push({
      id: `dispute-${index}`,
      check: "dispute",
      severity: item.unresolved ? "warn" : "info",
      hard: false,
      title: item.unresolved ? `Unresolved: ${item.person || "someone"}` : `Noted: ${item.person || "someone"}`,
      detail: `${item.reason} Quote: “${item.quote}”`,
      person: item.person,
    });
  });
  return findings;
}

export function standInOpinion(packet: ServPacket, policyVerdict: Verdict, policySummary: string): ServOpinion {
  const disputes = scanNotes(packet.notes);
  const unresolved = disputes.filter((item) => item.unresolved);
  let verdict: Verdict = "SETTLE";
  if (policyVerdict === "REJECT" || packet.localFindings.some((finding) => finding.hard && finding.severity === "fail")) {
    verdict = "REJECT";
  } else if (policyVerdict === "WAIT" || unresolved.length > 0) {
    verdict = "WAIT";
  }
  const fairness = fairnessFromNotes(packet);
  return {
    verdict,
    confidencePercent: 35,
    summary: `Local stand-in, not a SERV model. No recorded sample matches these inputs, and no API call was made. It followed the deterministic policy (${policyVerdict}) and a keyword scan of the notes.`,
    fairness,
    disputes,
    destinationNotes: packet.localFindings
      .filter((finding) => finding.id.startsWith("dest-") && finding.severity !== "pass")
      .slice(0, 4)
      .map((finding) => ({
        person: finding.person ?? "A receiver",
        concern: finding.title,
      })),
    reasonTrail: [
      { step: "Stand-in, not SERV", because: "These inputs do not match a recorded sample, and demo mode does not invent a live model call." },
      { step: "Policy", because: policySummary },
      {
        step: "Notes scan",
        because: unresolved.length
          ? `${unresolved.length} line${unresolved.length === 1 ? "" : "s"} still read as an open dispute.`
          : "The keyword scan did not find a denial or a promise to pay later.",
      },
      { step: "Recommendation", because: `The stand-in stops at ${verdict}. A live key on the server would replace this with a model verdict.` },
    ],
  };
}

function fairnessFromNotes(packet: ServPacket): ServOpinion["fairness"] {
  const hotel = packet.expenses.find((expense) => /hotel/i.test(expense.memo));
  const denied = packet.notes.split("\n").find((line) => /didn['’]t stay/i.test(line));
  if (!hotel || !denied) return [];
  const person = denied.split(":")[0]?.trim() || "A member";
  const share = hotel.shares.find((item) => item.person === person);
  return [
    {
      person,
      amountCents: share?.cents ?? 0,
      reason: `${person} is still on “${hotel.memo}” and the notes say they did not stay. This amount is the keyword stand-in, not a model judgment.`,
    },
  ];
}

function scanNotes(notes: string): ServOpinion["disputes"] {
  const rules: { re: RegExp; reason: string }[] = [
    { re: /didn['’]t (?:eat|stay|share|have|use)/i, reason: "The line denies sharing a cost that may still be on the ledger." },
    { re: /take me off/i, reason: "Someone asked to be removed from a line before settling." },
    { re: /not paying/i, reason: "Someone says they will not pay a line as it stands." },
    { re: /pay (?:my share )?later|i['’]ll pay/i, reason: "Someone is deferring their share instead of settling it now." },
  ];
  const found: ServOpinion["disputes"] = [];
  for (const line of notes.split("\n")) {
    const text = line.trim();
    if (!text) continue;
    const rule = rules.find((item) => item.re.test(text));
    if (!rule) continue;
    const person = text.includes(":") ? text.split(":")[0]!.trim() : "";
    found.push({ quote: clip(text, 240), person, unresolved: true, reason: rule.reason });
  }
  return found;
}

function parseConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("SERV confidence was not a number.");
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function parseFairness(value: unknown): ServOpinion["fairness"] {
  if (!Array.isArray(value)) throw new Error("SERV fairness list was missing.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("A fairness item was not an object.");
    const row = item as Record<string, unknown>;
    const amountCents = row.amountCents;
    if (typeof row.person !== "string" || typeof row.reason !== "string" || typeof amountCents !== "number" || !Number.isInteger(amountCents)) {
      throw new Error("A fairness item needs a person, an integer cent amount, and a reason.");
    }
    return { person: clip(row.person, 80), amountCents, reason: clip(row.reason, 400) };
  });
}

function parseDisputes(value: unknown): ServOpinion["disputes"] {
  if (!Array.isArray(value)) throw new Error("SERV dispute list was missing.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("A dispute item was not an object.");
    const row = item as Record<string, unknown>;
    if (typeof row.quote !== "string" || typeof row.person !== "string" || typeof row.unresolved !== "boolean" || typeof row.reason !== "string") {
      throw new Error("A dispute item is missing a quote, a person, a resolved flag, or a reason.");
    }
    return { quote: clip(row.quote, 240), person: clip(row.person, 80), unresolved: row.unresolved, reason: clip(row.reason, 400) };
  });
}

function parseNotes(value: unknown): ServOpinion["destinationNotes"] {
  if (!Array.isArray(value)) throw new Error("SERV destination notes were missing.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("A destination note was not an object.");
    const row = item as Record<string, unknown>;
    if (typeof row.person !== "string" || typeof row.concern !== "string") {
      throw new Error("A destination note needs a person and a concern.");
    }
    return { person: clip(row.person, 80), concern: clip(row.concern, 400) };
  });
}

function parseTrail(value: unknown): ServOpinion["reasonTrail"] {
  if (!Array.isArray(value)) throw new Error("SERV reason trail was missing.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("A reason step was not an object.");
    const row = item as Record<string, unknown>;
    if (typeof row.step !== "string" || typeof row.because !== "string") {
      throw new Error("A reason step needs a step and a because.");
    }
    return { step: clip(row.step, 120), because: clip(row.because, 400) };
  });
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
