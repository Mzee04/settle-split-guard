/** Integer cents. The ledger never stores a float. */
/** $10,000,000. Larger figures stop being exact integers in JavaScript. */
export const MAX_SETTLE_CENTS = 1_000_000_000;

export function assertInt(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${whole.toLocaleString("en-US")}.${frac}`;
}

export function parseUsdToCents(value: string): number | null {
  const trimmed = value.trim().replace(/[$,]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const [whole, frac = ""] = trimmed.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_SETTLE_CENTS) return null;
  return negative ? -cents : cents;
}

/** What to tell a person who is still typing an expense amount. Incomplete input is not an error. */
export function amountInputError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || /^\d+\.$/.test(trimmed)) return null;
  const cents = parseUsdToCents(trimmed);
  if (cents === null) {
    const numeric = trimmed.replace(/[$,]/g, "");
    if (/^\d+(\.\d{1,2})?$/.test(numeric)) {
      return `Use at most ${formatUsd(MAX_SETTLE_CENTS)}. Larger amounts are not exact in cents.`;
    }
    return "Use dollars and cents, such as 32.50.";
  }
  if (cents < 0) return "An expense cannot be negative.";
  return null;
}
