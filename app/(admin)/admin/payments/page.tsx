import Link from "next/link";
import { InvoiceCard, SendInvoiceRow, type InvoiceCardData } from "@/components/admin/InvoiceCard";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW } from "@/lib/env";
import { money, num, pad2, todayDubai } from "@/lib/format";
import { payUrl } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ auction?: string; show?: string }> }) {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to see winners and payments.</p>;
  const sp = await searchParams;
  const db = adminClient();
  const { data: auctions } = await db.from("auctions").select("id, number, status").neq("status", "draft").order("number", { ascending: false });
  const auctionId = sp.auction || auctions?.[0]?.id;
  if (!auctionId) return <p className="empty">No auctions yet.</p>;
  const [{ data: invs }, { data: settings }, { data: closed }] = await Promise.all([
    db.from("invoices").select("*, lots(lot_number, brand, model), profiles!invoices_bidder_id_fkey(paddle, full_name, email, phone, lang)").eq("auction_id", auctionId).neq("status", "void").order("number"),
    db.from("settings").select("seller_fee").eq("id", 1).single(),
    db.from("lots").select("id, lot_number, brand, model, current_bid, leader_paddle, leader_via, no_reserve, reserve_met, made_pure, ends_at")
      .eq("auction_id", auctionId).not("ends_at", "is", null).lte("ends_at", new Date().toISOString()).not("current_bid", "is", null).order("lot_number")
  ]);
  const ids = (invs || []).map(i => i.lot_id);
  const invIds = (invs || []).map(i => i.id);
  const [{ data: privs }, { data: pays }] = await Promise.all([
    ids.length ? db.from("lot_private").select("lot_id, source, cost, consignor_name, seller_fee").in("lot_id", ids) : Promise.resolve({ data: [] }),
    invIds.length ? db.from("payments").select("invoice_id, provider, status, created_at").in("invoice_id", invIds).order("created_at") : Promise.resolve({ data: [] })
  ]);
  const pv = new Map((privs || []).map(p => [p.lot_id, p]));
  const today = todayDubai();
  const cards: InvoiceCardData[] = (invs || []).map(i => {
    const p = pv.get(i.lot_id);
    const feePct = p?.seller_fee != null ? Number(p.seller_fee) : Number(settings?.seller_fee ?? 7.5);
    const fee = p?.source === "consign" ? Math.round((i.amount * feePct) / 100) : 0;
    const prof = i.profiles as { paddle: number; full_name: string; email: string; phone: string | null; lang: string } | null;
    return {
      id: i.id, number: i.number, amount: i.amount, due_date: i.due_date, status: i.status, method: i.method, paid_at: i.paid_at,
      notified_at: i.notified_at, notify_error: i.notify_error, transfer_claimed_at: i.transfer_claimed_at, payout_paid_at: i.payout_paid_at,
      ig_handle: i.ig_handle, payUrl: payUrl(prof?.lang === "ar" ? "ar" : "en", i.pay_token),
      // Cash on delivery buyers pay when the watch arrives, so they're never "overdue".
      overdue: i.status !== "paid" && !i.cod_requested_at && i.due_date < today,
      cod_fee: Number(i.cod_fee || 0), cod_requested_at: i.cod_requested_at || null, delivery_address: i.delivery_address || "", delivery_city: i.delivery_city || "", delivery_country: i.delivery_country || "",
      lot: i.lots as { lot_number: number; brand: string; model: string }, buyer: prof,
      source: p?.source || null, consignor: p?.consignor_name || "", fee, payout: p?.source === "consign" ? i.amount - fee : 0,
      income: (p?.source === "consign" ? fee : i.amount - (p?.cost || 0)) + (i.cod_requested_at ? Number(i.cod_fee || 0) : 0),
      payments: (pays || []).filter(x => x.invoice_id === i.id)
    };
  });
  const sum = (f: (c: InvoiceCardData) => number) => cards.reduce((s, c) => s + f(c), 0);
  const total = (c: InvoiceCardData) => c.amount + (c.cod_requested_at ? c.cod_fee : 0);
  // Sold lots with no invoice yet: staff send each one when they're sure of the winner.
  const invoiced = new Set((invs || []).map(i => i.lot_id));
  const unsent = (closed || []).filter(l => (l.no_reserve || l.reserve_met || l.made_pure) && !invoiced.has(l.id));
  const shown = sp.show === "unpaid" ? cards.filter(c => c.status !== "paid") : sp.show === "overdue" ? cards.filter(c => c.overdue) : cards;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="adm-head">
        <h1 className="disp">Winners &amp; payments</h1>
        <form className="inline-form" action="/admin/payments">
          <select name="auction" defaultValue={auctionId}>
            {(auctions || []).map(a => <option key={a.id} value={a.id}>Auction Nº {pad2(a.number)} ({a.status})</option>)}
          </select>
          <select name="show" defaultValue={sp.show || ""}>
            <option value="">All winners</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option>
          </select>
          <button className="btn sm" type="submit">Show</button>
          <Link className="btn sm" href={`/api/admin/export?auction=${auctionId}`}>Download CSV</Link>
        </form>
      </div>
      <div className="stats">
        <div><span className="k">Sold lots</span><b>{cards.length}</b></div>
        <div><span className="k">Buyers owe</span><b>{num(sum(total))}</b></div>
        <div><span className="k">Paid</span><b>{num(sum(c => (c.status === "paid" ? total(c) : 0)))}</b></div>
        <div><span className="k">Outstanding</span><b>{num(sum(c => (c.status !== "paid" ? total(c) : 0)))}</b></div>
        <div><span className="k">Overdue</span><b className={cards.some(c => c.overdue) ? "urgent" : ""}>{cards.filter(c => c.overdue).length}</b></div>
        <div><span className="k">To consignors</span><b>{num(sum(c => c.payout))}</b></div>
        <div><span className="k">Our income</span><b>{num(sum(c => c.income))}</b></div>
      </div>
      <p className="fine">Nothing goes to a buyer until you press Send invoice (here or in the live console). They then get their payment link by email and WhatsApp, and a reminder the working day before it’s due. Card, Tabby and Tamara payments mark themselves paid; mark bank transfers, cash and cash on delivery here when the money arrives.</p>
      {unsent.length ? (
        <div className="stack" style={{ gap: 12 }}>
          <h2 className="h3">Sold, invoice not sent yet · {unsent.length}</h2>
          {unsent.map(l => (
            <SendInvoiceRow
              key={l.id}
              lotId={l.id}
              title={`Lot ${pad2(l.lot_number)} · ${l.brand} ${l.model}`}
              line={`${money(l.current_bid)} · ${l.leader_paddle ? `paddle ${l.leader_paddle}` : "Instagram bidder"}${l.leader_via === "instagram" ? " (Instagram)" : ""}`}
            />
          ))}
        </div>
      ) : null}
      {shown.length ? <div className="stack" style={{ gap: 12 }}>{shown.map(c => <InvoiceCard key={c.id} i={c} />)}</div> : !unsent.length ? <p className="empty">No winners here yet. Sold lots appear here once their timer ends.</p> : null}
    </div>
  );
}
