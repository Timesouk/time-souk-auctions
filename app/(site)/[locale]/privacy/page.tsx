import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n/dict";
import { privacyDoc } from "@/lib/i18n/legal";
import { LegalDoc } from "@/components/site/LegalDoc";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDict(locale).legalTitles.privacy } : {};
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalDoc title={getDict(locale).legalTitles.privacy} doc={privacyDoc(locale)} />;
}
