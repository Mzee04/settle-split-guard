# Settle Split Guard

Settle Split Guard reviews a group settlement **before anyone signs**. It is an Open Track entry for [SERV Hackathon Edition 02](https://www.openserv.ai/hackathon-2).

[Settlemany](https://github.com/Mzee04/settlemany) already nets a group’s shared expenses and closes them in **one Bitcoin Cash transaction**, with each payer signing only their own input. That ledger is a live BCH BLAZE entry, and this project does not modify it. The guard sits in front of it. SERV Reasoning recommends **SETTLE**, **WAIT**, or **REJECT**. A deterministic policy checks the same proposal and can overrule the model. People keep the authority to sign.

“The model decided” is not a settlement. The audit record stores the inputs hash, every check, both evaluators, and the final verdict, so a review can be replayed.

## What it checks

1. **Math integrity (deterministic).** Expense shares are integer cents, using the same split and netting rules as Settlemany. Balances must sum to zero, every proposed payment must match what that person owes, and applying the payments must clear the group. A one-cent leak is a hard failure.
2. **Fairness (SERV).** Someone ticked onto an item they said they did not share, an unusual split, or one person carrying a disproportionate share. Each flag names the person, the amount, and the reason.
3. **Destination risk (deterministic, with SERV commentary).** A payout address that is new to the group, a lookalike of a known address (shared prefix or suffix, or a small edit distance), the wrong network (mainnet vs chipnet), or an invalid cashaddr. Invalid addresses and the wrong network are hard failures.
4. **Dispute signals (SERV).** Optional pasted chat or receipt notes. Unresolved lines such as “I didn’t stay” or “I’ll pay later” hold the verdict at WAIT or REJECT.
5. **A final verdict** with a confidence score and a short plain-English summary.

### Second opinion

The deterministic policy runs beside SERV. The final verdict is the **more cautious** of the two.

- If SERV says SETTLE and a hard rule fails (math, invalid cashaddr, wrong network), the final verdict is **REJECT**. The screen shows the disagreement.
- If SERV says SETTLE and the policy only has a warning (a new or lookalike address), the final verdict is **WAIT**, and the disagreement is shown.
- SERV can still WAIT or REJECT on fairness or the chat when the policy is clean. The model cannot loosen a harder policy verdict.

A person can record an override only on **WAIT**. That name and reason are written into the audit, and only then does “Proceed to Settlemany” unlock. **REJECT** stays closed. **SETTLE** unlocks without an override. The handoff opens [Settlemany](https://mzee04.github.io/settlemany/). Settlemany keeps its ledger in that browser, so the guard also downloads the group JSON. This app never signs and never broadcasts.

## How SERV Reasoning is used

The server calls the OpenAI-compatible API at `https://inference-api.openserv.ai/v1` with `gpt-5.4-mini`. The key is `SERV_API_KEY`, read in the route handler and passed into the client. It is not a `NEXT_PUBLIC_` variable and it is not in client code.

Every request sends a system prompt. The verdict is forced through a JSON schema. Two SERV tools ride along: `serv_prompt_guard`, because the pasted chat is untrusted, and `serv_shadow_agent`, which checks that a SETTLE draft does not ignore a hard failure, a fairness flag without a person and a reason, or a short reason trail.

```ts
const client = new OpenAI({
  baseURL: "https://inference-api.openserv.ai/v1",
  apiKey, // process.env.SERV_API_KEY, read only in the route handler
});

const completion = await client.chat.completions.create({
  model: "gpt-5.4-mini",
  reasoning_effort: "low",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(packet) },
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "settlement_verdict", strict: true, schema: VERDICT_SCHEMA },
  },
  tools: [
    { type: "function", function: { name: "serv_prompt_guard" } },
    { type: "function", function: { name: "serv_shadow_agent", parameters: shadowParameters } },
  ],
  tool_choice: "none",
});
```

The full call is in `src/serv/client.ts`. The system prompt is in `src/serv/prompt.ts`. The route is `src/app/api/review/route.ts`.

Without a key, or with demo mode on, the app does not call SERV. The three bundled samples replay recorded responses and are labelled **Demo data**. Any other input gets a local stand-in that says it is not a model. Live failures return an error and offer the recorded demo. They do not pretend a failed call succeeded.

## Architecture

```text
Browser (Next.js)
  ledger, notes, payout addresses, privacy toggles
        |
        |  POST /api/review   (no API key in the body)
        v
Route handler
  1. Deterministic policy   src/domain/mathCheck.ts, destination.ts, policy.ts
  2. Pseudonymized packet   src/serv/packet.ts
  3. SERV or recorded demo  src/serv/client.ts, src/serv/demo.ts
  4. Combiner               src/domain/verdict.ts
        |
        v
Audit JSON  (inputs hash, checks, both evaluators, verdict, reason trail)
```

Money is integer cents. Splits and minimum-transfer netting are ported from Settlemany so the guard argues about the same numbers the ledger will settle. Cashaddr validation follows the [CashAddr spec](https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md), including the checksum, so a lookalike that breaks the checksum is an invalid address rather than a warning.

Groups import as Settlemany JSON: one group object, or the `settlemany.v1` localStorage blob (`{ network, groups }`). A Settlemany share link does not contain the ledger. The page says so and tells you where that browser stores it.

## Privacy

Sent to SERV, and only when you press Review:

- expense memos, amounts, who paid, and how the split was set
- names, or `Member 1`… aliases if pseudonymize is on (it is on by default)
- the pasted notes
- payout addresses only if you check “Include receiver addresses”

Not sent:

- private keys, seeds, xpubs, signatures
- the API key
- addresses, when that box is unchecked (the destination check still runs on the server, and SERV sees the finding in words)

The on-screen payload preview is the object the server would forward. The audit download contains that packet. With pseudonyms on, the name legend is in the audit so you can read it on this device. Do not publish that file if the legend should stay private.

## Run it locally

```bash
npm install
npm test
npm run dev
```

The dev server listens on [http://127.0.0.1:3847](http://127.0.0.1:3847). Demo mode works with no key. Load **Lagos weekend**, **a clean flat**, or **the one-cent leak**, then press **Review before settling**.

For a live verdict:

```bash
cp .env.example .env.local
# set SERV_API_KEY in .env.local — get a key at https://console.openserv.ai
npm run dev
```

Turn **Demo mode** off. The health check at `/api/health` reports whether a key is configured. It does not return the key.

```bash
npm run lint
npm run build
npm start
```

`npm start` binds `0.0.0.0` and uses `PORT` (3847 if unset).

## Demo mode

| Sample | What you should see |
| --- | --- |
| Lagos weekend | **WAIT**. Ife is still on a $60 hotel share she denied. Tunde said he will pay later. Amaka’s payout shares a long prefix with her saved address. Both evaluators wait. Proceed stays off until a person records an override. |
| Clean flat | **SETTLE**. Rent and power, saved addresses, a short agreement in the notes. Proceed unlocks. |
| One-cent leak | SERV’s recorded answer says **SETTLE** and misses the cent. The policy says **REJECT**. The final verdict is **REJECT**, the disagreement is on screen, and Proceed stays off. |

Edit a note or an address and review again. If the inputs hash changes, the trail shows which checks flipped. Replaying the original inputs keeps the verdict. Edited inputs in demo mode are labelled as a stand-in, not as the recorded model.

## Deploy

This repo includes `render.yaml` for a free Render web service. It is not deployed from here.

1. Push the repo to a host Render can see.
2. In the Render dashboard, create a Blueprint from `render.yaml` (or a web service with build `npm ci && npm test && npm run build` and start `npm start`).
3. Set `SERV_API_KEY` in the environment. Leave it unset to run demo-only.
4. The service binds `0.0.0.0:$PORT`. `/api/health` is the health check.
5. Free web services spin down after a period of inactivity. The filesystem is ephemeral. Audits stay in the browser that requested them. Nothing here needs a database.

The same Next.js app runs on a Vercel-style host: import the project, set `SERV_API_KEY` in the project environment, and leave the API route as a serverless function. Do not mark the key as exposed to the browser.

## Tests

`npm test` covers cent splits and remainder assignment, zero-sum balances, the one-cent leak, an amounts split that does not add up, cashaddr checksums, lookalike and wrong-network addresses, the verdict combiner including the SETTLE-overruled-by-REJECT case, human override, recorded demo reviews, replay diffs, Settlemany JSON import, SERV JSON parsing, and a scan that keeps the API key out of client code.

## Revenue model

The review is the product, not a cut of the group’s debts. Settlemany settlement stays free.

- **Per group.** The organizer pays a flat review fee when they ask for a live SERV verdict. A reasonable public price is $1, or a few thousand sats, per review. Recorded demo reviews stay free so a group can see the gate before they pay.
- **Organizer add-on.** A trip host, a roommate ledger, or a wallet that embeds the guard pays a monthly seat. The settle button in that product stays locked until a guard verdict exists, and WAIT still requires a named human override.

This build does not charge anyone. There is no checkout.

## Layout

- `src/domain` — cents, splits, netting, cashaddr, math, destination, policy, combiner, samples
- `src/serv` — packet, prompt, schema, recorded responses, live client
- `src/app/api` — `POST /api/review`, `GET /api/health`
- `src/components` — the review screen
- `SUBMISSION.md` — hackathon write-up, demo script, and a draft X post (not posted)
