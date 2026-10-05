import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/data";
import { getDict, isLocale, timerWords } from "@/lib/i18n/dict";
import { INCREMENTS } from "@/lib/auction";
import { num } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).how.title } : {};
}

export default async function HowPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const s = await getSettings();
  const h = t.how;
  return (
    <>
      <section className="wrap pagehead">
        <span className="kick">{t.nav.how}</span>
        <h1 className="disp">{h.title}</h1>
        <p className="lede">{h.lede(s.lot_target)}</p>
      </section>
      <section className="wrap sec stack" style={{ gap: 36 }}>
        <div className="block">
          <h2 className="h3">{h.week}</h2>
          <div className="week">
            {h.days.map(([d, txt], i) => (
              <div key={d} className={i === 5 ? "sat" : ""}>
                <b>{d}</b>
                <span className={i === 5 ? "" : "quiet"}>{txt}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="block">
          <h2 className="h3">{h.bidding}</h2>
          <ol className="steps">
            {h.steps(timerWords(s.timer_seconds, locale), s.pay_days).map(([b, p]) => (
              <li key={b}><b>{b}</b><p>{p}</p></li>
            ))}
          </ol>
        </div>
        <div className="cols">
          <div className="block">
            <h2 className="h3">{h.pay}</h2>
            <p>{h.payBody}</p>
            <ul className="paylist">
              {h.payMethods.map(([a, b]) => <li key={a}>{a}<small>{b}</small></li>)}
            </ul>
            <p className="fine">{h.payNote(s.pay_days)}</p>
          </div>
          <div className="block">
            <h2 className="h3">{h.reserve}</h2>
            <p>{h.reserveBody}</p>
            <h2 className="h3" style={{ marginTop: 10 }}>{h.instagram}</h2>
            <p>{h.instagramBody}</p>
          </div>
          <div className="block">
            <h2 className="h3">{h.steps2}</h2>
            <p className="fine">{h.stepsNote}</p>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>{h.stepCurrent}</th><th className="n">{h.stepAdds}</th></tr></thead>
                <tbody>
                  {INCREMENTS.map(([limit, step], i) => (
                    <tr key={limit}>
                      <td className="ltr">{i === 0 ? `${h.under} ${num(limit)}` : limit === Infinity ? `${num(INCREMENTS[i - 1][0])} ${h.andUp}` : `${num(INCREMENTS[i - 1][0])} – ${num(limit - 1)}`}</td>
                      <td className="n">{num(step)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
