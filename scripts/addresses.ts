import { createHash } from "node:crypto";
import { encodeCashaddr } from "../src/domain/cashaddr.ts";

function hash(label: string): Uint8Array {
  return createHash("sha256").update(`settle-split-guard-v1:${label}`).digest().subarray(0, 20);
}

for (const label of ["maya", "kenji", "sofia", "daniel", "amara", "lucas", "elena"]) {
  console.log(label, encodeCashaddr("bchtest", 0, hash(label)));
}
const maya = hash("maya");
const look = new Uint8Array(maya);
look[19] = look[19]! ^ 0xff;
console.log("lookalike", encodeCashaddr("bchtest", 0, look));
console.log("mainnet", encodeCashaddr("bitcoincash", 0, hash("maya")));
