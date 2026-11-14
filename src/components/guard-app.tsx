"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { importSettlemany } from "@/domain/importGroup";
import { rawBalances, type Group } from "@/domain/ledger";
import { formatUsd, parseUsdToCents } from "@/domain/money";
import { openTransfers } from "@/domain/ledger";
import { runPolicy } from "@/domain/policy";
import { CLEAN_REVIEW, LEAK_REVIEW, LISBON_REVIEW, receiversFromMembers } from "@/domain/sample";
import type { AuditRecord, NetworkId, ReviewInput } from "@/domain/types";
import { buildServPacket } from "@/serv/packet";
import { ReviewResult } from "./review-result";

export function GuardApp() {
  const [draft, setDraft] = useState<ReviewInput | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [previous, setPrevious] = useState<AuditRecord | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ groups: Group[]; network: NetworkId } | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [servConfigured, setServConfigured] = useState(false);
  const [customPayments, setCustomPayments] = useState(false);

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json())
      .then((body: { servConfigured?: boolean }) => {
        const configured = Boolean(body.servConfigured);
        setServConfigured(configured);
        setDemoMode(!configured);
      })
      .catch(() => setDemoMode(true));
  }, []);

  const preview = useMemo(() => {
    if (!draft) return null;
    try {
      const policy = runPolicy(draft);
      const built = buildServPacket(draft, policy.findings);
      let balances: ReturnType<typeof rawBalances> = [];
      let balanceError: string | null = null;
      try {
        balances = rawBalances(draft.group);
      } catch (cause) {
        balanceError = cause instanceof Error ? cause.message : "Balances could not be computed.";
      }
      let transfers = draft.proposedTransfers ?? [];
      if (!draft.proposedTransfers) {
        try {
          transfers = openTransfers(draft.group).transfers;
        } catch {
          transfers = [];
        }
      }
      return { policy, ...built, balances, transfers, balanceError };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "The ledger could not be previewed." };
    }
  }, [draft]);

  async function review(input: ReviewInput, forceDemo: boolean) {
    setPhase("loading");
    setError(null);
    setPrevious(audit);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, forceDemo }),
      });
      const body = (await response.json()) as { audit?: AuditRecord; error?: string };
      if (!response.ok || !body.audit) {
        setPhase("error");
        setError(body.error ?? "The review failed.");
        return;
      }
      setAudit(body.audit);
      setPhase("idle");
      requestAnimationFrame(() => document.getElementById("verdict")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setPhase("error");
      setError("The review request did not reach the server.");
    }
  }

  function load(input: ReviewInput) {
    setDraft(input);
    setAmountDrafts({});
    setCustomPayments(Boolean(input.proposedTransfers?.length));
    setAudit(null);
    setPrevious(null);
    setError(null);
    setPhase("idle");
  }

  function patch(next: ReviewInput) {
    setDraft(next);
  }

  return (
    <>
      <a className="skip" href="#ledger">
        Skip to the ledger
      </a>
      <header className="banner">
        <div className="banner-stripe" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-[#f0b429] uppercase">SERV Hackathon Edition 02 · Open Track</p>
            <p className="display text-xl">Review the split before anyone signs</p>
          </div>
          <a className="text-sm text-[#f0b429] underline-offset-2 hover:underline" href="https://www.openserv.ai/hackathon-2">
            Hackathon brief
          </a>
        </div>
      </header>
      <nav className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#e4d5c4] bg-[#f7f1e6]/95 px-4 py-3">
        <a href="#top" className="display text-2xl no-underline">
          Settle Split Guard
        </a>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={demoMode ? "outline" : "secondary"}>{demoMode ? "Demo mode" : "Live SERV"}</Badge>
          <a className="text-sm underline-offset-2 hover:underline" href="https://mzee04.github.io/settlemany/">
            Settlemany
          </a>
          <a className="text-sm underline-offset-2 hover:underline" href="https://github.com/Mzee04/settlemany">
            Ledger repo
          </a>
        </div>
      </nav>

      <main id="top" className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <section className="grid gap-3">
          <h1 className="display text-5xl leading-[0.95] sm:text-6xl">Hold the settlement until the cents and the chat agree.</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#3b3129]">
            Settlemany nets a group and closes it in one Bitcoin Cash transaction. This guard runs first. SERV Reasoning returns SETTLE, WAIT, or REJECT with a reason trail. A deterministic policy checks the math and the addresses, and it can overrule the model. Each person still signs only their own share.
          </p>
        </section>

        <section className="flex flex-wrap gap-2">
          <Button type="button" className="h-11 rounded-full px-4" onClick={() => { setImported(null); load(LISBON_REVIEW); }}>
            Load Lisbon weekend
          </Button>
          <Button type="button" variant="outline" className="h-11 rounded-full bg-white px-4" onClick={() => { setImported(null); load(CLEAN_REVIEW); }}>
            Load a clean flat
          </Button>
          <Button type="button" variant="outline" className="h-11 rounded-full bg-white px-4" onClick={() => { setImported(null); load(LEAK_REVIEW); }}>
            Load the one-cent leak
          </Button>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="display text-2xl">Import a Settlemany group</CardTitle>
            <p className="text-sm leading-relaxed text-[#3b3129]">
              Paste a group JSON object, or the <span className="mono">settlemany.v1</span> value from that browser’s local storage. A share link does not carry the ledger.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='{"id":"grp_…","name":"Weekend","members":[…],"expenses":[…]}'
              className="min-h-28 bg-white"
            />
            {importError ? <p className="text-sm text-[#8d2610]">{importError}</p> : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-fit rounded-full bg-white px-4"
              onClick={() => {
                const parsed = importSettlemany(importText);
                if (!parsed.ok) {
                  setImportError(parsed.error);
                  setImported(null);
                  return;
                }
                setImportError(null);
                setImported(parsed.value);
                const group = parsed.value.groups[0];
                if (group) loadImported(group, parsed.value.network);
              }}
            >
              Import JSON
            </Button>
            {imported && imported.groups.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {imported.groups.map((group) => (
                  <Button
                    key={group.id}
                    type="button"
                    variant="outline"
                    className="h-11 rounded-full bg-white px-4"
                    onClick={() => loadImported(group, imported.network)}
                  >
                    {group.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {!draft ? (
          <Card>
            <CardHeader>
              <CardTitle className="display text-2xl">No group loaded</CardTitle>
              <p className="leading-relaxed">
                Start with the Lisbon weekend. It has four people, a hotel, a taxi, and dinner. Daniel is still ticked on a room he says he did not use, and Maya’s payout address is a lookalike of the one saved on her profile.
              </p>
            </CardHeader>
          </Card>
        ) : (
          <section id="ledger" className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="display text-4xl">{draft.group.name}</h2>
                <p className="max-w-2xl text-[#3b3129]">{draft.group.story}</p>
              </div>
              <div className="inline-flex overflow-hidden rounded-full border border-[#c9b7a4]" role="group" aria-label="Network">
                {(["chipnet", "mainnet"] as const).map((network) => (
                  <button
                    key={network}
                    type="button"
                    aria-pressed={draft.network === network}
                    className={`min-h-11 px-4 capitalize ${draft.network === network ? "bg-[#241c16] text-[#f7f1e6]" : "bg-transparent"}`}
                    onClick={() => patch({ ...draft, network })}
                  >
                    {network}
                  </button>
                ))}
              </div>
            </div>
            {draft.network === "mainnet" ? (
              <p className="rounded-2xl border border-[#f0b8a4] bg-[#fff1e8] px-4 py-3 text-sm">
                Mainnet is selected. A wrong-network address is a hard reject. This page still does not spend coins.
              </p>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="display text-2xl">Balances</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {preview && "balanceError" in preview && preview.balanceError ? <p className="text-sm text-[#8d2610]">{preview.balanceError}</p> : null}
                {preview && "balances" in preview
                  ? preview.balances.map((balance) => (
                      <div key={balance.memberId} className="flex items-center justify-between gap-3 border-b border-[#e4d5c4] py-2">
                        <span>{balance.name}</span>
                        <span className={balance.cents >= 0 ? "text-[#0f6e52]" : "text-[#8d2610]"}>
                          {balance.cents >= 0 ? "is owed " : "owes "}
                          {formatUsd(Math.abs(balance.cents))}
                        </span>
                      </div>
                    ))
                  : <p>{preview && "error" in preview ? preview.error : "Balances are not available."}</p>}
                {preview && "transfers" in preview ? (
                  <ul className="mt-2 grid gap-1 text-sm">
                    {preview.transfers.map((transfer) => (
                      <li key={`${transfer.fromId}-${transfer.toId}-${transfer.amountCents}`}>
                        {nameOf(draft, transfer.fromId)} pays {nameOf(draft, transfer.toId)} {formatUsd(transfer.amountCents)}
                      </li>
                    ))}
                    {preview.transfers.length === 0 ? <li>No payments fall out of this ledger.</li> : null}
                  </ul>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="display text-2xl">Expenses</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {draft.group.expenses.map((expense) => (
                  <label key={expense.id} className="grid gap-1 text-sm">
                    <span>
                      {expense.memo} · paid by {nameOf(draft, expense.payerId)} · {expense.splitMode}
                    </span>
                    <Input
                      inputMode="decimal"
                      aria-label={`${expense.memo} amount in dollars`}
                      className="h-11 bg-white"
                      value={amountDrafts[expense.id] ?? (expense.usdCents / 100).toFixed(2)}
                      onChange={(event) => {
                        const text = event.target.value;
                        setAmountDrafts((current) => ({ ...current, [expense.id]: text }));
                        const cents = parseUsdToCents(text);
                        if (cents === null || cents < 0) return;
                        patch({
                          ...draft,
                          group: {
                            ...draft.group,
                            expenses: draft.group.expenses.map((item) =>
                              item.id === expense.id ? { ...item, usdCents: cents, amountCents: cents } : item,
                            ),
                          },
                        });
                      }}
                    />
                  </label>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-full bg-white px-4"
                    onClick={() => {
                      if (!draft) return;
                      try {
                        const transfers = openTransfers(draft.group).transfers;
                        setCustomPayments(true);
                        patch({ ...draft, proposedTransfers: transfers });
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : "Could not compute payments.");
                      }
                    }}
                  >
                    Edit the payment list
                  </Button>
                  {customPayments ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 rounded-full px-4"
                      onClick={() => {
                        setCustomPayments(false);
                        patch({ ...draft, proposedTransfers: undefined });
                      }}
                    >
                      Use the computed net
                    </Button>
                  ) : null}
                </div>
                {customPayments && draft.proposedTransfers ? (
                  <div className="grid gap-2">
                    {draft.proposedTransfers.map((transfer, index) => (
                      <label key={`${transfer.fromId}-${transfer.toId}-${index}`} className="grid gap-1 text-sm">
                        {nameOf(draft, transfer.fromId)} → {nameOf(draft, transfer.toId)} (dollars)
                        <Input
                          inputMode="decimal"
                          className="h-11 bg-white"
                          defaultValue={(transfer.amountCents / 100).toFixed(2)}
                          onChange={(event) => {
                            const cents = parseUsdToCents(event.target.value);
                            if (cents === null || cents < 0 || !draft.proposedTransfers) return;
                            const proposedTransfers = draft.proposedTransfers.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, amountCents: cents } : item,
                            );
                            patch({ ...draft, proposedTransfers });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="display text-2xl">Payout addresses</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {draft.group.members.map((member) => {
                  const receiver = draft.receivers.find((item) => item.memberId === member.id);
                  return (
                    <label key={member.id} className="grid gap-1 text-sm">
                      {member.name}
                      <span className="mono text-xs break-all text-[#6d5e52]">Saved {member.address || "none"}</span>
                      <Input
                        className="mono h-11 bg-white text-xs"
                        aria-label={`${member.name} payout address`}
                        value={receiver?.address ?? ""}
                        onChange={(event) =>
                          patch({
                            ...draft,
                            receivers: draft.receivers.map((item) =>
                              item.memberId === member.id ? { ...item, address: event.target.value } : item,
                            ),
                          })
                        }
                      />
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="display text-2xl">Chat or receipt notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea className="min-h-40 bg-white" value={draft.notes} onChange={(event) => patch({ ...draft, notes: event.target.value })} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="display text-2xl">What is sent to SERV</CardTitle>
                <p className="text-sm leading-relaxed text-[#3b3129]">
                  A review can send amounts, memos, names or Member N aliases, the pasted notes, and payout addresses if you allow them. It does not send private keys, seeds, xpubs, or signatures. The API key stays in the server environment and is never part of this page.
                </p>
              </CardHeader>
              <CardContent className="grid gap-3">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    className="mt-0.5 size-5"
                    checked={draft.pseudonymize}
                    onCheckedChange={(checked) => patch({ ...draft, pseudonymize: checked })}
                  />
                  <span>Pseudonymize names before sending. “Daniel Berg” becomes Member 1 in the SERV payload. The screen still shows real names.</span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    className="mt-0.5 size-5"
                    checked={draft.includeAddresses}
                    onCheckedChange={(checked) => patch({ ...draft, includeAddresses: checked })}
                  />
                  <span>Include receiver addresses in the SERV payload. Leave this off and the destination check still runs on this server. SERV only hears the local finding, not the cashaddr.</span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox className="mt-0.5 size-5" checked={demoMode} onCheckedChange={(checked) => setDemoMode(checked)} />
                  <span>
                    Demo mode. Uses a recorded SERV response for the three bundled samples, or a labelled stand-in if you edit them.
                    {servConfigured ? " A key is configured on the server. Turn this off to call SERV." : " No API key is configured on the server, so live review is unavailable."}
                  </span>
                </label>
                {preview && "packet" in preview ? (
                  <details>
                    <summary className="cursor-pointer text-sm">Payload SERV would see</summary>
                    <pre className="mono mt-2 max-h-64 overflow-auto rounded-xl bg-[#1b1612] p-3 text-xs text-[#f6efe4]">
                      {JSON.stringify(preview.packet, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="h-11 rounded-full px-4"
                disabled={phase === "loading"}
                onClick={() => void review(draft, demoMode)}
              >
                {phase === "loading" ? "Reviewing…" : "Review before settling"}
              </Button>
              {audit ? (
                <Button type="button" variant="outline" className="h-11 rounded-full bg-white px-4" onClick={() => void review(audit.input, demoMode)}>
                  Replay this audit’s inputs
                </Button>
              ) : null}
              {phase === "loading" ? <p className="text-sm text-[#6d5e52]">Running the policy check and asking for a verdict.</p> : null}
            </div>
            {phase === "error" && error ? (
              <div className="rounded-2xl border border-[#f0b8a4] bg-[#fff1e8] px-4 py-3 text-sm" role="alert">
                <p>{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 h-11 rounded-full bg-white px-4"
                  onClick={() => {
                    setDemoMode(true);
                    void review(draft, true);
                  }}
                >
                  Run the recorded demo instead
                </Button>
              </div>
            ) : null}
          </section>
        )}

        {audit ? <ReviewResult audit={audit} previous={previous} onChange={setAudit} /> : null}
        {!audit && draft && phase === "idle" ? (
          <Card>
            <CardHeader>
              <CardTitle className="display text-2xl">No verdict yet</CardTitle>
              <p>Review before settling to see SETTLE, WAIT, or REJECT, the checks, and the audit JSON.</p>
            </CardHeader>
          </Card>
        ) : null}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-sm leading-relaxed text-[#6d5e52]">
        Built for the Open Track of SERV Hackathon Edition 02. It extends Settlemany and does not modify that project. Humans keep the authority to sign. A per-group review fee is the revenue model. It is not charged in this build.
      </footer>
    </>
  );

  function loadImported(group: Group, network: NetworkId) {
    load({
      network,
      group,
      receivers: receiversFromMembers(group),
      notes: "",
      pseudonymize: true,
      includeAddresses: false,
    });
  }
}

function nameOf(input: ReviewInput, memberId: string): string {
  return input.group.members.find((member) => member.id === memberId)?.name ?? memberId;
}
