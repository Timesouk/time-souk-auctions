"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLive, useTick } from "./LiveProvider";
import { Countdown, PureTag, StatusPill } from "./parts";
import { WatchArt } from "../WatchArt";
import { getDict } from "@/lib/i18n/dict";
import { isClosedStatus, lotPath } from "@/lib/auction";
import { money, pad2 } from "@/lib/format";
import type { Locale, Lot } from "@/lib/types";

export function LotCard({ locale, lot }: { locale: Locale; lot: Lot }) {
  const t = getDict(locale);
  const { statusOf, auction } = useLive();
  const st = statusOf(lot);
  const closed = isClosedStatus(st);
  const p = lot.current_bid;
  const [label, value] = closed
    ? st === "sold"
      ? [t.status.sold, money(p, locale)]
      : [t.status.unsold, p != null ? `${t.common.lastBid} ${money(p, locale)}` : t.common.noBids]
    : p != null
      ? [t.common.currentBid, money(p, locale)]
      : [t.common.startingBid, money(lot.start_price, locale)];
  return (
    <Link className={`card${st === "live" || st === "block" ? " onblock" : ""}`} href={lotPath(locale, auction.number, lot.lot_number)}>
      <div className="img">
        <WatchArt lot={lot} prefix="c" />
        <span className="lno">{pad2(lot.lot_number)}</span>
        <StatusPill locale={locale} status={st} />
        <PureTag locale={locale} lot={lot} status={st} />
      </div>
      <div className="body">
        <span className="brand">{lot.brand}</span>
        <span className="model ltr">{lot.model}</span>
        <span className="ref ltr">{[lot.reference, lot.year].filter(Boolean).join(" · ")}</span>
        <div className="tags">
          {lot.has_box && lot.has_papers ? <span className="tag">{t.common.boxPapers}</span> : lot.has_papers ? <span className="tag">{t.common.papers}</span> : lot.has_box ? <span className="tag">{t.common.box}</span> : null}
          {lot.condition ? <span className="tag">{t.common.conditions[lot.condition] || lot.condition}</span> : null}
        </div>
        <div className="foot-row">
          <div>
            <span className="k">{label}</span>
            <span className="v num">{value}</span>
          </div>
          {st === "live" && lot.ends_at ? (
            <Countdown className="v num urgent ltr" endsAt={lot.ends_at} />
          ) : (
            <span className="k">{t.common.bidsN(lot.bid_count)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function Catalogue({ locale, limit }: { locale: Locale; limit?: number }) {
  const t = getDict(locale);
  const { lots, statusOf } = useLive();
  useTick(1000);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [sort, setSort] = useState<"lot" | "high" | "low" | "bids">("lot");
  const [hideClosed, setHideClosed] = useState(false);

  const brands = useMemo(() => {
    const m = new Map<string, number>();
    lots.forEach(l => m.set(l.brand, (m.get(l.brand) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lots]);

  if (limit) {
    const top = lots.slice().sort((a, b) => b.estimate_high - a.estimate_high || a.lot_number - b.lot_number).slice(0, limit);
    return (
      <div className="grid">
        {top.map(l => <LotCard key={l.id} locale={locale} lot={l} />)}
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const cur = (l: Lot) => l.current_bid ?? l.start_price;
  const shown = lots
    .filter(l => (!brand || l.brand === brand) && (!needle || `${l.lot_number} ${l.brand} ${l.model} ${l.reference} ${l.year} ${l.dial}`.toLowerCase().includes(needle)) && (!hideClosed || !isClosedStatus(statusOf(l))))
    .sort((a, b) => (sort === "high" ? cur(b) - cur(a) : sort === "low" ? cur(a) - cur(b) : sort === "bids" ? b.bid_count - a.bid_count || a.lot_number - b.lot_number : a.lot_number - b.lot_number));

  if (!lots.length) return <div className="empty">{t.catalogue.none}</div>;
  return (
    <>
      <div className="toolbar">
        <input className="input" type="search" placeholder={t.catalogue.search} value={q} onChange={e => setQ(e.target.value)} aria-label={t.catalogue.search} />
        <select className="input" value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort">
          {(["lot", "high", "low", "bids"] as const).map(k => <option key={k} value={k}>{t.catalogue.sort[k]}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={hideClosed} onChange={e => setHideClosed(e.target.checked)} /> {t.catalogue.hideClosed}
        </label>
      </div>
      <div className="chips" role="group" aria-label="Brands">
        <button type="button" className="chip" aria-pressed={brand === ""} onClick={() => setBrand("")}>
          {t.catalogue.all}<small>{lots.length}</small>
        </button>
        {brands.map(([b, n]) => (
          <button key={b} type="button" className="chip" aria-pressed={brand === b} onClick={() => setBrand(b)}>
            {b}<small>{n}</small>
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid">{shown.map(l => <LotCard key={l.id} locale={locale} lot={l} />)}</div>
      ) : (
        <div className="empty">{t.catalogue.empty}</div>
      )}
    </>
  );
}
