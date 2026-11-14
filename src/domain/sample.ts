import { openTransfers } from "./ledger";
import type { Group } from "./ledger";
import type { Transfer } from "./netting";
import type { ReviewInput } from "./types";

export const ADDRESSES = {
  amaka: "bchtest:qqz90hkvl4tcwmwq8sszsqtjlh68km8g5czt2l63nw",
  amakaLookalike: "bchtest:qqz90hkvl4tcwmwq8sszsqtjlh68km8gtyl7mc9aex",
  tunde: "bchtest:qzwc74jnxpfxac9dt4k523d0r88vvzxp2u90j5rmr3",
  seyi: "bchtest:qzym9cp5wd3dcyxklwhjhjmpk8a55sm08vku73lsla",
  ife: "bchtest:qrcdvh5v5eqy9krf5xnq4ftvx75p36lp6cr60fpc4a",
  ada: "bchtest:qpvxjckrw6hre7wgnxwtspg58uvpasswny3a49276v",
  bola: "bchtest:qpu2j3vgc0eq2hd0vexx2wjuj0c6edmgf53965yu52",
  chi: "bchtest:qr8wljz5695d8609wue3cvdvs78deypk6gqwe33pgh",
  amakaMainnet: "bitcoincash:qqz90hkvl4tcwmwq8sszsqtjlh68km8g5cxewccx5j",
} as const;

const WHEN = "2026-11-13T18:00:00.000Z";

function lagosGroup(): Group {
  const members = [
    { id: "amaka", name: "Amaka Osei", address: ADDRESSES.amaka },
    { id: "tunde", name: "Tunde Bakare", address: ADDRESSES.tunde },
    { id: "seyi", name: "Seyi Adeniran", address: ADDRESSES.seyi },
    { id: "ife", name: "Ife Okoye", address: ADDRESSES.ife },
  ];
  return {
    id: "lagos-weekend",
    name: "Lagos weekend",
    story: "Four friends, one hotel, a taxi from the airport, and dinner. Ife says she never stayed. Amaka's payout address is one character-run away from the address saved on her profile.",
    createdAt: WHEN,
    members,
    expenses: [
      {
        id: "hotel",
        memo: "Hotel, two nights",
        payerId: "amaka",
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
        payerId: "seyi",
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
        payerId: "tunde",
        amountCents: 9600,
        currency: "USD",
        usdCents: 9600,
        fxNote: "Entered in USD",
        splitMode: "shares",
        parts: [
          { memberId: "amaka", shares: 2 },
          { memberId: "tunde", shares: 2 },
          { memberId: "seyi", shares: 1 },
          { memberId: "ife", shares: 0 },
        ],
        createdAt: WHEN,
      },
    ],
    settled: [],
  };
}

const LAGOS_NOTES = `Amaka: The hotel was $240 for two nights. I put it on my card.
Ife: I didn't stay at the hotel. I was at my cousin's in Yaba. Please take me off that one.
Tunde: I paid for the grill. Ife didn't eat, so I left her off that bill.
Seyi: The airport taxi was $32.50 from my cash.
Tunde: I'll pay my share later, after salary lands on Friday.
Ife: I'm not paying the hotel line until it is corrected.`;

export const LAGOS_REVIEW: ReviewInput = {
  network: "chipnet",
  group: lagosGroup(),
  receivers: [
    { memberId: "amaka", address: ADDRESSES.amakaLookalike },
    { memberId: "tunde", address: ADDRESSES.tunde },
    { memberId: "seyi", address: ADDRESSES.seyi },
    { memberId: "ife", address: ADDRESSES.ife },
  ],
  notes: LAGOS_NOTES,
  pseudonymize: true,
  includeAddresses: false,
};

function flatGroup(id: string, name: string, story: string): Group {
  const members = [
    { id: "ada", name: "Adaeze Cole", address: ADDRESSES.ada },
    { id: "bola", name: "Bola Martins", address: ADDRESSES.bola },
    { id: "chi", name: "Chi Nwankwo", address: ADDRESSES.chi },
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
        payerId: "ada",
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
        payerId: "bola",
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

const FLAT_NOTES = `Adaeze: Rent and power look right.
Bola: Agreed.
Chi: Please settle tonight.`;

export const CLEAN_REVIEW: ReviewInput = {
  network: "chipnet",
  group: flatGroup("flat-4b", "Flat 4B, March", "Rent and power for three roommates. Everyone already agreed in the chat, and each payout address is the one saved on that person."),
  receivers: [
    { memberId: "ada", address: ADDRESSES.ada },
    { memberId: "bola", address: ADDRESSES.bola },
    { memberId: "chi", address: ADDRESSES.chi },
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
    { memberId: "ada", address: ADDRESSES.ada },
    { memberId: "bola", address: ADDRESSES.bola },
    { memberId: "chi", address: ADDRESSES.chi },
  ],
  notes: FLAT_NOTES,
  pseudonymize: true,
  includeAddresses: false,
  proposedTransfers: shortenOneCent(leakGroup),
};

export function receiversFromMembers(group: Group): { memberId: string; address: string }[] {
  return group.members.map((member) => ({ memberId: member.id, address: member.address }));
}
