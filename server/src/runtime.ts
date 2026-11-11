import { existsSync, readFileSync } from "node:fs";
import { createPostgresStore } from "./postgres.js";
import { createService } from "./service.js";
import { MemoryStore } from "./store.js";

loadLocalEnv();

export function createRuntimeService() {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (process.env.VERCEL && !url) {
    throw new Error("DATABASE_URL is required.");
  }
  if (url) return createService(createPostgresStore(url));
  return createService(new MemoryStore());
}

function loadLocalEnv(): void {
  if (process.env.VERCEL) return;
  const metaUrl = import.meta.url;
  if (!metaUrl) return;
  let path: URL;
  try {
    path = new URL("../.env", metaUrl);
  } catch {
    return;
  }
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
