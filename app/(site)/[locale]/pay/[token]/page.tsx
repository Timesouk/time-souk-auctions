import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WatchArt } from "@/components/WatchArt";
import { getSettings } from "@/lib/data";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { invoiceContext, invoiceTotal, lotTitle } from "@/lib/invoices";
import { adminClient } from "@/lib/supabase/admin";
import { ziinaReady } from "@/lib/payments/ziina";
import { tabbyReady } from "@/lib/payments/tabby";
import { tamaraReady } from "@/lib/payments/tamara";
import { dateLong, money, pad2, todayDubai, waLink } from "@/lib/format";
import { IS_PREVIEW } from "@/lib/env";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type P = { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ status?: string; rejected?: string; unavailable?: string; cod?: string }> };

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
  const cod = !!inv.cod_requested_at;
  const overdue = !status && !cod && inv.due_date < todayDubai();
  const total = invoiceTotal(inv);
  const codTotal = inv.amount + c.codFee;
  // Delivery address: the one given for this invoice, else the one saved in their profile.
  const addr = inv.delivery_address || c.buyer?.address || "";
  const city = inv.delivery_address ? inv.delivery_city || "" : c.buyer?.city || "";
  const go = (m: string) => `/api/pay/${token}/${m}`;
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
          <span className="k">{cod && status !== "void" ? p.total : p.amount}</span>
          <div className="amount-due num">{money(status === "void" ? inv.amount : total, locale)}</div>
          <p className="fine">{p.noPremium}{cod && inv.cod_fee ? ` ${p.codFeeLine(money(inv.cod_fee, locale))}.` : ""}</p>
        </div>

        {status === "paid" ? (
          <p className="alert ok">{p.paidTitle} {p.paidBody}</p>
        ) : status === "void" ? (
          <p className="alert">{p.void}</p>
        ) : (
          <>
            {cod ? (
              <p className="alert ok">{p.codChosen(money(total, locale))}</p>
            ) : (
              <p className={overdue ? "alert" : "alert info"}>{overdue ? p.overdue : p.dueBy(dateLong(inv.due_date, locale))}</p>
            )}
            {sp.cod === "address" ? <p className="alert">{p.codNeedsAddress}</p> : null}
            {sp.status === "processing" ? <p className="alert info">{p.processing}</p> : null}
            {sp.status === "cancelled" ? <p className="alert">{p.cancelled}</p> : null}
            {sp.status === "failed" ? <p className="alert">{p.failed}</p> : null}
            {sp.status === "transfer" || inv.transfer_claimed_at ? <p className="alert ok">{p.sentDone}</p> : null}
            {sp.rejected ? <p className="alert">{p.rejected(who(sp.rejected))}</p> : null}
            {sp.unavailable ? <p className="alert">{p.unavailable(who(sp.unavailable))}</p> : null}

            {/* One form: whichever way they pay, the delivery address goes with it. */}
            <form method="post" action={go("card")} className="stack" style={{ gap: 18 }}>
              <div className="stack" style={{ gap: 10 }}>
                <h2 className="h3">{p.delivery}</h2>
                <p className="fine">{p.deliveryNote}</p>
                <label className="field">
                  {p.address}
                  <textarea name="address" rows={2} maxLength={500} defaultValue={addr} placeholder={p.addressPh} autoComplete="street-address" />
                </label>
                <label className="field">
                  {p.city}
                  <input name="city" maxLength={80} defaultValue={city} autoComplete="address-level2" />
                </label>
              </div>

              <h2 className="h3">{p.choose}</h2>
              {cod ? <p className="fine">{p.codSwitch}</p> : null}
              <div className="paygrid">
                <button className="paybtn" type="submit" formAction={go("card")} disabled={!ziinaReady()}>{p.card}<small>{p.cardNote}</small></button>
                <button className="paybtn" type="submit" formAction={go("tabby")} disabled={!tabbyReady() || !c.buyer}>{p.tabby}<small>{p.tabbyNote}</small></button>
                <button className="paybtn" type="submit" formAction={go("tamara")} disabled={!tamaraReady() || !c.buyer}>{p.tamara}<small>{p.tamaraNote}</small></button>
                <button className="paybtn" type="submit" formAction={go("cod")} disabled={cod}>
                  {p.cod}
                  <small>{p.codNote(money(c.codFee, locale))}</small>
                  <small><b>{cod ? `✓ ${p.total} ${money(total, locale)}` : p.codButton(money(codTotal, locale))}</b></small>
                </button>
              </div>

              <div className="stack" style={{ gap: 10 }}>
                <h2 className="h3">{p.bank}</h2>
                <p className="fine">{p.bankNote}</p>
                {priv?.bank_details ? <div className="bankbox">{priv.bank_details}{`\n${p.reference}: ${inv.number}`}</div> : null}
                {!inv.transfer_claimed_at ? (
                  <div><button className="btn" type="submit" formAction={go("transfer")}>{p.sent}</button></div>
                ) : null}
              </div>
            </form>
          </>
        )}
        {help ? <a className="fine" href={help} target="_blank" rel="noopener">{p.help}</a> : null}
        <p className="fine">{lotTitle(c.lot, locale)}</p>
      </div>
    </div>
  );
}
