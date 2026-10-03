import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/noto-kufi-arabic/800.css";
import "@fontsource/noto-kufi-arabic/900.css";
import "../../site.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { getCurrentAuction, getMyStatus, getSettings } from "@/lib/data";
import { IS_PREVIEW, SITE_URL } from "@/lib/env";

export const viewport: Viewport = { themeColor: "#121417", width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDict(locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.meta.title, template: `%s · ${locale === "ar" ? "تايم سوق" : "The Time Souk"}` },
    description: t.meta.description,
    alternates: { languages: { en: "/en", ar: "/ar" } },
    openGraph: { siteName: "The Time Souk", type: "website", locale: locale === "ar" ? "ar_AE" : "en_AE" }
  };
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const [settings, current, me] = await Promise.all([getSettings(), getCurrentAuction(), getMyStatus()]);
  const now = Date.now();
  const isLive = !!current && current.auction.status === "published" && now >= Date.parse(current.auction.live_starts_at) &&
    current.lots.some(l => !l.ends_at || Date.parse(l.ends_at) > now);
  return (
    <html lang={locale} dir={t.dir}>
      <body>
        {IS_PREVIEW ? <div className="preview-bar">{t.preview}</div> : null}
        <Header
          locale={locale}
          t={{ nav: t.nav, otherLang: t.otherLang }}
          auctionNo={current?.auction.number ?? null}
          isLive={isLive}
          paddle={me?.paddle ?? null}
        />
        <main id="main">{children}</main>
        <Footer locale={locale} t={t} instagram={settings.instagram} whatsapp={settings.whatsapp} />
      </body>
    </html>
  );
}
