"use client";
// Quick search (Ctrl K / ⌘K): type a few letters to jump to any page, start a common task, or find a buyer or lot.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAV, hrefFor } from "@/lib/admin-nav";

type Item = { id: string; group: string; label: string; hint?: string; href: string; words: string };

/** Common tasks, so nobody has to remember which page they live on. */
function tasks(auction: string | null, isAdmin: boolean): Item[] {
  const a = auction ? `a=${encodeURIComponent(auction)}` : "";
  const q = (path: string, extra = "") => `${path}${a || extra ? `?${[a, extra].filter(Boolean).join("&")}` : ""}`;
  const list: (Omit<Item, "id" | "group" | "words"> & { words?: string; admin?: boolean })[] = [
    { label: "Receive watches from a seller", hint: "Intake", href: "/admin/office/intake", words: "new intake receipt consign drop off" },
    { label: "Create an auction", hint: "Auctions & lots", href: "/admin/auctions", words: "new auction week" },
    { label: "Type results after the live", hint: "Lots & results", href: q("/admin/office/lots"), words: "hammer winner sold" },
    { label: "Send invoices not sent yet", hint: "Invoices", href: q("/admin/office/invoices", "show=unsent"), words: "whatsapp bill" },
    { label: "Print all invoices", hint: "Invoices", href: q("/admin/office/invoices/print"), words: "pdf paper" },
    { label: "Chase unpaid invoices", hint: "Invoices, every auction", href: "/admin/office/invoices?show=unpaid&all=1", words: "remind overdue owe collect" },
    { label: "Record a payment", hint: "Payments", href: "/admin/office/payments", words: "money received bank transfer cash" },
    { label: "Mark orders delivered", hint: "Invoices", href: q("/admin/office/invoices", "show=ready"), words: "ship collected courier dispatch" },
    { label: "Pay sellers", hint: "Pay sellers", href: "/admin/office/sellers/payouts", words: "payout settle owed consignor" },
    { label: "Print seller statements", hint: "Statements", href: q("/admin/office/statements"), words: "seller pdf" },
    { label: "Add a staff member", hint: "Staff", href: "/admin/staff", words: "employee access", admin: true }
  ];
  return list
    .filter(t => isAdmin || !t.admin)
    .map((t, i) => ({ id: `t${i}`, group: "Do", label: t.label, hint: t.hint, href: t.href, words: `${t.label} ${t.hint || ""} ${t.words || ""}`.toLowerCase() }));
}

export function QuickSearch({ open, onClose, isAdmin, auction }: { open: boolean; onClose: () => void; isAdmin: boolean; auction: string | null }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [at, setAt] = useState(0);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setText("");
      setAt(0);
      setTimeout(() => input.current?.focus(), 0);
    } else if (!open && d.open) d.close();
  }, [open]);

  const pages = useMemo<Item[]>(
    () =>
      NAV.flatMap(g =>
        g.links
          .filter(l => isAdmin || !l.admin)
          .map(l => ({ id: l.href, group: "Go to", label: l.label, hint: g.label || undefined, href: hrefFor(l, auction), words: `${l.label} ${g.label || ""} ${l.keywords || ""}`.toLowerCase() }))
      ),
    [isAdmin, auction]
  );
  const todo = useMemo(() => tasks(auction, isAdmin), [auction, isAdmin]);

  const items = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [...todo.slice(0, 6), ...pages];
    const words = q.split(/\s+/);
    const hit = (i: Item) => words.every(w => i.words.includes(w));
    // a label that starts with what was typed comes first
    const rank = (i: Item) => (i.label.toLowerCase().startsWith(q) ? 0 : 1);
    const seen = new Set<string>();
    // a task that only opens a page is left out when that page is already listed
    const found = [...pages.filter(hit), ...todo.filter(hit)]
      .filter(i => (seen.has(i.href) ? false : (seen.add(i.href), true)))
      .sort((x, y) => rank(x) - rank(y));
    const raw = text.trim();
    const a = auction ? `a=${encodeURIComponent(auction)}&` : "";
    return [
      ...found,
      { id: "fb", group: "Find", label: `Buyers matching “${raw}”`, href: `/admin/office/buyers?q=${encodeURIComponent(raw)}`, words: "" },
      { id: "fl", group: "Find", label: `Lots matching “${raw}”`, hint: auction ? `Auction ${auction}` : undefined, href: `/admin/office/lots?${a}q=${encodeURIComponent(raw)}`, words: "" }
    ];
  }, [text, pages, todo, auction]);

  const go = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    router.push(i.href);
  };

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAt(n => Math.min(items.length - 1, n + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAt(n => Math.max(0, n - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[at]);
    }
  };

  useEffect(() => {
    document.getElementById(`qs-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  let last = "";
  return (
    <dialog
      ref={dlg}
      className="qs"
      aria-label="Quick search"
      onClose={onClose}
      onClick={e => {
        if (e.target === dlg.current) onClose();
      }}
    >
      <div className="qs-box" onKeyDown={keys}>
        <input
          ref={input}
          className="qs-in"
          placeholder="Search pages and tasks, or a buyer or lot…"
          value={text}
          onChange={e => {
            setText(e.target.value);
            setAt(0);
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="qs-list"
          aria-activedescendant={items[at] ? `qs-${at}` : undefined}
        />
        <ul className="qs-list" id="qs-list" role="listbox">
          {items.map((i, n) => {
            const head = i.group !== last ? i.group : null;
            last = i.group;
            return (
              <li key={i.id} role="presentation">
                {head ? <span className="qs-group">{head === "Do" && !text ? "Common tasks" : head}</span> : null}
                <button
                  type="button"
                  id={`qs-${n}`}
                  role="option"
                  aria-selected={n === at}
                  className="qs-item"
                  onMouseMove={() => setAt(n)}
                  onClick={() => go(i)}
                >
                  <span>{i.label}</span>
                  {i.hint ? <small>{i.hint}</small> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="qs-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to move</span>
          <span><kbd>Enter</kbd> to open</span>
          <span><kbd>Esc</kbd> to close</span>
        </p>
      </div>
    </dialog>
  );
}
