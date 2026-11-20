"use client";
// The auction switcher at the top of back office pages: shows the auction you're looking at; click to pick another.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type PickItem = { number: number; date: string; state: string; tone: string };

export function AuctionPick({ items, current, action, extra }: { items: PickItem[]; current: number | null; action: string; extra?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = items.find(i => i.number === current) || null;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const href = (n: number) => {
    const q = new URLSearchParams({ a: String(n), ...(extra || {}) });
    return `${action}?${q.toString()}`;
  };

  return (
    <div className="apick no-print" ref={box}>
      <button type="button" className="apick-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="apick-k">Auction</span>
        {cur ? (
          <>
            <b>{cur.number}</b>
            <span className="apick-date">{cur.date}</span>
            {cur.state ? <span className={`pill ${cur.tone}`}>{cur.state}</span> : null}
          </>
        ) : (
          <span>Choose…</span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <div className="apick-pop" role="menu" aria-label="Auctions">
          {items.map(i => (
            <Link key={i.number} role="menuitem" href={href(i.number)} aria-current={i.number === current ? "true" : undefined} onClick={() => setOpen(false)}>
              <b>{i.number}</b>
              <span>{i.date}</span>
              {i.state ? <small>{i.state}</small> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
