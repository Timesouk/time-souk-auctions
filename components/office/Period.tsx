// Choose the period a report covers.
import Link from "next/link";

export function PeriodPicker({ action, current, from, to, list, extra = {} }: { action: string; current: string; from: string; to: string; list: { key: string; label: string }[]; extra?: Record<string, string> }) {
  const q = (k: string) => {
    const p = new URLSearchParams({ ...extra, p: k });
    return `${action}?${p.toString()}`;
  };
  return (
    <div className="stack no-print" style={{ gap: 8 }}>
      <div className="chips" style={{ marginTop: 0 }}>
        {list.map(p => <Link key={p.key} className="chip" href={q(p.key)} aria-pressed={current === p.key}>{p.label}</Link>)}
      </div>
      <form className="inline-form" action={action}>
        {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="k">From</label><input type="date" name="from" defaultValue={from} />
        <label className="k">To</label><input type="date" name="to" defaultValue={to} />
        <button className="btn sm">Show</button>
      </form>
    </div>
  );
}
