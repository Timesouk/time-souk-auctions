"use client";
import Link from "next/link";
import { useLive, useTick } from "./LiveProvider";
import { BidBox } from "./BidBox";
import { BidHistory } from "./BidHistory";
import { BigCountdown, PureTag, StatusPill, TimerBox, whoLabel } from "./parts";
import { WatchArt } from "../WatchArt";
import { getDict, timerWords } from "@/lib/i18n/dict";
import { estimateText, isClosedStatus, lotPath, upNext } from "@/lib/auction";
import { dateLong, money, num, pad2, timeOf } from "@/lib/format";
import type { BidRow, Locale, MyStatus } from "@/lib/types";

export function LivePanel({ locale, me, instagram, history = [] }: { locale: Locale; me: MyStatus | null; instagram: string; history?: BidRow[] }) {
  const t = getDict(locale);
  const { blockLot: lot, lots, statusOf, auction } = useLive();
  useTick(1000);
  if (!lot) return null;
  const st = statusOf(lot);
  const ig = instagram.replace(/^@/, "");
  const nexts = upNext(lots, lot, 4);
  const p = lot.current_bid;
  const priceLabel = p == null ? t.common.startingBid : st === "sold" ? t.common.hammer : st === "unsold" ? t.common.lastBid : t.common.currentBid;
  const meta = [lot.reference ? `${t.common.ref} ${lot.reference}` : "", lot.year, lot.case_size ? `${lot.case_size} ${t.common.mm}` : "", lot.has_box && lot.has_papers ? t.common.boxPapers : ""].filter(Boolean).join(" · ");
  return (
    <section aria-label={t.live.liveNow}>
      <div className="lhead">
        <span className="onair">{t.live.liveNow} · {t.home.auctionN(pad2(auction.number))}</span>
        {ig ? <a href={`https://www.instagram.com/${ig}/live/`} target="_blank" rel="noopener">{t.live.watch}</a> : <span>{dateLong(auction.sale_date, locale)}</span>}
      </div>
      <div className="live">
        <div className="img">
          <WatchArt lot={lot} prefix="lv" eager />
          <span className="lno">{pad2(lot.lot_number)}</span>
        </div>
        <div className="panel">
          <div className="row" style={{ gap: 8 }}>
            <StatusPill locale={locale} status={st} />
            <PureTag locale={locale} lot={lot} status={st} />
            <span className="pill">{t.live.lotOf(pad2(lot.lot_number), lots.length)}</span>
          </div>
          <div>
            <span className="brand">{lot.brand}</span>
            <h1 className="ltr">{lot.model}</h1>
            <span className="ref">{meta}</span>
          </div>
          <div>
            <span className="k">{priceLabel}{p != null ? ` · ${whoLabel(locale, lot.leader_paddle, lot.leader_via)}` : ""}</span>
            <div className="bigp num">{money(p ?? lot.start_price, locale)}</div>
            {estimateText(lot, n => money(n, locale), num) ? <span className="fine">{t.common.estimate} {estimateText(lot, n => money(n, locale), num)}</span> : null}
          </div>
          <TimerBox locale={locale} lot={lot} status={st} />
          {!isClosedStatus(st) ? <BidBox locale={locale} lotId={lot.id} me={me} /> : null}
          <BidHistory locale={locale} lotId={lot.id} initial={history} myPaddle={me?.paddle} limit={10} compact />
          <Link className="fine" href={lotPath(locale, auction.number, lot.lot_number)}>{t.lot.details} →</Link>
        </div>
      </div>
      {nexts.length ? (
        <div className="wrap" style={{ paddingBlock: "18px 26px" }}>
          <h2 className="h3">{t.common.upNext}</h2>
          <div className="next-strip">
            {nexts.map(n => (
              <Link key={n.id} className="next-it" href={lotPath(locale, auction.number, n.lot_number)}>
                <span className="thumb"><WatchArt lot={n} prefix="nx" /></span>
                <div>
                  <span className="k">{t.common.lotN(pad2(n.lot_number))}</span>
                  <b className="ltr">{n.brand} {n.model}</b>
                  <span className="fine">{money(n.current_bid ?? n.start_price, locale)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Home and catalogue top: the lot on the block if there is one, otherwise the auction hero. */
export function AuctionTop({ locale, me, instagram, history, showFacts = true }: {
  locale: Locale;
  me: MyStatus | null;
  instagram: string;
  history?: BidRow[];
  showFacts?: boolean;
}) {
  const t = getDict(locale);
  const { blockLot, auction, lots, statusOf, now, timerSeconds } = useLive();
  useTick(1000);
  if (blockLot) return <LivePanel locale={locale} me={me} instagram={instagram} history={history} />;

  const n = pad2(auction.number);
  const time = timeOf(auction.live_starts_at, locale);
  const allClosed = lots.length > 0 && lots.every(l => isClosedStatus(statusOf(l)));
  const beforeLive = now() < Date.parse(auction.live_starts_at);
  const sold = lots.filter(l => statusOf(l) === "sold").length;
  return (
    <section className="wrap hero">
      <div>
        <span className="kick">{t.home.kicker}</span>
        <h1 className="disp">
          <span>{t.home.auctionWord}</span>
          <span>{t.home.numberWord(n)}</span>
          <span className="date">{dateLong(auction.sale_date, locale)} · {time}</span>
        </h1>
        <p className="sub">{t.home.liveFrom(time, timerWords(timerSeconds, locale))}</p>
        {showFacts ? (
          <dl className="facts">
            <div><dt>{t.home.facts.lots}</dt><dd>{lots.length}</dd></div>
            <div><dt>{t.home.facts.premium}</dt><dd>{t.home.facts.none}</dd></div>
            <div><dt>{t.home.facts.perLot}</dt><dd className="ltr">{Math.floor(timerSeconds / 60)}:{pad2(timerSeconds % 60)}</dd></div>
            <div><dt>{t.home.facts.starts}</dt><dd>{time}</dd></div>
          </dl>
        ) : null}
        <div className="row" style={{ marginTop: 24 }}>
          <Link className="btn pri lg" href={`/${locale}/auctions/${auction.number}`}>{t.home.browse(lots.length)}</Link>
          {!me ? <Link className="btn lg" href={`/${locale}/register`}>{t.nav.register}</Link> : null}
        </div>
      </div>
      <div className="clock">
        {allClosed ? (
          <>
            <span className="lbl">{t.home.closedTitle}</span>
            <span className="big">{t.home.closedBody(sold, lots.length)}</span>
            <Link className="foot" href={`/${locale}/results`}>{t.home.seeResults} →</Link>
          </>
        ) : beforeLive ? (
          <>
            <span className="lbl">{t.home.liveIn}</span>
            <BigCountdown to={auction.live_starts_at} locale={locale} />
            <span className="foot">{dateLong(auction.sale_date, locale)} · {time}{instagram ? ` · @${instagram.replace(/^@/, "")}` : ""}</span>
          </>
        ) : (
          <>
            <span className="lbl">{t.home.liveNowTitle}</span>
            <span className="big">{t.home.liveNowBody}</span>
            <Link className="btn blk" href={`/${locale}/live`}>{t.home.goLive}</Link>
          </>
        )}
      </div>
    </section>
  );
}
