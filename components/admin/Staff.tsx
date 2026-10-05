"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmButton, Msg, useAction } from "./ui";
import { createStaffAccount, setStaffActive, setStaffPassword, setStaffRole } from "@/app/(admin)/admin/actions";
import { staffSignIn } from "@/app/(admin)/admin/sign-in-actions";

/** A random password without look-alike characters (no 0/O, 1/l/I). */
function makePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

/** The admin's sign-in box for staff: staff ID and password. */
export function StaffSignIn({ signedInAs }: { signedInAs?: string | null }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="panel-card" style={{ maxWidth: 480 }}>
      <h1 className="disp">Staff sign in</h1>
      {signedInAs ? <p className="alert">You’re signed in as {signedInAs}, which isn’t a staff account. Sign in with your staff ID below.</p> : null}
      <form
        className="stack"
        onSubmit={async e => {
          e.preventDefault();
          setErr("");
          setBusy(true);
          const r = await staffSignIn(id, pw).catch(() => ({ ok: false, message: "Couldn’t reach the server. Try again." }));
          setBusy(false);
          if (!r.ok) return setErr(r.message);
          router.refresh();
        }}
      >
        <label className="field">Staff ID<input value={id} onChange={e => setId(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label>
        <label className="field">Password<input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required /></label>
        <button className="btn pri lg" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {err ? <p className="alert" role="alert">{err}</p> : null}
      </form>
      <p className="fine">Forgot your password? Ask the admin to set a new one.</p>
      <p className="fine">Admin? <Link href="/en/sign-in?next=/admin">Sign in with your email code</Link>.</p>
    </div>
  );
}

export type StaffRow = { id: string; name: string; login: string | null; email: string; role: string; suspended: boolean; created_at: string; you: boolean };

export function CreateStaff({ site }: { site: string }) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [pw, setPw] = useState("");
  const [made, setMade] = useState<{ name: string; login: string; pw: string } | null>(null);
  const { pending, msg, run } = useAction();
  const note = made ? `Your Time Souk staff login\nSign in at: ${site}/admin\nStaff ID: ${made.login}\nPassword: ${made.pw}` : "";
  return (
    <div className="stack" style={{ gap: 10 }}>
      <form
        className="form-grid"
        onSubmit={e => {
          e.preventDefault();
          const snapshot = { name: name.trim(), login: login.trim().toLowerCase(), pw };
          run(() => createStaffAccount({ name, login, password: pw }), r => {
            if (!r.ok) return;
            setMade(snapshot);
            setName("");
            setLogin("");
            setPw("");
          });
        }}
      >
        <label className="field">Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Ahmed Khan" required /></label>
        <label className="field">Staff ID<input value={login} onChange={e => setLogin(e.target.value.replace(/\s/g, "").toLowerCase())} placeholder="ahmed" autoCapitalize="none" spellCheck={false} required /></label>
        <label className="field">Password
          <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required style={{ flex: 1 }} />
            <button className="btn sm" type="button" onClick={() => setPw(makePassword())}>Make one</button>
          </span>
        </label>
        <div className="field" style={{ alignSelf: "end" }}>
          <button className="btn pri" type="submit" disabled={pending}>Create login</button>
        </div>
      </form>
      <Msg r={msg} />
      {made ? (
        <div className="stack" style={{ gap: 6 }}>
          <p className="fine">Send these to {made.name} (for example on WhatsApp). The password is only shown now.</p>
          <div className="bankbox">{note}</div>
          <div className="row">
            <button className="btn sm" type="button" onClick={() => navigator.clipboard?.writeText(note)}>Copy</button>
            <button className="btn sm" type="button" onClick={() => setMade(null)}>Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StaffMember({ s }: { s: StaffRow }) {
  const { pending, msg, run } = useAction();
  const [pw, setPw] = useState("");
  const [shown, setShown] = useState("");
  return (
    <tr>
      <td><b>{s.name || "—"}</b>{s.you ? <span className="fine"> (you)</span> : null}</td>
      <td>{s.login ? <>Staff ID <span className="mono">{s.login}</span></> : <span className="fine">Email code · {s.email}</span>}</td>
      <td><span className={`pill ${s.role === "admin" ? "pure" : "st-block"}`}>{s.role}</span>{s.suspended ? <> <span className="pill warn">off</span></> : null}</td>
      <td>
        {s.you ? <span className="fine">—</span> : (
          <div className="stack" style={{ gap: 6 }}>
            {s.login ? (
              <div className="inline-form">
                <input value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" aria-label="New password" autoComplete="new-password" />
                <button className="btn sm" type="button" onClick={() => setPw(makePassword())}>Make one</button>
                <button className="btn sm" type="button" disabled={pending || pw.length < 8} onClick={() => { const p = pw; run(() => setStaffPassword(s.id, p), r => { if (r.ok) { setShown(p); setPw(""); } }); }}>Save password</button>
              </div>
            ) : null}
            {shown ? <p className="fine">New password for {s.login}: <span className="mono">{shown}</span> (only shown now)</p> : null}
            <div className="inline-form">
              {s.role === "admin" ? (
                <ConfirmButton label="Make staff (not admin)" confirm="Tap again to confirm" onConfirm={() => run(() => setStaffRole(s.id, "staff"))} />
              ) : s.login ? (
                s.suspended
                  ? <button className="btn sm" type="button" disabled={pending} onClick={() => run(() => setStaffActive(s.id, true))}>Turn access back on</button>
                  : <ConfirmButton className="btn sm danger" label="Turn off access" confirm="They can’t sign in. Sure?" onConfirm={() => run(() => setStaffActive(s.id, false))} />
              ) : (
                <ConfirmButton className="btn sm danger" label="Remove staff access" confirm="Back to a normal bidder?" onConfirm={() => run(() => setStaffRole(s.id, "bidder"))} />
              )}
            </div>
            <Msg r={msg} />
          </div>
        )}
      </td>
    </tr>
  );
}
