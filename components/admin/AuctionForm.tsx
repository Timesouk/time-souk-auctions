"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Msg, useAction } from "./ui";
import { TimerPicker } from "./TimerPicker";
import { saveAuction, setAuctionStatus } from "@/app/(admin)/admin/actions";
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
  const notSaturday = day && !day.startsWith("Saturday");
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
          <span className={`fine${notSaturday ? " urgent" : ""}`}>{day}{notSaturday ? " (not a Saturday)" : ""}</span>
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

export function AuctionStatusButtons({ id, status }: { id: string; status: "draft" | "published" | "closed" }) {
  const { pending, msg, run } = useAction();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {status !== "published" ? <button className="btn pri" type="button" disabled={pending} onClick={() => run(() => setAuctionStatus(id, "published"))}>Publish to the website</button> : null}
        {status === "published" ? <button className="btn" type="button" disabled={pending} onClick={() => run(() => setAuctionStatus(id, "draft"))}>Unpublish</button> : null}
        {status === "published" ? <button className="btn danger" type="button" disabled={pending} onClick={() => run(() => setAuctionStatus(id, "closed"))}>Close auction</button> : null}
      </div>
      <Msg r={msg} />
    </div>
  );
}
