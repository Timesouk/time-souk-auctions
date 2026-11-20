"use client";
// The admin's frame: the sidebar (a drawer on phones), quick search, and who is signed in.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { NAV, currentLink, hrefFor, navLinks } from "@/lib/admin-nav";
import { QuickSearch } from "./QuickSearch";
import { AdminSignOut } from "./ui";

export function Chrome({ isAdmin, who, canSignOut }: { isAdmin: boolean; who: string; canSignOut: boolean }) {
  const path = usePathname() || "";
  const sp = useSearchParams();
  const auction = sp.get("a");
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [mac, setMac] = useState(false);
  const here = currentLink(path, navLinks(isAdmin));

  // a page change closes the drawer
  useEffect(() => setMenu(false), [path]);
  // the browser tab says which page it is, so several open tabs can be told apart
  useEffect(() => {
    document.title = here ? `${here.label}${auction && here.perAuction ? ` · auction ${auction}` : ""} · Back office` : "Back office · The Time Souk";
  }, [here, auction]);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(s => !s);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        e.preventDefault();
        setSearch(true);
      } else if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shortcut = mac ? "⌘K" : "Ctrl K";

  return (
    <>
      <header className="bo-bar no-print">
        <button type="button" className="bo-menu" aria-label="Menu" aria-expanded={menu} aria-controls="bo-side" onClick={() => setMenu(m => !m)}>
          <span /><span /><span />
        </button>
        <Link href="/admin/office" className="bo-bar-brand" aria-label="Home">
          <Logo height={30} />
        </Link>
        <span className="bo-bar-here">{here?.label || ""}</span>
        <button type="button" className="bo-bar-search" aria-label="Quick search" onClick={() => setSearch(true)}>
          <SearchIcon />
        </button>
      </header>

      <aside id="bo-side" className={`bo-side no-print${menu ? " open" : ""}`}>
        <div className="bo-brand">
          <Link href="/admin/office" aria-label="Home"><Logo height={34} /></Link>
          <span>Back office</span>
        </div>
        <button type="button" className="bo-search" onClick={() => setSearch(true)}>
          <SearchIcon />
          <span>Search or jump to…</span>
          <kbd>{shortcut}</kbd>
        </button>
        <nav className="bo-nav" aria-label="Admin">
          {NAV.map(g => {
            const links = g.links.filter(l => isAdmin || !l.admin);
            if (!links.length) return null;
            return (
              <div key={g.label || "top"} className="bo-group">
                {g.label ? <span className="bo-group-name">{g.label}</span> : null}
                {links.map(l => (
                  <Link key={l.href} href={hrefFor(l, auction)} aria-current={here?.href === l.href ? "page" : undefined}>
                    {l.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="bo-me">
          <span>{who}</span>
          <span className="bo-me-links">
            <Link href="/en" target="_blank">View website</Link>
            {canSignOut ? <AdminSignOut /> : null}
          </span>
        </div>
      </aside>
      {menu ? <div className="bo-scrim no-print" onClick={() => setMenu(false)} aria-hidden="true" /> : null}

      <QuickSearch open={search} onClose={() => setSearch(false)} isAdmin={isAdmin} auction={auction} />
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.8" />
      <path d="M10.6 10.6 14 14" />
    </svg>
  );
}
