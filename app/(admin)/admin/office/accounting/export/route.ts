// The journal as a CSV file, for the accountant (staff only).
import { loadAccounting } from "@/lib/office/load";
import { SOURCE_LABEL } from "@/lib/office/accounting";
import { getStaff } from "@/lib/staff";
import { IS_PREVIEW } from "@/lib/env";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  if (!IS_PREVIEW && !(await getStaff())) return new Response("Staff only", { status: 401 });
  const u = new URL(req.url);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("from") || "") ? u.searchParams.get("from")! : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : "";
  const { j } = await loadAccounting();
  const rows = [["Date", "Entry", "Type", "Reference", "Account code", "Account", "Debit", "Credit", "Note"]];
  for (const e of j.entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    for (const l of e.lines) {
      rows.push([e.date, e.title, SOURCE_LABEL[e.source], e.ref, l.account, j.byCode.get(l.account)?.name || "", l.debit ? l.debit.toFixed(2) : "", l.credit ? l.credit.toFixed(2) : "", l.memo]);
    }
  }
  const csv = "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="time-souk-journal${from ? `-from-${from}` : ""}${to ? `-to-${to}` : ""}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
