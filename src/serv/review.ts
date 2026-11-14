import { hasNonHardConcern, unsupportedHardClaims } from "../domain/claims";
import { inputsHash } from "../domain/hash";
import { normalizeInput } from "../domain/normalize";
import { runPolicy } from "../domain/policy";
import type { AuditRecord, Finding, ReviewInput, ServCallMeta, ServOpinion } from "../domain/types";
import { combineVerdicts } from "../domain/verdict";
import { selectDemo } from "./demo";
import { opinionFindings } from "./opinion";
import { buildServPacket } from "./packet";
import { SERV_BASE_URL, SERV_MODEL } from "./prompt";

export function reviewDemo(input: ReviewInput, now = new Date()): AuditRecord {
  const policy = runPolicy(input);
  const { packet } = buildServPacket(input, policy.findings);
  const hash = inputsHash(input);
  const selected = selectDemo(hash, packet, policy);
  const requestedAt = now.toISOString();
  return buildAudit(input, selected.opinion, {
    mode: selected.kind === "recorded" ? "demo-recorded" : "demo-stand-in",
    model: SERV_MODEL,
    requestedAt,
    completedAt: requestedAt,
    responseId: selected.recordingId ? `demo:${selected.recordingId}` : "demo:stand-in",
    usage: null,
    shadowAgent: false,
    promptGuard: false,
    recordingId: selected.recordingId,
    baseURL: SERV_BASE_URL,
  }, now);
}

export function buildAudit(input: ReviewInput, opinion: ServOpinion, meta: ServCallMeta, now = new Date()): AuditRecord {
  const normalized = normalizeInput(input);
  const policy = runPolicy(normalized);
  const { packet, legend } = buildServPacket(normalized, policy.findings);
  const unsupported = unsupportedHardClaims(opinion, policy, normalized.network);
  const combined = combineVerdicts(policy.verdict, policy.summary, opinion.verdict, opinion.confidencePercent, opinion.summary, {
    unsupportedClaims: unsupported,
    servHasNonHardConcern: hasNonHardConcern(opinion, normalized.network),
    policyHasHardFailure: policy.hardFailures.length > 0,
  });
  const stamp = now.getTime().toString(36);
  const unsupportedFindings: Finding[] = unsupported.map((claim, index) => ({
    id: `unsupported-${claim.fact}-${index}`,
    check: "policy",
    severity: "info",
    hard: false,
    title: `Unsupported by policy: ${claim.fact}`,
    detail: claim.because,
  }));
  return {
    version: 1,
    id: `rev_${inputsHash(normalized).slice(0, 12)}_${stamp}`,
    createdAt: now.toISOString(),
    inputsHash: inputsHash(normalized),
    input: normalized,
    packet,
    legend,
    checks: [...policy.findings, ...unsupportedFindings, ...opinionFindings(opinion)],
    policy,
    serv: { ...meta, opinion },
    disagreement: combined.disagreement,
    disagreementReason: combined.disagreementReason,
    finalVerdict: combined.finalVerdict,
    finalSummary: combined.finalSummary,
    confidencePercent: combined.confidencePercent,
    reasonTrail: [
      ...opinion.reasonTrail,
      ...unsupported.map((claim) => ({ step: "Unsupported by policy", because: claim.because })),
      {
        step: "Second opinion",
        because:
          combined.disagreementReason ??
          `Deterministic policy also said ${policy.verdict}. The two evaluators agree, and the model is not the only judge.`,
      },
    ],
    humanOverride: null,
  };
}
