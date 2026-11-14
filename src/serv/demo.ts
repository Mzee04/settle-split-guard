import { inputsHash } from "../domain/hash";
import { CLEAN_REVIEW, LAGOS_REVIEW, LEAK_REVIEW } from "../domain/sample";
import type { PolicyReport, ServOpinion, ServPacket } from "../domain/types";
import { standInOpinion } from "./opinion";

const LAGOS_OPINION: ServOpinion = {
  verdict: "WAIT",
  confidencePercent: 74,
  summary:
    "Wait. Member 2 is still on the hotel for $60.00 after saying they did not stay, and Member 4 said they will pay later. The local check also says Member 1's payout is new and looks like the address already saved for them. Nobody should sign until those three are fixed.",
  fairness: [
    {
      person: "Member 2",
      amountCents: 6000,
      reason:
        "Member 2 is ticked on “Hotel, two nights” for an equal quarter, 6000 cents. The notes say they did not stay and ask to be taken off that line.",
    },
  ],
  disputes: [
    {
      quote: "Member 2: I didn't stay at the hotel. I was at my cousin's in Yaba. Please take me off that one.",
      person: "Member 2",
      unresolved: true,
      reason: "The hotel share is still on the ledger after this denial.",
    },
    {
      quote: "Member 4: I'll pay my share later, after salary lands on Friday.",
      person: "Member 4",
      unresolved: true,
      reason: "A promise to pay later is not a signature on this settlement.",
    },
    {
      quote: "Member 2: I'm not paying the hotel line until it is corrected.",
      person: "Member 2",
      unresolved: true,
      reason: "Member 2 is refusing the hotel line in the notes.",
    },
  ],
  destinationNotes: [
    {
      person: "Member 1",
      concern:
        "The local check says this payout is new to the group and shares a long prefix with the address saved on Member 1. Confirm it on another channel before any coins move.",
    },
  ],
  reasonTrail: [
    {
      step: "Math",
      because: "Local findings report the cents add up. This pass does not replace that check, and it does not find a second arithmetic error.",
    },
    {
      step: "Fairness",
      because: "Member 2's 6000 cent hotel share contradicts the note that they did not stay. Dinner already excludes them, so the hotel line is the odd one.",
    },
    {
      step: "Destination",
      because: "Member 1 would be paid at an address the local check calls new and lookalike. Addresses were not copied into this request, so the concern is the local finding, not a guess at the string.",
    },
    {
      step: "Disputes",
      because: "Two people still have open lines: a denial of the hotel, a refusal to pay it, and a promise to pay a share later.",
    },
    {
      step: "Recommendation",
      because: "WAIT. Fix the hotel tick, replace the payout with the saved address, and get Member 4 to settle in this transaction or drop their line. Then review again.",
    },
  ],
};

const CLEAN_OPINION: ServOpinion = {
  verdict: "SETTLE",
  confidencePercent: 88,
  summary:
    "Settle. Rent and power split equally, the payments match the balances, payouts are the saved addresses, and the notes are agreement rather than a dispute. Each person still signs only their own share.",
  fairness: [],
  disputes: [],
  destinationNotes: [],
  reasonTrail: [
    { step: "Math", because: "Local findings say the cents add up and the payments clear the flat. Nothing in the ledger contradicts that." },
    { step: "Fairness", because: "Both bills are equal thirds. Nobody is ticked onto a cost the notes say they missed." },
    { step: "Destination", because: "Local findings report the payouts match the saved addresses on chipnet. No new or lookalike receiver." },
    { step: "Disputes", because: "The notes are short agreement. There is no denial and no promise to pay later." },
    { step: "Recommendation", because: "SETTLE. The guard still only recommends. Each roommate confirms and signs their own input in Settlemany." },
  ],
};

const LEAK_OPINION: ServOpinion = {
  verdict: "SETTLE",
  confidencePercent: 91,
  summary:
    "Settle. The roommates agreed in the notes, the bills are equal thirds, and the payout addresses are the ones already saved. I don't see a reason to hold the signing.",
  fairness: [],
  disputes: [],
  destinationNotes: [],
  reasonTrail: [
    { step: "Chat", because: "The notes are agreement from Member 1, Member 2, and Member 3. Nothing in them asks to wait." },
    { step: "Fairness", because: "Equal splits on rent and power. No one is called out in the notes." },
    { step: "Addresses", because: "No destination warning stood out in a quick read of the request." },
    { step: "Recommendation", because: "SETTLE. The group can go sign." },
  ],
};

const RECORDINGS: { id: string; hash: string; opinion: ServOpinion }[] = [
  { id: "lagos-weekend", hash: inputsHash(LAGOS_REVIEW), opinion: LAGOS_OPINION },
  { id: "flat-4b", hash: inputsHash(CLEAN_REVIEW), opinion: CLEAN_OPINION },
  { id: "flat-4b-leak", hash: inputsHash(LEAK_REVIEW), opinion: LEAK_OPINION },
];

export function selectDemo(hash: string, packet: ServPacket, policy: PolicyReport): {
  opinion: ServOpinion;
  kind: "recorded" | "stand-in";
  recordingId?: string;
} {
  const recorded = RECORDINGS.find((item) => item.hash === hash);
  if (recorded) return { opinion: recorded.opinion, kind: "recorded", recordingId: recorded.id };
  return { opinion: standInOpinion(packet, policy.verdict, policy.summary), kind: "stand-in" };
}

export function recordedIds(): string[] {
  return RECORDINGS.map((item) => item.id);
}
