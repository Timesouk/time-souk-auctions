import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { aed } from "@/lib/office/engine";
import { companyName, dateText } from "@/lib/office/messages";
import { AuctionPicker, AuctionState, DemoNote, SetupNeeded, Tile } from "@/components/office/bits";
import { RunButton } from "@/components/office/RunButton";
import { bringInWebsiteResults } from "./actions";

export const dynamic = "force-dynamic";

export default async function OfficeHome({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  const q = a ? `?a=${a.number}` : "";
  const sum = a ? o.auctions.find(x => x.auction.id === a.id) : undefined;
  const lots = a ? o.lots.filter(l => l.auction_id === a.id) : [];
  const invs = a ? o.invoices.filter(i => i.auction?.id === a.id) : [];
  const todo: { n: number; text: string; href: string; warn?: boolean }[] = a
    ? [
        { n: lots.filter(l => l.status === "Winner missing").length, text: "lots have a hammer price but no winner", href: `/admin/office/lots${q}`, warn: true },
        { n: lots.filter(l => l.status === "Sold – add buyer").length, text: "sold lots need the buyer chosen", href: `/admin/office/lots${q}`, warn: true },
        { n: invs.filter(i => !i.sentAt).length, text: "invoices not sent yet", href: `/admin/office/invoices${q}&show=unsent` },
        { n: invs.filter(i => i.feeMissing).length, text: "overseas invoices need a delivery fee", href: `/admin/office/invoices${q}&show=fee`, warn: true },
        { n: invs.filter(i => /^Ready/.test(i.nextStep)).length, text: "orders paid and ready to ship or collect", href: `/admin/office/invoices${q}&show=ready` },
        { n: lots.filter(l => l.reserveCheck === "Below reserve").length, text: "lots sold below their reserve", href: `/admin/office/lots${q}` },
        { n: lots.filter(l => (l.sold || l.status === "Sold – add buyer") && !l.slip_printed_at).length, text: "sold slips not printed", href: `/admin/office/slips${q}` }
      ]
    : [];
  const overdue = o.owing.filter(i => (i.hoursOverdue || 0) > 0);
  const checks = o.ledger.filter(e => e.check && !e.demo);
  const dueSellers = o.lots.filter(l => l.payout === "Due to seller" && !l.demo);
  const inStock = o.intake.filter(i => i.status === "In stock" || /: in stock$/.test(i.status)).length;
  const target = sum?.target || o.data.settings.lot_target || 100;
  // which auctions an "every auction" line comes from, e.g. " · from auction 99" / " · from auctions 98 and 99"
  const from = (nums: (number | null | undefined)[]) => {
    const list = [...new Set(nums.filter((n): n is number => !!n))].sort((x, y) => x - y);
    if (!list.length) return "";
    const shown = list.length > 4 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : String(list[0]);
    return ` · from auction${list.length > 1 ? "s" : ""} ${shown}`;
  };
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="adm-head">
        <div>
          <h1 className="disp">Back office</h1>
          <p className="fine">{companyName(o.data.settings)} · everything the auction workbook did, in one place.</p>
        </div>
        <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office" />
      </div>

      {!a ? (
        <p className="empty">
          No auctions yet. Create one under <Link href="/admin/auctions">Auctions &amp; lots</Link>, or <Link href="/admin/office/import">import the workbook</Link>.
        </p>
      ) : (
        <>
          {a.demo ? <DemoNote /> : null}
          <section className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="h-sec">
                Auction {a.number} · {dateText(a.sale_date, "EN")}
                <AuctionState a={a} />
              </h2>
              <div className="row">
                <Link className="btn sm" href={`/admin/office/lots${q}`}>Lots &amp; results</Link>
                <Link className="btn sm" href={`/admin/office/invoices${q}`}>Invoices</Link>
              </div>
            </div>
            <div className="stats">
              <Tile label="Lots" value={`${sum?.lots ?? 0} / ${target}`} href={`/admin/office/lots${q}`} />
              <Tile label="Sold" value={`${sum?.sold ?? 0}${sum?.sellThrough != null ? ` · ${Math.round(sum.sellThrough * 100)}%` : ""}`} />
              <Tile label="Hammer total" value={aed(sum?.hammer)} />
              <Tile label="Our profit" value={aed(sum?.profit)} />
              <Tile label="Billed to buyers" value={aed(sum?.billed)} />
              <Tile label="Collected" value={aed(sum?.collected)} />
              <Tile label="Outstanding" value={aed(sum?.outstanding)} warn={(sum?.outstanding || 0) > 0} href={`/admin/office/invoices${q}&show=unpaid`} />
              <Tile label="Owed to sellers" value={aed(sum?.owedToSellers)} />
            </div>
            <div className="goal-bar" title={`${sum?.lots ?? 0} of ${target} lots`}>
              <span style={{ width: `${Math.min(100, ((sum?.lots || 0) / target) * 100)}%`, background: "var(--cyan)" }} />
            </div>
          </section>

          <section className="panel-card">
            <span className="k">To do · auction {a.number}</span>
            {todo.filter(t => t.n > 0).length === 0 ? (
              <p className="fine">Nothing waiting for this auction.</p>
            ) : (
              <ul className="todo">
                {todo.filter(t => t.n > 0).map(t => (
                  <li key={t.text}>
                    <Link href={t.href}>
                      <b className={t.warn ? "warn-ink" : undefined}>{t.n}</b> {t.text}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              <RunButton label="Bring in website results" busy="Bringing in…" run={bringInWebsiteResults.bind(null, a.id)} className="btn sm" />
            </div>
            <p className="fine">
              Lots that ran in the live console or on the website: their winner and final bid fill in the winner and hammer price (lots already typed are left alone), and website payments are added to Payments.
            </p>
          </section>
        </>
      )}

      <section className="panel-card">
        <span className="k">Every auction{a ? `, not only ${a.number}` : ""}</span>
        <p className="fine">Things still open from any auction, so nothing from an earlier week gets forgotten.</p>
        <ul className="todo">
          <li>
            <Link href="/admin/office/invoices?show=unpaid&all=1">
              <b className={o.owing.length ? "warn-ink" : undefined}>{o.owing.length}</b> unpaid {o.owing.length === 1 ? "invoice" : "invoices"} · {aed(o.owing.reduce((t, i) => t + i.balance, 0))} to collect
              {overdue.length ? ` · ${overdue.length} overdue` : ""}
              {from(o.owing.map(i => i.auctionNo))}
            </Link>
          </li>
          <li>
            <Link href="/admin/office/payments#refunds">
              <b className={o.refunds.length ? "warn-ink" : undefined}>{o.refunds.length}</b> {o.refunds.length === 1 ? "refund" : "refunds"} to make · {aed(o.refunds.reduce((t, r) => t + r.amount, 0))}
              {from(o.refunds.map(r => r.auctionNo))}
            </Link>
          </li>
          <li>
            <Link href="/admin/office/sellers">
              <b>{dueSellers.length}</b> {dueSellers.length === 1 ? "lot is" : "lots are"} paid for and due to their seller · {aed(dueSellers.reduce((t, l) => t + l.toPay, 0))}
              {from(dueSellers.map(l => l.auctionNo))}
            </Link>
          </li>
          <li>
            <Link href="/admin/office/intake">
              <b>{inStock}</b> consigned {inStock === 1 ? "watch is" : "watches are"} in stock, waiting for an auction
            </Link>
          </li>
          <li>
            <Link href="/admin/office/payments?show=checks">
              <b className={checks.length ? "warn-ink" : undefined}>{checks.length}</b> payment {checks.length === 1 ? "row needs" : "rows need"} a look
              {from(checks.map(e => e.auctionNo))}
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
