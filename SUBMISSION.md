# SERV Hackathon Edition 02 — submission notes

Track: **Open Track**.

These notes are the draft for the Typeform, the demo, and the X post. The X post is a draft. It has not been posted.

## Typeform

### What it does

Settle Split Guard reviews a group expense settlement before anyone signs. It returns **SETTLE**, **WAIT**, or **REJECT**, with a check-by-check reason trail and a downloadable audit. It sits in front of Settlemany, which nets the group and closes the debts in one Bitcoin Cash transaction where each payer signs only their own input. The guard recommends. It does not sign, and it does not move coins.

### Who it is for

People splitting a weekend, a flat, or a team bill on Bitcoin Cash, and the person organizing that settlement. Also wallet and ledger builders who want a review step before a multi-party transaction is offered for signature.

### The problem

A one-transaction group settle is only as safe as the numbers and the addresses inside it. A friend can be ticked onto a hotel they did not use. A payout address can be one glance away from the real one. Someone in the chat can say “I’ll pay later” while the transaction still collects from them. A model that simply says “looks fine” is not an audit. The system proposing the settlement should not be the only one evaluating it, and the people who sign should stay in charge.

### How it works

You load a sample group or paste a Settlemany group (JSON, or the `settlemany.v1` localStorage blob). The app shows balances, the payments, the payout addresses, and an optional paste of the group chat.

Press **Review before settling**. On the server:

1. A deterministic policy recomputes every share in integer cents, checks that the payments clear the group, and checks each cashaddr for checksum, network (chipnet vs mainnet), and whether it is new or a lookalike of an address this group already saved.
2. SERV Reasoning (`gpt-5.4-mini` on `https://inference-api.openserv.ai/v1`) reads the ledger, the local findings, and the notes, and returns a schema-locked verdict with fairness flags, dispute quotes, and a reason trail. The request always has a system prompt. Prompt guard and the shadow agent are on, because the chat is untrusted and a sloppy SETTLE is expensive.
3. The combiner keeps the more cautious verdict. If SERV says SETTLE and a hard rule failed, the final verdict is REJECT and the UI shows the disagreement.

SETTLE unlocks a link to Settlemany. WAIT unlocks it only after a named person writes why they are continuing. That override is part of the audit. REJECT does not unlock. Each person still confirms and signs their own share in Settlemany.

Every review is a JSON record: inputs hash, checks, both evaluators, model, timestamps, and the final verdict. Replay the same inputs and the verdict holds. Change one input and the screen shows what flipped.

Demo mode ships recorded SERV responses so the UI works before a key exists. Those screens are labelled demo data. The key, when you add one, stays in `SERV_API_KEY` on the server.

### How SERV Reasoning is used

SERV is the fairness and dispute reader, and it writes the reason trail. It is not the authority. The deterministic policy is the second opinion, on purpose: the component that recommends a payment is not the only component allowed to bless it. Structured JSON makes the verdict replayable. The shadow agent checks the draft against the hard rules before the app will treat it as a live answer. Prompt guard treats pasted chat as hostile. Names can be pseudonymized before they leave the server, and addresses can stay on the device while the local destination check still runs.

## New vs existing

Settlemany (https://github.com/Mzee04/settlemany, live at https://mzee04.github.io/settlemany/) is an existing BCH BLAZE project: the group ledger, the integer-cent netting, and the one-transaction settle where each Paytaca wallet signs its own input. That repo was not modified.

Settle Split Guard is new work for this hackathon. The review gate, the SERV call, the deterministic second opinion, the disagreement rule, the audit and replay, the privacy toggles, and the handoff are all new. The cent split and netting were ported so the guard uses the same numbers Settlemany will settle. They were not copied by changing the other repository.

## Two-minute demo script

0:00 — Open the app. Say: this does not sign. It reviews a Settlemany group before the signatures.

0:15 — Click **Load Lisbon weekend**. Point at the hotel ($240, four ways), the taxi, and dinner, which already leaves Daniel off. Point at Maya’s payout: it is not the address saved on her profile, and it shares a long prefix with that address. The notes are on screen: “I didn’t stay” and “I’ll pay later.”

0:35 — Open **Payload SERV would see**. Names are Member 1… Member 4. Addresses are absent unless the box is checked. Say the key never leaves the server, and demo mode is labelled because no live call is required for this pass.

0:50 — Click **Review before settling**. The card is **WAIT**. Show fairness: Daniel, $60, the hotel. Show the dispute quotes. Show the lookalike under destination. Both evaluators say WAIT. Proceed is disabled.

1:10 — Scroll the reason trail and the audit JSON. Click **Replay this audit’s inputs**. The hash matches and the verdict holds.

1:25 — Delete the dispute lines and set Maya’s payout back to her saved address. Review again. The hash changes and the screen lists what flipped. If demo mode is still on and the inputs are no longer the recording, the banner says this reasoning is a stand-in, not a model.

1:40 — Click **Load the one-cent leak**. Review. SERV’s recorded answer says SETTLE. The policy says REJECT. The banner says they disagree, the final verdict is REJECT, and Proceed stays off. Say: a model cannot overrule a failed hard rule.

1:55 — Click **Load a clean flat** and review. SETTLE. Proceed to Settlemany is a link. Say each person still signs their own share, and the guard never broadcasts.

## Draft X post

Do not post this from the agent. Post it from the project owner’s account, with the repo and demo links filled in.

```text
Settle Split Guard is my Open Track entry for SERV Hackathon Edition 02.

Before a group settles shared expenses in one Bitcoin Cash transaction, SERV Reasoning returns SETTLE, WAIT, or REJECT with a reason trail. A deterministic policy can overrule the model when the math, the address, or the network is wrong. People still sign their own share.

Built in front of Settlemany. Demo mode works before you add a key.

@openservai
```

Add the public repo URL and the demo URL before posting. The submission form asks for the link to that post.
