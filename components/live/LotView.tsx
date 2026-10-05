"use client";
import { useState } from "react";
import { useLive, useTick } from "./LiveProvider";
import { PureTag, StatusPill, TimerBox, whoLabel } from "./parts";
import { WatchArt } from "../WatchArt";
import { getDict } from "@/lib/i18n/dict";
import { estimateText, isPure } from "@/lib/auction";
import { money, num, pad2, stamp } from "@/lib/format";
import type { Locale, Lot } from "@/lib/types";

export function Gallery({ lot }: { lot: Lot }) {
  const [i, setI] = useState(0);
  const photos = lot.photos || [];
  return (
    <div className="gallery">
      <div className="main">
        <WatchArt lot={lot} prefix="g" index={i} eager />
        {!photos.length ? <span className="lno">{pad2(lot.lot_number)}</span> : null}
      </div>
      {photos.length > 1 ? (
        <div className="thumbs">
          {photos.map((src, k) => (
            <button key={src} type="button" aria-current={k === i} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Status, price and timer for one lot, kept live. */
export function LotStatusBlock({ locale, lotId }: { locale: Locale; lotId: string }) {
  const t = getDict(locale);
  const { byId, statusOf, auction } = useLive();
  useTick(1000);
  const lot = byId.get(lotId);
  if (!lot) return null;
  const st = statusOf(lot);
  const p = lot.current_bid;
  const label = p == null ? t.common.startingBid : st === "sold" ? t.common.hammer : st === "unsold" ? t.common.lastBid : t.common.currentBid;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <StatusPill locale={locale} status={st} />
        <PureTag locale={locale} lot={lot} status={st} />
        <span className="k">{t.common.bidsN(lot.bid_count)}</span>
      </div>
      <div>
        <span className="k">{label}{p != null ? ` · ${whoLabel(locale, lot.leader_paddle, lot.leader_via)}` : ""}</span>
        <div className="bigp num">{money(p ?? lot.start_price, locale)}</div>
        <div className="row" style={{ gap: "4px 14px", marginTop: 6 }}>
          {estimateText(lot, n => money(n, locale), num) ? <span className="fine">{t.common.estimate} {estimateText(lot, n => money(n, locale), num)}</span> : null}
          {!lot.no_reserve && !isPure(lot) && st !== "sold" && st !== "unsold" ? (
            <span className="fine">{p == null ? t.common.reserveApplies : t.common.reserveNotMet}</span>
          ) : null}
        </div>
      </div>
      {st === "live" || st === "block" || st === "sold" || st === "unsold" ? (
        <TimerBox locale={locale} lot={lot} status={st} />
      ) : (
        <p className="alert info">{t.lot.goesLive(stamp(auction.live_starts_at, locale))}</p>
      )}
    </div>
  );
}
