"use client";
// The console used during the Instagram live: run the block and type in bids.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLive, useTick } from "../live/LiveProvider";
import { TimerBox } from "../live/parts";
import { WatchArt } from "../WatchArt";
import { ConfirmButton } from "./ui";
import { TimerPicker } from "./TimerPicker";
import { browserClient } from "@/lib/supabase/client";
import { consoleData, lotBidsDetailed, setAuctionTimer } from "@/app/(admin)/admin/actions";
import { bidLadder, isClosedStatus, isPure, minBid, nextMinBid, timerLabel, upNext } from "@/lib/auction";
import { money, normIg, num, pad2, parseAmount, timeOf } from "@/lib/format";
import { IS_PREVIEW } from "@/lib/env";
import type { Lot } from "@/lib/types";

type Data = Awaited<ReturnType<typeof consoleData>>;
type Feed = Awaited<ReturnType<typeof lotBidsDetailed>>;
type Note = { ok: boolean; text: string } | null;

const ERR: Record<string, string> = {
  bid_too_low: "Too low. The lowest valid bid is",
  already_leading: "That bidder is already leading.",
  lot_closed: "The timer has ended. Reopen the lot only if this bid arrived before 0:00.",
  unknown_paddle: "No bidder has paddle",
  account_suspended: "That bidder is suspended.",
  max_needs_paddle: "Max bids need a registered paddle number.",
  max_not_higher: "That bidder’s max bid is already",
  bidder_required: "Enter a paddle number or an @handle.",
  another_lot_live: "Another lot is live. Let its timer finish or stop it first.",
  not_on_block: "Put the lot on the block first.",
  timer_already_used: "The timer has run. Use Restart or Reopen.",
  timer_not_running: "The timer isn’t running.",
  lot_open: "The lot is still open.",
  invoice_paid: "This lot’s invoice is already paid, so it can’t be reopened.",
  auction_not_published: "Publish the auction first (Auctions & lots).",
  lot_live: "A lot is live. Stop its timer first.",
  timer_running: "The timer is running. Sudden death: it can't be changed now. Stop or Restart instead.",
  invalid_timer: "The timer should be between 10 seconds and 60 minutes.",
  staff_only: "Staff only."
};
function explain(message: string) {
  const [code, arg] = String(message || "").split(":");
  const base = ERR[code] || message;
  return arg ? `${base} ${/^\d+$/.test(arg) ? num(Number(arg)) : arg}.` : base;
}

