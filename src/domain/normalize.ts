import type { ReviewInput } from "./types";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stable shape for hashing, replay, and the SERV packet. */
export function normalizeInput(input: ReviewInput): ReviewInput {
  const transfers = input.proposedTransfers?.map((transfer) => ({
    fromId: transfer.fromId,
    toId: transfer.toId,
    amountCents: transfer.amountCents,
  }));
  return {
    network: input.network,
    pseudonymize: Boolean(input.pseudonymize),
    includeAddresses: Boolean(input.includeAddresses),
    notes: input.notes.replace(/\r\n/g, "\n").trim(),
    receivers: [...input.receivers]
      .map((receiver) => ({ memberId: receiver.memberId, address: receiver.address.trim() }))
      .sort((a, b) => compareText(a.memberId, b.memberId)),
    proposedTransfers: transfers
      ?.slice()
      .sort((a, b) => compareText(a.fromId, b.fromId) || compareText(a.toId, b.toId) || a.amountCents - b.amountCents),
    group: {
      id: input.group.id,
      name: input.group.name.trim(),
      story: input.group.story?.trim() ?? "",
      createdAt: input.group.createdAt ?? "",
      members: [...input.group.members]
        .map((member) => ({
          id: member.id,
          name: member.name.trim(),
          address: member.address.trim(),
        }))
        .sort((a, b) => compareText(a.id, b.id)),
      expenses: [...input.group.expenses]
        .map((expense) => ({
          id: expense.id,
          memo: expense.memo.trim(),
          payerId: expense.payerId,
          amountCents: expense.amountCents,
          currency: expense.currency,
          usdCents: expense.usdCents,
          fxNote: expense.fxNote ?? "",
          splitMode: expense.splitMode,
          parts: [...expense.parts]
            .map((part) => ({
              memberId: part.memberId,
              ...(part.shares !== undefined ? { shares: part.shares } : {}),
              ...(part.amountCents !== undefined ? { amountCents: part.amountCents } : {}),
              ...(part.percentBps !== undefined ? { percentBps: part.percentBps } : {}),
            }))
            .sort((a, b) => compareText(a.memberId, b.memberId)),
          createdAt: expense.createdAt ?? "",
        }))
        .sort((a, b) => compareText(a.id, b.id)),
      settled: [...(input.group.settled ?? [])]
        .map((leg) => ({
          id: leg.id,
          fromId: leg.fromId,
          toId: leg.toId,
          usdCents: leg.usdCents,
          demo: Boolean(leg.demo),
        }))
        .sort((a, b) => compareText(a.id, b.id)),
    },
  };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = sortValue(source[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(input: ReviewInput): string {
  return JSON.stringify(sortValue(normalizeInput(input)));
}
