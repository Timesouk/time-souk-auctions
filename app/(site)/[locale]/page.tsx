import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveProvider } from "@/components/live/LiveProvider";
import { AuctionTop } from "@/components/live/LivePanel";
import { Catalogue } from "@/components/live/Catalogue";
import { Ticker } from "@/components/site/Ticker";
import { getBidHistory, getCurrentAuction, getMyStatus, getSettings } from "@/lib/data";
import { getDict, isLocale, timerWords } from "@/lib/i18n/dict";
import { dateLong, pad2, timeOf } from "@/lib/format";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const [settings, current, me] = await Promise.all([getSettings(), getCurrentAuction(), getMyStatus()]);
  const fee = String(settings.seller_fee);
  const block = current?.auction.block_lot_id ? current.lots.find(l => l.id === current.auction.block_lot_id) : null;
  const history = block ? await getBidHistory(block) : [];

  const howAndSell = (
    <>
      <section className="wrap sec">
        <div className="sec-h"><h2 className="disp">{t.home.how}</h2><Link href={`/${locale}/how-to-bid`}>{t.nav.how} →</Link></div>
        <ol className="steps">
          {t.home.steps.map(([b, p]) => (
            <li key={b}><b>{b}</b><p>{p}</p></li>
          ))}
        </ol>
      </section>
      <section className="band">
        <div className="wrap">
          <div>
            <h2 className="disp">{t.home.consignTitle}</h2>
            <p>{t.home.consignBody(fee)}</p>
          </div>
          <Link className="btn pri lg" href={`/${locale}/sell`}>{t.home.consignCta}</Link>
        </div>
      </section>
    </>
  );

  if (!current) {
    return (
      <>
        <section className="wrap pagehead">
          <span className="kick">{t.home.kicker}</span>
          <h1 className="disp">The Time Souk</h1>
          <p className="lede">{t.home.noAuction}</p>
        </section>
        {howAndSell}
      </>
    );
  }

  const { auction, lots } = current;
  return (
    <LiveProvider auction={auction} lots={lots} timerSeconds={settings.timer_seconds}>
      {!block ? (
        <Ticker items={t.home.ticker(pad2(auction.number), dateLong(auction.sale_date, locale), timeOf(auction.live_starts_at, locale), lots.length, timerWords(settings.timer_seconds, locale))} />
      ) : null}
      <AuctionTop locale={locale} me={me} instagram={settings.instagram} timerSeconds={settings.timer_seconds} history={history} />
      {lots.length ? (
        <section className="wrap sec">
          <div className="sec-h">
            <h2 className="disp">{t.home.highlights}</h2>
            <Link href={`/${locale}/auctions/${auction.number}`}>{t.home.browse(lots.length)} →</Link>
          </div>
          <Catalogue locale={locale} limit={8} />
        </section>
      ) : null}
      {howAndSell}
    </LiveProvider>
  );
}