export function LiveConsole() {
  const { lots, auction, blockLot, statusOf, byId, refresh, patchLot, timerFor, timerSeconds } = useLive();
  useTick(250);
  const sb = browserClient();
  const [data, setData] = useState<Data | null>(null);
  const [feed, setFeed] = useState<Feed>([]);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState("");
  const [via, setVia] = useState("instagram");
  const [kind, setKind] = useState<"bid" | "max">("bid");
  const whoRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<string | null>(null);

  const sel = (selId && byId.get(selId)) || blockLot || lots.find(l => !isClosedStatus(statusOf(l))) || lots[0] || null;

  const loadData = useCallback(async () => {
    if (IS_PREVIEW) return;
    try {
      setData(await consoleData(auction.id));
    } catch {
      /* staff session may have expired; the page shows the sign-in prompt on reload */
    }
  }, [auction.id]);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 15000);
    return () => clearInterval(id);
  }, [loadData]);

  useEffect(() => {
    if (IS_PREVIEW || !sel) return;
    lotBidsDetailed(sel.id).then(setFeed).catch(() => setFeed([]));
  }, [sel?.id, sel?.bid_count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggest the usual next step as the price moves (staff can type any amount above the current bid).
  useEffect(() => {
    if (sel) setAmount(String(nextMinBid(sel)));
  }, [sel?.id, sel?.current_bid]); // eslint-disable-line react-hooks/exhaustive-deps

  const bidders = useMemo(() => new Map((data?.bidders || []).map(b => [b.paddle, b])), [data]);
  const igMap = useMemo(() => new Map((data?.bidders || []).filter(b => b.ig).map(b => [b.ig!, b])), [data]);
  const priv = useMemo(() => new Map((data?.privs || []).map(p => [p.lot_id, p])), [data]);
  const maxes = (lotId: string) => (data?.maxes || []).filter(m => m.lot_id === lotId).sort((a, b) => b.amount - a.amount);
  const invoices = useMemo(() => new Map((data?.invoices || []).map(i => [i.lot_id, i])), [data]);
  // Sold lots whose invoice hasn't gone out yet (staff send each one when they're sure of the winner).
  // (Instagram winners who aren't registered yet are handled in Winners & payments.)
  const unsent = lots.filter(l => {
    const inv = invoices.get(l.id);
    return statusOf(l) === "sold" && !inv?.notified_at && !(inv && !inv.bidder_id);
  });

  function leaderText(l: Lot) {
    if (l.current_bid == null) return "No bids";
    if (l.leader_paddle) {
      const b = bidders.get(l.leader_paddle);
      return `Paddle ${l.leader_paddle}${b ? ` · ${b.name}` : ""}${l.leader_via === "instagram" ? " · Instagram" : ""}`;
    }
    const ig = priv.get(l.id)?.leader_ig;
    return ig ? `@${ig} (Instagram, not registered)` : "Instagram bidder";
  }

  function whoHint() {
    const v = who.trim();
    if (!v) return "Paddle number, or @handle for Instagram comments";
    if (/^\d+$/.test(v)) {
      const b = bidders.get(Number(v));
      return b ? `Paddle ${v} · ${b.name}${b.suspended ? " · SUSPENDED" : b.verified ? "" : " · phone not verified"}` : data ? `Paddle ${v} isn’t registered` : `Paddle ${v}`;
    }
    const h = normIg(v);
    if (!h) return "";
    const b = igMap.get(h);
    return b ? `@${h} → paddle ${b.paddle} · ${b.name}` : `@${h} · unregistered Instagram bidder (invoice needs their contact details)`;
  }

  async function lotAction(lot: Lot, action: string, done?: string, seconds: number | null = null) {
    setNote(null);
    if (IS_PREVIEW || !sb) return setNote({ ok: false, text: "Preview mode: connect Supabase to run the live." });
    setBusy(true);
    const { error } = await sb.rpc("staff_lot_action", { p_lot_id: lot.id, p_action: action, p_seconds: seconds });
    setBusy(false);
    if (error) return setNote({ ok: false, text: explain(error.message) });
    await refresh();
    if (action === "reopen" || action === "hammer") loadData();
    if (done) setNote({ ok: true, text: done });
  }

  /** Creates the winner's invoice and sends the payment link. Only when staff press "Send invoice". */
  async function sendInvoice(lot: Lot, quiet = false): Promise<boolean> {
    if (!quiet) setNote(null);
    if (IS_PREVIEW) {
      setNote({ ok: false, text: "Preview mode: connect Supabase to send invoices." });
      return false;
    }
    setSending(lot.id);
    const j = await fetch(`/api/lots/${lot.id}/finalize`, { method: "POST" })
      .then(r => r.json())
      .catch(() => ({ ok: false, error: "Couldn’t reach the server. Try again." }));
    setSending(null);
    const name = `Lot ${pad2(lot.lot_number)}`;
    let ok = false;
    let text: string;
    if (!j.ok) text = `${name}: ${j.error === "staff_only" ? "Staff only." : j.error || "Couldn’t send the invoice."}`;
    else if (!j.invoice) text = `${name}: no invoice. The lot didn’t sell (no bids or reserve not met), or its timer hasn’t ended.`;
    else if (!j.registered) {
      ok = true;
      text = `${name}: invoice ${j.number} created for @${j.ig}. They aren’t registered yet: link them to a paddle in Winners & payments and the payment link goes out.`;
    } else if (j.alreadySent) {
      ok = true;
      text = `${name}: invoice ${j.number} was already sent.`;
    } else if (j.sent?.sent) {
      ok = true;
      text = `${name}: invoice ${j.number} sent to ${leaderText(lot)}.${j.sent.errors?.length ? ` (${j.sent.errors.join(" · ")})` : ""}`;
    } else {
      text = `${name}: invoice ${j.number} created but not sent: ${(j.sent?.errors || []).join(" · ") || "unknown error"}. Try again, or resend from Winners & payments.`;
    }
    if (!quiet) setNote({ ok, text });
    await loadData();
    return ok;
  }

  async function sendAll() {
    setNote(null);
    setBusy(true);
    let done = 0;
    const list = [...unsent];
    for (const l of list) {
      if (await sendInvoice(l, true)) done++;
    }
    setBusy(false);
    setNote({ ok: done === list.length, text: `${done} of ${list.length} invoices sent.${done < list.length ? " Check the list below for the rest." : ""}` });
  }

  function winnerLine(l: Lot) {
    return `${money(l.current_bid ?? 0)} · ${leaderText(l)}`;
  }

  function invoiceButton(l: Lot, big = false) {
    const inv = invoices.get(l.id);
    if (inv?.notified_at) return <span className="pill pure">Invoice {inv.number} sent</span>;
    const label = inv ? (inv.bidder_id ? "Send invoice again" : "Invoice waiting for contact") : "Send invoice";
    if (inv && !inv.bidder_id) return <span className="pill">{label}</span>;
    return (
      <ConfirmButton
        className={big ? "btn pri lg" : "btn sm"}
        label={sending === l.id ? "Sending…" : label}
        confirm={`Send to ${l.leader_paddle ? `paddle ${l.leader_paddle}` : "this winner"} for ${money(l.current_bid ?? 0)}? Tap again`}
        disabled={busy || !!sending}
        onConfirm={() => sendInvoice(l)}
      />
    );
  }

  /** Same timer for every lot in this auction that hasn't started yet. */
  async function timerForAll(seconds: number) {
    setNote(null);
    if (IS_PREVIEW) return setNote({ ok: false, text: "Preview mode: connect Supabase to change the timer." });
    setBusy(true);
    const r = await setAuctionTimer(auction.id, seconds).catch(() => ({ ok: false, message: "Couldn’t save the timer." }));
    setBusy(false);
    await refresh();
    setNote({ ok: r.ok, text: r.ok ? `Every lot that hasn’t started now runs for ${timerLabel(seconds)}.` : r.message });
  }

  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) return;
    setNote(null);
    if (IS_PREVIEW || !sb) return setNote({ ok: false, text: "Preview mode: connect Supabase to record bids." });
    const v = who.trim();
    const paddle = /^\d+$/.test(v) ? Number(v) : null;
    const ig = paddle ? null : normIg(v);
    if (!paddle && !ig) return setNote({ ok: false, text: ERR.bidder_required });
    const amt = parseAmount(amount);
    setBusy(true);
    const { data: r, error } = await sb.rpc("staff_record_bid", { p_lot_id: sel.id, p_amount: amt, p_paddle: paddle, p_ig: ig, p_via: via, p_kind: kind });
    setBusy(false);
    if (error) return setNote({ ok: false, text: explain(error.message) });
    const res = r as { price: number; leader_paddle: number | null; bid_count: number; pure: boolean; leading: boolean; added: number };
    patchLot({ id: sel.id, current_bid: res.price, leader_paddle: res.leader_paddle, bid_count: res.bid_count });
    setNote({
      ok: res.leading || kind === "max",
      text: kind === "max" && !res.added ? `Max bid saved. Price stays ${money(res.price)}.` : res.leading ? `${money(res.price)} · ${v.startsWith("@") || ig ? "@" + ig : "paddle " + paddle} leads${res.pure && !isPure(sel) ? " · PURE SALE" : ""}` : `Recorded, but a website max bid answered. ${money(res.price)} now.`
    });
    setWho("");
    setKind("bid");
    loadData();
    whoRef.current?.focus();
  }

  const nexts = upNext(lots, blockLot, 1);
  const blockSt = blockLot ? statusOf(blockLot) : null;
  const liveOther = lots.find(l => statusOf(l) === "live");
  const pv = blockLot ? priv.get(blockLot.id) : undefined;

  return (
    <div className="stack" style={{ gap: 22 }}>
      {note ? <p className={`alert ${note.ok ? "ok" : ""}`} role="status">{note.text}</p> : null}
      <div className="console">
        <div className="stack">
          <div className="panel-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="k">On the block</span>
              {blockLot ? <span className={`pill st-${blockSt}`}>{blockSt}</span> : null}
            </div>
            {blockLot && blockSt ? (
              <>
                <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
                  <div style={{ width: 96, flex: "none", aspectRatio: "1", background: "var(--tint)", border: "2px solid var(--ink)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                    <WatchArt lot={blockLot} prefix="cs" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 22, lineHeight: 1.15 }}>Lot {pad2(blockLot.lot_number)} · {blockLot.brand} {blockLot.model}</b>
                    <div className="ref">{blockLot.reference}</div>
                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                      {isPure(blockLot) ? <span className="pill pure">{blockLot.no_reserve ? "No reserve" : "Pure sale"}</span> : <span className="pill">Reserve not met</span>}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <span className="k">{blockLot.current_bid == null ? "Starting bid" : isClosedStatus(blockSt) ? "Final bid" : "Current bid"}</span>
                    <span className="num" style={{ fontSize: 40, lineHeight: 1 }}>{money(blockLot.current_bid ?? blockLot.start_price)}</span>
                    <div className="fine">{leaderText(blockLot)}</div>
                  </div>
                  <div style={{ textAlign: "end" }}>
                    <span className="k">Reserve · private</span>
                    <b className="num">{blockLot.no_reserve ? "None" : pv?.reserve ? num(pv.reserve) : IS_PREVIEW ? "—" : "NOT SET"}</b>
                    <div className="fine">{maxes(blockLot.id).map(m => `#${m.paddle} max ${num(m.amount)}`).join(", ") || "No max bids"}</div>
                  </div>
                </div>
                <TimerBox locale="en" lot={blockLot} status={blockSt} />
                {blockSt === "block" ? (
                  <div className="timer-set">
                    <span className="k">Timer for this lot</span>
                    <TimerPicker
                      key={`${blockLot.id}-${timerFor(blockLot)}`}
                      label="Timer for this lot"
                      value={timerFor(blockLot)}
                      applyButton
                      disabled={busy}
                      onChange={s => s && s !== timerFor(blockLot) && lotAction(blockLot, "set_timer", `Lot ${pad2(blockLot.lot_number)} will run for ${timerLabel(s)}.`, s)}
                    />
                    {timerFor(blockLot) !== timerSeconds ? (
                      <button className="btn sm" type="button" disabled={busy} onClick={() => timerForAll(timerFor(blockLot))}>Use {timerLabel(timerFor(blockLot))} for all remaining lots</button>
                    ) : (
                      <span className="fine">Same as the auction timer ({timerLabel(timerSeconds)}).</span>
                    )}
                  </div>
                ) : null}
                <div className="row">
                  {blockSt === "block" ? <button className="btn pri lg" type="button" disabled={busy} onClick={() => lotAction(blockLot, "start", "Timer running.")}>Start timer</button> : null}
                  {blockSt === "live" ? (
                    <>
                      <ConfirmButton className="btn" label="Restart timer" confirm="Restart from the top?" onConfirm={() => lotAction(blockLot, "restart", "Timer restarted.")} />
                      <ConfirmButton className="btn" label="Stop timer" confirm="Stop the timer?" onConfirm={() => lotAction(blockLot, "stop", "Timer stopped. The lot is still on the block.")} />
                    </>
                  ) : null}
                  {blockSt === "block" || blockSt === "live" ? (
                    <ConfirmButton className="btn danger" label="Hammer now" confirm={`Sell now at ${blockLot.current_bid == null ? "no bids" : num(blockLot.current_bid)}?`} onConfirm={() => lotAction(blockLot, "hammer", "Lot closed. Check for missed bids, then press Send invoice.")} />
                  ) : null}
                  {!isPure(blockLot) && !isClosedStatus(blockSt) ? (
                    <ConfirmButton className="btn" label="Make pure sale" confirm="Sell whatever the price?" onConfirm={() => lotAction(blockLot, "pure", "Now a pure sale.")} />
                  ) : null}
                  {blockSt === "sold" ? invoiceButton(blockLot, true) : null}
                  {isClosedStatus(blockSt) ? (
                    <>
                      {nexts[0] ? <button className="btn pri lg" type="button" disabled={busy} onClick={() => { setSelId(null); lotAction(nexts[0], "block", `Lot ${pad2(nexts[0].lot_number)} is on the block.`); }}>Next: lot {pad2(nexts[0].lot_number)}</button> : null}
                      <ConfirmButton className="btn" label="Reopen lot" confirm="Only if a bid arrived before 0:00. Reopen?" onConfirm={() => lotAction(blockLot, "reopen", "Reopened. Record the missed bid, then start or hammer.")} />
                    </>
                  ) : null}
                  {blockSt !== "live" ? <ConfirmButton className="btn sm" label="Clear the block" confirm="Hide the live panel on the site?" onConfirm={() => lotAction(blockLot, "clear", "Block cleared.")} /> : null}
                </div>
                {blockSt === "sold" ? (
                  <p className="alert info">
                    Sold {winnerLine(blockLot)}. Check Instagram for any bid that arrived before 0:00 and isn’t typed in yet.
                    If there is one, press Reopen. If not, press Send invoice (you can also send it later from the list on the right).
                    {invoices.get(blockLot.id)?.notify_error && !invoices.get(blockLot.id)?.notified_at ? ` Last try: ${invoices.get(blockLot.id)!.notify_error}` : ""}
                  </p>
                ) : (
                  <p className="fine">
                    {blockSt === "block" ? "Press Start at the same moment you start the timer on Instagram." : blockSt === "live" ? "Type in every bid that reaches you before 0:00." : "Reopen only to add a bid that arrived before 0:00, then hammer again."}
                  </p>
                )}
              </>
            ) : (
              <>
                <p>Nothing on the block. When the live starts, put the first lot up: it shows large at the top of the website for everyone.</p>
                {nexts[0] ? <button className="btn pri lg" type="button" disabled={busy} onClick={() => lotAction(nexts[0], "block", `Lot ${pad2(nexts[0].lot_number)} is on the block.`)}>Put lot {pad2(nexts[0].lot_number)} on the block</button> : null}
              </>
            )}
          </div>

          <div className="panel-card">
            <span className="k">All lots · tap to select, then record bids or put it on the block</span>
            <div className="lotstrip">
              {lots.map(l => {
                const st = statusOf(l);
                return (
                  <button key={l.id} type="button" className={`st-${st}`} aria-pressed={sel?.id === l.id} onClick={() => setSelId(l.id)}>
                    <b>{pad2(l.lot_number)}</b>
                    <span>{l.brand} {l.model}</span>
                    <span>{l.current_bid == null ? `start ${num(l.start_price)}` : num(l.current_bid)}</span>
                  </button>
                );
              })}
            </div>
            {sel && sel.id !== blockLot?.id && !sel.ends_at ? (
              <div className="row">
                <button className="btn" type="button" disabled={busy || !!liveOther} onClick={() => lotAction(sel, "block", `Lot ${pad2(sel.lot_number)} is on the block.`)}>
                  Put lot {pad2(sel.lot_number)} on the block
                </button>
                {liveOther ? <span className="fine">Lot {pad2(liveOther.lot_number)} is live.</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="stack">
          {sel ? (
            <form className="panel-card" onSubmit={record} autoComplete="off">
              <span className="k">Record a bid · Lot {pad2(sel.lot_number)} · {sel.brand} {sel.model}</span>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label className="field">Bidder
                  <input ref={whoRef} value={who} onChange={e => setWho(e.target.value)} placeholder="104 or @handle" autoFocus />
                </label>
                <label className="field">Amount (AED)
                  <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" className="num" />
                </label>
              </div>
              <p className="fine">{whoHint()}</p>
              <div className="row" style={{ gap: 6 }}>
                {bidLadder(sel, 4).map(a => (
                  <button key={a} type="button" className="btn sm mono" onClick={() => setAmount(String(a))}>{num(a)}</button>
                ))}
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label className="field">Received via
                  <select value={via} onChange={e => setVia(e.target.value)}>
                    <option value="instagram">Instagram</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In person</option>
                  </select>
                </label>
                <label className="field">Type
                  <select value={kind} onChange={e => setKind(e.target.value as "bid" | "max")}>
                    <option value="bid">Bid at this amount</option>
                    <option value="max">Max bid (absentee)</option>
                  </select>
                </label>
              </div>
              <p className="fine">
                Any amount from <b>{money(minBid(sel))}</b> · usual step {money(nextMinBid(sel))} · {leaderText(sel)}
                {isClosedStatus(statusOf(sel)) ? " · CLOSED" : ""}
              </p>
              <button className="btn pri lg" type="submit" disabled={busy || isClosedStatus(statusOf(sel))}>Record bid</button>
            </form>
          ) : null}

          {unsent.length ? (
            <div className="panel-card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="k">Sold · invoice not sent yet · {unsent.length}</span>
                {unsent.length > 1 ? (
                  <ConfirmButton className="btn sm" label={`Send all ${unsent.length}`} confirm={`Send ${unsent.length} invoices now? Tap again`} disabled={busy || !!sending} onConfirm={sendAll} />
                ) : null}
              </div>
              <div className="tbl-wrap">
                <table>
                  <tbody>
                    {unsent.map(l => (
                      <tr key={l.id}>
                        <td className="mono"><b>{pad2(l.lot_number)}</b></td>
                        <td>{l.brand} {l.model}<div className="fine">{winnerLine(l)}</div></td>
                        <td style={{ textAlign: "end" }}>{invoiceButton(l)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="fine">Nothing is sent until you press Send invoice. Reopen a lot first if a bid before 0:00 was missed.</p>
            </div>
          ) : null}

          {sel ? (
            <div className="panel-card">
              <span className="k">Bids on lot {pad2(sel.lot_number)} · {sel.bid_count}</span>
              {feed.length ? (
                <div className="tbl-wrap feed">
                  <table>
                    <tbody>
                      {feed.map(b => (
                        <tr key={b.id}>
                          <td className="mono">{timeOf(b.at)}</td>
                          <td className="n"><b>{num(b.amount)}</b></td>
                          <td>{b.paddle ? `#${b.paddle} ${b.name}` : `@${b.ig}`}</td>
                          <td className="dim">{b.auto ? "max bid" : b.via}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="fine">{IS_PREVIEW ? "Preview mode." : "No bids yet."}</p>}
              <p className="fine">Max bids: {maxes(sel.id).map(m => `#${m.paddle} ${m.name} up to ${num(m.amount)}`).join("; ") || "none"}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
