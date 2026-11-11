import { formatShekels } from "@homi/shared";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "Month";
}

export function monthShort(month: number): string {
  return monthName(month).slice(0, 3);
}

export function monthLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

export function todayISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDay(iso: string): string {
  const [yearText, monthText, dayText] = iso.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function money(agorot: number): string {
  return formatShekels(agorot, { symbol: true }).replace("₪", "₪ ");
}

export function moneyPlain(agorot: number): string {
  return formatShekels(Math.abs(agorot));
}

export function percentLabel(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return `${whole}%`;
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function bpsToInput(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0")}`.replace(/0$/, "");
}

export function inputToBps(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [wholeText, fraction = ""] = trimmed.split(".");
  if (wholeText === undefined) return null;
  const bps = Number(wholeText) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  if (bps < 0 || bps > 10000) return null;
  return bps;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  if (nextYear < 2020 || nextYear > 2030) return { year, month };
  return { year: nextYear, month: nextMonth };
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function netLabel(net: number): string {
  if (net > 0) return `Owed ${money(net)}`;
  if (net < 0) return `Owes ${money(-net)}`;
  return "Even";
}

export function youBalance(net: number, otherName: string): { title: string; detail: string; tone: "positive" | "negative" | "zero" } {
  if (net > 0) {
    return { title: money(net), detail: `${otherName} owes you`, tone: "positive" };
  }
  if (net < 0) {
    return { title: money(-net), detail: `You owe ${otherName}`, tone: "negative" };
  }
  return { title: money(0), detail: "You're settled up", tone: "zero" };
}
