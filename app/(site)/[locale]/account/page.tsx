import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoinFlow } from "@/components/site/JoinFlow";
import { AccountForm, SignOutButton } from "@/components/site/AccountParts";
import { getMyStatus, getSettings } from "@/lib/data";
import { serverClient } from "@/lib/supabase/server";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { verifyChannels } from "@/lib/notify/twilio";
import { isPure, lotPath } from "@/lib/auction";
import { dateShort, money, pad2 } from "@/lib/format";
import { safeNext } from "@/lib/next-path";
import { IS_PREVIEW } from "@/lib/env";

type P = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).account.title, robots: { index: false } } : {};
}

type BidLot = { id: string; lot_number: number; brand: string; model: string; current_bid: number | null; leader_paddle: number | null; ends_at: string | null; no_reserve: boolean; reserve_met: boolean; made_pure: boolean; auctions: { number: number } | null };

export default async function AccountPage({ params, searchParams }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const sp = await searchParams;
  if (IS_PREVIEW) redirect(`/${locale}/sign-in`);
  const me = await getMyStatus();
  if (!me) redirect(`/${locale}/sign-in?next=/${locale}/account`);
  const s = await getSettings();
  if (!me.verified && !me.suspended) {
    return (
      <div className="wrap narrow">
        <JoinFlow locale={locale} mode="account" next={safeNext(sp.next, `/${locale}`)} payDays={s.pay_days} channels={verifyChannels()} />
      </div>
    );
  }

  const sb = (await serverClient())!;
  const [{ data: bids }, { data: maxes }, { data: invoices }] = await Promise.all([
    sb.from("bids").select("amount, lot_id, lots(id,lot_number,brand,model,current_bid,leader_paddle,ends_at,no_reserve,reserve_met,made_pure,auctions!lots_auction_id_fkey(number))").order("id", { ascending: false }).limit(300),
    sb.from("max_bids").select("lot_id, amount"),
    sb.from("invoices").select("id, number, amount, cod_fee, cod_requested_at, due_date, status, pay_token, lots(lot_number, brand, model)").neq("status", "void").order("created_at", { ascending: false })
  ]);
  const maxBy = new Map((maxes || []).map(m => [m.lot_id as string, m.amount as number]));
  const seen = new Map<string, { lot: BidLot; mine: number }>();
  for (const b of (bids || []) as unknown as { amount: number; lot_id: string; lots: BidLot | null }[]) {
    if (!b.lots) continue;
    const cur = seen.get(b.lot_id);
    if (!cur || b.amount > cur.mine) seen.set(b.lot_id, { lot: b.lots, mine: b.amount });
  }
  const now = Date.now();
  const rows = [...seen.values()].map(({ lot, mine }) => {
    const closed = !!lot.ends_at && Date.parse(lot.ends_at) <= now;
    const leading = lot.leader_paddle === me.paddle;
    const state = closed ? (leading && isPure(lot) ? "won" : "lost") : leading ? "leading" : "outbid";
    return { lot, mine, state, max: maxBy.get(lot.id) };
  });

  return (
    <>
      <section className="wrap pagehead">
        <span className="kick">{t.account.title}</span>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <span className="k">{t.account.paddle}</span>
            <span className="paddle-big">{me.paddle}</span>
          </div>
          <SignOutButton locale={locale} label={t.nav.signOut} />
        </div>
      </section>
      <section className="wrap sec cols">
        <div className="block">
          <h2 className="h3">{t.account.myBids}</h2>
          {rows.length ? (
            <div className="tbl-wrap">
              <table>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.lot.id}>
                      <td>
                        <Link href={lotPath(locale, r.lot.auctions?.number || 1, r.lot.lot_number)}>{t.common.lotN(pad2(r.lot.lot_number))} · {r.lot.brand} {r.lot.model}</Link>
                        {r.max ? <><br /><span className="fine">{t.account.state.max(money(r.max, locale))}</span></> : null}
                      </td>
                      <td className="n">{money(r.lot.current_bid, locale)}</td>
                      <td><span className={`pill ${r.state === "leading" || r.state === "won" ? "ok" : r.state === "outbid" ? "warn" : "st-unsold"}`}>{t.account.state[r.state as "leading" | "outbid" | "won" | "lost"]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="fine">{t.account.noBids}</p>}

          <h2 className="h3" style={{ marginTop: 18 }}>{t.account.invoices}</h2>
          {invoices && invoices.length ? (
            <div className="tbl-wrap">
              <table>
                <tbody>
                  {(invoices as unknown as { id: string; number: string; amount: number; cod_fee: number | null; cod_requested_at: string | null; due_date: string; status: string; pay_token: string; lots: { lot_number: number; brand: string; model: string } | null }[]).map(inv => (
                    <tr key={inv.id}>
                      <td><span className="mono">{inv.number}</span><br />{inv.lots ? `${inv.lots.brand} ${inv.lots.model}` : ""}</td>
                      <td className="n">{money(inv.amount + (inv.cod_requested_at ? inv.cod_fee || 0 : 0), locale)}<br /><span className="fine">{inv.status === "paid" ? t.account.paid : inv.cod_requested_at ? t.pay.cod : t.account.due(dateShort(inv.due_date, locale))}</span></td>
                      <td>{inv.status === "paid" ? <span className="pill ok">{t.account.paid}</span> : <Link className="btn sm pri" href={`/${locale}/pay/${inv.pay_token}`}>{t.account.payNow}</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="fine">{t.account.noInvoices}</p>}
        </div>
        <div className="block">
          <h2 className="h3">{t.account.checks}</h2>
          <ul className="checks">
            <li className={me.email_verified ? "" : "no"}>{t.account.emailOk} · <span className="fine ltr">{me.email}</span></li>
            <li className={me.phone_verified ? "" : "no"}>{t.account.phoneOk} · <span className="fine ltr">{me.phone}</span></li>
            <li className={me.terms_accepted ? "" : "no"}>{t.account.termsOk}</li>
          </ul>
          <h2 className="h3" style={{ marginTop: 18 }}>{t.account.details}</h2>
          <AccountForm locale={locale} me={me} />
        </div>
      </section>
    </>
  );
}
