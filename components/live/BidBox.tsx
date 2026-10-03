"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLive } from "./LiveProvider";
import { browserClient } from "@/lib/supabase/client";
import { IS_PREVIEW } from "@/lib/env";
import { getDict } from "@/lib/i18n/dict";
import { bidLadder, isClosedStatus, nextMinBid } from "@/lib/auction";
import { money, num, stamp } from "@/lib/format";
import type { Locale, Lot, MyStatus } from "@/lib/types";

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

const PREVIEW_ME: MyStatus = {
  paddle: 104, full_name: "Preview bidder", email: "", email_verified: true, phone: null, phone_verified: true,
  terms_accepted: true, country: "", instagram: null, lang: "en", role: "bidder", suspended: false, verified: true
};

export function BidBox({ locale, lotId, me: meProp }: { locale: Locale; lotId: string; me: MyStatus | null }) {
  const t = getDict(locale);
  const { byId, statusOf, auction, patchLot } = useLive();
  const lot = byId.get(lotId) as Lot | undefined;
  const me = IS_PREVIEW ? PREVIEW_ME : meProp;
  const path = usePathname();
  const [kind, setKind] = useState<"bid" | "max">("bid");
  const [amount, setAmount] = useState<number | null>(null);
  const [maxText, setMaxText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirming, setConfirming] = useState(false);
  const [myMax, setMyMax] = useState<number | null>(null);
  const [hasBid, setHasBid] = useState(false);

  const ladder = useMemo(() => (lot ? bidLadder(lot, 3) : []), [lot]);
  const min = lot ? nextMinBid(lot) : 0;

  // Keep the chosen amount valid as the price moves.
  useEffect(() => {
    if (!ladder.length) return;
    setAmount(a => (a == null || a < ladder[0] ? ladder[0] : a));
  }, [ladder]);

  // The signed-in bidder's own max bid and whether they've bid on this lot.
  useEffect(() => {
    const sb = browserClient();
    if (!sb || !me?.verified || !lot) return;
    let alive = true;
    (async () => {
      const [{ data: mx }, { count }] = await Promise.all([
        sb.from("max_bids").select("amount").eq("lot_id", lotId).maybeSingle(),
        sb.from("bids").select("id", { count: "exact", head: true }).eq("lot_id", lotId)
      ]);
      if (!alive) return;
      setMyMax(mx?.amount ?? null);
      setHasBid((count || 0) > 0 || !!mx);
    })();
    return () => {
      alive = false;
    };
  }, [lotId, me?.verified, lot?.bid_count]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lot) return null;
  const status = statusOf(lot);
  const next = `?next=${encodeURIComponent(path || `/${locale}`)}`;

  if (isClosedStatus(status)) {
    return (
      <div className="bidbox">
        <p className="fine">{t.bid.closed}</p>
      </div>
    );
  }
  if (status === "preview") {
    return (
      <div className="bidbox">
        <p>{t.bid.notOpen(stamp(auction.prebid_opens_at, locale))}</p>
        {!me ? <Link className="btn pri" href={`/${locale}/register${next}`}>{t.bid.register}</Link> : null}
      </div>
    );
  }
  if (!me) {
    return (
      <div className="bidbox">
        <Link className="btn pri lg" href={`/${locale}/register${next}`}>{t.bid.register}</Link>
        <Link className="btn" href={`/${locale}/sign-in${next}`}>{t.bid.signIn}</Link>
        <p className="fine">{t.bid.registerNote} {t.bid.noPremium}</p>
      </div>
    );
  }
  if (!me.verified) {
    return (
      <div className="bidbox">
        <Link className="btn pri lg" href={`/${locale}/account${next}`}>{t.bid.finishVerify}</Link>
        <p className="fine">{t.bid.errors.verification_required}</p>
      </div>
    );
  }

  const leading = lot.leader_paddle != null && lot.leader_paddle === me.paddle;
  const maxValue = Math.round(Number(maxText.replace(/[^\d]/g, "")) || 0);
  const chosen = kind === "bid" ? amount || min : maxValue;
  const big = chosen > lot.estimate_high * 1.5;

  async function place() {
    if (!lot) return;
    setMsg(null);
    if (IS_PREVIEW) {
      setMsg({ kind: "info", text: t.preview });
      return;
    }
    if (kind === "max" && maxValue < (leading ? (lot.current_bid || 0) + 1 : min)) {
      setMsg({ kind: "err", text: t.bid.errors.bid_too_low(leading ? (lot.current_bid || 0) + 1 : min) });
      return;
    }
    if (big && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    const sb = browserClient()!;
    const { data, error } = await sb.rpc("place_bid", { p_lot_id: lot.id, p_amount: chosen, p_kind: kind });
    setBusy(false);
    if (error) {
      const [code, arg] = String(error.message || "").split(":");
      const e = t.bid.errors;
      const text =
        code === "bid_too_low" ? e.bid_too_low(Number(arg)) :
        code === "max_not_higher" ? e.max_not_higher(Number(arg)) :
        code in e && typeof e[code as keyof typeof e] === "string" ? (e[code as keyof typeof e] as string) : e.generic;
      setMsg({ kind: "err", text });
      return;
    }
    const r = data as { price: number; leader_paddle: number | null; bid_count: number; pure: boolean; leading: boolean };
    patchLot({ id: lot.id, current_bid: r.price, leader_paddle: r.leader_paddle, bid_count: r.bid_count });
    setHasBid(true);
    if (kind === "max") {
      setMyMax(chosen);
      setMaxText("");
      setMsg(r.leading ? { kind: "ok", text: t.bid.maxSet(money(chosen, locale)) } : { kind: "err", text: t.bid.outbidNow(money(r.price, locale)) });
    } else {
      setMsg(r.leading ? { kind: "ok", text: t.bid.placed(money(chosen, locale)) } : { kind: "err", text: t.bid.outbidNow(money(r.price, locale)) });
    }
  }

  return (
    <div className="bidbox">
      <div className="as">
        <span>{t.bid.bidAs(me.paddle)}</span>
        <span className="ver">{t.bid.verified}</span>
      </div>
      {leading ? (
        <p className="leadline lead">{t.bid.leading}{myMax ? ` · ${t.bid.yourMax(money(myMax, locale))}` : ""}</p>
      ) : hasBid ? (
        <p className="leadline out">{t.bid.outbid}</p>
      ) : null}
      <div className="seg" role="group" aria-label={t.bid.yourBid}>
        <button type="button" aria-pressed={kind === "bid"} onClick={() => { setKind("bid"); setConfirming(false); }}>{t.bid.kindBid}</button>
        <button type="button" aria-pressed={kind === "max"} onClick={() => { setKind("max"); setConfirming(false); }}>{t.bid.kindMax}</button>
      </div>
      {kind === "bid" ? (
        <div className="quick">
          {ladder.map(a => (
            <button key={a} type="button" aria-pressed={a === amount} onClick={() => { setAmount(a); setConfirming(false); }}>
              {num(a)}
            </button>
          ))}
        </div>
      ) : (
        <label className="field">
          {t.bid.yourBid} (AED)
          <input
            inputMode="numeric"
            className="input num"
            placeholder={num(leading ? (lot.current_bid || 0) + 1000 : min)}
            value={maxText}
            onChange={e => { setMaxText(e.target.value); setConfirming(false); }}
          />
        </label>
      )}
      {confirming ? (
        <p className="alert">{t.bid.confirmBig(money(chosen, locale), `${num(lot.estimate_low)}–${num(lot.estimate_high)}`)}</p>
      ) : null}
      <button
        type="button"
        className={`btn lg wide ${confirming ? "strong" : "pri"}`}
        disabled={busy || (kind === "bid" ? leading : !maxValue)}
        onClick={place}
      >
        {kind === "bid" ? t.bid.place(money(chosen, locale)) : t.bid.placeMax(money(chosen || min, locale))}
      </button>
      {msg ? <p className={`alert ${msg.kind === "ok" ? "ok" : msg.kind === "info" ? "info" : ""}`} role="status">{msg.text}</p> : null}
      <p className="fine">{t.bid.noPremium}{status === "open" ? ` ${t.bid.preBidNote(stamp(auction.live_starts_at, locale))}` : ""}</p>
    </div>
  );
}
