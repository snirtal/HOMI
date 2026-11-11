import { describe, expect, it } from "vitest";
import { agorotToNumeric, numericToAgorot } from "./rows.js";

describe("shekel conversion at the database boundary", () => {
  it("keeps agorot and numeric shekels equal", () => {
    expect(agorotToNumeric(12050)).toBe("120.50");
    expect(agorotToNumeric(5)).toBe("0.05");
    expect(numericToAgorot("120.50")).toBe(12050);
    expect(numericToAgorot(agorotToNumeric(1))).toBe(1);
  });
});
