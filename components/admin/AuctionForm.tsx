"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Msg, useAction } from "./ui";
import { TimerPicker } from "./TimerPicker";
import { deleteAuction, saveAuction, setAuctionStatus } from "@/app/(admin)/admin/actions";
import { dateLong } from "@/lib/format";
import { timerLabel } from "@/lib/auction";

type Init = { id?: string; number: number; sale_date: string; prebid_date: string; prebid_time: string; live_time: string; timer_seconds: number | null };

/** Create an auction, or change its number, date, start time, pre-bid opening and timer at any time. */
export function AuctionForm({ initial, defaultTimer }: { initial: Init; defaultTimer: number }) {
  const [f, setF] = useState(initial);
  const { pending, msg, run } = useAction();
  const router = useRouter();
  const set = (k: keyof Init) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "number" ? Number(e.target.value) : e.target.value });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(f.sale_date) ? dateLong(f.sale_date) : "";
  const notSunday = day && !day.startsWith("Sunday");
  return (
    <form
      className="stack"
      onSubmit={e => {
        e.preventDefault();
        run(() => saveAuction(f), r => {
          if (r.ok && !initial.id && r.id) router.push(`/admin/auctions/${r.id}`);
          if (r.ok && initial.id) router.refresh();
        });
      }}
    >
      <div className="form-grid">
        <label className="field">Auction number<input type="number" min={1} value={f.number} onChange={set("number")} /></label>
        <label className="field">Auction date<input type="date" required value={f.sale_date} onChange={set("sale_date")} />
          <span className={`fine${notSunday ? " urgent" : ""}`}>{day}{notSunday ? " (not a Sunday)" : ""}</span>
        </label>
        <label className="field">Live starts (Dubai time)<input type="time" required value={f.live_time} onChange={set("live_time")} /></label>
        <div className="field" role="group" aria-label="Timer per lot">Timer per lot
          <TimerPicker label="Timer per lot" value={f.timer_seconds} defaultLabel={`Default (${timerLabel(defaultTimer)} min, from Settings)`} onChange={v => setF({ ...f, timer_seconds: v })} />
        </div>
        <label className="field">Pre-bids open (date)<input type="date" required value={f.prebid_date} onChange={set("prebid_date")} /></label>
        <label className="field">Pre-bids open (time)<input type="time" required value={f.prebid_time} onChange={set("prebid_time")} /></label>
      </div>
      <p className="fine">Changes show on the website straight away, including the countdown. The timer applies to each lot when you press Start; you can also change it for a single lot in the live console.</p>
      <div className="row"><button className="btn pri" type="submit" disabled={pending}>{initial.id ? "Save changes" : "Create auction"}</button></div>
      <Msg r={msg} />
    </form>
  );
}

/** Publish for Instagram only, or on the website and Instagram; unpublish; close. */
export function AuctionStatusButtons({ id, status, instagram, demo }: { id: string; status: "draft" | "published" | "closed"; instagram?: boolean; demo?: boolean }) {
  const { pending, msg, run } = useAction();
  const router = useRouter();
  const go = (s: "draft" | "instagram" | "published" | "closed") => run(() => setAuctionStatus(id, s), r => r.ok && router.refresh());
  if (demo) return <p className="fine">Demo auction for training: never published.</p>;
  const igOnly = status === "draft" && instagram;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {status === "draft" && !instagram ? <button className="btn pri" type="button" disabled={pending} onClick={() => go("instagram")}>Publish for Instagram only</button> : null}
        {status !== "published" ? <button className={`btn${igOnly ? " pri" : ""}`} type="button" disabled={pending} onClick={() => go("published")}>{igOnly ? "Publish on the website too" : "Publish on the website and Instagram"}</button> : null}
        {igOnly ? <button className="btn" type="button" disabled={pending} onClick={() => go("draft")}>Back to draft</button> : null}
        {status === "published" ? <button className="btn" type="button" disabled={pending} onClick={() => go("instagram")}>Take off the website (Instagram only)</button> : null}
        {status === "published" ? <button className="btn danger" type="button" disabled={pending} onClick={() => go("closed")}>Close auction</button> : null}
      </div>
      <Msg r={msg} />
    </div>
  );
}

/** Deletes an auction made by mistake (admin only), after an "Are you sure?" prompt. */
export function DeleteAuction({ id, number, lots }: { id: string; number: number; lots: number }) {
  const { pending, msg, run } = useAction();
  const router = useRouter();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="fine">
        Made by mistake? Deleting removes the auction{lots ? ` and its ${lots} lot${lots === 1 ? "" : "s"}` : ""}; watches added from intake go back in stock.
        Test invoices from a live-console run go with it. It&apos;s refused once anything real hangs on it: results, payments or card links on its invoices, a paid website invoice, website bids, or a place on the website. Admins only.
      </p>
      <div className="row">
        <button
          className="btn danger"
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Are you sure you want to delete auction ${number}${lots ? ` and its ${lots} lot${lots === 1 ? "" : "s"}` : ""}?\n\nThis can't be undone.`)) return;
            run(() => deleteAuction(id), r => {
              if (r.ok) setTimeout(() => router.push("/admin/auctions"), 1200);
            });
          }}
        >
          {pending ? "Deleting…" : `Delete auction ${number}`}
        </button>
      </div>
      <Msg r={msg} />
    </div>
  );
}
