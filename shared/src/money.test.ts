import { describe, expect, it } from "vitest";
import { MoneyError, formatShekels, parseShekels } from "./money.js";

describe("parseShekels", () => {
  it("reads whole shekels and one or two decimal places", () => {
    expect(parseShekels("300")).toBe(30_000);
    expect(parseShekels("300.5")).toBe(30_050);
    expect(parseShekels("300.50")).toBe(30_050);
    expect(parseShekels("0.01")).toBe(1);
    expect(parseShekels(" 0 ")).toBe(0);
  });

  it("rejects symbols, commas, extra decimals, and negatives", () => {
    for (const input of ["₪300", "300.555", "1,200.00", "-1", "", "300.", ".5"]) {
      expect(() => parseShekels(input)).toThrow(MoneyError);
    }
  });
});

describe("formatShekels", () => {
  it("formats agorot in English with an optional shekel symbol", () => {
    expect(formatShekels(30_000)).toBe("300.00");
    expect(formatShekels(1)).toBe("0.01");
    expect(formatShekels(123_456)).toBe("1,234.56");
    expect(formatShekels(30_000, { symbol: true })).toBe("₪300.00");
    expect(formatShekels(-20_000, { symbol: true })).toBe("-₪200.00");
  });
});
