"use client";
import { useState } from "react";
import { getDict } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/types";

const CONDITIONS = ["Unworn", "Excellent", "Very good", "Good", "Fair"];

export function ConsignForm({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, string>;
    if (!body.name?.trim() || !body.phone?.trim() || !body.brand?.trim() || !body.model?.trim()) {
      setErr(t.sell.required);
      return;
    }
    setErr("");
    setState("sending");
    try {
      const r = await fetch("/api/consign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, lang: locale }) });
      setState(r.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") return <p className="alert ok" role="status">{t.sell.done}</p>;
  return (
    <form className="block" onSubmit={submit} noValidate>
      <h2 className="h3">{t.sell.form}</h2>
      <div className="form-grid">
        <label className="field">{t.sell.name}<input name="name" autoComplete="name" required maxLength={120} /></label>
        <label className="field">{t.sell.phone}<input name="phone" type="tel" autoComplete="tel" required maxLength={40} placeholder="+971 5X XXX XXXX" /></label>
        <label className="field wide">{t.sell.email}<input name="email" type="email" autoComplete="email" maxLength={160} /></label>
        <label className="field">{t.sell.brand}<input name="brand" required maxLength={60} /></label>
        <label className="field">{t.sell.model}<input name="model" required maxLength={120} /></label>
        <label className="field">{t.sell.reference}<input name="reference" maxLength={60} /></label>
        <label className="field">{t.sell.year}<input name="year" inputMode="numeric" maxLength={10} /></label>
        <label className="field">{t.sell.set}
          <select name="box_papers">{t.sell.sets.map((s, i) => <option key={s} value={["Box and papers", "Papers only", "Box only", "Watch only"][i]}>{s}</option>)}</select>
        </label>
        <label className="field">{t.sell.condition}
          <select name="condition">{CONDITIONS.map(c => <option key={c} value={c}>{t.common.conditions[c]}</option>)}</select>
        </label>
        <label className="field wide">{t.sell.price}<input name="price" inputMode="numeric" maxLength={12} /></label>
        <label className="field wide">{t.sell.notes}<textarea name="notes" maxLength={2000} placeholder={t.sell.notesPh} /></label>
        <label className="sr-only" aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {err ? <p className="alert">{err}</p> : null}
      {state === "error" ? <p className="alert">{t.sell.error}</p> : null}
      <div className="row">
        <button className="btn pri lg" type="submit" disabled={state === "sending"}>{state === "sending" ? t.sell.sending : t.sell.send}</button>
      </div>
    </form>
  );
}
