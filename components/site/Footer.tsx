import Link from "next/link";
import { Logo } from "../Logo";
import type { Dict } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/types";

export function Footer({ locale, t, instagram, whatsapp }: { locale: Locale; t: Dict; instagram: string; whatsapp: string }) {
  const ig = instagram.replace(/^@/, "");
  return (
    <footer className="ftr">
      <div className="wrap">
        <Logo height={44} />
        <div>
          <p>{t.footer.tagline} {t.footer.notAffiliated} {t.footer.times}</p>
          <nav aria-label="Footer">
            <Link href={`/${locale}/how-to-bid`}>{t.nav.how}</Link>
            <Link href={`/${locale}/sell`}>{t.nav.sell}</Link>
            <Link href={`/${locale}/results`}>{t.nav.results}</Link>
            <Link href={`/${locale}/terms`}>{t.footer.terms}</Link>
            <Link href={`/${locale}/privacy`}>{t.footer.privacy}</Link>
            {ig ? <a href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener">Instagram</a> : null}
            {whatsapp ? <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener">WhatsApp</a> : null}
          </nav>
        </div>
        <div>
          <span className="k">{t.footer.pay}</span>
          <div className="paylabels">{t.footer.payMethods.map(p => <span key={p}>{p}</span>)}</div>
        </div>
      </div>
    </footer>
  );
}
