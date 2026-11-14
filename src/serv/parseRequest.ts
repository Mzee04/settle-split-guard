import { importSettlemany } from "../domain/importGroup";
import type { Transfer } from "../domain/netting";
import type { ReviewInput } from "../domain/types";

export function parseReviewRequest(body: unknown): { ok: true; input: ReviewInput; forceDemo: boolean } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const row = body as Record<string, unknown>;
  const network = row.network === "mainnet" ? "mainnet" : row.network === "chipnet" ? "chipnet" : null;
  if (!network) return { ok: false, error: "Network must be chipnet or mainnet." };
  if (typeof row.notes !== "string") return { ok: false, error: "Notes must be a string. Send an empty string if there are none." };
  if (row.notes.length > 8000) return { ok: false, error: "Notes are limited to 8000 characters." };
  const imported = importSettlemany(row.group);
  if (!imported.ok) return imported;
  const group = imported.value.groups[0];
  if (!group) return { ok: false, error: "The group was empty." };
  if (group.members.length > 40) return { ok: false, error: "This guard reviews groups of up to 40 people." };
  if (group.expenses.length > 80) return { ok: false, error: "This guard reviews up to 80 expenses at a time." };
  if (!Array.isArray(row.receivers)) return { ok: false, error: "Receivers must be a list." };
  const receivers: { memberId: string; address: string }[] = [];
  for (const receiver of row.receivers) {
    if (!receiver || typeof receiver !== "object") return { ok: false, error: "A receiver entry is not an object." };
    const item = receiver as Record<string, unknown>;
    if (typeof item.memberId !== "string" || typeof item.address !== "string") {
      return { ok: false, error: "Each receiver needs a memberId and an address string." };
    }
    if (item.address.length > 120) return { ok: false, error: "An address is unexpectedly long." };
    receivers.push({ memberId: item.memberId, address: item.address });
  }
  let proposedTransfers: Transfer[] | undefined;
  if (row.proposedTransfers !== undefined) {
    if (!Array.isArray(row.proposedTransfers)) return { ok: false, error: "proposedTransfers must be a list." };
    if (row.proposedTransfers.length > 200) return { ok: false, error: "Too many proposed payments." };
    proposedTransfers = [];
    for (const transfer of row.proposedTransfers) {
      if (!transfer || typeof transfer !== "object") return { ok: false, error: "A payment entry is not an object." };
      const item = transfer as Record<string, unknown>;
      if (typeof item.fromId !== "string" || typeof item.toId !== "string" || typeof item.amountCents !== "number") {
        return { ok: false, error: "Each payment needs fromId, toId, and amountCents." };
      }
      proposedTransfers.push({ fromId: item.fromId, toId: item.toId, amountCents: item.amountCents });
    }
  }
  return {
    ok: true,
    forceDemo: row.forceDemo === true,
    input: {
      network,
      group,
      receivers,
      notes: row.notes,
      pseudonymize: row.pseudonymize !== false,
      includeAddresses: row.includeAddresses === true,
      proposedTransfers,
    },
  };
}
