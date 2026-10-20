"use client";
// The Lots sheet, in the browser: type straight into the rows, then Save (or Ctrl+S / ⌘S).
// Enter moves down to the same column on the next lot, like Excel.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLots } from "@/app/(admin)/admin/office/actions";
import { WaButton } from "./Wa";
import { statusClass } from "@/lib/office/status";

export type GridCol = { key: string; label: string; kind?: "text" | "num" | "date" | "select"; options?: readonly string[]; list?: string; w?: number };
export type GridRow = {
  id: string;
  key: string;
  watch: string;
  seller: string;
  status: string;
  values: Record<string, string>;
  /** read-only cells shown after the inputs (calculated) */
  info: Record<string, string>;
  wa?: { phone: string; text: string; ref: string; name: string; total: number | null } | null;
  href?: string;
};

export function LotsGrid({
  rows, cols, info, buyers, sellers, waMode, empty
}: {
  rows: GridRow[];
  cols: GridCol[];
  info: { key: string; label: string; n?: boolean }[];
  buyers?: string[];
  sellers?: string[];
  waMode: "app" | "web";
  empty: string;
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const table = useRef<HTMLTableElement>(null);
  const dirty = Object.keys(edits).length;

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => `${r.key} ${r.watch} ${r.seller} ${r.status} ${Object.values(r.values).join(" ")}`.toLowerCase().includes(q));
  }, [rows, filter]);

  const val = (r: GridRow, k: string) => edits[r.id]?.[k] ?? r.values[k] ?? "";
  const set = (r: GridRow, k: string, v: string) =>
    setEdits(e => {
      const row = { ...(e[r.id] || {}) };
      if ((r.values[k] ?? "") === v) delete row[k];
      else row[k] = v;
      const next = { ...e };
      if (Object.keys(row).length) next[r.id] = row;
      else delete next[r.id];
      return next;
    });

  const save = () => {
    if (!dirty || pending) return;
    const changes = Object.entries(edits).map(([id, fields]) => ({ id, fields }));
    start(async () => {
      const r = await saveLots(changes);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setEdits({});
        router.refresh();
      }
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(edits).length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edits]);

  /** Enter: same column, next row. */
  const onEnter = (e: React.KeyboardEvent<HTMLElement>, ri: number, ci: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = table.current?.querySelector<HTMLElement>(`[data-cell="${ri + (e.shiftKey ? -1 : 1)}-${ci}"]`);
    next?.focus();
    if (next instanceof HTMLInputElement) next.select();
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <input className="grid-filter" placeholder="Find a lot, watch, seller, buyer…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Find" />
        <span className="fine">{shown.length} of {rows.length} lots</span>
      </div>
      {buyers ? (
        <datalist id="dl-buyers">
          {buyers.map(b => <option key={b} value={b} />)}
        </datalist>
      ) : null}
      {sellers ? (
        <datalist id="dl-sellers">
          {sellers.map(b => <option key={b} value={b} />)}
        </datalist>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="tbl-wrap grid-wrap">
          <table className="lgrid" ref={table}>
            <thead>
              <tr>
                <th>Lot</th>
                <th>Watch</th>
                {cols.map(c => <th key={c.key}>{c.label}</th>)}
                {info.map(c => <th key={c.key} className={c.n ? "n" : undefined}>{c.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r, ri) => (
                <tr key={r.id} className={edits[r.id] ? "dirty" : undefined}>
                  <td className="mono nowrap">{r.href ? <a href={r.href}>{r.key}</a> : r.key}</td>
                  <td className="watch" title={r.watch}>
                    {r.watch}
                    {r.seller ? <small>{r.seller}</small> : null}
                  </td>
                  {cols.map((c, ci) => (
                    <td key={c.key} className={c.kind === "num" ? "n" : undefined}>
                      {c.kind === "select" ? (
                        <select data-cell={`${ri}-${ci}`} value={val(r, c.key)} onChange={e => set(r, c.key, e.target.value)} onKeyDown={e => onEnter(e, ri, ci)} aria-label={`${c.label}, lot ${r.key}`}>
                          <option value="" />
                          {(c.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          data-cell={`${ri}-${ci}`}
                          type={c.kind === "date" ? "date" : "text"}
                          inputMode={c.kind === "num" ? "decimal" : undefined}
                          list={c.list}
                          value={val(r, c.key)}
                          style={c.w ? { width: c.w } : undefined}
                          onChange={e => set(r, c.key, e.target.value)}
                          onKeyDown={e => onEnter(e, ri, ci)}
                          aria-label={`${c.label}, lot ${r.key}`}
                        />
                      )}
                    </td>
                  ))}
                  {info.map(c => (
                    <td key={c.key} className={c.n ? "n" : undefined}>
                      {c.key === "status" ? <span className={`pill ${statusClass(r.info.status)}`}>{r.info.status}</span> : r.info[c.key]}
                    </td>
                  ))}
                  <td className="nowrap">
                    {r.wa && !edits[r.id] ? (
                      <WaButton label="WhatsApp" phone={r.wa.phone} text={r.wa.text} mode={waMode} log={{ ref: r.wa.ref, name: r.wa.name, total: r.wa.total, balance: r.wa.total, kind: `Won lot ${r.key}`, link: "" }} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={`savebar${dirty ? " on" : ""}`}>
        <span>{dirty ? `${dirty} lot${dirty === 1 ? "" : "s"} changed` : msg?.text || "All saved"}</span>
        {dirty ? (
          <>
            <button type="button" className="btn" onClick={() => setEdits({})} disabled={pending}>Undo</button>
            <button type="button" className="btn pri" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save (Ctrl+S)"}</button>
          </>
        ) : null}
      </div>
      {msg && !msg.ok ? <p className="alert" role="status">{msg.text}</p> : null}
    </div>
  );
}
