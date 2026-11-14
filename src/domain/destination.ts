import { decodeCashaddr, isCashaddrError } from "./cashaddr";
import { memberName, type Group } from "./ledger";
import type { Finding, NetworkId } from "./types";

const LOOKALIKE_DISTANCE = 5;
const PREFIX_CHARS = 8;

export function checkDestinations(
  group: Group,
  network: NetworkId,
  receivers: { memberId: string; address: string }[],
  creditorIds: string[],
): Finding[] {
  const findings: Finding[] = [];
  const creditors = new Set(creditorIds);
  const byMember = new Map(receivers.map((receiver) => [receiver.memberId, receiver.address.trim()]));
  const known = group.members
    .map((member) => ({ member, address: member.address.trim().toLowerCase() }))
    .filter((row) => row.address.length > 0);

  for (const memberId of creditorIds) {
    if (!byMember.has(memberId)) {
      findings.push(
        hard(
          `dest-missing-${memberId}`,
          `${memberName(group, memberId)} has no payout address`,
          "Someone is owed money and the settlement has nowhere to send it.",
          memberName(group, memberId),
          memberId,
        ),
      );
    }
  }

  const seen = new Set<string>();
  for (const receiver of receivers) {
    const person = memberName(group, receiver.memberId);
    const address = receiver.address.trim();
    if (!address) {
      if (creditors.has(receiver.memberId)) {
        findings.push(
          hard(
            `dest-empty-${receiver.memberId}`,
            `${person} is owed money but the payout address is blank`,
            "A creditor needs a cashaddr before anyone signs.",
            person,
            receiver.memberId,
          ),
        );
      }
      continue;
    }
    const key = `${receiver.memberId}:${address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const decoded = decodeCashaddr(address);
    if (isCashaddrError(decoded)) {
      findings.push(
        hard(
          `dest-invalid-${receiver.memberId}`,
          `${person}'s payout is not a valid cashaddr`,
          decoded.error,
          person,
          receiver.memberId,
          address,
        ),
      );
      continue;
    }
    if (decoded.network !== network) {
      const actual = decoded.network === "unknown" ? `prefix “${decoded.prefix}”` : decoded.network;
      findings.push(
        hard(
          `dest-network-${receiver.memberId}`,
          `${person}'s payout is on ${actual}, not ${network}`,
          network === "chipnet"
            ? "This review is for chipnet. A mainnet address would send real Bitcoin Cash, or the other way around."
            : "This review is for mainnet. A chipnet address cannot receive a mainnet settlement.",
          person,
          receiver.memberId,
          address,
        ),
      );
      continue;
    }
    if (decoded.type !== 0) {
      findings.push({
        id: `dest-type-${receiver.memberId}`,
        check: "destination",
        severity: "info",
        hard: false,
        title: `${person}'s payout is not a P2PKH address`,
        detail: "The checksum is valid. Settlemany's shared transaction is built for P2PKH (type 0) keys, the same kind Paytaca shows.",
        person,
        personId: receiver.memberId,
        address,
      });
    }

    const normalized = address.toLowerCase();
    const ownAddress = group.members.find((member) => member.id === receiver.memberId)?.address.trim().toLowerCase() ?? "";
    const exactOther = known.find((row) => row.member.id !== receiver.memberId && row.address === normalized);
    if (exactOther) {
      findings.push({
        id: `dest-wrong-person-${receiver.memberId}`,
        check: "destination",
        severity: "warn",
        hard: false,
        title: `${person} would be paid at ${exactOther.member.name}'s address`,
        detail: "The payout is a valid address, and it is already saved on someone else in this group. Confirm that is intentional before anyone signs.",
        person,
        personId: receiver.memberId,
        address,
      });
    } else if (ownAddress && normalized !== ownAddress) {
      findings.push({
        id: `dest-new-${receiver.memberId}`,
        check: "destination",
        severity: "warn",
        hard: false,
        title: `${person}'s payout is new to this group`,
        detail: "It does not match the address saved on their profile, and it is not saved on anyone else here.",
        person,
        personId: receiver.memberId,
        address,
      });
    }

    for (const row of known) {
      if (row.address === normalized) continue;
      const relation = lookalike(normalized, row.address);
      if (!relation) continue;
      findings.push({
        id: `dest-lookalike-${receiver.memberId}-${row.member.id}`,
        check: "destination",
        severity: "warn",
        hard: false,
        title: `${person}'s payout looks like ${row.member.name}'s address`,
        detail: relation,
        person,
        personId: receiver.memberId,
        address,
      });
    }
  }

  if (!findings.some((item) => item.severity === "fail" || item.severity === "warn")) {
    findings.unshift({
      id: "dest-ok",
      check: "destination",
      severity: "pass",
      hard: false,
      title: "Payout addresses match this group and network",
      detail: `Every creditor address is valid ${network} cashaddr and matches an address already saved on that person.`,
    });
  }
  return findings;
}

function lookalike(left: string, right: string): string | null {
  const leftBody = bodyOf(left);
  const rightBody = bodyOf(right);
  const prefix = commonPrefix(leftBody, rightBody);
  const suffix = commonSuffix(leftBody, rightBody);
  const distance = editDistance(left, right, LOOKALIKE_DISTANCE);
  if (prefix >= PREFIX_CHARS) {
    return `The two addresses share ${prefix} leading characters after the prefix. A swapped address often keeps the start of a real one so it survives a quick glance.`;
  }
  if (prefix >= 5 && suffix >= 5) {
    return `The addresses share ${prefix} leading and ${suffix} trailing characters. That is a prefix-and-suffix lookalike.`;
  }
  if (distance > 0 && distance <= LOOKALIKE_DISTANCE) {
    return `The addresses differ by ${distance} edit${distance === 1 ? "" : "s"}. That is close enough to misread on a phone.`;
  }
  return null;
}

function bodyOf(address: string): string {
  const colon = address.indexOf(":");
  return colon >= 0 ? address.slice(colon + 1) : address;
}

function commonPrefix(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffix(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left[left.length - 1 - index] === right[right.length - 1 - index]) index += 1;
  return index;
}

function editDistance(left: string, right: string, cap: number): number {
  if (Math.abs(left.length - right.length) > cap) return cap + 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    let rowMin = current[0]!;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (current[j]! < rowMin) rowMin = current[j]!;
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j]!;
  }
  return previous[right.length] ?? cap + 1;
}

function hard(id: string, title: string, detail: string, person: string, personId: string, address?: string): Finding {
  return finding(id, "fail", true, title, detail, person, personId, address);
}

function finding(
  id: string,
  severity: Finding["severity"],
  hardRule: boolean,
  title: string,
  detail: string,
  person: string,
  personId: string,
  address?: string,
): Finding {
  return { id, check: "destination", severity, hard: hardRule, title, detail, person, personId, address };
}
