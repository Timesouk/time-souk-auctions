"use client";
// Accounting forms: money in and out, opening balances, journal entries, the chart, settings and reconciliation.
import { useMemo, useState } from "react";
import { ConfirmButton, Msg, useAction } from "@/components/admin/ui";
import { postEntry, saveAccount, saveAcctSettings, saveReconciliation, setCleared, voidEntry, type LineInput } from "@/app/(admin)/admin/office/accounting/actions";
import type { Account, ManualKind } from "@/lib/office/types";

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const num = (v: string) => Number(String(v || "").replace(/[^\d.-]/g, "")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100 || 0;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Opt = { code: string; name: string; type: Account["type"]; subtype: string };

function AccountSelect({ value, onChange, options, label, placeholder = "Choose…" }: { value: string; onChange: (v: string) => void; options: Opt[]; label?: string; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
    </select>
  );
}

type Tab = "expense" | "purchase" | "income" | "transfer" | "owner";
const TABS: [Tab, string, string][] = [
  ["expense", "Expense", "Money out for running the business: ads, courier, rent, salaries, fees…"],
  ["purchase", "Stock bought", "A watch bought for own stock: it goes into stock at cost and becomes cost of sales when it sells."],
  ["income", "Other income", "Money in that isn't from an auction invoice."],
  ["transfer", "Transfer", "Money moved between your own accounts: a Ziina, Tabby or Tamara payout to the bank (with their fee), cash banked, the courier handing over cash on delivery."],
  ["owner", "Owners' money", "Money the owners put in or take out, or lend the business. (Admin)"]
];

/** Money in and out: each tab becomes one balanced entry. */
export function MoneyForm({ accounts, isAdmin }: { accounts: Opt[]; isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>("expense");
  const [date, setDate] = useState(today());
  const [payee, setPayee] = useState("");
  const [memo, setMemo] = useState("");
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState("");
  const [cat, setCat] = useState("");
  const [from, setFrom] = useState("1020");
  const [to, setTo] = useState("1020");
  const [fee, setFee] = useState("");
  const [feeAcct, setFeeAcct] = useState("6020");
  const [ownerKind, setOwnerKind] = useState<"in" | "out" | "loan" | "repay">("in");
  const { pending, msg, run } = useAction();

  const money = accounts.filter(a => a.type === "asset" && ["cash", "bank", "clearing"].includes(a.subtype));
  const payFrom = [...money, ...accounts.filter(a => a.code === "2010" || a.code === "2500")];
  const expenseCats = accounts.filter(a => (a.type === "expense" && a.code !== "5010") || ["1400", "1500"].includes(a.code));
  // auction income is journalled from invoices; these are for anything else
  const incomeCats = accounts.filter(a => a.type === "income" && !["4010", "4100", "4300", "4400", "4600"].includes(a.code));
  const fees = accounts.filter(a => a.type === "expense");

  const a = num(amount);
  const v = num(vat);
  const lines = (): LineInput[] => {
    switch (tab) {
      case "expense":
        return [
          { account_code: cat, debit: r2(a - v), credit: 0, memo },
          ...(v ? [{ account_code: "1300", debit: v, credit: 0, memo: "VAT" }] : []),
          { account_code: from, debit: 0, credit: a, memo: payee }
        ];
      case "purchase":
        return [
          { account_code: "1200", debit: r2(a - v), credit: 0, memo },
          ...(v ? [{ account_code: "1300", debit: v, credit: 0, memo: "VAT" }] : []),
          { account_code: from, debit: 0, credit: a, memo: payee }
        ];
      case "income":
        return [
          { account_code: to, debit: a, credit: 0, memo: payee },
          { account_code: cat || "4900", debit: 0, credit: r2(a - v), memo },
          ...(v ? [{ account_code: "2300", debit: 0, credit: v, memo: "VAT" }] : [])
        ];
      case "transfer": {
        const f = num(fee);
        return [
          { account_code: to, debit: r2(a - f), credit: 0, memo },
          ...(f ? [{ account_code: feeAcct, debit: f, credit: 0, memo: "Fee deducted" }] : []),
          { account_code: from, debit: 0, credit: a, memo }
        ];
      }
      case "owner":
        return ownerKind === "in"
          ? [{ account_code: to, debit: a, credit: 0, memo }, { account_code: "3010", debit: 0, credit: a, memo: payee }]
          : ownerKind === "out"
            ? [{ account_code: "3100", debit: a, credit: 0, memo: payee }, { account_code: from, debit: 0, credit: a, memo }]
            : ownerKind === "loan"
              ? [{ account_code: to, debit: a, credit: 0, memo }, { account_code: "2500", debit: 0, credit: a, memo: payee }]
              : [{ account_code: "2500", debit: a, credit: 0, memo: payee }, { account_code: from, debit: 0, credit: a, memo }];
    }
  };
  const missing = !a || (tab === "expense" && !cat) || (tab === "transfer" && from === to);
  const submit = () =>
    run(
      () => postEntry({ kind: tab, entry_date: date, memo: memo || TABS.find(t => t[0] === tab)![1], payee, reference: ref, lines: lines() }),
      r => {
        if (r.ok) {
          setAmount("");
          setVat("");
          setMemo("");
          setRef("");
          setFee("");
        }
      }
    );
  const tabs = TABS.filter(t => isAdmin || t[0] !== "owner");
  const desc = TABS.find(t => t[0] === tab)![2];
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="chips" role="tablist">
        {tabs.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <p className="fine">{desc}</p>
      <div className="form-grid tight">
        <label className="field">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        {tab === "owner" ? (
          <label className="field">What happened
            <select value={ownerKind} onChange={e => setOwnerKind(e.target.value as typeof ownerKind)}>
              <option value="in">An owner put money in (capital)</option>
              <option value="out">An owner took money out (drawings)</option>
              <option value="loan">An owner lent money to the business</option>
              <option value="repay">The business repaid an owner&apos;s loan</option>
            </select>
          </label>
        ) : null}
        <label className="field">{tab === "income" ? "From" : tab === "owner" ? "Which owner" : tab === "transfer" ? "Provider / note" : "Paid to"}<input value={payee} onChange={e => setPayee(e.target.value)} /></label>
        {tab === "expense" ? <label className="field">Category<AccountSelect value={cat} onChange={setCat} options={expenseCats} label="Category" /></label> : null}
        {tab === "income" ? <label className="field">Category<AccountSelect value={cat} onChange={setCat} options={incomeCats} label="Category" placeholder="4900 · Other income" /></label> : null}
        <label className="field">{tab === "transfer" ? "Amount sent (AED)" : "Amount (AED)"}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        {tab === "expense" || tab === "purchase" || tab === "income" ? (
          <label className="field">VAT inside it (AED)
            <input inputMode="decimal" value={vat} onChange={e => setVat(e.target.value)} placeholder="0" />
            {a ? <button type="button" className="linkbtn fine" onClick={() => setVat(String(r2((a * 5) / 105)))}>5% VAT included: {fmt(r2((a * 5) / 105))}</button> : null}
          </label>
        ) : null}
        {tab === "expense" || tab === "purchase" || tab === "transfer" || (tab === "owner" && (ownerKind === "out" || ownerKind === "repay")) ? (
          <label className="field">{tab === "transfer" ? "From" : "Paid from"}<AccountSelect value={from} onChange={setFrom} options={tab === "transfer" ? money : tab === "owner" ? money : payFrom} label="From" /></label>
        ) : null}
        {tab === "income" || tab === "transfer" || (tab === "owner" && (ownerKind === "in" || ownerKind === "loan")) ? (
          <label className="field">{tab === "transfer" ? "To" : "Into"}<AccountSelect value={to} onChange={setTo} options={money} label="To" /></label>
        ) : null}
        {tab === "transfer" ? (
          <>
            <label className="field">Fee deducted (AED)<input inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} placeholder="0" /></label>
            <label className="field">Fee account<AccountSelect value={feeAcct} onChange={setFeeAcct} options={fees} label="Fee account" /></label>
          </>
        ) : null}
        <label className="field">{tab === "purchase" ? "Watch (brand, model, ref.)" : "Description"}<input value={memo} onChange={e => setMemo(e.target.value)} /></label>
        <label className="field">Receipt / reference<input value={ref} onChange={e => setRef(e.target.value)} /></label>
      </div>
      {tab === "purchase" ? <p className="fine">Type the same cost on the watch&apos;s lot (Lots › Lot details › Cost) so its profit is right when it sells.</p> : null}
      {tab === "expense" && from === "2010" ? <p className="fine">Not paid yet: the amount is owed to the supplier (account 2010). When you pay it, the admin records a journal entry: debit 2010, credit the bank.</p> : null}
      {tab === "expense" && from === "2500" ? <p className="fine">Paid by an owner personally: the business now owes that owner (account 2500, loans from owners).</p> : null}
      <div className="row">
        <button type="button" className="btn pri" disabled={pending || missing} onClick={submit}>{pending ? "Saving…" : "Save to the books"}</button>
        {a ? <span className="fine">{lines().filter(l => num(String(l.debit)) || num(String(l.credit))).map(l => `${num(String(l.debit)) ? "Dr" : "Cr"} ${l.account_code} ${fmt(num(String(l.debit)) || num(String(l.credit)))}`).join(" · ")}</span> : null}
      </div>
      <Msg r={msg} />
    </div>
  );
}

type JLineInput = { account_code: string; debit: string; credit: string; memo: string };
const blankLine = (): JLineInput => ({ account_code: "", debit: "", credit: "", memo: "" });

/** A journal entry with any lines (admin): corrections, accruals, anything the other forms don't cover. */
export function JournalForm({ accounts, kind = "journal", preset }: { accounts: Opt[]; kind?: ManualKind; preset?: JLineInput[] }) {
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState(kind === "opening" ? "Opening balances" : "");
  const [ref, setRef] = useState("");
  const [lines, setLines] = useState<JLineInput[]>(preset || [blankLine(), blankLine()]);
  const { pending, msg, run } = useAction();
  const dr = r2(lines.reduce((t, l) => t + num(l.debit), 0));
  const cr = r2(lines.reduce((t, l) => t + num(l.credit), 0));
  const up = (i: number, k: keyof JLineInput, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="form-grid tight">
        <label className="field">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field wide">Description<input value={memo} onChange={e => setMemo(e.target.value)} /></label>
        <label className="field">Reference<input value={ref} onChange={e => setRef(e.target.value)} /></label>
      </div>
      <div className="tbl-wrap">
        <table className="lgrid">
          <thead><tr><th>Account</th><th className="n">Debit</th><th className="n">Credit</th><th>Line note</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ minWidth: 260 }}><AccountSelect value={l.account_code} onChange={v => up(i, "account_code", v)} options={accounts} label="Account" /></td>
                <td className="n"><input inputMode="decimal" value={l.debit} onChange={e => up(i, "debit", e.target.value)} aria-label="Debit" style={{ width: 110 }} /></td>
                <td className="n"><input inputMode="decimal" value={l.credit} onChange={e => up(i, "credit", e.target.value)} aria-label="Credit" style={{ width: 110 }} /></td>
                <td><input value={l.memo} onChange={e => up(i, "memo", e.target.value)} aria-label="Line note" /></td>
                <td>{lines.length > 2 ? <button type="button" className="btn sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">×</button> : null}</td>
              </tr>
            ))}
            <tr>
              <td><b>Totals</b></td>
              <td className="n"><b>{fmt(dr)}</b></td>
              <td className="n"><b>{fmt(cr)}</b></td>
              <td colSpan={2} className={Math.abs(dr - cr) < 0.005 && dr > 0 ? "ok-ink" : "warn-ink"}>{Math.abs(dr - cr) < 0.005 ? (dr > 0 ? "Balanced" : "") : `Difference ${fmt(r2(dr - cr))}`}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => setLines([...lines, blankLine()])}>+ Line</button>
        {kind === "opening" && Math.abs(dr - cr) > 0.004 ? (
          <button type="button" className="btn" onClick={() => setLines([...lines, { account_code: "3050", debit: cr > dr ? String(r2(cr - dr)) : "", credit: dr > cr ? String(r2(dr - cr)) : "", memo: "Balancing figure" }])}>
            Balance it to 3050 Opening balances
          </button>
        ) : null}
        <button type="button" className="btn pri" disabled={pending || Math.abs(dr - cr) > 0.004 || !dr} onClick={() => run(() => postEntry({ kind, entry_date: date, memo, payee: "", reference: ref, lines }), r => r.ok && setLines(preset || [blankLine(), blankLine()]))}>
          {pending ? "Saving…" : "Save entry"}
        </button>
      </div>
      <Msg r={msg} />
    </div>
  );
}

