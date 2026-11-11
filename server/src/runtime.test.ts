import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeService } from "./runtime.js";

describe("deployed database", () => {
  const previousVercel = process.env.VERCEL;
  const previousUrl = process.env.DATABASE_URL;

  afterEach(() => {
    restore("VERCEL", previousVercel);
    restore("DATABASE_URL", previousUrl);
  });

  it("requires the Neon connection when the app is deployed", () => {
    process.env.VERCEL = "1";
    delete process.env.DATABASE_URL;
    expect(() => createRuntimeService()).toThrow(/DATABASE_URL/);
  });
});

function restore(key: "VERCEL" | "DATABASE_URL", value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
