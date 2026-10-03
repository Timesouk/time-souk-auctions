import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getResults } from "@/lib/data";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { isPure, lotPath } from "@/lib/auction";
import { dateLong, money, num, pad2 } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).results.title } : {};
}

export default async function ResultsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const results = await getResults();
  return (
    <>
      <section className="wrap pagehead">
        <span className="kick">{t.nav.results}</span>
        <h1 className="disp">{t.results.title}</h1>
        <p className="lede">{t.results.lede}</p>
      </section>
      <section className="wrap sec stack" style={{ gap: 34 }}>
        {results.length ? results.map(({ auction, lots }) => {
          const sold = lots.filter(l => l.current_bid != null && isPure(l));
          const total = sold.reduce((s, l) => s + (l.current_bid || 0), 0);
          return (
            <div className="block" key={auction.id}>
              <h2 className="h3">{t.results.summary(pad2(auction.number), dateLong(auction.sale_date, locale), sold.length, lots.length, money(total, locale))}</h2>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>{t.common.lot}</th><th>{t.results.watch}</th><th className="n">{t.common.hammer}</th></tr></thead>
                  <tbody>
                    {lots.map(l => {
                      const ok = l.current_bid != null && isPure(l);
                      return (
                        <tr key={l.id}>
                          <td className="mono">{pad2(l.lot_number)}</td>
                          <td><Link href={lotPath(locale, auction.number, l.lot_number)}>{l.brand} {l.model}</Link> <span className="ref">{l.reference}</span></td>
                          <td className="n">{ok ? num(l.current_bid) : <span className="dim">{t.results.unsold}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }) : <div className="empty">{t.results.none}</div>}
      </section>
    </>
  );
}