export function VoidButton({ id }: { id: string }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const { pending, msg, run } = useAction();
  if (!open) return <button type="button" className="btn sm danger" onClick={() => setOpen(true)}>Void</button>;
  return (
    <span className="inline-form">
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why? (e.g. typed twice)" />
      <ConfirmButton label="Void it" confirm="Sure? Void" className="btn sm danger" disabled={pending || !reason} onConfirm={() => run(() => voidEntry(id, reason))} />
      <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
      {msg && !msg.ok ? <Msg r={msg} /> : null}
    </span>
  );
}

export function AccountRow({ a }: { a: Account }) {
  const [name, setName] = useState(a.name);
  const [active, setActive] = useState(a.active);
  const [notes, setNotes] = useState(a.notes);
  const { pending, msg, run } = useAction();
  const changed = name !== a.name || active !== a.active || notes !== a.notes;
  return (
    <tr>
      <td className="mono">{a.code}</td>
      <td><input value={name} onChange={e => setName(e.target.value)} aria-label={`Name of ${a.code}`} style={{ minWidth: 260 }} /></td>
      <td>{a.type}{a.subtype ? <small className="sub">{a.subtype}</small> : null}</td>
      <td>{a.system ? <span className="fine">used automatically</span> : <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> in use</label>}</td>
      <td><input value={notes} onChange={e => setNotes(e.target.value)} aria-label={`Notes for ${a.code}`} /></td>
      <td>
        {changed ? <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => saveAccount({ code: a.code, name, type: a.type, subtype: a.subtype, active, notes, isNew: false }))}>Save</button> : null}
        {msg ? (msg.ok ? <span className="fine ok-ink">Saved</span> : <Msg r={msg} />) : null}
      </td>
    </tr>
  );
}

