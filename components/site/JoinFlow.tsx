"use client";
// Sign in / register: email code → your details → mobile code. Picks up wherever the bidder left off.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { getDict } from "@/lib/i18n/dict";
import { toE164 } from "@/lib/format";
import type { Locale, MyStatus } from "@/lib/types";

type Step = "loading" | "email" | "code" | "details" | "phone" | "phonecode" | "done";
const COUNTRY_VALUES = ["United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Bahrain", "Kuwait", "Other"];

export function JoinFlow({ locale, mode, next, payDays, channels }: {
  locale: Locale;
  mode: "signin" | "register" | "account";
  next: string;
  payDays: number;
  channels: ("whatsapp" | "sms")[];
}) {
  const t = getDict(locale);
  const a = t.auth;
  const router = useRouter();
  const sb = browserClient();
  const [step, setStep] = useState<Step>("loading");
  const [status, setStatus] = useState<MyStatus | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState(COUNTRY_VALUES[0]);
  const [ig, setIg] = useState("");
  const [agree, setAgree] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const route = useCallback((s: MyStatus | null) => {
    setStatus(s);
    if (!s) return setStep("email");
    if (!s.terms_accepted || !s.full_name) {
      setName(s.full_name || "");
      if (s.country) setCountry(s.country);
      setIg(s.instagram ? `@${s.instagram}` : "");
      return setStep("details");
    }
    if (!s.phone_verified) return setStep("phone");
    setStep("done");
  }, []);

  const loadStatus = useCallback(async () => {
    if (!sb) return route(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return route(null);
    const { data } = await sb.rpc("my_status");
    route((data as MyStatus) || null);
  }, [sb, route]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  if (!sb) {
    return (
      <div className="authbox">
        <h1 className="disp">{mode === "register" ? a.registerTitle : a.signInTitle}</h1>
        <p className="alert info">{a.unavailable}</p>
      </div>
    );
  }

  async function sendEmailCode(e?: React.FormEvent) {
    e?.preventDefault();
    setErr("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr(a.badEmail);
    setBusy(true);
    const { error } = await sb!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, data: { lang: locale } } });
    setBusy(false);
    if (error) return setErr(error.status === 429 ? a.tooMany : error.message);
    setCode("");
    setStep("code");
  }

  async function verifyEmailCode(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await sb!.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ""), type: "email" });
    setBusy(false);
    if (error) return setErr(error.status === 429 ? a.tooMany : a.badCode);
    router.refresh();
    await loadStatus();
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (name.trim().length < 2) return setErr(a.nameRequired);
    if (!agree) return setErr(a.termsRequired);
    setBusy(true);
    const { data, error } = await sb!.rpc("complete_profile", { p_full_name: name, p_country: country, p_instagram: ig, p_lang: locale, p_accept_terms: true });
    setBusy(false);
    if (error) return setErr(error.message.startsWith("instagram_taken") ? a.igTaken : error.message);
    route(data as MyStatus);
  }

  async function sendPhoneCode(channel: "whatsapp" | "sms") {
    setErr("");
    const e164 = toE164(phone);
    if (!e164) return setErr(a.badPhone);
    setBusy(true);
    const r = await fetch("/api/phone/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: e164, channel, locale }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error === "phone_taken" ? a.phoneTaken : j.error === "too_many" ? a.tooMany : j.error === "bad_phone" ? a.badPhone : t.bid.errors.generic);
    setPhone(e164);
    setNote(a.phoneSent(e164));
    setCode("");
    setStep("phonecode");
  }

  async function checkPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const r = await fetch("/api/phone/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, code }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error === "phone_taken" ? a.phoneTaken : j.error === "too_many" ? a.tooMany : a.badCode);
    router.refresh();
    await loadStatus();
  }

  const stepIndex = step === "email" || step === "code" ? 0 : step === "details" ? 1 : step === "phone" || step === "phonecode" ? 2 : 3;
  const showStepper = mode !== "signin" || stepIndex > 0;
  const title = step === "done" ? a.doneTitle : step === "details" ? a.detailsTitle : step === "phone" || step === "phonecode" ? a.phoneTitle : mode === "register" ? a.registerTitle : a.signInTitle;

  return (
    <div className="authbox">
      {showStepper && step !== "done" && step !== "loading" ? (
        <div className="stepper" aria-hidden="true">
          {[a.stepEmail, a.stepDetails, a.stepPhone].map((s, i) => (
            <span key={s} className={i === stepIndex ? "on" : i < stepIndex ? "done" : ""}>{s}</span>
          ))}
        </div>
      ) : null}
      <h1 className="disp">{title}</h1>

      {step === "loading" ? <p className="fine">{t.common.loading}</p> : null}

      {step === "email" ? (
        <form className="stack" onSubmit={sendEmailCode}>
          <p>{mode === "register" ? a.registerLede : a.signInLede}</p>
          <label className="field">{a.email}<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <button className="btn pri lg" type="submit" disabled={busy}>{a.sendCode}</button>
          <p className="fine">
            {mode === "register" ? a.haveAccount : a.noAccount}{" "}
            <Link href={`/${locale}/${mode === "register" ? "sign-in" : "register"}?next=${encodeURIComponent(next)}`}>{mode === "register" ? t.nav.signIn : t.nav.register}</Link>
          </p>
        </form>
      ) : null}

      {step === "code" ? (
        <form className="stack" onSubmit={verifyEmailCode}>
          <p>{a.codeSent(email)}</p>
          <label className="field">{a.code}<input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required value={code} onChange={e => setCode(e.target.value)} /></label>
          <button className="btn pri lg" type="submit" disabled={busy || code.replace(/\D/g, "").length < 6}>{a.verify}</button>
          <div className="row">
            <button className="btn sm" type="button" onClick={() => sendEmailCode()} disabled={busy}>{a.resend}</button>
            <button className="btn sm" type="button" onClick={() => setStep("email")}>{a.changeEmail}</button>
          </div>
        </form>
      ) : null}

      {step === "details" ? (
        <form className="stack" onSubmit={saveDetails}>
          <label className="field">{a.fullName}<input autoComplete="name" required value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="field">{a.country}
            <select value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRY_VALUES.map((v, i) => <option key={v} value={v}>{t.countries[i]}</option>)}
            </select>
          </label>
          <label className="field">{a.instagram}<input value={ig} onChange={e => setIg(e.target.value)} placeholder="@yourname" dir="ltr" /></label>
          <p className="fine">{a.instagramNote}</p>
          <label className="check">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span>{a.agree(payDays)} <Link href={`/${locale}/terms`} target="_blank">{a.readTerms}</Link></span>
          </label>
          <button className="btn pri lg" type="submit" disabled={busy}>{a.continue}</button>
        </form>
      ) : null}

      {step === "phone" ? (
        <div className="stack">
          <p>{a.phoneLede}</p>
          <label className="field">{a.phone}<input type="tel" autoComplete="tel" dir="ltr" placeholder={a.phonePh} value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <div className="row">
            {channels.includes("whatsapp") ? <button className="btn pri" type="button" disabled={busy} onClick={() => sendPhoneCode("whatsapp")}>{a.viaWhatsapp}</button> : null}
            {channels.includes("sms") ? <button className={`btn${channels.includes("whatsapp") ? "" : " pri"}`} type="button" disabled={busy} onClick={() => sendPhoneCode("sms")}>{a.viaSms}</button> : null}
          </div>
        </div>
      ) : null}

      {step === "phonecode" ? (
        <form className="stack" onSubmit={checkPhoneCode}>
          <p>{note}</p>
          <label className="field">{a.code}<input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required value={code} onChange={e => setCode(e.target.value)} /></label>
          <button className="btn pri lg" type="submit" disabled={busy || code.replace(/\D/g, "").length < 4}>{a.verify}</button>
          <button className="btn sm" type="button" onClick={() => setStep("phone")}>{a.resend}</button>
        </form>
      ) : null}

      {step === "done" && status ? (
        <div className="stack">
          <span className="k">{t.account.paddle}</span>
          <span className="paddle-big">{status.paddle}</span>
          <p>{a.doneBody(status.paddle)}</p>
          <Link className="btn pri lg" href={next}>{a.goBid}</Link>
        </div>
      ) : null}

      {err ? <p className="alert" role="alert">{err}</p> : null}
    </div>
  );
}
