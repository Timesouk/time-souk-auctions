import Link from "next/link";
import { notFound } from "next/navigation";
import { AuctionForm, AuctionStatusButtons } from "@/components/admin/AuctionForm";
import { ImportLots, Relist } from "@/components/admin/ImportLots";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW } from "@/lib/env";
import { dateLong, dubaiParts, num, pad2, stamp } from "@/lib/format";
import { isPure, lotPath, timerLabel } from "@/lib/auction";

export const dynamic = "force-dynamic";

export default async function AuctionAdmin({ params }: { params: Promise<{ id: string }> }) {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to manage auctions.</p>;
  const { id } = await params;
  const db = adminClient();
  const { data: auction } = await db.from("auctions").select("*").eq("id", id).maybeSingle();
  if (!auction) notFound();
  const [{ data: lots }, { data: settings }] = await Promise.all([
    db.from("lots").select("id, lot_number, brand, model, reference, estimate_low, estimate_high, start_price, current_bid, bid_count, no_reserve, reserve_met, made_pure, ends_at, photos").eq("auction_id", id).order("lot_number"),
    db.from("settings").select("lot_target, timer_seconds").eq("id", 1).single()
  ]);
  const ids = (lots || []).map(l => l.id);
  const { data: privs } = ids.length ? await db.from("lot_private").select("lot_id, reserve, source").in("lot_id", ids) : { data: [] };
  const pv = new Map((privs || []).map(p => [p.lot_id, p]));
  const now = Date.now();
  const stat = (l: { ends_at: string | null; current_bid: number | null; no_reserve: boolean; reserve_met: boolean; made_pure: boolean }) =>
    !l.ends_at ? "open" : Date.parse(l.ends_at) > now ? "live" : l.current_bid != null && isPure(l) ? "sold" : "unsold";

  // Unsold watches from closed auctions that haven't been relisted yet.
  const { data: closed } = await db.from("auctions").select("id, number").eq("status", "closed");
  let relistable: { id: string; label: string }[] = [];
  if (closed?.length) {
    const { data: old } = await db.from("lots").select("id, lot_number, brand, model, current_bid, no_reserve, reserve_met, made_pure, ends_at, auction_id").in("auction_id", closed.map(c => c.id));
    const { data: relisted } = await db.from("lots").select("relisted_from").not("relisted_from", "is", null);
    const done = new Set((relisted || []).map(r => r.relisted_from));
    const no = new Map(closed.map(c => [c.id, c.number]));
    relistable = (old || []).filter(l => !done.has(l.id) && !(l.current_bid != null && isPure(l) && l.ends_at))
      .map(l => ({ id: l.id, label: `Nº ${pad2(no.get(l.auction_id) || 0)} · lot ${pad2(l.lot_number)} · ${l.brand} ${l.model}` }));
  }

  const total = lots?.length || 0;
  const consign = (privs || []).filter(p => p.source === "consign").length;
  const target = settings?.lot_target || 100;
  const noReserveSet = (lots || []).filter(l => !l.no_reserve && !pv.get(l.id)?.reserve).length;
  const pre = dubaiParts(auction.prebid_opens_at);
  const live = dubaiParts(auction.live_starts_at);

  return (
    <div className="stack" style={{ gap: 26 }}>
      <div className="adm-head">
        <div>
          <span className="kick"><Link href="/admin/auctions">Auctions</Link> · {auction.status}</span>
          <h1 className="disp">Auction Nº {pad2(auction.number)} · {dateLong(auction.sale_date)}</h1>
        </div>
        <AuctionStatusButtons id={auction.id} status={auction.status} />
      </div>

      <div className="panel-card">
        <span className="k">Date, time and timer · Live {stamp(auction.live_starts_at)} · {timerLabel(auction.timer_seconds || settings?.timer_seconds || 180)} per lot</span>
        <AuctionForm
          defaultTimer={settings?.timer_seconds || 180}
          initial={{ id: auction.id, number: auction.number, sale_date: auction.sale_date, prebid_date: pre.date, prebid_time: pre.time, live_time: live.time, timer_seconds: auction.timer_seconds ?? null }}
        />
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b className="num" style={{ fontSize: 34 }}>{total}<span className="fine"> / {target} lots</span></b>
          <span className="fine">{total - consign} own stock · {consign} consignment{noReserveSet ? ` · ${noReserveSet} need a reserve` : ""}</span>
        </div>
        <div className="goal-bar"><span style={{ width: `${Math.min(100, ((total - consign) / target) * 100)}%`, background: "var(--ink)" }} /><span style={{ width: `${Math.min(100, (consign / target) * 100)}%`, background: "var(--cyan)" }} /></div>
      </div>

      <div className="row">
        <Link className="btn pri" href={`/admin/lots/new?auction=${auction.id}`}>Add a lot</Link>
        <Link className="btn" href={`/en/auctions/${auction.number}`} target="_blank">View on the website</Link>
      </div>

      {lots?.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Lot</th><th>Watch</th><th>Source</th><th className="n">Estimate</th><th className="n">Start</th><th className="n">Reserve</th><th className="n">Bid</th><th>Status</th><th>Photos</th><th /></tr></thead>
            <tbody>
              {lots.map(l => {
                const p = pv.get(l.id);
                const st = stat(l);
                return (
                  <tr key={l.id}>
                    <td className="mono">{pad2(l.lot_number)}</td>
                    <td><b>{l.brand}</b> {l.model}<br /><span className="ref">{l.reference}</span></td>
                    <td>{p ? <span className={`src ${p.source}`}>{p.source === "consign" ? "Consign" : "Own"}</span> : <span className="src none">—</span>}</td>
                    <td className="n">{num(l.estimate_low)}–{num(l.estimate_high)}</td>
                    <td className="n">{num(l.start_price)}</td>
                    <td className="n">{l.no_reserve ? "None" : p?.reserve ? num(p.reserve) : <span className="urgent">Not set</span>}</td>
                    <td className="n">{l.current_bid == null ? "—" : `${num(l.current_bid)} (${l.bid_count})`}</td>
                    <td><span className={`pill st-${st === "open" ? "preview" : st}`}>{st}</span>{isPure(l) && st !== "sold" && st !== "unsold" ? <> <span className="pill pure">pure</span></> : null}</td>
                    <td className="n">{l.photos.length || <span className="urgent">0</span>}</td>
                    <td className="n"><Link className="btn sm" href={`/admin/lots/${l.id}`}>Edit</Link> <Link className="btn sm" href={lotPath("en", auction.number, l.lot_number)} target="_blank">View</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="empty">No lots yet. Add one, paste from Excel, or relist unsold watches below.</p>}

      <div className="cols">
        <div className="panel-card"><span className="k">Paste lots from Excel</span><ImportLots auctionId={auction.id} /></div>
        <div className="panel-card"><span className="k">Unsold from earlier auctions</span><Relist auctionId={auction.id} lots={relistable} /></div>
      </div>
    </div>
  );
}
