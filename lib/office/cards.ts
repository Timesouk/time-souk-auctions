// Ziina card payment links for back-office invoices, lots and deposits (server only).
// A paid link is recorded on Payments by itself: from Ziina's webhook, the every-minute job, or "Check card payments".
import { adminClient } from "../supabase/admin";
import { SITE_URL } from "../env";
import { ziinaCreate, ziinaGet, ziinaReady } from "../payments/ziina";
import { signRef } from "./links";

export type CardLinkRow = {
  id: string; kind: "Invoice" | "Lot" | "Deposit"; invoice_no: string; lot_key: string; customer_id: string | null; name: string;
  amount: number; fee: number; card_amount: number; ziina_id: string | null; url: string; status: string; ledger_id: string | null;
};

export const PAID_METHOD = "Card link (Ziina)";

/** Makes the link with Ziina and records it on Card Links. */
export async function makeCardLink(p: {
  kind: CardLinkRow["kind"]; invoiceNo: string; lotKey: string; customerId: string | null; name: string; amount: number; cardAmount: number; expiresAt: string | null; what: string;
}) {
  if (!ziinaReady()) throw new Error("Ziina isn't connected: add ZIINA_API_KEY in Vercel › Settings › Environment Variables.");
  if (!(p.cardAmount >= 2)) throw new Error("The card amount is too small for a link.");
  const back = p.invoiceNo ? `${SITE_URL}/en/invoice/${signRef(p.invoiceNo)}` : `${SITE_URL}/en`;
  const intent = await ziinaCreate({ amountAed: p.cardAmount, message: p.what, successUrl: `${back}?paid=1`, cancelUrl: back, failureUrl: back });
  const { data, error } = await adminClient()
    .from("card_links")
    .insert({
      kind: p.kind, invoice_no: p.invoiceNo, lot_key: p.lotKey, customer_id: p.customerId, name: p.name, amount: p.amount,
      fee: Math.round((p.cardAmount - p.amount) * 100) / 100, card_amount: p.cardAmount, expires_at: p.expiresAt, ziina_id: intent.id,
      url: intent.redirect_url, status: "open"
    })
    .select("id, url")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; url: string };
}

/** Asks Ziina about one link; records the payment once when it's paid. Returns its status. */
export async function settleCardLink(link: CardLinkRow): Promise<string> {
  if (!link.ziina_id) return link.status;
  if (link.ledger_id) return "paid";
  const intent = await ziinaGet(link.ziina_id);
  const db = adminClient();
  const now = new Date().toISOString();
  if (intent.status === "completed") {
    const { data: entry } = await db
      .from("ledger")
      .upsert(
        {
          import_ref: `ziina:${link.ziina_id}`, kind: link.kind === "Deposit" ? "Deposit" : "Payment", customer_id: link.customer_id,
          invoice_no: link.kind === "Deposit" ? "" : link.invoice_no, method: PAID_METHOD, amount: link.card_amount,
          reference: `Ziina ${link.ziina_id}`, notes: link.lot_key ? `Card link for lot ${link.lot_key}` : "Card link"
        },
        { onConflict: "import_ref" }
      )
      .select("id")
      .single();
    await db.from("card_links").update({ status: "paid", checked_at: now, ledger_id: entry?.id || null }).eq("id", link.id);
    return "paid";
  }
  const status = intent.status === "failed" ? "failed" : intent.status === "canceled" ? "cancelled" : "open";
  await db.from("card_links").update({ status, checked_at: now }).eq("id", link.id);
  return status;
}

/** Checks every open link from the last few weeks. */
export async function checkOpenCardLinks(limit = 40, staleMinutes = 0) {
  if (!ziinaReady()) return { checked: 0, paid: 0 };
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  let q = adminClient()
    .from("card_links")
    .select("id, kind, invoice_no, lot_key, customer_id, name, amount, fee, card_amount, ziina_id, url, status, ledger_id")
    .eq("status", "open")
    .not("ziina_id", "is", null)
    .is("ledger_id", null)
    .gte("created_at", since)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (staleMinutes > 0) q = q.or(`checked_at.is.null,checked_at.lt.${new Date(Date.now() - staleMinutes * 60e3).toISOString()}`);
  const { data } = await q;
  let paid = 0;
  for (const l of (data || []) as CardLinkRow[]) {
    try {
      if ((await settleCardLink({ ...l, amount: Number(l.amount), fee: Number(l.fee), card_amount: Number(l.card_amount) })) === "paid") paid++;
    } catch {
      /* try again next time */
    }
  }
  return { checked: data?.length || 0, paid };
}

/** From Ziina's webhook: a back-office link, if it's one of ours. */
export async function settleCardLinkByZiinaId(ziinaId: string) {
  const { data } = await adminClient()
    .from("card_links")
    .select("id, kind, invoice_no, lot_key, customer_id, name, amount, fee, card_amount, ziina_id, url, status, ledger_id")
    .eq("ziina_id", ziinaId)
    .maybeSingle();
  if (!data) return false;
  const l = data as CardLinkRow;
  await settleCardLink({ ...l, amount: Number(l.amount), fee: Number(l.fee), card_amount: Number(l.card_amount) });
  return true;
}
