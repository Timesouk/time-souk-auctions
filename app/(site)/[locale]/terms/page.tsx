import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/data";
import { getDict, isLocale, timerWords } from "@/lib/i18n/dict";
import { termsDoc } from "@/lib/i18n/legal";
import { LegalDoc } from "@/components/site/LegalDoc";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).legalTitles.terms } : {};
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const s = await getSettings();
  const doc = termsDoc(locale, { payDays: s.pay_days, timer: timerWords(s.timer_seconds, locale), fee: String(s.seller_fee) });
  return <LegalDoc title={getDict(locale).legalTitles.terms} doc={doc} />;
}
