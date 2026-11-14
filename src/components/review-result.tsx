"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatUsd } from "@/domain/money";
import { diffAudits } from "@/domain/replay";
import type { AuditRecord, Finding, Pseudonym, Verdict } from "@/domain/types";
import { applyHumanOverride, handoffAllowed, settlemanyHandoff } from "@/domain/verdict";

const ORDER = ["math", "fairness", "destination", "dispute", "policy"] as const;

export function ReviewResult({
  audit,
  previous,
  onChange,
}: {
  audit: AuditRecord;
  previous: AuditRecord | null;
  onChange: (next: AuditRecord) => void;
}) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const allowed = handoffAllowed(audit);
  const tone = audit.finalVerdict === "SETTLE" ? "verdict-settle" : audit.finalVerdict === "WAIT" ? "verdict-wait" : "verdict-reject";
  const diff = previous && previous.id !== audit.id ? diffAudits(previous, audit) : null;

  return (
    <div id="verdict" className="grid gap-4">
      <DemoBanner audit={audit} />
      <Card className={`border ${tone}`}>
        <CardHeader>
          <p className="text-xs tracking-[0.14em] text-[#6d5e52] uppercase">Final verdict</p>
          <CardTitle className="display text-4xl">{audit.finalVerdict}</CardTitle>
          <p className="text-base leading-relaxed">{audit.finalSummary}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Confidence {audit.confidencePercent}%</Badge>
          <Badge variant="outline">{audit.serv.mode === "live" ? "Live SERV" : "Demo data"}</Badge>
          <span className="text-sm text-[#6d5e52]">The guard recommends. It does not sign.</span>
        </CardContent>
      </Card>

      {audit.disagreement && audit.disagreementReason ? (
        <div className="rounded-2xl border border-[#b8860b] bg-[#fff6db] px-4 py-3 text-sm leading-relaxed" role="status">
          <p className="display text-lg">The two evaluators disagree</p>
          <p className="mt-1">{audit.disagreementReason}</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Evaluator
          name="SERV Reasoning"
          verdict={audit.serv.opinion.verdict}
          detail={`${audit.serv.model} · ${audit.serv.mode === "live" ? "live call" : audit.serv.mode === "demo-recorded" ? "recorded sample" : "local stand-in"}`}
        />
        <Evaluator name="Deterministic policy" verdict={audit.policy.verdict} detail={audit.policy.summary} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="display text-2xl">Checks</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          {ORDER.map((check) => {
            const items = audit.checks.filter((item) => item.check === check);
            if (items.length === 0) return null;
            return (
              <section key={check}>
                <h3 className="display mb-2 text-xl capitalize">{label(check)}</h3>
                <ul className="grid gap-2">
                  {items.map((item) => (
                    <li key={item.id} className="rounded-xl border border-[#e4d5c4] bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityMark finding={item} />
                        <p className="font-medium">{showPerson(item.title, audit.legend)}</p>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-[#3b3129]">{showPerson(item.detail, audit.legend)}</p>
                      {item.amountCents !== undefined ? (
                        <p className="mt-1 text-sm">
                          Amount {formatUsd(item.amountCents)}
                          {item.person ? ` · ${showPerson(item.person, audit.legend)}` : ""}
                        </p>
                      ) : null}
                      {item.address ? <p className="mono mt-1 text-xs break-all text-[#6d5e52]">{item.address}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="display text-2xl">Reason trail</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            {audit.reasonTrail.map((step, index) => (
              <li key={`${step.step}-${index}`} className="grid grid-cols-[2rem_1fr] gap-2">
                <span className="display text-xl text-[#d8431a]">{index + 1}</span>
                <div>
                  <p className="font-medium">{step.step}</p>
                  <p className="text-sm leading-relaxed text-[#3b3129]">{step.because}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {diff ? (
        <Card>
          <CardHeader>
            <CardTitle className="display text-2xl">{diff.verdictHeld ? "Verdict held" : "Verdict flipped"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm leading-relaxed">
            <p>
              {diff.hashChanged ? "The inputs hash changed." : "The inputs hash is the same."} {diff.verdictBefore} → {diff.verdictAfter}.
            </p>
            {diff.flipped.length === 0 ? <p>No check changed severity.</p> : null}
            <ul className="grid gap-1">
              {diff.flipped.map((item) => (
                <li key={item.id}>
                  <span className="font-medium">{item.title}</span>: {item.before} → {item.after}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {audit.finalVerdict === "WAIT" ? (
        <Card>
          <CardHeader>
            <CardTitle className="display text-2xl">Human override</CardTitle>
            <p className="text-sm leading-relaxed text-[#3b3129]">
              WAIT can continue only after a person writes their name and why. The override is stored on this audit. REJECT cannot be overridden.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {audit.humanOverride ? (
              <p className="rounded-xl bg-[#fff6db] px-3 py-2 text-sm">
                {audit.humanOverride.name} overrode WAIT at {audit.humanOverride.at}. Reason: {audit.humanOverride.reason}
              </p>
            ) : (
              <>
                <label className="grid gap-1 text-sm">
                  Your name
                  <Input value={name} onChange={(event) => setName(event.target.value)} className="h-11 bg-white" />
                </label>
                <label className="grid gap-1 text-sm">
                  Why you are continuing
                  <Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="bg-white" />
                </label>
                {overrideError ? <p className="text-sm text-[#8d2610]">{overrideError}</p> : null}
                <Button
                  type="button"
                  className="h-11 w-fit rounded-full px-4"
                  onClick={() => {
                    try {
                      onChange(applyHumanOverride(audit, { name, reason, at: new Date().toISOString() }));
                      setOverrideError(null);
                    } catch (error) {
                      setOverrideError(error instanceof Error ? error.message : "Could not record the override.");
                    }
                  }}
                >
                  Record override
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="display text-2xl">Proceed to Settlemany</CardTitle>
          <p className="text-sm leading-relaxed text-[#3b3129]">
            Settlemany keeps the ledger in that browser. This link opens the group route. If that browser does not already have the group, recreate it there from the JSON you download here. The guard never asks for a key, never signs, and never broadcasts.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {allowed ? (
            <a
              className="inline-flex h-11 items-center rounded-full bg-[#d8431a] px-4 font-medium text-[#fffaf3]"
              href={settlemanyHandoff(audit.input.group.id)}
              target="_blank"
              rel="noreferrer"
            >
              Proceed to Settlemany
            </a>
          ) : (
            <Button type="button" disabled className="h-11 rounded-full px-4">
              Proceed to Settlemany
            </Button>
          )}
          <Button type="button" variant="outline" className="h-11 rounded-full bg-white px-4" onClick={() => download(`settle-split-guard-${audit.id}.json`, audit)}>
            Download audit JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full bg-white px-4"
            onClick={() => download(`${audit.input.group.id}.json`, audit.input.group)}
          >
            Download group JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="display text-2xl">Audit record</CardTitle>
          <p className="mono text-xs break-all text-[#6d5e52]">sha256 {audit.inputsHash}</p>
        </CardHeader>
        <CardContent>
          <pre className="mono max-h-80 overflow-auto rounded-xl bg-[#1b1612] p-3 text-xs leading-relaxed text-[#f6efe4]">
            {JSON.stringify(audit, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function DemoBanner({ audit }: { audit: AuditRecord }) {
  if (audit.serv.mode === "live") {
    return (
      <p className="rounded-2xl border border-[#0f6e52] bg-[#e7f6ef] px-4 py-3 text-sm leading-relaxed">
        Live SERV Reasoning. Model {audit.serv.model}. Requested {audit.serv.requestedAt}. Response {audit.serv.responseId ?? "without an id"}.
        {audit.serv.usage?.totalTokens != null ? ` Tokens ${audit.serv.usage.totalTokens}.` : ""} Prompt guard and the shadow agent were on. The API key stayed on the server.
      </p>
    );
  }
  if (audit.serv.mode === "demo-recorded") {
    return (
      <p className="rounded-2xl border border-[#b8860b] bg-[#fff6db] px-4 py-3 text-sm leading-relaxed" role="status">
        Demo data. This SERV response was recorded for the “{audit.serv.recordingId}” sample. Nothing was sent to inference-api.openserv.ai. Timestamps below are the moment the recording was replayed, not a live model call.
      </p>
    );
  }
  return (
    <p className="rounded-2xl border border-[#b8860b] bg-[#fff6db] px-4 py-3 text-sm leading-relaxed" role="status">
      Demo data. These inputs do not match a recorded sample, so the reasoning section is a local stand-in, not a model. Turn off demo mode and set the server key for a live verdict.
    </p>
  );
}

function Evaluator({ name, verdict, detail }: { name: string; verdict: Verdict; detail: string }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs tracking-[0.14em] text-[#6d5e52] uppercase">{name}</p>
        <CardTitle className="display text-3xl">{verdict}</CardTitle>
        <p className="text-sm leading-relaxed">{detail}</p>
      </CardHeader>
    </Card>
  );
}

function SeverityMark({ finding }: { finding: Finding }) {
  const text = finding.severity === "pass" ? "Pass" : finding.severity === "warn" ? "Warning" : finding.severity === "fail" ? "Fail" : "Note";
  const variant = finding.severity === "fail" ? "destructive" : finding.severity === "pass" ? "secondary" : "outline";
  return (
    <Badge variant={variant}>
      {text}
      {finding.hard ? " · hard rule" : ""}
    </Badge>
  );
}

function label(check: string): string {
  if (check === "math") return "Math integrity";
  if (check === "destination") return "Destination risk";
  if (check === "fairness") return "Fairness";
  if (check === "dispute") return "Dispute signals";
  return "Policy";
}

function showPerson(text: string, legend: Pseudonym[]): string {
  let next = text;
  for (const item of legend) {
    if (item.alias === item.name) continue;
    next = next.replaceAll(item.alias, `${item.name} (${item.alias})`);
  }
  return next;
}

function download(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
