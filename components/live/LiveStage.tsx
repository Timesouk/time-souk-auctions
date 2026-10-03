"use client";
import Link from "next/link";
import { useLive, useTick } from "./LiveProvider";
import { LivePanel } from "./LivePanel";
import { BigCountdown } from "./parts";
import { getDict } from "@/lib/i18n/dict";
import { isClosedStatus } from "@/lib/auction";
import { pad2, timeOf } from "@/lib/format";
import type { BidRow, Locale, MyStatus } from "@/lib/types";

/** The /live page: the lot on the block, or what's happening when there isn't one. */
export function LiveStage({ locale, me, instagram, history }: { locale: Locale; me: MyStatus | null; instagram: string; history: BidRow[] }) {
  const t = getDict(locale);
  const { blockLot, auction, lots, statusOf, now } = useLive();
  useTick(1000);
  if (blockLot) return <LivePanel locale={locale} me={me} instagram={instagram} history={history} />;
  const before = now() < Date.parse(auction.live_starts_at);
  const ended = lots.length > 0 && lots.every(l => isClosedStatus(statusOf(l)));
  return (
    <section className="wrap pagehead">
      <span className="kick">{t.home.auctionN(pad2(auction.number))}</span>
      <h1 className="disp">{t.live.title}</h1>
      {before ? (
        <>
          <p className="lede">{t.live.notStarted(timeOf(auction.live_starts_at, locale))}</p>
          <div className="clock" style={{ maxWidth: 560 }}>
            <span className="lbl">{t.home.liveIn}</span>
            <BigCountdown to={auction.live_starts_at} locale={locale} />
          </div>
        </>
      ) : (
        <p className="lede">{ended ? t.live.ended : t.live.nothing}</p>
      )}
      <div className="row">
        <Link className="btn pri" href={`/${locale}/auctions/${auction.number}`}>{t.live.catalogue}</Link>
        {ended ? <Link className="btn" href={`/${locale}/results`}>{t.home.seeResults}</Link> : null}
      </div>
    </section>
  );
}
