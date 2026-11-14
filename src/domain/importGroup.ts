import type { Group } from "./ledger";
import type { SplitMode } from "./split";
import type { NetworkId } from "./types";

const MODES = new Set<SplitMode>(["equal", "shares", "amounts", "percent"]);

export type ImportedLedger = {
  groups: Group[];
  network: NetworkId;
};

export function importSettlemany(raw: unknown): { ok: true; value: ImportedLedger } | { ok: false; error: string } {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("#/")) {
      return {
        ok: false,
        error:
          "That is a Settlemany link. The ledger lives in that browser, not in the URL. On the computer that has the group, open developer tools, Application, Local Storage, and copy the value of settlemany.v1. Paste that JSON here.",
      };
    }
    try {
      return importSettlemany(JSON.parse(trimmed) as unknown);
    } catch {
      return { ok: false, error: "That text is not JSON. Paste a Settlemany group or the settlemany.v1 localStorage value." };
    }
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "Paste a JSON object." };
  const record = raw as Record<string, unknown>;
  const network: NetworkId = record.network === "mainnet" ? "mainnet" : "chipnet";
  if (Array.isArray(record.groups)) {
    const groups: Group[] = [];
    for (const item of record.groups) {
      const parsed = parseGroup(item);
      if (!parsed.ok) return parsed;
      groups.push(parsed.group);
    }
    if (groups.length === 0) return { ok: false, error: "The groups array is empty." };
    return { ok: true, value: { groups, network } };
  }
  if (record.group && typeof record.group === "object") {
    const parsed = parseGroup(record.group);
    if (!parsed.ok) return parsed;
    return { ok: true, value: { groups: [parsed.group], network } };
  }
  const parsed = parseGroup(raw);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { groups: [parsed.group], network } };
}

function parseGroup(value: unknown): { ok: true; group: Group } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "A group has to be a JSON object." };
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string") {
    return { ok: false, error: "Each group needs a string id and name." };
  }
  if (!Array.isArray(row.members) || !Array.isArray(row.expenses)) {
    return { ok: false, error: `${row.name} is missing members or expenses.` };
  }
  const members = [];
  for (const member of row.members) {
    if (!member || typeof member !== "object") return { ok: false, error: "A member entry is not an object." };
    const person = member as Record<string, unknown>;
    if (typeof person.id !== "string" || typeof person.name !== "string") {
      return { ok: false, error: "Each member needs a string id and name." };
    }
    members.push({
      id: person.id,
      name: person.name,
      address: typeof person.address === "string" ? person.address : "",
      demoKeyLabel: typeof person.demoKeyLabel === "string" ? person.demoKeyLabel : null,
    });
  }
  const expenses = [];
  for (const expense of row.expenses) {
    if (!expense || typeof expense !== "object") return { ok: false, error: "An expense entry is not an object." };
    const item = expense as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.payerId !== "string") {
      return { ok: false, error: "Each expense needs an id and a payerId." };
    }
    if (typeof item.usdCents !== "number" || typeof item.amountCents !== "number") {
      return { ok: false, error: `Expense ${item.id} needs amountCents and usdCents as numbers.` };
    }
    const splitMode = item.splitMode;
    if (typeof splitMode !== "string" || !MODES.has(splitMode as SplitMode)) {
      return { ok: false, error: `Expense ${item.id} has an unknown splitMode.` };
    }
    if (!Array.isArray(item.parts)) return { ok: false, error: `Expense ${item.id} is missing parts.` };
    const parts = [];
    for (const part of item.parts) {
      if (!part || typeof part !== "object") return { ok: false, error: `Expense ${item.id} has a part that is not an object.` };
      const piece = part as Record<string, unknown>;
      if (typeof piece.memberId !== "string") return { ok: false, error: `Expense ${item.id} has a part without a memberId.` };
      parts.push({
        memberId: piece.memberId,
        ...(typeof piece.shares === "number" ? { shares: piece.shares } : {}),
        ...(typeof piece.amountCents === "number" ? { amountCents: piece.amountCents } : {}),
        ...(typeof piece.percentBps === "number" ? { percentBps: piece.percentBps } : {}),
      });
    }
    expenses.push({
      id: item.id,
      memo: typeof item.memo === "string" ? item.memo : "Expense",
      payerId: item.payerId,
      amountCents: item.amountCents,
      currency: typeof item.currency === "string" ? item.currency : "USD",
      usdCents: item.usdCents,
      fxNote: typeof item.fxNote === "string" ? item.fxNote : "",
      splitMode: splitMode as SplitMode,
      parts,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    });
  }
  const settled = Array.isArray(row.settled)
    ? row.settled.flatMap((leg) => {
        if (!leg || typeof leg !== "object") return [];
        const item = leg as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.fromId !== "string" || typeof item.toId !== "string") return [];
        if (typeof item.usdCents !== "number") return [];
        return [
          {
            id: item.id,
            fromId: item.fromId,
            toId: item.toId,
            usdCents: item.usdCents,
            demo: Boolean(item.demo),
            txid: typeof item.txid === "string" ? item.txid : null,
          },
        ];
      })
    : [];
  return {
    ok: true,
    group: {
      id: row.id,
      name: row.name,
      story: typeof row.story === "string" ? row.story : "",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
      members,
      expenses,
      settled,
    },
  };
}
