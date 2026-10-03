import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveProvider } from "@/components/live/LiveProvider";
import { LiveBar } from "@/components/live/parts";
import { BidBox } from "@/components/live/BidBox";
import { BidHistory } from "@/components/live/BidHistory";
import { Gallery, LotStatusBlock } from "@/components/live/LotView";
import { getAuctionByNumber, getBidHistory, getMyStatus, getSettings } from "@/lib/data";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { lotPath } from "@/lib/auction";
import { money, num, pad2, waLink } from "@/lib/format";

type P = { params: Promise<{ locale: string; no: string; lot: string }> };

async function load(no: string, lotNo: string) {
  if (!/^\d+$/.test(no) || !/^\d+$/.test(lotNo)) return null;
  const data = await getAuctionByNumber(Number(no));
  const lot = data?.lots.find(l => l.lot_number === Number(lotNo));
  return data && lot ? { ...data, lot } : null;
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, no, lot: lotNo } = await params;
  if (!isLocale(locale)) return {};
  const d = await load(no, lotNo);
  if (!d) return {};
  const t = getDict(locale);
  const title = `${t.common.lotN(pad2(d.lot.lot_number))} · ${d.lot.brand} ${d.lot.model}`;
  return {
    title,
    description: `${t.common.estimate} ${money(d.lot.estimate_low, locale)} – ${num(d.lot.estimate_high)}. ${t.home.auctionN(pad2(d.auction.number))}.`,
    openGraph: { title, images: d.lot.photos[0] ? [d.lot.photos[0]] : undefined }
  };
}

export default async function LotPage({ params }: P) {
  const { locale, no, lot: lotNo } = await params;
  if (!isLocale(locale)) notFound();
  const d = await load(no, lotNo);
  if (!d) notFound();
  const t = getDict(locale);
  const { auction, lots, lot } = d;
  const [history, me, settings] = await Promise.all([getBidHistory(lot), getMyStatus(), getSettings()]);
  const sorted = lots.slice().sort((a, b) => a.lot_number - b.lot_number);
  const idx = sorted.findIndex(l => l.id === lot.id);
  const prev = sorted[idx - 1];
  const next = sorted[idx + 1];
  const notes = (locale === "ar" && lot.notes_ar) || lot.notes_en;
  const f = t.lot.fields;
  const spec: [string, string][] = [
    [f.brand, lot.brand], [f.model, lot.model], [f.reference, lot.reference], [f.year, lot.year],
    [f.case, [lot.case_size ? `${lot.case_size} ${t.common.mm}` : "", lot.case_material].filter(Boolean).join(", ")],
    [f.dial, lot.dial], [f.bracelet, lot.bracelet],
    [f.box, lot.has_box ? t.common.yes : t.common.no], [f.papers, lot.has_papers ? t.common.yes : t.common.no],
    [f.condition, t.common.conditions[lot.condition] || lot.condition],
    [f.estimate, `${money(lot.estimate_low, locale)} – ${num(lot.estimate_high)}`],
    [f.start, money(lot.start_price, locale)]
  ].filter(([, v]) => v) as [string, string][];
  const ask = settings.whatsapp ? waLink(settings.whatsapp, t.lot.askText(pad2(lot.lot_number), `${lot.brand} ${lot.model} ${lot.reference}`.trim())) : "";

  return (
    <LiveProvider auction={auction} lots={lots} timerSeconds={settings.timer_seconds}>
      <LiveBar locale={locale} />
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={`/${locale}/auctions/${auction.number}`}>{t.home.auctionN(pad2(auction.number))}</Link>
          <span aria-hidden="true">/</span>
          <span>{t.common.lotN(pad2(lot.lot_number))}</span>
        </nav>
        <div className="lotpage">
          <Gallery lot={lot} />
          <div className="lotinfo">
            <div>
              <span className="brand">{lot.brand}</span>
              <h1 className="ltr">{lot.model}</h1>
              <span className="ref">{[lot.reference ? `${t.common.ref} ${lot.reference}` : "", lot.year].filter(Boolean).join(" · ")}</span>
            </div>
            <LotStatusBlock locale={locale} lotId={lot.id} />
            <BidBox locale={locale} lotId={lot.id} me={me} />
            {notes ? (
              <div className="stack" style={{ gap: 8 }}>
                <h2 className="h3">{t.lot.condition}</h2>
                <p dir="auto">{notes}</p>
              </div>
            ) : null}
            <div className="stack" style={{ gap: 8 }}>
              <h2 className="h3">{t.lot.details}</h2>
              <dl className="specs">
                {spec.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd dir="auto">{v}</dd>
                  </div>
                ))}
              </dl>
              {!lot.photos.length ? <p className="fine">{t.common.illustration}</p> : null}
            </div>
            <BidHistory locale={locale} lotId={lot.id} initial={history} myPaddle={me?.paddle} />
            {ask ? <a className="btn" href={ask} target="_blank" rel="noopener">{t.lot.ask}</a> : null}
            <nav className="pager" aria-label="Lots">
              {prev ? <Link className="btn sm" href={lotPath(locale, auction.number, prev.lot_number)}>{t.lot.prev} · {pad2(prev.lot_number)}</Link> : <span />}
              {next ? <Link className="btn sm" href={lotPath(locale, auction.number, next.lot_number)}>{t.lot.next} · {pad2(next.lot_number)}</Link> : <span />}
            </nav>
          </div>
        </div>
      </div>
    </LiveProvider>
  );
}
