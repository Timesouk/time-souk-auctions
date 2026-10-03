import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveProvider } from "@/components/live/LiveProvider";
import { LiveStage } from "@/components/live/LiveStage";
import { getBidHistory, getCurrentAuction, getMyStatus, getSettings } from "@/lib/data";
import { getDict, isLocale } from "@/lib/i18n/dict";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).live.title } : {};
}

export default async function LivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const [current, me, settings] = await Promise.all([getCurrentAuction(), getMyStatus(), getSettings()]);
  if (!current) {
    return (
      <section className="wrap pagehead">
        <h1 className="disp">{t.live.title}</h1>
        <p className="lede">{t.home.noAuction}</p>
        <Link className="btn" href={`/${locale}`}>{t.common.back}</Link>
      </section>
    );
  }
  const block = current.auction.block_lot_id ? current.lots.find(l => l.id === current.auction.block_lot_id) : null;
  const history = block ? await getBidHistory(block) : [];
  return (
    <LiveProvider auction={current.auction} lots={current.lots} timerSeconds={settings.timer_seconds}>
      <LiveStage locale={locale} me={me} instagram={settings.instagram} history={history} />
    </LiveProvider>
  );
}
