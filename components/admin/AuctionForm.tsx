"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Msg, useAction } from "./ui";
import { saveAuction, setAuctionStatus } from "@/app/(admin)/admin/actions";

type Init = { id?: string; number: number; sale_date: string; prebid_date: string; prebid_time: string; live_time: string };

export function AuctionForm({ initial }: { initial: Init }) {
  const [f, setF] = useState(initial);
  const { pending, msg, run } = useAction();
  const router = useRouter();
  const set = (k: keyof Init) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "number" ? Number(e.target.value) : e.target.value });
  return (
    <form
      className="stack"
      onSubmit={e => {
        e.preventDefault();
        run(() => saveAuction(f), r => {
          if (r.ok && !initial.id && r.id) router.push(`/admin/auctions/${r.id}`);
        });
      }}
    >
      <div className="form-grid">
        <label className="field">Auction number<input type="number" min={1} value={f.number} onChange={set("number")} /></label>
        <label className="field">Saturday<input type="date" value={f.sale_date} onChange={set("sale_date")} /></label>
        <label className="field">Live starts (Dubai time)<input type="time" value={f.live_time} onChange={set("live_time")} /></label>
        <label className="field">Pre-bids open (date)<input type="date" value={f.prebid_date} onChange={set("prebid_date")} /></label>
        <label className="field">Pre-bids open (time)<input type="time" value={f.prebid_time} onChange={set("prebid_time")} /></label>
      </div>
      <div className="row"><button className="btn pri" type="submit" disabled={pending}>{initial.id ? "Save dates" : "Create auction"}</button></div>
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
