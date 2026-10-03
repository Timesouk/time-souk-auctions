"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { getDict } from "@/lib/i18n/dict";
import type { Locale, MyStatus } from "@/lib/types";

const COUNTRY_VALUES = ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Bahrain", "Kuwait", "Other"];

export function SignOutButton({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        await browserClient()?.auth.signOut();
        router.push(`/${locale}`);
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}

export function AccountForm({ locale, me }: { locale: Locale; me: MyStatus }) {
  const t = getDict(locale);
  const router = useRouter();
  const [name, setName] = useState(me.full_name);
  const [country, setCountry] = useState(COUNTRY_VALUES.includes(me.country) ? me.country : "Other");
  const [ig, setIg] = useState(me.instagram ? `@${me.instagram}` : "");
  const [lang, setLang] = useState<Locale>(me.lang);
  const [msg, setMsg] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async e => {
        e.preventDefault();
        setMsg("");
        const { error } = await browserClient()!.rpc("complete_profile", { p_full_name: name, p_country: country, p_instagram: ig, p_lang: lang, p_accept_terms: true });
        setMsg(error ? (error.message.startsWith("instagram_taken") ? t.auth.igTaken : t.bid.errors.generic) : t.account.saved);
        if (!error) router.refresh();
      }}
    >
      <label className="field">{t.auth.fullName}<input value={name} onChange={e => setName(e.target.value)} required /></label>
      <label className="field">{t.auth.country}
        <select value={country} onChange={e => setCountry(e.target.value)}>
          {COUNTRY_VALUES.map((v, i) => <option key={v} value={v}>{t.countries[i]}</option>)}
        </select>
      </label>
      <label className="field">{t.auth.instagram}<input value={ig} onChange={e => setIg(e.target.value)} dir="ltr" /></label>
      <label className="field">Language · اللغة
        <select value={lang} onChange={e => setLang(e.target.value as Locale)}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </label>
      <button className="btn" type="submit">{t.account.save}</button>
      {msg ? <p className="fine" role="status">{msg}</p> : null}
    </form>
  );
}
