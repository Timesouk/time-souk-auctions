// Winners, payments and consignor payouts for one auction, as CSV for Excel.
import { adminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/staff";

const q = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const staff = await getStaff();
  if (!staff) return new Response("Staff only", { status: 403 });
  const auctionId = new URL(req.url).searchParams.get("auction") || "";
  const db = adminClient();
  const [{ data: auction }, { data: inv }, { data: settings }] = await Promise.all([
    db.from("auctions").select("number").eq("id", auctionId).single(),
    db.from("invoices").select("number, amount, due_date, status, method, paid_at, ig_handle, payout_paid_at, lot_id, cod_fee, cod_requested_at, delivery_address, delivery_city, lots(lot_number, brand, model, reference), profiles!invoices_bidder_id_fkey(paddle, full_name, email, phone)").eq("auction_id", auctionId).neq("status", "void").order("number"),
    db.from("settings").select("seller_fee").eq("id", 1).single()
  ]);
  const ids = (inv || []).map(i => i.lot_id);
  const { data: privs } = ids.length ? await db.from("lot_private").select("lot_id, source, cost, consignor_name, seller_fee").in("lot_id", ids) : { data: [] };
  const pv = new Map((privs || []).map(p => [p.lot_id, p]));
  const head = ["Auction", "Invoice", "Lot", "Watch", "Ref", "Paddle", "Buyer", "Email", "Phone", "Instagram", "Hammer AED", "Cash on delivery AED", "Total AED", "Delivery address", "City", "Due", "Status", "Method", "Paid at", "Source", "Consignor", "Seller fee AED", "To consignor AED", "Payout paid", "Our income AED"];
  const rows = (inv || []).map(i => {
    const lot = i.lots as unknown as { lot_number: number; brand: string; model: string; reference: string } | null;
    const b = i.profiles as unknown as { paddle: number; full_name: string; email: string; phone: string } | null;
    const p = pv.get(i.lot_id);
    const feePct = p?.seller_fee != null ? Number(p.seller_fee) : Number(settings?.seller_fee ?? 7.5);
    const fee = p?.source === "consign" ? Math.round((i.amount * feePct) / 100) : 0;
    const codFee = i.cod_requested_at ? Number(i.cod_fee || 0) : 0;
    const income = (p?.source === "consign" ? fee : i.amount - (p?.cost || 0)) + codFee;
    return [auction?.number, i.number, lot?.lot_number, `${lot?.brand} ${lot?.model}`, lot?.reference, b?.paddle, b?.full_name, b?.email, b?.phone, i.ig_handle, i.amount, codFee || "", i.amount + codFee, i.delivery_address, i.delivery_city, i.due_date, i.status, i.method === "cod" ? "cash on delivery" : i.method, i.paid_at, p?.source === "consign" ? "Consignment" : "Own stock", p?.consignor_name, fee, p?.source === "consign" ? i.amount - fee : "", i.payout_paid_at ? "Yes" : "", income].map(q).join(",");
  });
  const csv = "﻿" + [head.join(","), ...rows].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="time-souk-auction-${auction?.number || ""}.csv"` } });
}
