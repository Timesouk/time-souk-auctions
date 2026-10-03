"use client";
import Link from "next/link";
import { useLive, useTick } from "./LiveProvider";
import { getDict } from "@/lib/i18n/dict";
import { isPure, mmss } from "@/lib/auction";
import { money, pad2 } from "@/lib/format";
import type { Locale, Lot, LotStatus } from "@/lib/types";

export function whoLabel(locale: Locale, paddle: number | null | undefined, via?: string | null) {
  const t = getDict(locale);
  if (paddle) return via === "instagram" ? `${t.common.paddleN(paddle)} · ${t.via.instagram}` : t.common.paddleN(paddle);
  return t.common.instagramBidder;
}

export function StatusPill({ locale, status }: { locale: Locale; status: LotStatus }) {
  const t = getDict(locale);
  return <span className={`pill st-${status}`}>{t.status[status]}</span>;
}

/** "1:47" counting down to ends_at on the database clock. */
export function Countdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const { now } = useLive();
  useTick(250);
  const left = Date.parse(endsAt) - now();
  return <span className={className} suppressHydrationWarning>{mmss(left)}</span>;
}

/** Days / hours / minutes / seconds until a moment. */
export function BigCountdown({ to, locale }: { to: string; locale: Locale }) {
  const { now } = useLive();
  useTick(1000);
  const t = getDict(locale);
  const s = Math.max(0, Math.floor((Date.parse(to) - now()) / 1000));
  const u = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  return (
    <div className="units" role="timer">
      {u.map((v, i) => (
        <span key={i}>
          <b className="num" suppressHydrationWarning>{pad2(v)}</b>
          <i>{t.home.units[i]}</i>
        </span>
      ))}
    </div>
  );
}

/** The big yellow timer block: running, waiting on the block, or the result. */
export function TimerBox({ locale, lot, status }: { locale: Locale; lot: Lot; status: LotStatus }) {
  const { now, timerSeconds } = useLive();
  useTick(250);
  const t = getDict(locale);
  if (status === "live" && lot.ends_at) {
    const left = Date.parse(lot.ends_at) - now();
    return (
      <div className={`timer${left <= 30000 ? " hurry" : ""}`} role="timer" aria-live="off">
        <span className="t-lbl">{t.common.timeLeft}</span>
        <b className="num ltr" suppressHydrationWarning>{mmss(left)}</b>
        <p>{t.live.sudden}</p>
      </div>
    );
  }
  if (status === "sold" || status === "unsold") {
    return (
      <div className={`timer ${status}`}>
        <span className="t-lbl">{t.live.result}</span>
        <b className="word">{t.status[status]}</b>
        <p>
          {status === "sold"
            ? t.live.soldTo(money(lot.current_bid, locale), whoLabel(locale, lot.leader_paddle, lot.leader_via))
            : lot.current_bid != null
              ? t.live.reserveNotMet
              : t.common.noBids}
        </p>
      </div>
    );
  }
  return (
    <div className="timer idle">
      <span className="t-lbl">{t.status.block}</span>
      <b className="num ltr">{mmss(timerSeconds * 1000)}</b>
      <p>{t.live.waitingTimer}</p>
    </div>
  );
}

/** Red "Live now" strip shown on other pages while a lot is on the block. */
export function LiveBar({ locale }: { locale: Locale }) {
  const { blockLot, statusOf } = useLive();
  useTick(1000);
  const t = getDict(locale);
  if (!blockLot) return null;
  const st = statusOf(blockLot);
  if (st === "sold" || st === "unsold") return null;
  return (
    <Link className="livebar" href={`/${locale}/live`}>
      <span className="onair">{t.catalogue.liveBar}</span>
      <span>
        {t.common.lotN(pad2(blockLot.lot_number))} · {blockLot.brand} {blockLot.model}
      </span>
      {st === "live" && blockLot.ends_at ? <Countdown className="t ltr" endsAt={blockLot.ends_at} /> : <span className="t">{t.catalogue.onBlockNow}</span>}
    </Link>
  );
}

export function PureTag({ locale, lot, status }: { locale: Locale; lot: Lot; status: LotStatus }) {
  const t = getDict(locale);
  if (!isPure(lot) || status === "sold" || status === "unsold") return null;
  return <span className="pill pure">{lot.no_reserve && lot.current_bid == null ? t.common.noReserve : t.common.pure}</span>;
}
