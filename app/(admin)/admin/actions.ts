"use server";
// Staff actions. Every action checks the signed-in user is staff, then writes with the server key.
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { normStaffLogin, requireAdmin, requireStaff, staffEmail } from "@/lib/staff";
import { createAndSendInvoice, markPaid, notifyInvoice } from "@/lib/invoices";
import { normIg, dubaiInstant, toE164 } from "@/lib/format";
import { emailHtml, emailReady, sendEmail } from "@/lib/notify/email";
import { ziinaReady, ziinaRegisterWebhook } from "@/lib/payments/ziina";
import { tabbyReady, tabbyRegisterWebhook } from "@/lib/payments/tabby";
import type { ImportedLot } from "@/lib/import";
import { SITE_URL } from "@/lib/env";

export type Result = { ok: boolean; message: string; id?: string };
const ok = (message: string, id?: string): Result => ({ ok: true, message, id });
const bad = (message: string): Result => ({ ok: false, message });

async function guard<T extends Result>(fn: () => Promise<T>): Promise<Result> {
  try {
    await requireStaff();
    return await fn();
  } catch (e) {
    return bad((e as Error).message || "Something went wrong");
  }
}

const int = (v: unknown) => {
  const n = Math.round(Number(String(v ?? "").replace(/[^\d.]/g, "")));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const str = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);

// ─── auctions ───

export async function saveAuction(input: { id?: string; number: number; sale_date: string; prebid_date: string; prebid_time: string; live_time: string; timer_seconds?: number | null }) {
  return guard(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sale_date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.prebid_date)) return bad("Pick the dates.");
    if (!/^\d{2}:\d{2}$/.test(input.live_time || "") || !/^\d{2}:\d{2}$/.test(input.prebid_time || "")) return bad("Pick the times.");
    const timer = input.timer_seconds == null ? null : Math.round(Number(input.timer_seconds));
    if (timer != null && !(timer >= 10 && timer <= 3600)) return bad("The timer should be between 10 seconds and 60 minutes.");
    const row = {
      number: Math.max(1, Math.round(input.number)),
      sale_date: input.sale_date,
      prebid_opens_at: dubaiInstant(input.prebid_date, input.prebid_time),
      live_starts_at: dubaiInstant(input.sale_date, input.live_time),
      timer_seconds: timer
    };
    if (row.prebid_opens_at >= row.live_starts_at) return bad("Pre-bids must open before the live starts.");
    const db = adminClient();
    const { data, error } = input.id
      ? await db.from("auctions").update(row).eq("id", input.id).select("id").single()
      : await db.from("auctions").insert({ ...row, status: "draft" }).select("id").single();
    if (error) return bad(error.code === "23505" ? `Auction Nº ${row.number} already exists.` : error.message);
    revalidatePath("/admin/auctions");
    revalidatePath("/", "layout");
    return ok(input.id ? "Saved. The website shows the new details now." : `Auction Nº ${row.number} created as a draft.`, data.id);
  });
}

/** Live console: use one timer length for every lot in this auction that hasn't started yet. */
export async function setAuctionTimer(auctionId: string, seconds: number | null) {
  return guard(async () => {
    const timer = seconds == null ? null : Math.round(Number(seconds));
    if (timer != null && !(timer >= 10 && timer <= 3600)) return bad("The timer should be between 10 seconds and 60 minutes.");
    const db = adminClient();
    const { error } = await db.from("auctions").update({ timer_seconds: timer }).eq("id", auctionId);
    if (error) return bad(error.message);
    await db.from("lots").update({ timer_seconds: null }).eq("auction_id", auctionId).is("ends_at", null);
    return ok("Timer changed for every lot that hasn’t started.");
  });
}

export async function setAuctionStatus(id: string, status: "draft" | "published" | "closed") {
  return guard(async () => {
    const db = adminClient();
    if (status === "closed") {
      const { data: live } = await db.from("lots").select("id").eq("auction_id", id).gt("ends_at", new Date().toISOString()).limit(1);
      if (live && live.length) return bad("A lot is live. Wait for its timer to end.");
      await db.from("auctions").update({ status, block_lot_id: null }).eq("id", id);
    } else {
      await db.from("auctions").update({ status }).eq("id", id);
    }
    revalidatePath(`/admin/auctions/${id}`);
    return ok(status === "published" ? "Published: the catalogue is now on the website." : status === "closed" ? "Auction closed." : "Back to draft: hidden from the website.");
  });
}

