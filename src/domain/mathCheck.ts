import { applyTransfers, netBalances, type Transfer } from "./netting";
import { expenseShares, memberName, rawBalances, type Group } from "./ledger";
import { formatUsd, MAX_SETTLE_CENTS } from "./money";
import type { Finding } from "./types";

export function checkMath(group: Group, proposedTransfers?: Transfer[]): Finding[] {
  const findings: Finding[] = [];
  const ids = new Set<string>();
  for (const member of group.members) {
    if (!member.id || !member.name.trim()) {
      findings.push(fail("math-member", "A person is missing a name", "Every person needs an id and a name before the shares can be checked."));
      return findings;
    }
    if (ids.has(member.id)) {
      findings.push(fail("math-duplicate", "Two people share an id", `${member.id} appears more than once, so a share cannot be tied to one person.`));
      return findings;
    }
    ids.add(member.id);
  }
  if (group.members.length < 2 || group.expenses.length === 0) {
    findings.push(
      fail(
        "math-empty",
        "There is nothing to settle",
        "Add at least two people and one expense. An empty ledger is not a settlement.",
      ),
    );
    return findings;
  }

  let splitFailed = false;
  for (const expense of group.expenses) {
    if (!Number.isInteger(expense.usdCents) || !Number.isInteger(expense.amountCents)) {
      splitFailed = true;
      findings.push(
        fail(
          `math-expense-${expense.id}-integer`,
          `${expense.memo || "An expense"} is not in whole cents`,
          "Settlemany stores money as integer cents. A fractional cent would leak or be invented at settlement.",
        ),
      );
      continue;
    }
    if (
      !Number.isSafeInteger(expense.usdCents) ||
      !Number.isSafeInteger(expense.amountCents) ||
      expense.usdCents > MAX_SETTLE_CENTS ||
      expense.amountCents > MAX_SETTLE_CENTS
    ) {
      splitFailed = true;
      findings.push(
        fail(
          `math-expense-${expense.id}-size`,
          `${expense.memo || "An expense"} is too large to settle exactly`,
          `Each line has to be at most ${formatUsd(MAX_SETTLE_CENTS)}. Bigger numbers stop being exact cents.`,
        ),
      );
      continue;
    }
    if (expense.usdCents < 0 || expense.amountCents < 0) {
      splitFailed = true;
      findings.push(fail(`math-expense-${expense.id}-sign`, `${expense.memo} is negative`, "An expense total cannot be negative."));
      continue;
    }
    if (!ids.has(expense.payerId)) {
      splitFailed = true;
      findings.push(
        fail(
          `math-expense-${expense.id}-payer`,
          `${expense.memo} names a payer who is not in the group`,
          `Payer ${expense.payerId} is not one of the people on this ledger.`,
        ),
      );
      continue;
    }
    const unknown = expense.parts.find((part) => !ids.has(part.memberId));
    if (unknown) {
      splitFailed = true;
      findings.push(
        fail(
          `math-expense-${expense.id}-part`,
          `${expense.memo} splits onto someone outside the group`,
          `${unknown.memberId} is ticked on this expense but is not a member.`,
        ),
      );
      continue;
    }
    try {
      const shares = expenseShares(expense);
      const sum = shares.reduce((total, share) => total + share.cents, 0);
      if (sum !== expense.usdCents) {
        splitFailed = true;
        findings.push(
          fail(
            `math-expense-${expense.id}-sum`,
            `${expense.memo} leaks ${formatUsd(expense.usdCents - sum)}`,
            `The shares add up to ${formatUsd(sum)}. The expense is ${formatUsd(expense.usdCents)}. The difference would be left unpaid or invented.`,
            { amountCents: expense.usdCents - sum },
          ),
        );
      }
    } catch (error) {
      splitFailed = true;
      findings.push(
        fail(
          `math-expense-${expense.id}-split`,
          `${expense.memo} does not add up`,
          error instanceof Error ? error.message : "The split could not be checked.",
        ),
      );
    }
  }
  if (splitFailed) return findings;

  let balances;
  try {
    balances = rawBalances(group);
  } catch (error) {
    findings.push(
      fail("math-balances", "Balances could not be computed", error instanceof Error ? error.message : "The ledger could not be summed."),
    );
    return findings;
  }
  const balanceSum = balances.reduce((total, balance) => total + balance.cents, 0);
  if (balanceSum !== 0) {
    findings.push(
      fail(
        "math-balance-sum",
        `The group is off by ${formatUsd(balanceSum)}`,
        "What was paid in and what was shared out have to match. A non-zero sum means a cent was created or lost.",
        { amountCents: balanceSum },
      ),
    );
    return findings;
  }

  let transfers: Transfer[];
  if (proposedTransfers) {
    transfers = proposedTransfers;
    for (const transfer of transfers) {
      if (!Number.isInteger(transfer.amountCents) || transfer.amountCents <= 0) {
        findings.push(
          fail(
            "math-transfer-amount",
            "A proposed payment is not a positive number of cents",
            "Every leg of the settlement has to be a whole number of cents greater than zero.",
          ),
        );
        return findings;
      }
      if (!ids.has(transfer.fromId) || !ids.has(transfer.toId) || transfer.fromId === transfer.toId) {
        findings.push(fail("math-transfer-party", "A proposed payment names the wrong people", "Each payment has to run from one member to a different member."));
        return findings;
      }
    }
  } else {
    try {
      transfers = netBalances(balances.map((balance) => ({ id: balance.memberId, cents: balance.cents }))).transfers;
    } catch (error) {
      findings.push(
        fail("math-netting", "The settlement could not be netted", error instanceof Error ? error.message : "Netting failed."),
      );
      return findings;
    }
  }

  const paid = new Map<string, number>();
  const received = new Map<string, number>();
  for (const transfer of transfers) {
    paid.set(transfer.fromId, (paid.get(transfer.fromId) ?? 0) + transfer.amountCents);
    received.set(transfer.toId, (received.get(transfer.toId) ?? 0) + transfer.amountCents);
  }
  for (const balance of balances) {
    const owes = balance.cents < 0 ? -balance.cents : 0;
    const owed = balance.cents > 0 ? balance.cents : 0;
    const out = paid.get(balance.memberId) ?? 0;
    const inn = received.get(balance.memberId) ?? 0;
    if (out > owes) {
      findings.push(
        fail(
          `math-overpay-${balance.memberId}`,
          `${balance.name} would pay more than they owe`,
          `The expenses say ${balance.name} owes ${formatUsd(owes)}. The settlement asks them to pay ${formatUsd(out)}.`,
          { person: balance.name, personId: balance.memberId, amountCents: out - owes },
        ),
      );
    }
    if (out !== owes || inn !== owed) {
      const gap = owes - out + inn - owed;
      findings.push(
        fail(
          `math-share-${balance.memberId}`,
          `${balance.name}'s settlement does not match their share`,
          `${balance.name} ${balance.cents >= 0 ? "is owed" : "owes"} ${formatUsd(Math.abs(balance.cents))} from the expenses. The proposed payments ${
            balance.cents >= 0 ? "send them" : "collect"
          } ${formatUsd(balance.cents >= 0 ? inn : out)}.`,
          { person: balance.name, personId: balance.memberId, amountCents: gap },
        ),
      );
    }
  }
  if (findings.some((finding) => finding.severity === "fail")) return findings;

  const after = applyTransfers(
    balances.map((balance) => ({ id: balance.memberId, cents: balance.cents })),
    transfers,
  );
  for (const [id, cents] of after) {
    if (cents !== 0) {
      findings.push(
        fail(
          "math-uncleared",
          "Applying the payments does not clear the group",
          `${memberName(group, id)} would still be at ${formatUsd(cents)} after every proposed payment.`,
          { person: memberName(group, id), personId: id, amountCents: cents },
        ),
      );
      return findings;
    }
  }

  const owedTotal = balances.filter((balance) => balance.cents > 0).reduce((total, balance) => total + balance.cents, 0);
  const moved = transfers.reduce((total, transfer) => total + transfer.amountCents, 0);
  if (moved !== owedTotal) {
    findings.push(
      fail(
        "math-moved",
        "The payments do not move the amount that is owed",
        `Creditors are owed ${formatUsd(owedTotal)} and the payments add up to ${formatUsd(moved)}.`,
        { amountCents: owedTotal - moved },
      ),
    );
    return findings;
  }

  findings.push({
    id: "math-ok",
    check: "math",
    severity: "pass",
    hard: false,
    title: "The cents add up",
    detail: `Every expense splits exactly, the balances sum to zero, and ${transfers.length === 0 ? "nobody owes anything" : `${transfers.length} payment${transfers.length === 1 ? "" : "s"} clear the group`} (${formatUsd(moved)}). No rounding leak.`,
  });
  return findings;
}

function fail(id: string, title: string, detail: string, extra?: Partial<Finding>): Finding {
  return { id, check: "math", severity: "fail", hard: true, title, detail, ...extra };
}
