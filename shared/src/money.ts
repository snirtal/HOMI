const SHEKEL_PATTERN = /^\d+(\.\d{1,2})?$/;
const MAX_AGOROT = BigInt(Number.MAX_SAFE_INTEGER);

export class MoneyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
  }
}

export function parseShekels(input: string): number {
  const value = input.trim();
  if (!SHEKEL_PATTERN.test(value)) {
    throw new MoneyError(
      "invalid_amount",
      "Enter a shekel amount with at most two decimal places.",
    );
  }

  const [whole, fraction = ""] = value.split(".");
  if (whole === undefined) {
    throw new MoneyError("invalid_amount", "Enter a shekel amount with at most two decimal places.");
  }
  const agorot = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (agorot > MAX_AGOROT) {
    throw new MoneyError("unsafe_amount", "That amount is too large to calculate safely.");
  }
  return Number(agorot);
}

export function formatShekels(
  agorot: number,
  options?: { symbol?: boolean },
): string {
  if (!Number.isSafeInteger(agorot)) {
    throw new MoneyError("invalid_amount", "Amount must be a whole number of agorot.");
  }

  const negative = agorot < 0;
  const abs = negative ? -agorot : agorot;
  const shekels = Math.floor(abs / 100);
  const fraction = abs % 100;
  const body = `${shekels.toLocaleString("en-US")}.${fraction.toString().padStart(2, "0")}`;

  if (options?.symbol) {
    return negative ? `-₪${body}` : `₪${body}`;
  }
  return negative ? `-${body}` : body;
}

export function assertAgorot(value: number, options?: { allowZero?: boolean }): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError("invalid_amount", "Amount must be a whole number of agorot.");
  }
  if (value < 0 || (!options?.allowZero && value === 0)) {
    throw new MoneyError("not_positive", "Amount must be greater than zero.");
  }
}
