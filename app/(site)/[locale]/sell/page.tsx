import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsignForm } from "@/components/site/ConsignForm";
import { getSettings } from "@/lib/data";
import { getDict, isLocale } from "@/lib/i18n/dict";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).sell.title } : {};
}

export default async function SellPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const s = await getSettings();
  const fee = String(s.seller_fee);
  return (
    <>
      <section className="wrap pagehead">
        <span className="kick">{t.nav.sell}</span>
        <h1 className="disp">{t.sell.title}</h1>
        <p className="lede">{t.sell.lede(fee)}</p>
      </section>
      <section className="wrap sec cols">
        <div className="block">
          <h2 className="h3">{t.sell.how}</h2>
          <ol className="steps one">
            {t.sell.steps(fee).map(([b, p]) => <li key={b}><b>{b}</b><p>{p}</p></li>)}
          </ol>
        </div>
        <ConsignForm locale={locale} />
      </section>
    </>
  );
}
