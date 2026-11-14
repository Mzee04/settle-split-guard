import type { Group } from "./ledger";
import type { Transfer } from "./netting";

export type NetworkId = "chipnet" | "mainnet";

export type Verdict = "SETTLE" | "WAIT" | "REJECT";

export type CheckId = "math" | "destination" | "fairness" | "dispute" | "policy";

export type Severity = "pass" | "info" | "warn" | "fail";

export type Finding = {
  id: string;
  check: CheckId;
  severity: Severity;
  hard: boolean;
  title: string;
  detail: string;
  person?: string;
  personId?: string;
  amountCents?: number;
  /** Present locally. Stripped from the SERV payload unless the user opts in. */
  address?: string;
};

export type ReviewInput = {
  network: NetworkId;
  group: Group;
  receivers: { memberId: string; address: string }[];
  notes: string;
  pseudonymize: boolean;
  includeAddresses: boolean;
  /** When set, these are the payments the group is about to sign. */
  proposedTransfers?: Transfer[];
};

export type ServFairness = {
  person: string;
  amountCents: number;
  reason: string;
};

export type ServDispute = {
  quote: string;
  person: string;
  unresolved: boolean;
  reason: string;
};

export type ServDestinationNote = {
  person: string;
  concern: string;
};

export type ReasonStep = {
  step: string;
  because: string;
};

export type ServOpinion = {
  verdict: Verdict;
  confidencePercent: number;
  summary: string;
  fairness: ServFairness[];
  disputes: ServDispute[];
  destinationNotes: ServDestinationNote[];
  reasonTrail: ReasonStep[];
};

export type PolicyReport = {
  verdict: Verdict;
  findings: Finding[];
  hardFailures: string[];
  summary: string;
};

export type HumanOverride = {
  at: string;
  name: string;
  reason: string;
  from: "WAIT";
};

export type ServMode = "live" | "demo-recorded" | "demo-stand-in";

export type ServCallMeta = {
  mode: ServMode;
  model: string;
  requestedAt: string;
  completedAt: string;
  responseId: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
  shadowAgent: boolean;
  promptGuard: boolean;
  recordingId?: string;
  baseURL: string;
};

export type Pseudonym = {
  memberId: string;
  name: string;
  alias: string;
};

export type ServPacket = {
  network: NetworkId;
  groupName: string;
  people: {
    alias: string;
    balanceCents: number;
    payoutAddress?: string;
    savedAddress?: string;
  }[];
  expenses: {
    memo: string;
    payer: string;
    usdCents: number;
    currency: string;
    splitMode: string;
    shares: { person: string; cents: number }[];
  }[];
  transfers: { from: string; to: string; amountCents: number }[];
  localFindings: {
    id: string;
    severity: Severity;
    hard: boolean;
    title: string;
    detail: string;
    person?: string;
    amountCents?: number;
  }[];
  notes: string;
  addressesIncluded: boolean;
  namesPseudonymized: boolean;
};

export type AuditRecord = {
  version: 1;
  id: string;
  createdAt: string;
  inputsHash: string;
  input: ReviewInput;
  packet: ServPacket;
  legend: Pseudonym[];
  checks: Finding[];
  policy: PolicyReport;
  serv: ServCallMeta & { opinion: ServOpinion };
  disagreement: boolean;
  disagreementReason: string | null;
  finalVerdict: Verdict;
  finalSummary: string;
  confidencePercent: number;
  reasonTrail: ReasonStep[];
  humanOverride: HumanOverride | null;
};