export function NewAccount() {
  const [v, setV] = useState({ code: "", name: "", type: "expense", subtype: "", notes: "" });
  const { pending, msg, run } = useAction();
  return (
    <form className="inline-form" onSubmit={e => { e.preventDefault(); run(() => saveAccount({ ...v, active: true, isNew: true }), r => r.ok && setV({ code: "", name: "", type: v.type, subtype: "", notes: "" })); }}>
      <input value={v.code} onChange={e => setV({ ...v, code: e.target.value })} placeholder="Code (e.g. 6120)" style={{ width: 130 }} aria-label="Code" />
      <input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Name" aria-label="Name" style={{ minWidth: 220 }} />
      <select value={v.type} onChange={e => setV({ ...v, type: e.target.value, subtype: "" })} aria-label="Type">
        <option value="asset">Asset (what you own)</option><option value="liability">Liability (what you owe)</option><option value="equity">Equity (owners)</option>
        <option value="income">Income</option><option value="expense">Expense</option>
      </select>
      {v.type === "asset" ? (
        <select value={v.subtype} onChange={e => setV({ ...v, subtype: e.target.value })} aria-label="Kind of asset">
          <option value="">Other asset</option><option value="bank">Bank account</option><option value="cash">Cash</option><option value="clearing">Payment provider</option>
        </select>
      ) : v.type === "expense" ? (
        <select value={v.subtype} onChange={e => setV({ ...v, subtype: e.target.value })} aria-label="Kind of expense">
          <option value="">Running cost</option><option value="cogs">Cost of sales</option>
        </select>
      ) : null}
      <button className="btn sm pri" disabled={pending}>Add account</button>
      <Msg r={msg} />
    </form>
  );
}

