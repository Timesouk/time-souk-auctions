"use client";
// WhatsApp: shows the message (editable), opens the chat with it typed in, and notes it on the Sent Log.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logSent, type SentInput } from "@/app/(admin)/admin/office/actions";

export type WaProps = {
  label: string;
  phone: string;
  text: string;
  /** "app" opens wa.me (the phone or desktop app); "web" opens WhatsApp Web. */
  mode?: "app" | "web";
  log?: Omit<SentInput, "phone">;
  className?: string;
  title?: string;
};

export function waUrl(phone: string, text: string, mode: "app" | "web" = "app") {
  const n = String(phone || "").replace(/\D/g, "");
  if (!n) return "";
  return mode === "web" ? `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(text)}` : `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function WaButton({ label, phone, text, mode = "app", log, className = "btn sm", title }: WaProps) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [msg, setMsg] = useState(text);
  const [note, setNote] = useState("");
  const router = useRouter();
  const open = () => {
    setMsg(text);
    setNote("");
    dlg.current?.showModal();
  };
  const send = async () => {
    const url = waUrl(phone, msg, mode);
    if (!url) return;
    window.open(url, "_blank", "noopener");
    if (log) {
      const r = await logSent({ ...log, phone });
      setNote(r.ok ? "Opened in WhatsApp and noted on the Sent Log. Press Send in WhatsApp." : r.message);
      if (r.ok) router.refresh();
    } else setNote("Opened in WhatsApp. Press Send there.");
  };
  return (
    <>
      <button type="button" className={className} onClick={open} title={title}>
        {label}
      </button>
      <dialog ref={dlg} className="wa-dlg" onClick={e => e.target === dlg.current && dlg.current?.close()}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{label}</strong>
            <span className="fine mono">{phone || "no number"}</span>
          </div>
          {!phone ? <p className="alert">There&apos;s no WhatsApp number for this person. Add it on their page first.</p> : null}
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={14} dir="auto" aria-label="Message" />
          <div className="row">
            <button type="button" className="btn pri" disabled={!phone} onClick={send}>Open WhatsApp</button>
            <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(msg).then(() => setNote("Copied."))}>Copy text</button>
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>Close</button>
          </div>
          {note ? <p className="fine" role="status">{note}</p> : null}
        </div>
      </dialog>
    </>
  );
}
