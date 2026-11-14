import { createHash } from "node:crypto";
import { canonicalJson } from "./normalize";
import type { ReviewInput } from "./types";

export function inputsHash(input: ReviewInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}
