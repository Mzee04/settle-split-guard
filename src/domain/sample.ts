import { openTransfers } from "./ledger";
import type { Group } from "./ledger";
import type { Transfer } from "./netting";
import type { ReviewInput } from "./types";

export const ADDRESSES = {
  maya: "bchtest:qq88n2a6ets206699j8xgcz4sskn7j0tmvx4fg226d",
  mayaLookalike: "bchtest:qq88n2a6ets206699j8xgcz4sskn7j0tysmqc04xs9",
  kenji: "bchtest:qrnd7u6x207suwdpd3yrhw5qf3ejvhfs75neml50g4",
  sofia: "bchtest:qrjhnfr4dglqhk8jjcvxxk5hyhd82t7ass08jz3ysm",
  daniel: "bchtest:qp27mzfmye6mneg95cvk76pvzxrajwl8pvlwcmepjl",
  amara: "bchtest:qquwdlg7azvd9vd8jakzjknvjyxddrgaasajmv9zy9",
  lucas: "bchtest:qpuuwvcqtvezu59wjy2r3kk0qgl8t58l9vvj8dmax5",
  elena: "bchtest:qpzdut9f9d7spq3eqgjqduyw9avpuqt28cwpy3qlvh",
  mayaMainnet: "bitcoincash:qq88n2a6ets206699j8xgcz4sskn7j0tmvz8d0gaa3",
} as const;

const WHEN = "2026-11-13T18:00:00.000Z";

function lisbonGroup(): Group {
  const members = [
    { id: "maya", name: "Maya Chen", address: ADDRESSES.maya },
    { id: "kenji", name: "Kenji Sato", address: ADDRESSES.kenji },
    { id: "sofia", name: "Sofia Alves", address: ADDRESSES.sofia },
    { id: "daniel", name: "Daniel Berg", address: ADDRESSES.daniel },
  ];
  return {
    id: "lisbon-weekend",
    name: "Lisbon weekend",
    story:
      "Four friends, one hotel, a taxi from the airport, and dinner. Daniel says he never stayed. Maya's payout address is one character-run away from the address saved on her profile.",
    createdAt: WHEN,
    members,
    expenses: [
      {
        id: "hotel",
        memo: "Hotel, two nights",
        payerId: "maya",
        amountCents: 24000,
        currency: "USD",
        usdCents: 24000,
        fxNote: "Entered in USD",
        splitMode: "equal",
        parts: members.map((member) => ({ memberId: member.id })),
        createdAt: WHEN,
      },
      {
        id: "taxi",
        memo: "Airport taxi",
        payerId: "sofia",
        amountCents: 3250,
        currency: "USD",
        usdCents: 3250,
        fxNote: "Entered in USD",
        splitMode: "equal",
        parts: members.map((member) => ({ memberId: member.id })),
        createdAt: WHEN,
      },
      {
        id: "food",
        memo: "Dinner at the grill",
        payerId: "kenji",
        amountCents: 9600,
        currency: "USD",
        usdCents: 9600,
        fxNote: "Entered in USD",
        splitMode: "shares",
        parts: [
          { memberId: "maya", shares: 2 },
          { memberId: "kenji", shares: 2 },
          { memberId: "sofia", shares: 1 },
          { memberId: "daniel", shares: 0 },
        ],
        createdAt: WHEN,
      },
    ],
    settled: [],
  };
}

const LISBON_NOTES = `Maya: The hotel was $240 for two nights. I put it on my card.
Daniel: I didn't stay at the hotel. I was at my cousin's in Alfama. Please take me off that one.
Kenji: I paid for the grill. Daniel didn't eat, so I left him off that bill.
Sofia: The airport taxi was $32.50 from my cash.
Kenji: I'll pay my share later, after salary lands on Friday.
Daniel: I'm not paying the hotel line until it is corrected.`;

export const LISBON_REVIEW: ReviewInput = {
  network: "chipnet",
  group: lisbonGroup(),
  receivers: [
    { memberId: "maya", address: ADDRESSES.mayaLookalike },
    { memberId: "kenji", address: ADDRESSES.kenji },
    { memberId: "sofia", address: ADDRESSES.sofia },
    { memberId: "daniel", address: ADDRESSES.daniel },
  ],
  notes: LISBON_NOTES,
  pseudonymize: true,
  includeAddresses: false,
};

function flatGroup(id: string, name: string, story: string): Group {
  const members = [
    { id: "amara", name: "Amara Diallo", address: ADDRESSES.amara },
    { id: "lucas", name: "Lucas Ferreira", address: ADDRESSES.lucas },
    { id: "elena", name: "Elena Costa", address: ADDRESSES.elena },
  ];
  return {
    id,
    name,
    story,
    createdAt: WHEN,
    members,
    expenses: [
      {
        id: "rent",
        memo: "March rent",
        payerId: "amara",
        amountCents: 90000,
        currency: "USD",
        usdCents: 90000,
        fxNote: "Entered in USD",
        splitMode: "equal",
        parts: members.map((member) => ({ memberId: member.id })),
        createdAt: WHEN,
      },
      {
        id: "power",
        memo: "Power bill",
        payerId: "lucas",
        amountCents: 4500,
        currency: "USD",
        usdCents: 4500,
        fxNote: "Entered in USD",
        splitMode: "equal",
        parts: members.map((member) => ({ memberId: member.id })),
        createdAt: WHEN,
      },
    ],
    settled: [],
  };
}

const FLAT_NOTES = `Amara: Rent and power look right.
Lucas: Agreed.
Elena: Please settle tonight.`;

export const CLEAN_REVIEW: ReviewInput = {
  network: "chipnet",
  group: flatGroup(
    "flat-4b",
    "Flat 4B, March",
    "Rent and power for three roommates. Everyone already agreed in the chat, and each payout address is the one saved on that person.",
  ),
  receivers: [
    { memberId: "amara", address: ADDRESSES.amara },
    { memberId: "lucas", address: ADDRESSES.lucas },
    { memberId: "elena", address: ADDRESSES.elena },
  ],
  notes: FLAT_NOTES,
  pseudonymize: true,
  includeAddresses: false,
};

function shortenOneCent(group: Group): Transfer[] {
  const transfers = openTransfers(group).transfers.map((transfer) => ({ ...transfer }));
  const target = transfers.slice().sort((a, b) => b.amountCents - a.amountCents)[0];
  if (!target) throw new Error("The flat has no payments to shorten");
  target.amountCents -= 1;
  return transfers;
}

const leakGroup = flatGroup(
  "flat-4b-leak",
  "Flat 4B, one cent short",
  "The same rent and power, and a calm chat. The payment list is one cent short of the ledger, which a quick read can miss.",
);

export const LEAK_REVIEW: ReviewInput = {
  network: "chipnet",
  group: leakGroup,
  receivers: [
    { memberId: "amara", address: ADDRESSES.amara },
    { memberId: "lucas", address: ADDRESSES.lucas },
    { memberId: "elena", address: ADDRESSES.elena },
  ],
  notes: FLAT_NOTES,
  pseudonymize: true,
  includeAddresses: false,
  proposedTransfers: shortenOneCent(leakGroup),
};

export function receiversFromMembers(group: Group): { memberId: string; address: string }[] {
  return group.members.map((member) => ({ memberId: member.id, address: member.address }));
}
