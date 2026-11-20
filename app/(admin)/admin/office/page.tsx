import Link from "next/link";
import { loadOffice, pickAuction } from "@/lib/office/load";
import { aed } from "@/lib/office/engine";
import { companyName, dateText } from "@/lib/office/messages";
import { auctionState } from "@/lib/office/types";
import { AuctionPicker, AuctionState, DemoNote, SetupNeeded } from "@/components/office/bits";
import { dubaiStamp } from "@/components/office/DocHead";
import { RunButton } from "@/components/office/RunButton";
import { bringInWebsiteResults } from "./actions";

export const dynamic = "force-dynamic";

type Stage = { name: string; line: string; href: string; done: boolean; warn?: boolean };

export default async function OfficeHome({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams;
  const o = await loadOffice().catch((e: Error) => e);
  if (o instanceof Error) return <SetupNeeded error={o.message} />;
  const a = pickAuction(o, sp.a);
  const q = a ? `?a=${a.number}` : "";
  const sum = a ? o.auctions.find(x => x.auction.id === a.id) : undefined;
  const lots = a ? o.lots.filter(l => l.auction_id === a.id) : [];
  const invs = a ? o.invoices.filter(i => i.auction?.id === a.id) : [];
  const overdue = o.owing.filter(i => (i.hoursOverdue || 0) > 0);
  const checks = o.ledger.filter(e => e.check && !e.demo);
  const dueSellers = o.lots.filter(l => l.payout === "Due to seller" && !l.demo);
  const inStock = o.intake.filter(i => i.status === "In stock" || /: in stock$/.test(i.status)).length;
  const target = sum?.target || o.data.settings.lot_target || 100;

  // this auction, stage by stage: the week runs left to right
  const closed = a?.status === "closed";
  const missing = lots.filter(l => l.status === "Winner missing" || l.status === "Sold – add buyer").length;
  const unsent = invs.filter(i => !i.sentAt).length;
  const unpaid = invs.filter(i => i.balance > 0);
  const overdueHere = unpaid.filter(i => (i.hoursOverdue || 0) > 0).length;
  const notDelivered = invs.filter(i => i.deliveryStatus !== "Delivered" && i.deliveryStatus !== "Collected");
  const ready = invs.filter(i => /^Ready/.test(i.nextStep)).length;
  const dueHere = lots.filter(l => l.payout === "Due to seller");
  const waitHere = lots.filter(l => /^Wait/.test(l.payout)).length;
  const sellersDue = new Set(dueHere.map(l => l.seller_id)).size;
  const live = a?.live_starts_at ? Date.parse(a.live_starts_at) : NaN;
  const stages: Stage[] = a
    ? [
        {
          name: "Intake",
          line: closed ? `${lots.filter(l => l.type === "Consignment").length} consigned lots` : `${inStock} in stock, not in an auction`,
          href: "/admin/office/intake",
          done: closed
        },
        { name: "Catalogue", line: `${sum?.lots ?? 0} of ${target} lots`, href: `/admin/office/lots${q}`, done: closed || (sum?.lots ?? 0) >= target },
        {
          name: "Live sale",
          line: closed ? `${sum?.sold ?? 0} sold${sum?.sellThrough != null ? `, ${Math.round(sum.sellThrough * 100)}%` : ""}` : Number.isFinite(live) ? dubaiStamp(live).replace(/^\w+ /, "").replace(/ \d{4},/, ",") : dateText(a.sale_date, "EN"),
          href: "/admin/live",
          done: closed
        },
        {
          name: "Results",
          line: missing ? `${missing} ${missing === 1 ? "lot needs" : "lots need"} a buyer` : closed ? "All typed in" : "After the live",
          href: `/admin/office/lots${q}`,
          done: closed && !missing,
          warn: missing > 0
        },
        {
          name: "Invoices",
          line: !invs.length ? "None yet" : unsent ? `${unsent} of ${invs.length} not sent` : `All ${invs.length} sent`,
          href: `/admin/office/invoices${q}${unsent ? "&show=unsent" : ""}`,
          done: invs.length > 0 && !unsent
        },
        {
          name: "Payments",
          line: !invs.length ? "None yet" : unpaid.length ? `${aed(unpaid.reduce((t, i) => t + i.balance, 0))} to collect` : "All paid",
          href: `/admin/office/invoices${q}${unpaid.length ? "&show=unpaid" : ""}`,
          done: invs.length > 0 && !unpaid.length,
          warn: overdueHere > 0
        },
        {
          name: "Dispatch",
          line: !invs.length ? "None yet" : notDelivered.length ? `${ready} ready, ${notDelivered.length} to go` : "All delivered",
          href: `/admin/office/invoices${q}${ready ? "&show=ready" : ""}`,
          done: invs.length > 0 && !notDelivered.length
        },
        {
          name: "Pay sellers",
          line: dueHere.length ? `${aed(dueHere.reduce((t, l) => t + l.toPay, 0))} due to ${sellersDue} ${sellersDue === 1 ? "seller" : "sellers"}` : waitHere ? `${waitHere} ${waitHere === 1 ? "lot waits" : "lots wait"} for the buyer` : closed ? "All paid" : "After the sale",
          href: "/admin/office/sellers/payouts",
          done: closed && !(sum?.owedToSellers || 0)
        }
      ]
    : [];
  const now = stages.findIndex(s => !s.done);

  const todo: { n: number; text: string; href: string; warn?: boolean }[] = a
    ? [
        { n: lots.filter(l => l.status === "Winner missing").length, text: "lots have a hammer price but no winner", href: `/admin/office/lots${q}`, warn: true },
        { n: lots.filter(l => l.status === "Sold – add buyer").length, text: "sold lots need the buyer chosen", href: `/admin/office/lots${q}`, warn: true },
        { n: unsent, text: "invoices not sent yet", href: `/admin/office/invoices${q}&show=unsent` },
        { n: invs.filter(i => i.feeMissing).length, text: "overseas invoices need a delivery fee", href: `/admin/office/invoices${q}&show=fee`, warn: true },
        { n: ready, text: "orders paid and ready to ship or collect", href: `/admin/office/invoices${q}&show=ready` },
        { n: lots.filter(l => l.reserveCheck === "Below reserve").length, text: "lots sold below their reserve", href: `/admin/office/lots${q}` },
        { n: lots.filter(l => (l.sold || l.status === "Sold – add buyer") && !l.slip_printed_at).length, text: "sold slips not printed", href: `/admin/office/slips${q}` }
      ].filter(t => t.n > 0)
    : [];

  // which auctions an "every auction" line comes from, e.g. "from auction 99" / "from auctions 98 and 99"
  const from = (nums: (number | null | undefined)[]) => {
    const list = [...new Set(nums.filter((n): n is number => !!n))].sort((x, y) => x - y);
    if (!list.length) return "";
    const shown = list.length > 4 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : String(list[0]);
    return `from auction${list.length > 1 ? "s" : ""} ${shown}`;
  };
  const open: { n: number; text: string; sub: string; href: string; warn?: boolean }[] = [
    {
      n: o.owing.length,
      text: `unpaid ${o.owing.length === 1 ? "invoice" : "invoices"}, ${aed(o.owing.reduce((t, i) => t + i.balance, 0))} to collect`,
      sub: [overdue.length ? `${overdue.length} overdue` : "", from(o.owing.map(i => i.auctionNo))].filter(Boolean).join(" · "),
      href: "/admin/office/invoices?show=unpaid&all=1",
      warn: overdue.length > 0
    },
    {
      n: o.refunds.length,
      text: `${o.refunds.length === 1 ? "refund" : "refunds"} to make, ${aed(o.refunds.reduce((t, r) => t + r.amount, 0))}`,
      sub: from(o.refunds.map(r => r.auctionNo)),
      href: "/admin/office/payments#refunds",
      warn: o.refunds.length > 0
    },
    {
      n: dueSellers.length,
      text: `${dueSellers.length === 1 ? "lot is" : "lots are"} paid for and due to the seller, ${aed(dueSellers.reduce((t, l) => t + l.toPay, 0))}`,
      sub: from(dueSellers.map(l => l.auctionNo)),
      href: "/admin/office/sellers/payouts"
    },
    { n: inStock, text: `consigned ${inStock === 1 ? "watch is" : "watches are"} in stock, waiting for an auction`, sub: "", href: "/admin/office/intake" },
    {
      n: checks.length,
      text: `payment ${checks.length === 1 ? "row needs" : "rows need"} a look`,
      sub: from(checks.map(e => e.auctionNo)),
      href: "/admin/office/payments?show=checks",
      warn: checks.length > 0
    }
  ];

  return (
    <div className="stack home" style={{ gap: 22 }}>
      <div className="adm-head">
        <div>
          <h1>{a ? <>Auction {a.number}<AuctionState a={a} /></> : "Back office"}</h1>
          <p className="fine">
            {a ? `${dateText(a.sale_date, "EN")}${Number.isFinite(live) && !closed ? `, live at ${dubaiStamp(live).split(", ")[1]}` : ""} · ` : ""}
            {companyName(o.data.settings)}
          </p>
        </div>
        <div className="row">
          <AuctionPicker auctions={o.data.auctions} current={a} action="/admin/office" />
          {invs.length ? <Link className="btn sm" href={`/admin/office/invoices/print${q}`}>Print all {invs.length} invoices</Link> : null}
        </div>
      </div>

      {!a ? (
        <div className="empty">
          <p><b>No auctions yet.</b></p>
          <p className="fine">Create the first one, then add lots to it. Coming from the Excel workbook? Import it and everything comes across.</p>
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <Link className="btn pri" href="/admin/auctions">Create an auction</Link>
            <Link className="btn" href="/admin/office/import">Import the workbook</Link>
          </div>
        </div>
      ) : (
        <>
          {a.demo ? <DemoNote /> : null}
          <nav className="wk" aria-label={`Auction ${a.number}, stage by stage`}>
            <ol>
              {stages.map((s, i) => (
                <li key={s.name} className={`${s.done ? "done" : ""}${i === now ? " now" : ""}${s.warn ? " warn" : ""}`}>
                  <Link href={s.href} aria-current={i === now ? "step" : undefined}>
                    <span className="wk-n" aria-hidden="true">{s.done ? <Tick /> : i + 1}</span>
                    <span className="wk-name">{s.name}</span>
                    <span className="wk-line">{s.line}</span>
                    <span className="sr-only">{s.done ? " (done)" : i === now ? " (next)" : ""}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

          <div className="home-cols">
            <section className="panel-card">
              <h2 className="h-sec">Needs you now</h2>
              {todo.length === 0 ? (
                <p className="fine">Nothing waiting for auction {a.number}.</p>
              ) : (
                <ul className="to-list">
                  {todo.map(t => (
                    <li key={t.text}>
                      <Link href={t.href}>
                        <b className={t.warn ? "warn-ink" : undefined}>{t.n}</b>
                        <span>{t.text}</span>
                        <Chevron />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {auctionState(a) !== "Draft" ? (
                <div className="home-sync">
                  <RunButton label="Bring in website results" busy="Bringing in…" run={bringInWebsiteResults.bind(null, a.id)} className="btn sm" />
                  <p className="fine">Fills in winners and hammer prices from the live console and website (lots already typed are left alone) and adds website payments.</p>
                </div>
              ) : null}
            </section>

            <section className="panel-card">
              <h2 className="h-sec">Money, auction {a.number}</h2>
              <dl className="figs">
                <div><dt>Hammer total</dt><dd>{aed(sum?.hammer)}</dd></div>
                <div><dt>Our profit</dt><dd>{aed(sum?.profit)}</dd></div>
                <div><dt>Billed to buyers</dt><dd>{aed(sum?.billed)}</dd></div>
                <div><dt>Collected</dt><dd>{aed(sum?.collected)}</dd></div>
                <div>
                  <dt>Still to collect</dt>
                  <dd className={(sum?.outstanding || 0) > 0 ? "warn-ink" : undefined}>
                    {(sum?.outstanding || 0) > 0 ? <Link href={`/admin/office/invoices${q}&show=unpaid`}>{aed(sum?.outstanding)}</Link> : aed(sum?.outstanding)}
                  </dd>
                </div>
                <div><dt>Owed to sellers</dt><dd>{aed(sum?.owedToSellers)}</dd></div>
              </dl>
              <div className="lots-goal">
                <span className="fine">{sum?.lots ?? 0} of {target} lots</span>
                <div className="goal-bar" role="img" aria-label={`${sum?.lots ?? 0} of ${target} lots`}>
                  <span style={{ width: `${Math.min(100, ((sum?.lots || 0) / target) * 100)}%`, background: "var(--ink)" }} />
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      <section className="panel-card">
        <h2 className="h-sec">Still open from any auction</h2>
        <p className="fine">So nothing from an earlier week gets forgotten.</p>
        <ul className="to-list">
          {open.map(t => (
            <li key={t.href} className={t.n ? undefined : "zero"}>
              <Link href={t.href}>
                <b className={t.warn ? "warn-ink" : undefined}>{t.n}</b>
                <span>
                  {t.text}
                  {t.sub ? <small>{t.sub}</small> : null}
                </span>
                <Chevron />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.5 6.3 2.3 2.3 4.7-5" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5.5 3 4 4-4 4" />
    </svg>
  );
}
