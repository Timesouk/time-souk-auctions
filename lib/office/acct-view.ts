// Small helpers for the accounting pages.
import { periods } from "./accounting";
import type { Account } from "./types";

/** "1,234.50" / "−1,234.50" (always two decimals: these are the books). */
export const m2 = (n: number | null | undefined) => {
  const v = Math.round((Number(n) || 0) * 100) / 100 || 0;
  return `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The period a report shows: ?p=month|last|quarter|year|all, or ?from=…&to=… */
export function resolvePeriod(sp: { p?: string; from?: string; to?: string }, today: string, fallback = "month") {
  const list = periods(today);
  if (isDate(sp.from) || isDate(sp.to)) {
    const from = isDate(sp.from) ? sp.from! : "";
    const to = isDate(sp.to) ? sp.to! : "";
    return { key: "custom", from, to, label: `${from || "the start"} to ${to || "today"}`, list };
  }
  const hit = list.find(p => p.key === sp.p) || list.find(p => p.key === fallback)!;
  return { key: hit.key, from: hit.from, to: hit.to, label: hit.label, list };
}

export const acctOptions = (accounts: Account[]) =>
  accounts.filter(a => a.active).map(a => ({ code: a.code, name: a.name, type: a.type, subtype: a.subtype }));

export const moneyAccounts = (accounts: Account[]) => accounts.filter(a => a.active && a.type === "asset" && ["cash", "bank", "clearing"].includes(a.subtype));
