import { parseShekels } from "./money.js";

const MAX_AGOROT = 100_000_000;
const MAX_TITLE_LENGTH = 80;

export type ShortcutImport = {
  title: string;
  amount: string;
  amountInvalid: boolean;
  fingerprint: string;
};

/**
 * Read an Apple Shortcuts transaction link.
 * Returns null unless addExpense=1, so ordinary visits are ignored.
 */
export function parseShortcutImport(search: string): ShortcutImport | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  if (params.get("addExpense") !== "1") return null;

  const title = cleanMerchant(params.get("merchant") ?? "");
  const normalized = normalizeAmount(params.get("amount") ?? "");
  const amount = acceptAmount(normalized);

  return {
    title,
    amount: amount ?? "",
    amountInvalid: amount === null,
    fingerprint: `${amount ?? normalized}|${title}`,
  };
}

function acceptAmount(normalized: string): string | null {
  if (!normalized) return null;
  try {
    const agorot = parseShekels(normalized);
    if (agorot <= 0 || agorot > MAX_AGOROT) return null;
    return displayShekels(agorot);
  } catch {
    return null;
  }
}

function displayShekels(agorot: number): string {
  const shekels = Math.floor(agorot / 100);
  const fraction = agorot % 100;
  if (fraction === 0) return String(shekels);
  return `${shekels}.${String(fraction).padStart(2, "0")}`;
}

function cleanMerchant(raw: string): string {
  const cleaned = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
  return [...cleaned].slice(0, MAX_TITLE_LENGTH).join("");
}

function normalizeAmount(raw: string): string {
  let value = raw.trim().replace(/[\s\u00a0]/g, "");
  value = value.replace(/₪/g, "");
  value = value.replace(/ils|nis/gi, "");
  value = value.replace(/ש["״']?ח/g, "");
  value = value.replace(/^\+/, "");
  if (!value) return "";

  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma !== -1 && dot !== -1) {
    return comma > dot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  }
  if (comma === -1) return value;

  const parts = value.split(",");
  const tail = parts.at(-1) ?? "";
  const head = parts[0] ?? "";
  const grouped =
    head !== "" &&
    /^\d+$/.test(head) &&
    parts.slice(1).every((part) => /^\d{3}$/.test(part));
  if (grouped) return parts.join("");
  if (parts.length === 2 && /^\d+$/.test(head) && /^\d{1,2}$/.test(tail)) {
    return `${head}.${tail}`;
  }
  return value;
}
