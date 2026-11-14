import { createHash } from "node:crypto";
import { encodeCashaddr } from "../src/domain/cashaddr.ts";

function hash(label: string): Uint8Array {
  return createHash("sha256").update(`settle-split-guard-v1:${label}`).digest().subarray(0, 20);
}

for (const label of ["amaka", "tunde", "seyi", "ife", "ada", "bola", "chi"]) {
  console.log(label, encodeCashaddr("bchtest", 0, hash(label)));
}
const amaka = hash("amaka");
const look = new Uint8Array(amaka);
look[19] = look[19]! ^ 0xff;
console.log("lookalike", encodeCashaddr("bchtest", 0, look));
console.log("mainnet", encodeCashaddr("bitcoincash", 0, hash("amaka")));
