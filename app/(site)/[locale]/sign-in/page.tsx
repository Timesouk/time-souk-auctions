import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JoinFlow } from "@/components/site/JoinFlow";
import { getSettings } from "@/lib/data";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { verifyChannels } from "@/lib/notify/twilio";
import { safeNext } from "@/lib/next-path";

type P = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).auth.signInTitle, robots: { index: false } } : {};
}

export default async function SignInPage({ params, searchParams }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <div className="wrap narrow">
      <JoinFlow locale={locale} mode="signin" next={safeNext(sp.next, `/${locale}`)} payDays={s.pay_days} channels={verifyChannels()} />
    </div>
  );
}
