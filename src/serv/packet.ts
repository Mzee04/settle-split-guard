import { expenseShares, rawBalances } from "../domain/ledger";
import { normalizeInput } from "../domain/normalize";
import { openTransfers } from "../domain/ledger";
import type { Finding, Pseudonym, ReviewInput, ServPacket } from "../domain/types";

export function legendFor(input: ReviewInput): Pseudonym[] {
  return [...input.group.members]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((member, index) => ({
      memberId: member.id,
      name: member.name,
      alias: input.pseudonymize ? `Member ${index + 1}` : member.name,
    }));
}

export function maskNames(text: string, legend: Pseudonym[], enabled: boolean): string {
  if (!enabled || !text) return text;
  const pairs = legend
    .flatMap((item) => {
      const first = item.name.split(/\s+/)[0] ?? "";
      return [item.name, first].filter((name) => name.length > 2).map((name) => ({ name, alias: item.alias }));
    })
    .sort((a, b) => b.name.length - a.name.length);
  let next = text;
  const seen = new Set<string>();
  for (const pair of pairs) {
    const key = pair.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next = next.replace(new RegExp(`\\b${escapeRegExp(pair.name)}\\b`, "gi"), pair.alias);
  }
  return next;
}

export function buildServPacket(input: ReviewInput, findings: Finding[]): { packet: ServPacket; legend: Pseudonym[] } {
  const normalized = normalizeInput(input);
  const legend = legendFor(normalized);
  const aliasOf = (memberId: string) => legend.find((item) => item.memberId === memberId)?.alias ?? memberId;
  const mask = (text: string) => maskNames(text, legend, normalized.pseudonymize);
  let balances: { memberId: string; cents: number }[] = [];
  try {
    balances = rawBalances(normalized.group).map((balance) => ({ memberId: balance.memberId, cents: balance.cents }));
  } catch {
    balances = normalized.group.members.map((member) => ({ memberId: member.id, cents: 0 }));
  }
  const balanceOf = new Map(balances.map((balance) => [balance.memberId, balance.cents]));
  let transfers = normalized.proposedTransfers ?? [];
  if (!normalized.proposedTransfers) {
    try {
      transfers = openTransfers(normalized.group).transfers;
    } catch {
      transfers = [];
    }
  }
  const packet: ServPacket = {
    network: normalized.network,
    groupName: mask(normalized.group.name),
    people: normalized.group.members.map((member) => {
      const payout = normalized.receivers.find((receiver) => receiver.memberId === member.id)?.address;
      const person: ServPacket["people"][number] = {
        alias: aliasOf(member.id),
        balanceCents: balanceOf.get(member.id) ?? 0,
      };
      if (normalized.includeAddresses) {
        if (payout) person.payoutAddress = payout;
        if (member.address) person.savedAddress = member.address;
      }
      return person;
    }),
    expenses: normalized.group.expenses.map((expense) => {
      let shares: { memberId: string; cents: number }[] = [];
      try {
        shares = expenseShares(expense);
      } catch {
        shares = [];
      }
      return {
        memo: mask(expense.memo),
        payer: aliasOf(expense.payerId),
        usdCents: expense.usdCents,
        currency: expense.currency,
        splitMode: expense.splitMode,
        shares: shares.map((share) => ({ person: aliasOf(share.memberId), cents: share.cents })),
      };
    }),
    transfers: transfers.map((transfer) => ({
      from: aliasOf(transfer.fromId),
      to: aliasOf(transfer.toId),
      amountCents: transfer.amountCents,
    })),
    localFindings: findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      hard: finding.hard,
      title: mask(finding.title),
      detail: mask(finding.detail),
      ...(finding.person ? { person: mask(finding.person) } : {}),
      ...(finding.amountCents !== undefined ? { amountCents: finding.amountCents } : {}),
    })),
    notes: mask(normalized.notes),
    addressesIncluded: normalized.includeAddresses,
    namesPseudonymized: normalized.pseudonymize,
  };
  return { packet, legend };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
