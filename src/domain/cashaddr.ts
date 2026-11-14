/**
 * CashAddr (Bitcoin Cash) codec. Checksum follows the CashAddr specification:
 * https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATORS = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
const HASH_SIZES = [20, 24, 28, 32, 40, 48, 56, 64];

export type CashNetwork = "mainnet" | "chipnet" | "regtest" | "unknown";

export type DecodedCashaddr = {
  prefix: string;
  type: number;
  hash: Uint8Array;
  network: CashNetwork;
};

export type CashaddrError = { error: string };

export function isCashaddrError(value: DecodedCashaddr | CashaddrError): value is CashaddrError {
  return "error" in value;
}

function polymod(values: number[]): bigint {
  let checksum = 1n;
  for (const value of values) {
    const top = checksum >> 35n;
    checksum = ((checksum & 0x07ffffffffn) << 5n) ^ BigInt(value);
    for (let index = 0; index < GENERATORS.length; index += 1) {
      if ((top >> BigInt(index)) & 1n) checksum ^= GENERATORS[index]!;
    }
  }
  return checksum ^ 1n;
}

function prefixExpand(prefix: string): number[] {
  const expanded: number[] = [];
  for (const char of prefix) expanded.push(char.charCodeAt(0) & 31);
  expanded.push(0);
  return expanded;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits) return null;
    acc = ((acc << fromBits) | value) & maxAcc;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits) result.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    return null;
  }
  return result;
}

export function encodeCashaddr(prefix: string, type: number, hash: Uint8Array): string {
  const sizeBits = HASH_SIZES.indexOf(hash.length);
  if (sizeBits < 0) throw new Error(`Unsupported hash length ${hash.length}`);
  if (type < 0 || type > 15) throw new Error("Address type is out of range");
  const version = (type << 3) | sizeBits;
  const payload = convertBits([version, ...hash], 8, 5, true);
  if (!payload) throw new Error("Could not encode the address payload");
  const checksumValue = polymod([...prefixExpand(prefix), ...payload, 0, 0, 0, 0, 0, 0, 0, 0]);
  let body = payload.map((value) => CHARSET[value]).join("");
  for (let shift = 0; shift < 8; shift += 1) {
    const piece = Number((checksumValue >> BigInt(5 * (7 - shift))) & 31n);
    body += CHARSET[piece];
  }
  return `${prefix}:${body}`;
}

export function decodeCashaddr(address: string): DecodedCashaddr | CashaddrError {
  const trimmed = address.trim();
  if (!trimmed) return { error: "Address is empty" };
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (trimmed !== lower && trimmed !== upper) {
    return { error: "Mixed-case cashaddr is not valid" };
  }
  const colon = lower.lastIndexOf(":");
  if (colon <= 0 || colon === lower.length - 1) {
    return { error: "Cashaddr needs a network prefix and a colon, such as bchtest: or bitcoincash:" };
  }
  const prefix = lower.slice(0, colon);
  const body = lower.slice(colon + 1);
  if (prefix.includes(":")) return { error: "Address looks double-prefixed" };
  if (!/^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(body)) {
    return { error: "Address uses characters cashaddr does not allow" };
  }
  if (body.length < 8) return { error: "Address is too short to carry a checksum" };
  const data = [...body].map((char) => CHARSET.indexOf(char));
  if (polymod([...prefixExpand(prefix), ...data]) !== 0n) {
    return { error: "Cashaddr checksum does not match" };
  }
  const payload = convertBits(data.slice(0, -8), 5, 8, false);
  if (!payload || payload.length === 0) return { error: "Cashaddr payload is invalid" };
  const version = payload[0]!;
  if (version & 0x80) return { error: "Cashaddr version byte sets the reserved bit" };
  const type = version >> 3;
  const hashSize = HASH_SIZES[version & 7];
  const hash = Uint8Array.from(payload.slice(1));
  if (hashSize === undefined || hash.length !== hashSize) {
    return { error: `Hash length is ${hash.length} bytes; this version expects ${hashSize ?? "a known size"}` };
  }
  const network: CashNetwork =
    prefix === "bitcoincash" ? "mainnet" : prefix === "bchtest" ? "chipnet" : prefix === "bchreg" ? "regtest" : "unknown";
  return { prefix, type, hash, network };
}

export function cashaddrNetwork(address: string): CashNetwork | null {
  const decoded = decodeCashaddr(address);
  if (isCashaddrError(decoded)) return null;
  return decoded.network;
}
