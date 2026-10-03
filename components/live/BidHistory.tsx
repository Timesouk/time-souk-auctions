"use client";
import { useEffect, useState } from "react";
import { useLive } from "./LiveProvider";
import { whoLabel } from "./parts";
import { browserClient } from "@/lib/supabase/client";
import { getDict } from "@/lib/i18n/dict";
import { money, stamp, timeOf } from "@/lib/format";
import type { BidRow, Locale } from "@/lib/types";

export function BidHistory({ locale, lotId, initial, myPaddle, limit = 50, compact }: {
  locale: Locale;
  lotId: string;
  initial: BidRow[];
  myPaddle?: number | null;
  limit?: number;
  compact?: boolean;
}) {
  const t = getDict(locale);
  const { byId } = useLive();
  const lot = byId.get(lotId);
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    const sb = browserClient();
    if (!sb || !lot) return;
    let alive = true;
    sb.rpc("lot_bid_history", { p_lot_id: lotId, p_limit: limit }).then(({ data }) => {
      if (alive && data) setRows(data as BidRow[]);
    });
    return () => {
      alive = false;
    };
  }, [lotId, lot?.bid_count, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = compact ? rows.slice(0, 5) : rows;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h2 className="h3">
        {t.lot.history} · {lot?.bid_count ?? rows.length}
      </h2>
      {shown.length ? (
        <ol className="hist">
          {shown.map((b, i) => (
            <li key={`${b.created_at}-${i}`} className={myPaddle && b.paddle === myPaddle ? "mine" : undefined}>
              <span className="amt">{money(b.amount, locale)}</span>
              <span className="who">
                {myPaddle && b.paddle === myPaddle ? t.common.you : whoLabel(locale, b.paddle, null)}{" "}
                <em>· {t.via[b.is_auto ? "max" : b.via] || b.via}</em>
              </span>
              <em>{compact ? timeOf(b.created_at, locale) : stamp(b.created_at, locale)}</em>
            </li>
          ))}
        </ol>
      ) : (
        <p className="fine">{t.common.noBids}</p>
      )}
    </div>
  );
}
