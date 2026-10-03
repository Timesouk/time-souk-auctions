"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "../Logo";
import type { Dict } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/types";

type Props = {
  locale: Locale;
  t: Pick<Dict, "nav" | "otherLang">;
  auctionNo: number | null;
  isLive: boolean;
  paddle: number | null;
};

export function Header({ locale, t, auctionNo, isLive, paddle }: Props) {
  const path = usePathname() || `/${locale}`;
  const [open, setOpen] = useState(false);
  const other = locale === "en" ? "ar" : "en";
  const switchHref = path.replace(/^\/(en|ar)(?=\/|$)/, `/${other}`);
  const links: [string, string, boolean?][] = [
    [auctionNo ? `/${locale}/auctions/${auctionNo}` : `/${locale}`, t.nav.auction],
    ...(isLive ? ([[`/${locale}/live`, t.nav.live, true]] as [string, string, boolean][]) : []),
    [`/${locale}/how-to-bid`, t.nav.how],
    [`/${locale}/sell`, t.nav.sell],
    [`/${locale}/results`, t.nav.results]
  ];
  const current = (href: string) => (href === `/${locale}` ? path === href : path.startsWith(href));
  return (
    <header className="hdr">
      <div className="wrap">
        <Link href={`/${locale}`} aria-label="The Time Souk" onClick={() => setOpen(false)}>
          <Logo priority />
        </Link>
        <nav className="main" aria-label="Main">
          {links.map(([href, label, live]) => (
            <Link key={href} href={href} className={live ? "live-link" : undefined} aria-current={current(href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="acts">
          <a className="langb" href={switchHref} lang={other} hrefLang={other}>{t.otherLang}</a>
          {paddle ? (
            <Link className="paddle-chip" href={`/${locale}/account`} title={t.nav.account}>#{paddle}</Link>
          ) : (
            <>
              <Link className="plain hide-m" href={`/${locale}/sign-in`}>{t.nav.signIn}</Link>
              <Link className="btn pri" href={`/${locale}/register`}>{t.nav.register}</Link>
            </>
          )}
          <button className="menu-btn" type="button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(o => !o)}>
            <span /><span /><span />
            <span className="sr-only">{t.nav.menu}</span>
          </button>
        </div>
      </div>
      <nav id="mobile-nav" className="mobile-nav" data-open={open} aria-label="Mobile">
        {links.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
        ))}
        {paddle ? (
          <Link href={`/${locale}/account`} onClick={() => setOpen(false)}>{t.nav.account}</Link>
        ) : (
          <Link href={`/${locale}/sign-in`} onClick={() => setOpen(false)}>{t.nav.signIn}</Link>
        )}
      </nav>
    </header>
  );
}
