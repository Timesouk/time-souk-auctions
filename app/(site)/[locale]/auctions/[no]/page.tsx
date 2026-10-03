import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveProvider } from "@/components/live/LiveProvider";
import { LiveBar } from "@/components/live/parts";
import { Catalogue } from "@/components/live/Catalogue";
import { getAuctionByNumber, getSettings } from "@/lib/data";
import { getDict, isLocale, timerWords } from "@/lib/i18n/dict";
import { dateLong, pad2, stamp, timeOf } from "@/lib/format";

type P = { params: Promise<{ locale: string; no: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, no } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDict(locale).home.auctionN(pad2(Number(no))) };
}

export default async function AuctionPage({ params }: P) {
  const { locale, no } = await params;
  if (!isLocale(locale) || !/^\d+$/.test(no)) notFound();
  const t = getDict(locale);
  const [data, settings] = await Promise.all([getAuctionByNumber(Number(no)), getSettings()]);
  if (!data) notFound();
  const { auction, lots } = data;
  return (
    <LiveProvider auction={auction} lots={lots} timerSeconds={settings.timer_seconds}>
      <LiveBar locale={locale} />
      <section className="wrap pagehead">
        <span className="kick">{t.home.kicker}</span>
        <h1 className="disp">{t.home.auctionN(pad2(auction.number))}</h1>
        <p className="lede">
          {dateLong(auction.sale_date, locale)} · {timeOf(auction.live_starts_at, locale)}. {t.home.liveFrom(timeOf(auction.live_starts_at, locale), timerWords(settings.timer_seconds, locale))}
        </p>
        {Date.now() < Date.parse(auction.prebid_opens_at) ? <p className="alert info">{t.bid.notOpen(stamp(auction.prebid_opens_at, locale))}</p> : null}
      </section>
      <section className="wrap sec">
        <div className="sec-h">
          <h2 className="disp">{t.catalogue.title}</h2>
          <p className="fine">{t.catalogue.note}</p>
        </div>
        <Catalogue locale={locale} />
      </section>
    </LiveProvider>
  );
}
