import { describe, expect, it } from "vitest";
import { parseShortcutImport } from "./shortcutImport.js";

function imported(search: string) {
  const result = parseShortcutImport(search);
  if (!result) throw new Error("expected an import");
  return result;
}

describe("parseShortcutImport", () => {
  it("reads a plain amount and merchant", () => {
    expect(imported("?addExpense=1&amount=185&merchant=Shufersal")).toMatchObject({
      title: "Shufersal",
      amount: "185",
      amountInvalid: false,
    });
  });

  it("accepts a comma decimal, a thousands separator, and a shekel symbol", () => {
    expect(imported("addExpense=1&amount=185,50&merchant=A").amount).toBe("185.50");
    expect(imported("addExpense=1&amount=1,234.50&merchant=A").amount).toBe("1234.50");
    expect(imported("addExpense=1&amount=1.234,50&merchant=A").amount).toBe("1234.50");
    expect(imported("addExpense=1&amount=%E2%82%AA%20185&merchant=A").amount).toBe("185");
    expect(imported("addExpense=1&amount=ILS185.5&merchant=A").amount).toBe("185.50");
  });

  it("rejects zero, negative, and non-numeric amounts but still opens an import", () => {
    for (const amount of ["0", "-5", "abc", "185.555"]) {
      const result = imported(`addExpense=1&amount=${encodeURIComponent(amount)}&merchant=Shop`);
      expect(result.amount).toBe("");
      expect(result.amountInvalid).toBe(true);
      expect(result.title).toBe("Shop");
    }
  });

  it("allows a missing amount and a missing merchant", () => {
    expect(imported("addExpense=1&merchant=Shop")).toMatchObject({
      title: "Shop",
      amount: "",
      amountInvalid: true,
    });
    expect(imported("addExpense=1&amount=10")).toMatchObject({
      title: "",
      amount: "10",
      amountInvalid: false,
    });
  });

  it("trims the merchant and caps it at 80 characters", () => {
    const long = `${"a".repeat(90)}\n`;
    const result = imported(`addExpense=1&amount=10&merchant=${encodeURIComponent(`  ${long}`)}`);
    expect(result.title).toBe("a".repeat(80));
    expect(result.title).not.toMatch(/[\n\r]/);
  });

  it("ignores links that are not an expense import", () => {
    expect(parseShortcutImport("")).toBeNull();
    expect(parseShortcutImport("?amount=185&merchant=Shufersal")).toBeNull();
    expect(parseShortcutImport("?addExpense=true&amount=185")).toBeNull();
  });

  it("uses the same fingerprint for the same transaction written differently", () => {
    const plain = imported("addExpense=1&amount=185&merchant=Shufersal");
    const symbol = imported("addExpense=1&amount=%E2%82%AA185.00&merchant=Shufersal");
    expect(plain.fingerprint).toBe(symbol.fingerprint);
  });
});