export function AcctSettingsForm({ methods, payoutDefault, lockDate, money }: { methods: Record<string, string>; payoutDefault: string; lockDate: string; money: Opt[] }) {
  const [m, setM] = useState(methods);
  const [payout, setPayout] = useState(payoutDefault);
  const [lock, setLock] = useState(lockDate);
  const { pending, msg, run } = useAction();
  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={e => { e.preventDefault(); run(() => saveAcctSettings({ methods: m, payout_default: payout, lock_date: lock })); }}>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Payment method</th><th>Money lands in</th></tr></thead>
          <tbody>
            {Object.keys(m).map(k => (
              <tr key={k}><td>{k}</td><td><AccountSelect value={m[k]} onChange={v => setM({ ...m, [k]: v })} options={money} label={k} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-grid tight">
        <label className="field">Sellers are usually paid from<AccountSelect value={payout} onChange={setPayout} options={money} label="Payout account" /></label>
        <label className="field">Books closed up to
          <input type="date" value={lock} onChange={e => setLock(e.target.value)} />
          <span className="fine">Nothing dated on or before this day can be added or changed (payments, results, payouts, entries). Clear it to reopen.</span>
        </label>
      </div>
      <div className="row"><button className="btn pri" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
      <Msg r={msg} />
    </form>
  );
}

export type RecLine = { key: string; date: string; title: string; memo: string; amount: number; cleared: boolean };

/** Tick each line that's on the bank statement; when the ticked total matches the statement, save it. */
export function Reconcile({ account, lines, openingCleared }: { account: string; lines: RecLine[]; openingCleared: number }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set(lines.filter(l => l.cleared).map(l => l.key)));
  const [date, setDate] = useState(today());
  const [stmt, setStmt] = useState("");
  const { pending, msg, run } = useAction();
  const save = useAction();
  const shown = useMemo(() => lines.filter(l => l.date <= date), [lines, date]);
  const cleared = r2(openingCleared + shown.filter(l => ticked.has(l.key)).reduce((t, l) => t + l.amount, 0));
  const diff = r2(num(stmt) - cleared);
  const changed = lines.filter(l => l.cleared !== ticked.has(l.key));
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="form-grid tight">
        <label className="field">Statement date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field">Closing balance on the statement (AED)<input inputMode="decimal" value={stmt} onChange={e => setStmt(e.target.value)} /></label>
        <div className="field">Ticked balance<b style={{ fontSize: 20 }}>{fmt(cleared)}</b></div>
        <div className="field">Difference<b style={{ fontSize: 20 }} className={stmt && Math.abs(diff) < 0.005 ? "ok-ink" : "warn-ink"}>{stmt ? fmt(diff) : "–"}</b></div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>On statement</th><th>Date</th><th>What</th><th>Note</th><th className="n">In</th><th className="n">Out</th></tr></thead>
          <tbody>
            {shown.map(l => (
              <tr key={l.key} className={ticked.has(l.key) ? "ticked" : undefined}>
                <td><input type="checkbox" checked={ticked.has(l.key)} onChange={e => { const n = new Set(ticked); if (e.target.checked) n.add(l.key); else n.delete(l.key); setTicked(n); }} aria-label={`Ticked ${l.title}`} /></td>
                <td className="nowrap">{l.date}</td>
                <td>{l.title}</td>
                <td className="fine">{l.memo}</td>
                <td className="n">{l.amount > 0 ? fmt(l.amount) : ""}</td>
                <td className="n">{l.amount < 0 ? fmt(-l.amount) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={pending || !changed.length} onClick={async () => {
          const on = changed.filter(l => ticked.has(l.key)).map(l => l.key);
          const off = changed.filter(l => !ticked.has(l.key)).map(l => l.key);
          run(async () => {
            if (off.length) {
              const r = await setCleared({ account, keys: off, cleared: false, date });
              if (!r.ok) return r;
            }
            return setCleared({ account, keys: on, cleared: true, date });
          });
        }}>Save ticks ({changed.length})</button>
        <button type="button" className="btn pri" disabled={save.pending || changed.length > 0 || !stmt || Math.abs(diff) > 0.004} onClick={() => save.run(() => saveReconciliation({ account, statement_date: date, statement_balance: stmt, cleared_balance: cleared }))}>
          Finish reconciliation
        </button>
        <span className="fine">Save the ticks first; Finish works when the difference is 0.</span>
      </div>
      <Msg r={msg} />
      <Msg r={save.msg} />
    </div>
  );
}
