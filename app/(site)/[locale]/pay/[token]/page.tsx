import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WatchArt } from "@/components/WatchArt";
import { getSettings } from "@/lib/data";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { invoiceContext, lotTitle } from "@/lib/invoices";
import { adminClient } from "@/lib/supabase/admin";
import { ziinaReady } from "@/lib/payments/ziina";
import { tabbyReady } from "@/lib/payments/tabby";
import { tamaraReady } from "@/lib/payments/tamara";
import { dateLong, money, pad2, todayDubai, waLink } from "@/lib/format";
import { IS_PREVIEW } from "@/lib/env";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type P = { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ status?: string; rejected?: string; unavailable?: string }> };

export default async function PayPage({ params, searchParams }: P) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const p = t.pay;
  const sp = await searchParams;
  const c = IS_PREVIEW || !/^[0-9a-f]{48}$/.test(token) ? null : await invoiceContext({ token });
  if (!c) {
    return (
      <div className="wrap narrow">
        <div className="authbox"><h1 className="disp">{p.title}</h1><p className="alert">{p.notFound}</p></div>
      </div>
    );
  }
  const settings = await getSettings();
  const { data: priv } = await adminClient().from("settings_private").select("bank_details").eq("id", 1).single();
  const inv = c.invoice;
  const status = inv.status === "paid" || sp.status === "paid" ? "paid" : inv.status === "void" ? "void" : null;
  const overdue = !status && inv.due_date < todayDubai();
  const who = (m?: string) => (m === "tabby" ? p.tabby : m === "tamara" ? p.tamara : p.card);
  const help = settings.whatsapp ? waLink(settings.whatsapp, `${p.invoice} ${inv.number}`) : "";

  return (
    <div className="wrap narrow">
      <div className="authbox">
        <span className="kick">{p.invoice} <span className="mono">{inv.number}</span></span>
        <h1 className="disp">{p.title}</h1>
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 16 }}>
          <div style={{ width: 92, flex: "none", aspectRatio: "1", background: "var(--tint)", display: "grid", placeItems: "center", border: "2px solid var(--ink)", overflow: "hidden" }}>
            <WatchArt lot={c.lot} prefix="pay" />
          </div>
          <p style={{ fontWeight: 700 }}>{p.won(pad2(c.lot.lot_number), `${c.lot.brand} ${c.lot.model}`)}</p>
        </div>
        <div>
          <span className="k">{p.amount}</span>
          <div className="amount-due num">{money(inv.amount, locale)}</div>
          <p className="fine">{p.noPremium}</p>
        </div>

        {status === "paid" ? (
          <p className="alert ok">{p.paidTitle} {p.paidBody}</p>
        ) : status === "void" ? (
          <p className="alert">{p.void}</p>
        ) : (
          <>
            <p className={overdue ? "alert" : "alert info"}>{overdue ? p.overdue : p.dueBy(dateLong(inv.due_date, locale))}</p>
            {sp.status === "processing" ? <p className="alert info">{p.processing}</p> : null}
            {sp.status === "cancelled" ? <p className="alert">{p.cancelled}</p> : null}
            {sp.status === "failed" ? <p className="alert">{p.failed}</p> : null}
            {sp.status === "transfer" || inv.transfer_claimed_at ? <p className="alert ok">{p.sentDone}</p> : null}
            {sp.rejected ? <p className="alert">{p.rejected(who(sp.rejected))}</p> : null}
            {sp.unavailable ? <p className="alert">{p.unavailable(who(sp.unavailable))}</p> : null}

            <h2 className="h3">{p.choose}</h2>
            <div className="paygrid">
              <form method="post" action={`/api/pay/${token}/card`}>
                <button className="paybtn" type="submit" disabled={!ziinaReady()}>{p.card}<small>{p.cardNote}</small></button>
              </form>
              <form method="post" action={`/api/pay/${token}/tabby`}>
                <button className="paybtn" type="submit" disabled={!tabbyReady() || !c.buyer}>{p.tabby}<small>{p.tabbyNote}</small></button>
              </form>
              <form method="post" action={`/api/pay/${token}/tamara`}>
                <button className="paybtn" type="submit" disabled={!tamaraReady() || !c.buyer}>{p.tamara}<small>{p.tamaraNote}</small></button>
              </form>
            </div>

            <h2 className="h3">{p.bank}</h2>
            <p className="fine">{p.bankNote}</p>
            {priv?.bank_details ? <div className="bankbox">{priv.bank_details}{`\n${p.reference}: ${inv.number}`}</div> : null}
            {!inv.transfer_claimed_at ? (
              <form method="post" action={`/api/pay/${token}/transfer`}>
                <button className="btn" type="submit">{p.sent}</button>
              </form>
            ) : null}
          </>
        )}
        {help ? <a className="fine" href={help} target="_blank" rel="noopener">{p.help}</a> : null}
        <p className="fine">{lotTitle(c.lot, locale)}</p>
      </div>
    </div>
  );
}
