"use client";
// Back office forms, part 2: sellers and payouts, intake, card links, auction settings.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Msg, useAction } from "@/components/admin/ui";
import {
  addIntakeLines, addToAuction, createCardLink, markSellerPaid, newIntake, recordSettlement, saveAuctionOffice, saveIntakeItem, savePastedLink, saveSeller,
  type IntakeLine, type SellerInput, type SettlementInput
} from "@/app/(admin)/admin/office/actions2";
import { BOX_PAPERS, CONDITIONS, type MessageOverrides, type OfficeSettings } from "@/lib/office/types";
import { Wording, cardLinkMessage, type Code } from "@/lib/office/messages";
import { poolAt, settleCash, type SettleLot } from "@/lib/office/engine";
import { WaButton } from "./Wa";

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);

export const blankSeller = (): SellerInput => ({ code: "", name: "", kind: "consignment", phone: "", instagram: "", email: "", id_checked: "", fee_pct: "", fee_fixed: "", bank: "", iban: "", notes: "" });

function SellerFields({ v, set, isNew }: { v: SellerInput; set: (v: SellerInput) => void; isNew: boolean }) {
  const f = (k: keyof SellerInput) => ({ value: (v[k] as string) || "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...v, [k]: e.target.value }) });
  return (
    <div className="form-grid tight">
      {isNew ? <label className="field">Seller ID (blank = next)<input placeholder="S004" {...f("code")} /></label> : null}
      <label className="field">Name<input required {...f("name")} /></label>
      <label className="field">Type<select {...f("kind")}><option value="consignment">Consignment</option><option value="own">Own stock</option></select></label>
      <label className="field">WhatsApp number<input inputMode="tel" placeholder="+971 50 123 4567" {...f("phone")} /></label>
      <label className="field">Instagram<input {...f("instagram")} /></label>
      <label className="field">Email<input type="email" {...f("email")} /></label>
      <label className="field">ID checked (what was seen)<input placeholder="Emirates ID" {...f("id_checked")} /></label>
      <label className="field">Fee % (blank = default)<input inputMode="decimal" {...f("fee_pct")} /></label>
      <label className="field">Fixed fee per sold lot (AED)<input inputMode="decimal" {...f("fee_fixed")} /></label>
      <label className="field">Bank<input {...f("bank")} /></label>
      <label className="field">IBAN (for payouts)<input {...f("iban")} /></label>
      <label className="field wide">Notes<input {...f("notes")} /></label>
    </div>
  );
}

export function SellerForm({ value, onSaved }: { value: SellerInput; onSaved?: (code: string) => void }) {
  const [v, setV] = useState(value);
  const { pending, msg, run } = useAction();
  return (
    <form
      className="stack"
      style={{ gap: 10 }}
      onSubmit={e => {
        e.preventDefault();
        run(() => saveSeller(v), r => r.ok && !v.id && r.id && onSaved?.(r.id));
      }}
    >
      <SellerFields v={v} set={setV} isNew={!v.id} />
      <div className="row"><button className="btn pri" disabled={pending}>{pending ? "Saving…" : v.id ? "Save seller" : "Add seller"}</button></div>
      <Msg r={msg} />
    </form>
  );
}

export function NewSeller() {
  const router = useRouter();
  return (
    <details className="panel-card">
      <summary><strong>Add a seller</strong></summary>
      <SellerForm value={blankSeller()} onSaved={code => router.push(`/admin/office/sellers/${code}`)} />
    </details>
  );
}

export type PayoutLot = { id: string; key: string; watch: string; net: number; invoice: string; state: string; settle: SettleLot | null };

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * Tick the lots you've settled with the seller, then mark them paid. Money the seller holds for us (buyers who paid them
 * directly, for any lot) comes off the amount; if it's more than what's owed, the seller pays us the difference.
 */
export function PayoutForm({ lots, accounts = [], defaultAccount = "" }: { lots: PayoutLot[]; held?: number; accounts?: { code: string; name: string }[]; defaultAccount?: string }) {
  const [pick, setPick] = useState<string[]>(lots.filter(l => l.state === "Due to seller" || l.state === "Seller owes us").map(l => l.id));
  const [date, setDate] = useState(today());
  const [ref, setRef] = useState("");
  const [account, setAccount] = useState(defaultAccount);
  const [takeOff, setTakeOff] = useState(true);
  const { pending, msg, run } = useAction();
  const chosen = lots.filter(l => pick.includes(l.id));
  const settles = chosen.map(l => l.settle).filter((x): x is SettleLot => !!x);
  const cash = settleCash(settles, date, takeOff);
  const total = Math.round(chosen.reduce((t, l) => t + (cash.get(l.id) ?? l.net), 0) * 100) / 100;
  // what the seller holds of ours on the payout date, and their own buyers' money for the ticked lots
  const pool = lots[0]?.settle ? poolAt(lots[0].settle.pool, date) : 0;
  const own = Math.round(settles.reduce((t, x) => t + (!x.ownOn || x.ownOn <= date ? x.own : 0), 0) * 100) / 100;
  const netting = Math.abs(pool) > 0.005 || own > 0.005 || lots.some(l => (l.settle?.own || 0) > 0.005);
  if (!lots.length) return <p className="fine">No sold lots waiting to be settled with this seller.</p>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {netting ? (
        <div className="alert info">
          {own > 0.005 ? <p>Buyers already paid this seller <b>AED {money(own)}</b> of the ticked lots&apos; share directly: that part isn&apos;t paid again.</p> : null}
          {pool > 0.005 ? <p>By {date} they also hold <b>AED {money(pool)}</b> of ours (from buyers who paid them more than their share: our fee, delivery or other watches). It comes off below.</p>
            : pool < -0.005 ? <p>We owe this seller <b>AED {money(-pool)}</b> on top of their lots (on account). It&apos;s added below.</p> : null}
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={takeOff} onChange={e => setTakeOff(e.target.checked)} />
            Take it off this payout (untick if you paid them their full share, e.g. a payment made before a buyer paid them)
          </label>
        </div>
      ) : null}
      <div className="tbl-wrap">
        <table>
          <thead><tr><th /><th>Lot</th><th>Watch</th><th>Invoice</th><th className="n">Net</th>{netting ? <th className="n">To settle</th> : null}<th>State</th></tr></thead>
          <tbody>
            {lots.map(l => (
              <tr key={l.id}>
                <td><input type="checkbox" checked={pick.includes(l.id)} onChange={e => setPick(e.target.checked ? [...pick, l.id] : pick.filter(x => x !== l.id))} aria-label={`Paid lot ${l.key}`} /></td>
                <td className="mono">{l.key}</td>
                <td>{l.watch}</td>
                <td className="mono">{l.invoice}</td>
                <td className="n">{money(l.net)}</td>
                {netting ? <td className="n">{pick.includes(l.id) ? money(cash.get(l.id) ?? l.net) : ""}</td> : null}
                <td className={l.state === "Due to seller" ? "ok-ink" : l.state === "Seller owes us" ? "warn-ink" : "fine"}>{l.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inline-form">
        <label className="k">Paid on</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input placeholder="Transfer reference" value={ref} onChange={e => setRef(e.target.value)} />
        {accounts.length ? (
          <select value={account} onChange={e => setAccount(e.target.value)} aria-label={total < 0 ? "Received into" : "Paid from"}>
            {accounts.map(a => <option key={a.code} value={a.code}>{total < 0 ? "Received into" : "Paid from"} {a.code} · {a.name}</option>)}
          </select>
        ) : null}
        <button type="button" className="btn pri" disabled={pending || !pick.length} onClick={() => run(() => markSellerPaid({ lotIds: pick, date, ref, account: accounts.length ? account : undefined, takeOff }))}>
          {total < 0 ? `Mark ${pick.length} settled · seller paid us AED ${money(-total)}` : `Mark ${pick.length} paid · AED ${money(total)}`}
        </button>
      </div>
      <p className="fine">
        Lots marked &ldquo;Wait&rdquo; haven&apos;t been paid for by the buyer yet. Only money buyers paid the seller by the &ldquo;Paid on&rdquo; date is taken off.
        {netting ? " Ticking only some lots: each stays at 0 or more, and what's left of the money they hold comes off the next payout." : ""}
      </p>
      <Msg r={msg} />
    </div>
  );
}

export type AuctionPayoutSeller = { id: string; code: string; name: string; lots: { id: string; key: string; net: number; waiting: boolean; settle: SettleLot | null }[] };

/**
 * Every consignor of one auction at once: tick the sellers you've paid (or paid before the back office), choose the date
 * and the account it was paid from, and mark them all. Each seller's money held from buyers comes off, as on their page.
 */
export function AuctionPayoutForm({ sellers, accounts = [], defaultAccount = "" }: { sellers: AuctionPayoutSeller[]; accounts?: { code: string; name: string }[]; defaultAccount?: string }) {
  const [pick, setPick] = useState<string[]>(sellers.map(x => x.id));
  const [date, setDate] = useState(today());
  const [ref, setRef] = useState("");
  const [account, setAccount] = useState(defaultAccount || accounts[0]?.code || "");
  const [takeOff, setTakeOff] = useState(true);
  const { pending, msg, run } = useAction();
  const cashOf = (x: AuctionPayoutSeller) => {
    const c = settleCash(x.lots.map(l => l.settle).filter((v): v is SettleLot => !!v), date, takeOff);
    return Math.round(x.lots.reduce((t, l) => t + (c.get(l.id) ?? l.net), 0) * 100) / 100;
  };
  const chosen = sellers.filter(x => pick.includes(x.id));
  const total = Math.round(chosen.reduce((t, x) => t + cashOf(x), 0) * 100) / 100;
  const lotIds = chosen.flatMap(x => x.lots.map(l => l.id));
  const waiting = chosen.reduce((t, x) => t + x.lots.filter(l => l.waiting).length, 0);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th /><th>Seller</th><th>Lots</th><th className="n">Their share</th><th className="n">To pay now</th><th /></tr></thead>
          <tbody>
            {sellers.map(x => {
              const share = Math.round(x.lots.reduce((t, l) => t + l.net, 0) * 100) / 100;
              const cash = cashOf(x);
              const w = x.lots.filter(l => l.waiting).length;
              return (
                <tr key={x.id}>
                  <td><input type="checkbox" checked={pick.includes(x.id)} onChange={e => setPick(e.target.checked ? [...pick, x.id] : pick.filter(v => v !== x.id))} aria-label={`Paid ${x.code}`} /></td>
                  <td><b>{x.code}</b> <span className="fine">{x.name}</span></td>
                  <td className="mono">{x.lots.map(l => l.key).join(", ")}</td>
                  <td className="n">{money(share)}</td>
                  <td className="n"><b>{cash < 0 ? `they pay us ${money(-cash)}` : money(cash)}</b>{Math.abs(share - cash) > 0.005 ? <small className="sub">{money(share - cash)} already paid to them by buyers</small> : null}</td>
                  <td className="fine">{w ? `${w} buyer${w === 1 ? " hasn't" : "s haven't"} paid (in the system)` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" checked={takeOff} onChange={e => setTakeOff(e.target.checked)} />
        <span>Take off money buyers paid the sellers directly by the &ldquo;Paid on&rdquo; date. Untick if you paid each seller their full share (for example, paid before any buyer paid them).</span>
      </label>
      <div className="inline-form">
        <label className="k">Paid on</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input placeholder="Reference (optional)" value={ref} onChange={e => setRef(e.target.value)} />
        {accounts.length ? (
          <select value={account} onChange={e => setAccount(e.target.value)} aria-label="Paid from">
            {accounts.map(a => <option key={a.code} value={a.code}>Paid from {a.code} · {a.name}</option>)}
          </select>
        ) : null}
        <button
          type="button"
          className="btn pri"
          disabled={pending || !chosen.length}
          onClick={() => {
            if (waiting && !window.confirm(`${waiting} of these watches' buyers haven't paid yet (in the system). Mark their sellers paid anyway?\n\nIf those buyers did pay, record their payments on Invoices too.`)) return;
            run(() => markSellerPaid({ lotIds, date, ref, account: accounts.length ? account : undefined, takeOff }));
          }}
        >
          {pending ? "Saving…" : `Mark ${chosen.length} seller${chosen.length === 1 ? "" : "s"} paid · AED ${money(total)}`}
        </button>
      </div>
      <p className="fine">The payments are booked in Accounting on that date, from the account chosen (owed to consignors goes down, the bank or cash goes down). Marked with the wrong date or amount? Use <b>Undo</b> under &ldquo;Already marked paid&rdquo; and mark them again.</p>
      <Msg r={msg} />
    </div>
  );
}

/** Settle up outside a lot payout: the seller pays us back what buyers paid them for others, or we pay them on account. */
export function SettlementForm({ sellerId, owed, accounts = [], defaultAccount = "" }: { sellerId: string; owed: number; accounts?: { code: string; name: string }[]; defaultAccount?: string }) {
  const [v, setV] = useState<SettlementInput>({
    seller_id: sellerId, direction: owed < 0 ? "paid_us" : "we_paid", amount: owed ? String(Math.abs(owed)) : "", date: today(), account: defaultAccount, reference: "", notes: ""
  });
  const { pending, msg, run } = useAction();
  const f = (k: keyof SettlementInput) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={e => { e.preventDefault(); run(() => recordSettlement(v)); }}>
      <div className="form-grid tight">
        <label className="field">What happened
          <select {...f("direction")}>
            <option value="paid_us">The seller paid us</option>
            <option value="we_paid">We paid the seller (on account)</option>
          </select>
        </label>
        <label className="field">Amount (AED)<input required inputMode="decimal" {...f("amount")} /></label>
        <label className="field">Date<input type="date" {...f("date")} /></label>
        {accounts.length ? (
          <label className="field">{v.direction === "paid_us" ? "Received into" : "Paid from"}
            <select {...f("account")}>{accounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select>
          </label>
        ) : null}
        <label className="field">Reference<input {...f("reference")} /></label>
        <label className="field wide">Notes<input placeholder="e.g. what buyer B0012 paid them for lot 101-07" {...f("notes")} /></label>
      </div>
      <div className="row"><button className="btn pri" disabled={pending}>{pending ? "Saving…" : "Record"}</button></div>
      <Msg r={msg} />
    </form>
  );
}

// ───────────────────────────── intake ─────────────────────────────

const blankLine = (): IntakeLine => ({ brand: "", model: "", reference: "", serial: "", year: "", box_papers: "", condition: "", notes: "", reserve: "", start_price: "", fee_pct: "", fee_fixed: "" });

function Lines({ lines, set }: { lines: IntakeLine[]; set: (l: IntakeLine[]) => void }) {
  const up = (i: number, k: keyof IntakeLine, val: string) => set(lines.map((l, j) => (j === i ? { ...l, [k]: val } : l)));
  return (
    <div className="tbl-wrap">
      <table className="lgrid">
        <thead>
          <tr><th>#</th><th>Brand</th><th>Model / description</th><th>Reference</th><th>Serial no.</th><th>Year</th><th>Box &amp; papers</th><th>Condition</th><th>Notes (marks, extras)</th><th>Reserve</th><th>Start</th><th>Fee %</th><th>Fixed fee</th><th /></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="mono">{i + 1}</td>
              <td><input value={l.brand} onChange={e => up(i, "brand", e.target.value)} aria-label="Brand" /></td>
              <td><input value={l.model} onChange={e => up(i, "model", e.target.value)} aria-label="Model" style={{ minWidth: 150 }} /></td>
              <td><input value={l.reference} onChange={e => up(i, "reference", e.target.value)} aria-label="Reference" /></td>
              <td><input value={l.serial} onChange={e => up(i, "serial", e.target.value)} aria-label="Serial" /></td>
              <td><input value={l.year} onChange={e => up(i, "year", e.target.value)} aria-label="Year" style={{ width: 60 }} /></td>
              <td><select value={l.box_papers} onChange={e => up(i, "box_papers", e.target.value)} aria-label="Box and papers"><option value="" />{BOX_PAPERS.map(o => <option key={o}>{o}</option>)}</select></td>
              <td><select value={l.condition} onChange={e => up(i, "condition", e.target.value)} aria-label="Condition"><option value="" />{CONDITIONS.map(o => <option key={o}>{o}</option>)}</select></td>
              <td><input value={l.notes} onChange={e => up(i, "notes", e.target.value)} aria-label="Notes" style={{ minWidth: 140 }} /></td>
              <td className="n"><input inputMode="decimal" value={l.reserve} onChange={e => up(i, "reserve", e.target.value)} aria-label="Reserve" style={{ width: 80 }} /></td>
              <td className="n"><input inputMode="decimal" value={l.start_price} onChange={e => up(i, "start_price", e.target.value)} aria-label="Start price" style={{ width: 80 }} /></td>
              <td className="n"><input inputMode="decimal" value={l.fee_pct} placeholder="seller's" onChange={e => up(i, "fee_pct", e.target.value)} aria-label="Fee %" style={{ width: 64 }} /></td>
              <td className="n"><input inputMode="decimal" value={l.fee_fixed} placeholder="seller's" onChange={e => up(i, "fee_fixed", e.target.value)} aria-label="Fixed fee" style={{ width: 70 }} /></td>
              <td>{lines.length > 1 ? <button type="button" className="btn sm" onClick={() => set(lines.filter((_, j) => j !== i))} aria-label="Remove row">×</button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** NEW INTAKE: choose (or add) the seller, type the watches, get a receipt number. */
export function IntakeForm({ sellers }: { sellers: { id: string; label: string }[] }) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState("");
  const [ns, setNs] = useState<SellerInput>(blankSeller());
  const [date, setDate] = useState(today());
  const [by, setBy] = useState("");
  const [idc, setIdc] = useState("");
  const [lines, setLines] = useState<IntakeLine[]>([blankLine(), blankLine(), blankLine()]);
  const { pending, msg, run } = useAction();
  const isNew = sellerId === "new";
  return (
    <form
      className="stack"
      style={{ gap: 12 }}
      onSubmit={e => {
        e.preventDefault();
        run(
          () => newIntake({ seller_id: isNew ? "" : sellerId, newSeller: isNew ? ns : undefined, received_on: date, received_by: by, id_checked: idc, lines }),
          r => r.ok && r.id && router.push(`/admin/office/intake/${r.id}`)
        );
      }}
    >
      <div className="form-grid tight">
        <label className="field">Seller
          <select required value={sellerId} onChange={e => setSellerId(e.target.value)}>
            <option value="">Choose…</option>
            <option value="new">+ New seller</option>
            {sellers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">Date received<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field">Received by<input value={by} onChange={e => setBy(e.target.value)} placeholder="Your name" /></label>
        <label className="field">ID checked (what was seen)<input value={idc} onChange={e => setIdc(e.target.value)} placeholder="Emirates ID / passport" /></label>
      </div>
      {isNew ? (
        <div className="panel-card private">
          <span className="k">New seller</span>
          <SellerFields v={ns} set={setNs} isNew />
        </div>
      ) : null}
      <Lines lines={lines} set={setLines} />
      <div className="row">
        <button type="button" className="btn" onClick={() => setLines([...lines, blankLine()])}>+ Another watch</button>
        <button className="btn pri" disabled={pending}>{pending ? "Saving…" : "Save and show the receipt"}</button>
        <span className="fine">Empty rows are ignored.</span>
      </div>
      <Msg r={msg} />
    </form>
  );
}

export function AddLines({ receipt }: { receipt: string }) {
  const [lines, setLines] = useState<IntakeLine[]>([blankLine()]);
  const { pending, msg, run } = useAction();
  return (
    <details className="panel-card no-print">
      <summary><strong>Add watches to this receipt</strong></summary>
      <Lines lines={lines} set={setLines} />
      <div className="row">
        <button type="button" className="btn" onClick={() => setLines([...lines, blankLine()])}>+ Another watch</button>
        <button type="button" className="btn pri" disabled={pending} onClick={() => run(() => addIntakeLines({ receipt_no: receipt, lines }), r => r.ok && setLines([blankLine()]))}>Add</button>
      </div>
      <Msg r={msg} />
    </details>
  );
}

export type IntakeRow = {
  id: string; item_id: string; receipt: string; seller: string; watch: string; serial: string; reserve: number | null; status: string; lot: string;
  line: IntakeLine; returned_on: string; inStock: boolean;
};

/** Intake rows with ticks: ADD TO AUCTION, and edit a watch's details. */
export function IntakeTable({ rows, auctions, showReceipt = true }: { rows: IntakeRow[]; auctions: { id: string; label: string }[]; showReceipt?: boolean }) {
  const [pick, setPick] = useState<string[]>([]);
  const [auction, setAuction] = useState(auctions[0]?.id || "");
  const [edit, setEdit] = useState<IntakeRow | null>(null);
  const { pending, msg, run } = useAction();
  const stock = useMemo(() => rows.filter(r => r.inStock), [rows]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="inline-form no-print">
        <button type="button" className="btn sm" onClick={() => setPick(pick.length ? [] : stock.map(r => r.id))}>{pick.length ? "Clear ticks" : `Tick all in stock (${stock.length})`}</button>
        <select value={auction} onChange={e => setAuction(e.target.value)} aria-label="Auction">{auctions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        <button type="button" className="btn pri sm" disabled={pending || !pick.length || !auction} onClick={() => run(() => addToAuction({ itemIds: pick, auctionId: auction }), r => r.ok && setPick([]))}>
          Add {pick.length || ""} to auction
        </button>
      </div>
      <Msg r={msg} />
      <div className="tbl-wrap">
        <table>
          <thead><tr><th /><th>Item</th>{showReceipt ? <th>Receipt</th> : null}<th>Seller</th><th>Watch</th><th>Serial</th><th className="n">Reserve</th><th>Status</th><th>Lot</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.inStock ? <input type="checkbox" checked={pick.includes(r.id)} onChange={e => setPick(e.target.checked ? [...pick, r.id] : pick.filter(x => x !== r.id))} aria-label={`Choose ${r.item_id}`} /> : null}</td>
                <td className="mono">{r.item_id}</td>
                {showReceipt ? <td className="mono"><a href={`/admin/office/intake/${r.receipt}`}>{r.receipt}</a></td> : null}
                <td>{r.seller}</td>
                <td>{r.watch}</td>
                <td className="mono">{r.serial}</td>
                <td className="n">{r.reserve ? r.reserve.toLocaleString("en-US") : ""}</td>
                <td>{r.status}</td>
                <td className="mono">{r.lot}</td>
                <td><button type="button" className="btn sm" onClick={() => setEdit(r)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? <EditIntake row={edit} close={() => setEdit(null)} /> : null}
    </div>
  );
}

function EditIntake({ row, close }: { row: IntakeRow; close: () => void }) {
  const [line, setLine] = useState<IntakeLine>(row.line);
  const [ret, setRet] = useState(row.returned_on);
  const { pending, msg, run } = useAction();
  return (
    <div className="panel-card">
      <span className="k">Edit {row.item_id}</span>
      <Lines lines={[line]} set={l => setLine(l[0])} />
      <div className="inline-form">
        <label className="k">Returned to seller on</label>
        <input type="date" value={ret} onChange={e => setRet(e.target.value)} />
        <button type="button" className="btn pri" disabled={pending} onClick={() => run(() => saveIntakeItem({ id: row.id, line, returned_on: ret }), r => r.ok && close())}>Save</button>
        <button type="button" className="btn" onClick={close}>Cancel</button>
      </div>
      <p className="fine">Intake is the master record: change a reserve here before adding the watch to its next auction.</p>
      <Msg r={msg} />
    </div>
  );
}

// ───────────────────────────── card links ─────────────────────────────

/** SEND CARD LINK: makes a Ziina link for the exact amount, then opens WhatsApp with it typed in. */
export function CardLinkButton({
  kind, invoiceNo, lotIds, customerId, amount, ask, phone, name, code, lots, watch, nLots, due, settings, overrides, label = "Card link", className = "btn"
}: {
  kind: "Invoice" | "Lot" | "Deposit"; invoiceNo?: string; lotIds?: string[]; customerId?: string; amount?: number; ask?: boolean; phone: string; name: string; code: Code;
  lots: string; watch: string; nLots: number; due: number | null; settings: OfficeSettings; overrides: MessageOverrides; label?: string; className?: string;
}) {
  const [url, setUrl] = useState("");
  const [amt, setAmt] = useState(amount ? String(amount) : "");
  const { pending, msg, run } = useAction();
  const rate = (settings.card_fee_pct || 0) / 100;
  const typed = Number(String(amt).replace(/[^\d.]/g, "")) || 0;
  const cardAmount = Math.round((kind === "Deposit" ? typed : amount || 0) * (1 + rate) * 100) / 100;
  const text = url
    ? cardLinkMessage(new Wording(settings, overrides), { code, name, kind, invoice: invoiceNo || "", lots, watch, nLots, cardAmount, link: url, due, now: Date.now() })
    : "";
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        {ask ? <input inputMode="decimal" placeholder="Deposit (AED)" value={amt} onChange={e => setAmt(e.target.value)} style={{ width: 130 }} aria-label="Deposit amount" /> : null}
        <button type="button" className={className} disabled={pending || (ask && !typed)} onClick={() => run(() => createCardLink({ kind, invoice_no: invoiceNo, lot_ids: lotIds, customer_id: customerId, amount: amt }), r => r.ok && r.id && setUrl(r.id))}>
          {pending ? "Making the link…" : `${label}${cardAmount ? ` · AED ${cardAmount.toLocaleString("en-US")}` : ""}`}
        </button>
        {url ? (
          <WaButton label="Send link on WhatsApp" className="btn pri" phone={phone} text={text} mode={settings.wa_mode}
            log={{ ref: invoiceNo || "", name, total: cardAmount, balance: null, kind: kind === "Deposit" ? "Card link (deposit)" : `Card link (${kind.toLowerCase()})`, link: url }} />
        ) : null}
      </div>
      {url ? <p className="fine mono" style={{ wordBreak: "break-all" }}>{url}</p> : null}
      <Msg r={msg} />
    </div>
  );
}

/** Ziina not connected? Paste a link made in the Ziina app, so it's recorded with the invoice. */
export function PastedLink({ invoiceNo, cardAmount }: { invoiceNo: string; cardAmount: number }) {
  const [url, setUrl] = useState("");
  const { pending, msg, run } = useAction();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="inline-form">
        <input placeholder="Paste a Ziina link" value={url} onChange={e => setUrl(e.target.value)} style={{ minWidth: 220 }} />
        <button type="button" className="btn sm" disabled={pending || !url} onClick={() => run(() => savePastedLink({ invoice_no: invoiceNo, url, card_amount: String(cardAmount) }), r => r.ok && setUrl(""))}>Save link</button>
      </div>
      <Msg r={msg} />
    </div>
  );
}

// ───────────────────────────── auction settings ─────────────────────────────

export function AuctionOfficeForm({ id, pay_clock, lot_target, office_notes, defaultClock, defaultTarget }: { id: string; pay_clock: string; lot_target: string; office_notes: string; defaultClock: string; defaultTarget: number }) {
  const [v, setV] = useState({ id, pay_clock, lot_target, office_notes });
  const { pending, msg, run } = useAction();
  return (
    <form className="inline-form" onSubmit={e => { e.preventDefault(); run(() => saveAuctionOffice(v)); }}>
      <label className="k">Payment clock</label>
      <input type="time" value={v.pay_clock} placeholder={defaultClock} onChange={e => setV({ ...v, pay_clock: e.target.value })} title={`Blank = Settings (${defaultClock})`} />
      <label className="k">Lot target</label>
      <input inputMode="numeric" value={v.lot_target} placeholder={String(defaultTarget)} onChange={e => setV({ ...v, lot_target: e.target.value })} style={{ width: 70 }} />
      <input value={v.office_notes} placeholder="Notes" onChange={e => setV({ ...v, office_notes: e.target.value })} />
      <button className="btn sm" disabled={pending}>Save</button>
      <Msg r={msg} />
    </form>
  );
}