// ─── lots ───

export type LotInput = {
  id?: string;
  auction_id: string;
  lot_number?: number | null;
  pub: Record<string, unknown>;
  priv: Record<string, unknown>;
  consignment_id?: string | null;
};

const PUB_TEXT = ["brand", "model", "reference", "year", "case_size", "case_material", "dial", "bracelet", "dial_colour", "bezel", "shape", "hands", "condition"];

export async function saveLot(input: LotInput) {
  return guard(async () => {
    const db = adminClient();
    const p = input.pub;
    const row: Record<string, unknown> = {};
    for (const k of PUB_TEXT) row[k] = str(p[k], 120);
    row.notes_en = str(p.notes_en, 4000);
    row.notes_ar = str(p.notes_ar, 4000);
    row.has_box = !!p.has_box;
    row.has_papers = !!p.has_papers;
    row.no_reserve = !!p.no_reserve;
    // Estimates are optional (empty = not shown). One given on its own is used for both.
    const lo = int(p.estimate_low);
    const hi = int(p.estimate_high);
    row.estimate_low = lo ?? hi;
    row.estimate_high = hi ?? lo;
    row.start_price = int(p.start_price) ?? 0;
    row.photos = Array.isArray(p.photos) ? (p.photos as string[]).filter(u => /^https:\/\//.test(u)).slice(0, 24) : [];
    if (!row.brand || !row.model) return bad("Brand and model are required.");
    if (lo && hi && lo > hi) return bad("The low estimate is higher than the high estimate.");
    const reserve = row.no_reserve ? null : int(input.priv.reserve);
    if (!row.no_reserve && !reserve) return bad("Set a reserve, or tick No reserve.");

    let id = input.id;
    if (id) {
      const { data: cur } = await db.from("lots").select("bid_count, start_price").eq("id", id).single();
      if (cur && cur.bid_count > 0) row.start_price = cur.start_price; // locked once bidding has started
      if (input.lot_number) row.lot_number = input.lot_number;
      row.updated_at = new Date().toISOString();
      const { error } = await db.from("lots").update(row).eq("id", id);
      if (error) return bad(error.code === "23505" ? "Another lot already has that number." : error.message);
    } else {
      let n = input.lot_number || null;
      if (!n) {
        const { data: last } = await db.from("lots").select("lot_number").eq("auction_id", input.auction_id).order("lot_number", { ascending: false }).limit(1).maybeSingle();
        n = (last?.lot_number || 0) + 1;
      }
      const { data, error } = await db.from("lots").insert({ ...row, auction_id: input.auction_id, lot_number: n }).select("id").single();
      if (error) return bad(error.code === "23505" ? "Another lot already has that number." : error.message);
      id = data.id as string;
    }
    const q = input.priv;
    const { error: e2 } = await db.from("lot_private").upsert({
      lot_id: id,
      reserve,
      source: q.source === "consign" ? "consign" : "stock",
      cost: int(q.cost),
      consignor_name: str(q.consignor_name, 120),
      consignor_phone: str(q.consignor_phone, 40),
      consignor_email: str(q.consignor_email, 160),
      seller_fee: q.seller_fee === "" || q.seller_fee == null ? null : Number(q.seller_fee),
      updated_at: new Date().toISOString()
    });
    if (e2) return bad(e2.message);
    // Reserve changes can make a lot with bids a pure sale.
    if (reserve) {
      const { data: l } = await db.from("lots").select("current_bid").eq("id", id).single();
      if (l?.current_bid && l.current_bid >= reserve) await db.from("lots").update({ reserve_met: true }).eq("id", id);
    }
    if (input.consignment_id) await db.from("consignments").update({ status: "listed", lot_id: id }).eq("id", input.consignment_id);
    revalidatePath(`/admin/auctions/${input.auction_id}`);
    return ok(input.id ? "Lot saved." : "Lot added.", id);
  });
}

export async function deleteLot(id: string) {
  return guard(async () => {
    const db = adminClient();
    const { data: lot } = await db.from("lots").select("auction_id, bid_count").eq("id", id).single();
    if (!lot) return bad("Lot not found.");
    if (lot.bid_count > 0) return bad("This lot has bids. It can’t be deleted; let it close unsold instead.");
    const { data: inv } = await db.from("invoices").select("id").eq("lot_id", id).limit(1);
    if (inv && inv.length) return bad("This lot has an invoice.");
    const { error } = await db.from("lots").delete().eq("id", id);
    if (error) return bad(error.message);
    revalidatePath(`/admin/auctions/${lot.auction_id}`);
    return ok("Lot deleted.");
  });
}

export async function importLots(auctionId: string, lots: ImportedLot[]) {
  return guard(async () => {
    if (!lots.length) return bad("Nothing to add.");
    if (lots.length > 300) return bad("Add at most 300 lots at a time.");
    const db = adminClient();
    const { data: last } = await db.from("lots").select("lot_number").eq("auction_id", auctionId).order("lot_number", { ascending: false }).limit(1).maybeSingle();
    let n = last?.lot_number || 0;
    const rows = lots.map(l => ({
      ...l.pub,
      brand: str(l.pub.brand, 60), model: str(l.pub.model, 120),
      // Estimates are optional; a starting bid left empty is 0.
      estimate_low: l.pub.estimate_low ? Math.round(l.pub.estimate_low) : null,
      estimate_high: l.pub.estimate_high || l.pub.estimate_low ? Math.round(Math.max(l.pub.estimate_high || 0, l.pub.estimate_low || 0)) : null,
      start_price: Math.max(0, Math.round(l.pub.start_price || 0)),
      auction_id: auctionId,
      lot_number: ++n
    }));
    const { data, error } = await db.from("lots").insert(rows).select("id, lot_number");
    if (error) return bad(error.message);
    const byNo = new Map((data || []).map(r => [r.lot_number as number, r.id as string]));
    const privs = lots.map((l, i) => ({ lot_id: byNo.get(rows[i].lot_number)!, ...l.priv, seller_fee: l.priv.seller_fee ?? null }));
    const { error: e2 } = await db.from("lot_private").insert(privs);
    if (e2) return bad(e2.message);
    revalidatePath(`/admin/auctions/${auctionId}`);
    const noReserve = lots.filter(l => !l.pub.no_reserve && !l.priv.reserve).length;
    return ok(`${lots.length} lots added.${noReserve ? ` ${noReserve} still need a reserve before they can take bids.` : ""}`);
  });
}

export async function relistLots(lotIds: string[], auctionId: string) {
  return guard(async () => {
    const db = adminClient();
    const { data: src } = await db.from("lots").select("*").in("id", lotIds);
    if (!src?.length) return bad("Nothing selected.");
    const { data: privs } = await db.from("lot_private").select("*").in("lot_id", lotIds);
    const privBy = new Map((privs || []).map(p => [p.lot_id, p]));
    const { data: last } = await db.from("lots").select("lot_number").eq("auction_id", auctionId).order("lot_number", { ascending: false }).limit(1).maybeSingle();
    let n = last?.lot_number || 0;
    for (const l of src) {
      const copy: Record<string, unknown> = { ...l };
      for (const k of ["id", "created_at", "updated_at", "current_bid", "leader_paddle", "leader_via", "bid_count", "ends_at", "reserve_met", "made_pure"]) delete copy[k];
      const { data: created, error } = await db.from("lots").insert({ ...copy, auction_id: auctionId, lot_number: ++n, relisted_from: l.id }).select("id").single();
      if (error) return bad(error.message);
      const p = privBy.get(l.id);
      await db.from("lot_private").insert({
        lot_id: created.id, reserve: p?.reserve ?? null, source: p?.source || "stock", cost: p?.cost ?? null,
        consignor_name: p?.consignor_name || "", consignor_phone: p?.consignor_phone || "", consignor_email: p?.consignor_email || "", seller_fee: p?.seller_fee ?? null
      });
    }
    revalidatePath(`/admin/auctions/${auctionId}`);
    return ok(`${src.length} lot${src.length === 1 ? "" : "s"} added to this auction. Check their reserves with the owners.`);
  });
}

/** Every lot in this auction that has no bids yet starts at AED 0. */
export async function zeroStartPrices(auctionId: string) {
  return guard(async () => {
    const { data, error } = await adminClient().from("lots")
      .update({ start_price: 0, updated_at: new Date().toISOString() })
      .eq("auction_id", auctionId).eq("bid_count", 0).gt("start_price", 0).select("id");
    if (error) return bad(error.message);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath("/", "layout");
    return ok(data?.length ? `${data.length} lot${data.length === 1 ? "" : "s"} now start at AED 0. Lots that already have bids keep their starting bid.` : "Every lot without bids already starts at AED 0.");
  });
}

/**
 * Rehearsals: puts every lot in an auction back to "not sold yet" so the same watches can be run again.
 * Deletes all bids and max bids, clears prices and timers, and cancels the auction's invoices (paid test ones too).
 * Admins only, and only after typing the auction number.
 */
export async function resetAuctionForRehearsal(auctionId: string, typed: string) {
  return guard(async () => {
    const me = await requireStaff();
    if (me.role !== "admin") return bad("Only an admin can reset an auction.");
    const db = adminClient();
    const { data: auction } = await db.from("auctions").select("id, number").eq("id", auctionId).maybeSingle();
    if (!auction) return bad("Auction not found.");
    if (String(typed).trim() !== String(auction.number)) return bad(`Type ${auction.number} in the box to confirm.`);
    const { data: lots } = await db.from("lots").select("id").eq("auction_id", auctionId);
    const ids = (lots || []).map(l => l.id);
    if (!ids.length) return bad("This auction has no lots.");
    const now = new Date().toISOString();
    const steps = [
      await db.from("auctions").update({ block_lot_id: null }).eq("id", auctionId),
      await db.from("invoices").update({ status: "void", void_reason: "Rehearsal reset", updated_at: now }).in("lot_id", ids).neq("status", "void"),
      await db.from("max_bids").delete().in("lot_id", ids),
      await db.from("bids").delete().in("lot_id", ids),
      await db.from("lots").update({
        current_bid: null, leader_paddle: null, leader_via: null, bid_count: 0,
        reserve_met: false, made_pure: false, ends_at: null, updated_at: now
      }).in("id", ids),
      await db.from("lot_private").update({ leader_id: null, leader_ig: null, updated_at: now }).in("lot_id", ids)
    ];
    const failed = steps.find(r => r.error);
    if (failed?.error) return bad(`Reset stopped part-way: ${failed.error.message}. Press Reset again to finish.`);
    await db.from("events").insert({ kind: "auction_reset", actor: me.id, data: { auction_id: auctionId, lots: ids.length } });
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath("/admin/payments");
    revalidatePath("/", "layout");
    return ok(`Auction Nº ${auction.number} reset: ${ids.length} lots are back to their starting price, ready for another rehearsal.`);
  });
}

export async function setLotPhotos(lotId: string, photos: string[]) {
  return guard(async () => {
    const clean = photos.filter(u => /^https:\/\//.test(u)).slice(0, 24);
    const { error } = await adminClient().from("lots").update({ photos: clean, updated_at: new Date().toISOString() }).eq("id", lotId);
    return error ? bad(error.message) : ok("Photos saved.");
  });
}

// ─── live console data ───

export async function consoleData(auctionId: string) {
  await requireStaff();
  const db = adminClient();
  const { data: lots } = await db.from("lots").select("id").eq("auction_id", auctionId);
  const ids = (lots || []).map(l => l.id);
  const [{ data: privs }, { data: maxes }, { data: bidders }, { data: invoices }] = await Promise.all([
    ids.length ? db.from("lot_private").select("lot_id, reserve, source, consignor_name, leader_ig").in("lot_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("max_bids").select("lot_id, amount, set_at, profiles(paddle, full_name)").in("lot_id", ids) : Promise.resolve({ data: [] }),
    db.from("profiles").select("paddle, full_name, instagram, instagram_confirmed, phone_verified_at, suspended").order("paddle").limit(5000),
    db.from("invoices").select("id, lot_id, number, status, amount, bidder_id, ig_handle, notified_at, notify_error").eq("auction_id", auctionId).neq("status", "void")
  ]);
  return {
    privs: (privs || []) as { lot_id: string; reserve: number | null; source: string; consignor_name: string; leader_ig: string | null }[],
    maxes: ((maxes || []) as unknown as { lot_id: string; amount: number; profiles: { paddle: number; full_name: string } | null }[]).map(m => ({ lot_id: m.lot_id, amount: m.amount, paddle: m.profiles?.paddle ?? null, name: m.profiles?.full_name || "" })),
    bidders: (bidders || []).map(b => ({ paddle: b.paddle as number, name: b.full_name as string, ig: b.instagram_confirmed ? (b.instagram as string | null) : null, verified: !!b.phone_verified_at, suspended: !!b.suspended })),
    // Invoices already created for this auction (staff send each one from the console).
    invoices: (invoices || []) as { id: string; lot_id: string; number: string; status: string; amount: number; bidder_id: string | null; ig_handle: string | null; notified_at: string | null; notify_error: string | null }[]
  };
}

export async function lotBidsDetailed(lotId: string) {
  await requireStaff();
  const { data } = await adminClient()
    .from("bids").select("id, amount, paddle, ig_handle, via, is_auto, created_at, profiles!bids_bidder_id_fkey(full_name)")
    .eq("lot_id", lotId).order("id", { ascending: false }).limit(40);
  return ((data || []) as unknown as { id: number; amount: number; paddle: number | null; ig_handle: string | null; via: string; is_auto: boolean; created_at: string; profiles: { full_name: string } | null }[])
    .map(b => ({ id: b.id, amount: b.amount, paddle: b.paddle, ig: b.ig_handle, via: b.via, auto: b.is_auto, at: b.created_at, name: b.profiles?.full_name || "" }));
}

// ─── bidders ───

export async function updateBidder(profileId: string, patch: { instagram?: string; instagram_confirmed?: boolean; suspended?: boolean; role?: "bidder" | "staff" | "admin"; notes?: string; id_checked?: boolean; phone?: string }) {
  return guard(async () => {
    const me = await requireStaff();
    const db = adminClient();
    const row: Record<string, unknown> = {};
    if (patch.instagram !== undefined) row.instagram = normIg(patch.instagram);
    if (patch.instagram_confirmed !== undefined) row.instagram_confirmed = patch.instagram_confirmed;
    if (patch.suspended !== undefined) row.suspended = patch.suspended;
    if (patch.role !== undefined) {
      if (me.role !== "admin") return bad("Only the admin can change roles.");
      if (profileId === me.id) return bad("You can’t change your own role.");
      if (patch.role === "admin") return bad("There is only one admin. Make them staff instead.");
      row.role = patch.role;
    }
    if (patch.phone !== undefined) {
      const e164 = toE164(patch.phone);
      if (!e164) return bad("Enter the number with its country code.");
      row.phone = e164;
      row.phone_verified_at = new Date().toISOString();
    }
    if (Object.keys(row).length) {
      const { error } = await db.from("profiles").update(row).eq("id", profileId);
      if (error) return bad(error.code === "23505" ? "That Instagram handle or phone number already belongs to another bidder." : error.message);
    }
    if (patch.notes !== undefined || patch.id_checked !== undefined) {
      const { data: cur } = await db.from("profile_notes").select("notes, id_checked").eq("profile_id", profileId).maybeSingle();
      await db.from("profile_notes").upsert({
        profile_id: profileId,
        notes: patch.notes ?? cur?.notes ?? "",
        id_checked: patch.id_checked ?? cur?.id_checked ?? false,
        updated_at: new Date().toISOString()
      });
    }
    revalidatePath("/admin/bidders");
    return ok("Saved.");
  });
}

// ─── payments ───

/** "Send invoice" in Winners & payments, for a sold lot whose invoice hasn't gone out yet. */
export async function sendLotInvoice(lotId: string) {
  return guard(async () => {
    await requireStaff();
    const r = await createAndSendInvoice(lotId);
    revalidatePath("/admin/payments");
    if (!r.ok) return bad(r.error || "Couldn’t send the invoice.");
    if (!r.invoice) return bad("No invoice: the lot didn’t sell, or its timer hasn’t ended.");
    if (!r.registered) return ok(`Invoice ${r.number} created for @${r.ig}. Link them to a paddle below to send the payment link.`);
    if (r.alreadySent) return ok(`Invoice ${r.number} was already sent.`);
    return r.sent?.sent
      ? ok(`Invoice ${r.number} sent.${r.sent.errors.length ? " " + r.sent.errors.join(" · ") : ""}`)
      : bad(`Invoice ${r.number} created but not sent: ${(r.sent?.errors || []).join(" · ") || "unknown error"}.`);
  });
}

export async function markInvoicePaid(invoiceId: string, method: "bank" | "cash" | "card" | "tabby" | "tamara" | "cod") {
  return guard(async () => {
    const me = await requireStaff();
    const done = await markPaid(invoiceId, method, me.id);
    revalidatePath("/admin/payments");
    return done ? ok("Marked paid. The buyer has been sent a receipt.") : bad("Already paid or cancelled.");
  });
}

export async function voidInvoice(invoiceId: string, reason: string) {
  return guard(async () => {
    const { error } = await adminClient().from("invoices").update({ status: "void", void_reason: str(reason, 300) || "Cancelled by staff", updated_at: new Date().toISOString() }).eq("id", invoiceId).neq("status", "paid");
    revalidatePath("/admin/payments");
    return error ? bad(error.message) : ok("Invoice cancelled.");
  });
}

export async function resendInvoice(invoiceId: string) {
  return guard(async () => {
    const r = await notifyInvoice(invoiceId, { force: true });
    revalidatePath("/admin/payments");
    return r.sent ? ok(`Sent (${r.sent} message${r.sent === 1 ? "" : "s"}).${r.errors.length ? " " + r.errors.join(" · ") : ""}`) : bad(r.errors.join(" · ") || "Nothing was sent.");
  });
}

/** For Instagram winners: attach the invoice to a registered bidder, then send the payment link. */
export async function linkInvoiceBidder(invoiceId: string, paddle: number) {
  return guard(async () => {
    const db = adminClient();
    const { data: prof } = await db.from("profiles").select("id, full_name").eq("paddle", paddle).maybeSingle();
    if (!prof) return bad(`Paddle ${paddle} isn’t registered.`);
    const { error } = await db.from("invoices").update({ bidder_id: prof.id, notified_at: null, notify_error: null, updated_at: new Date().toISOString() }).eq("id", invoiceId).neq("status", "paid");
    if (error) return bad(error.message);
    const r = await notifyInvoice(invoiceId, { force: true });
    revalidatePath("/admin/payments");
    return ok(`Linked to paddle ${paddle} (${prof.full_name}).${r.sent ? " Payment link sent." : " " + r.errors.join(" · ")}`);
  });
}

export async function setPayout(invoiceId: string, paid: boolean) {
  return guard(async () => {
    await adminClient().from("invoices").update({ payout_paid_at: paid ? new Date().toISOString() : null }).eq("id", invoiceId);
    revalidatePath("/admin/payments");
    return ok(paid ? "Consignor payout recorded." : "Payout unmarked.");
  });
}

// ─── consignments ───

export async function setConsignmentStatus(id: string, status: "new" | "contacted" | "accepted" | "declined" | "listed") {
  return guard(async () => {
    await adminClient().from("consignments").update({ status }).eq("id", id);
    revalidatePath("/admin/consignments");
    return ok("Updated.");
  });
}

// ─── staff accounts (admin only) ───

/** Creates a staff login: they sign in to the admin with this staff ID and password (no email or phone code). */
export async function createStaffAccount(input: { name: string; login: string; password: string }) {
  return guard(async () => {
    await requireAdmin();
    const name = str(input.name, 120);
    const login = normStaffLogin(input.login);
    const password = String(input.password || "");
    if (name.length < 2) return bad("Add the staff member’s name.");
    if (!login) return bad("Staff ID: 3 to 30 letters or numbers (dots, dashes and underscores are fine), no spaces.");
    if (password.length < 8) return bad("The password needs at least 8 characters.");
    const db = adminClient();
    const { data: taken } = await db.from("profiles").select("id").eq("staff_login", login).maybeSingle();
    if (taken) return bad(`The staff ID “${login}” is already taken.`);
    const { data, error } = await db.auth.admin.createUser({
      email: staffEmail(login, SITE_URL), password, email_confirm: true,
      user_metadata: { full_name: name, lang: "en" }
    });
    if (error || !data.user) return bad(error?.message || "Couldn’t create the account.");
    const { error: e2 } = await db.from("profiles")
      .update({ role: "staff", staff_login: login, full_name: name, terms_accepted_at: new Date().toISOString() })
      .eq("id", data.user.id);
    if (e2) {
      await db.auth.admin.deleteUser(data.user.id);
      return bad(e2.message);
    }
    revalidatePath("/admin/staff");
    return ok(`Login created for ${name}.`, data.user.id);
  });
}

export async function setStaffPassword(profileId: string, password: string) {
  return guard(async () => {
    const me = await requireAdmin();
    if (profileId === me.id) return bad("Change your own sign-in from your account, not here.");
    if (String(password || "").length < 8) return bad("The password needs at least 8 characters.");
    const db = adminClient();
    const { data: p } = await db.from("profiles").select("staff_login").eq("id", profileId).maybeSingle();
    if (!p?.staff_login) return bad("This person signs in with an email code, so they have no password to change.");
    const { error } = await db.auth.admin.updateUserById(profileId, { password });
    return error ? bad(error.message) : ok("New password saved. Their old password no longer works.");
  });
}

/** Turns a staff login off (they can't sign in) or back on. */
export async function setStaffActive(profileId: string, active: boolean) {
  return guard(async () => {
    const me = await requireAdmin();
    if (profileId === me.id) return bad("You can’t turn off your own access.");
    const db = adminClient();
    const { error } = await db.from("profiles").update({ suspended: !active }).eq("id", profileId);
    if (error) return bad(error.message);
    await db.auth.admin.updateUserById(profileId, { ban_duration: active ? "none" : "876000h" });
    revalidatePath("/admin/staff");
    return ok(active ? "Access turned back on." : "Access turned off. They’re signed out and can’t sign in.");
  });
}

/** Removes the staff (or a second admin's) role from someone who signs in with an email code; they stay a bidder. */
export async function setStaffRole(profileId: string, role: "staff" | "bidder") {
  return guard(async () => {
    const me = await requireAdmin();
    if (profileId === me.id) return bad("You can’t change your own role.");
    const { error } = await adminClient().from("profiles").update({ role }).eq("id", profileId);
    revalidatePath("/admin/staff");
    return error ? bad(error.message) : ok(role === "staff" ? "Now staff (not admin)." : "Staff access removed. They can still bid as a normal bidder.");
  });
}

// ─── settings ───

export async function saveSettings(input: { seller_fee: number; pay_days: number; timer_seconds: number; lot_target: number; cod_fee: number; whatsapp: string; instagram: string; contact_email: string; bank_details: string }) {
  return guard(async () => {
    await requireAdmin();
    const db = adminClient();
    const fee = Number(input.seller_fee);
    if (!(fee >= 0 && fee <= 50)) return bad("Seller fee should be between 0 and 50%.");
    const { error } = await db.from("settings").update({
      seller_fee: fee,
      pay_days: Math.min(30, Math.max(1, Math.round(input.pay_days))),
      timer_seconds: Math.min(3600, Math.max(10, Math.round(input.timer_seconds))),
      lot_target: Math.max(1, Math.round(input.lot_target)),
      cod_fee: Math.min(1000, Math.max(0, Math.round(Number(input.cod_fee) || 0))),
      whatsapp: toE164(input.whatsapp) || "",
      instagram: str(input.instagram, 60).replace(/^@+/, ""),
      contact_email: str(input.contact_email, 160),
      updated_at: new Date().toISOString()
    }).eq("id", 1);
    if (error) return bad(error.message);
    await db.from("settings_private").update({ bank_details: str(input.bank_details, 2000), updated_at: new Date().toISOString() }).eq("id", 1);
    revalidatePath("/", "layout");
    return ok("Settings saved.");
  });
}

export async function registerWebhooks() {
  return guard(async () => {
    await requireAdmin();
    const out: string[] = [];
    if (ziinaReady() && process.env.ZIINA_WEBHOOK_SECRET) {
      const r = await ziinaRegisterWebhook(`${SITE_URL}/api/webhooks/ziina`);
      out.push(`Ziina: ${r.detail}`);
    } else out.push("Ziina: add ZIINA_API_KEY and ZIINA_WEBHOOK_SECRET first");
    if (tabbyReady() && process.env.TABBY_WEBHOOK_SECRET) {
      const r = await tabbyRegisterWebhook(`${SITE_URL}/api/webhooks/tabby`);
      out.push(`Tabby: ${r.detail}`);
    } else out.push("Tabby: add TABBY_SECRET_KEY, TABBY_MERCHANT_CODE and TABBY_WEBHOOK_SECRET first");
    out.push(`Tamara: add ${SITE_URL}/api/webhooks/tamara in the Tamara partner portal`);
    return ok(out.join(" · "));
  });
}

export async function sendTestEmail() {
  return guard(async () => {
    const me = await requireAdmin();
    if (!emailReady()) return bad("Add RESEND_API_KEY and EMAIL_FROM first.");
    const r = await sendEmail({ to: me.email, subject: "Test from The Time Souk", text: "Email is working.", html: emailHtml({ lang: "en", heading: "Email is working", blocks: ["This is a test from your auction admin."], footer: "The Time Souk admin" }) });
    return r.ok ? ok(`Test email sent to ${me.email}.`) : bad(r.error || "Failed");
  });
}
