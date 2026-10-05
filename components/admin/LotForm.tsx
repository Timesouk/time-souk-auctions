"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfirmButton, Msg, useAction } from "./ui";
import { deleteLot, saveLot } from "@/app/(admin)/admin/actions";
import { watchSVG, BEZEL_OPTIONS, DIAL_OPTIONS, HANDS_OPTIONS, SHAPE_OPTIONS } from "@/lib/watch-drawing";

export type LotFormValues = {
  pub: {
    brand: string; model: string; reference: string; year: string; case_size: string; case_material: string; dial: string; bracelet: string;
    dial_colour: string; bezel: string; shape: string; hands: string; has_box: boolean; has_papers: boolean; condition: string;
    notes_en: string; notes_ar: string; estimate_low: string; estimate_high: string; start_price: string; no_reserve: boolean; photos: string[];
  };
  priv: { reserve: string; source: "stock" | "consign"; cost: string; consignor_name: string; consignor_phone: string; consignor_email: string; seller_fee: string };
};

const CONDS = ["Unworn", "Excellent", "Very good", "Good", "Fair"];

/** Resizes a photo in the browser (max 1800px, JPEG) so uploads are quick and pages load fast. */
async function resize(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("resize failed"))), "image/jpeg", 0.86));
}

export function LotForm({ id, auctionId, auctionLabel, lotNumber, bidCount, initial, consignmentId, defaultFee }: {
  id?: string;
  auctionId: string;
  auctionLabel: string;
  lotNumber?: number;
  bidCount: number;
  initial: LotFormValues;
  consignmentId?: string;
  defaultFee: number;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [num, setNum] = useState(lotNumber ? String(lotNumber) : "");
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, msg, setMsg, run } = useAction();
  const p = v.pub;
  const setP = (k: keyof LotFormValues["pub"], val: unknown) => setV(s => ({ ...s, pub: { ...s.pub, [k]: val } }));
  const setQ = (k: keyof LotFormValues["priv"], val: string) => setV(s => ({ ...s, priv: { ...s.priv, [k]: val } }));
  const text = (k: keyof LotFormValues["pub"]) => ({ value: p[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setP(k, e.target.value) });

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 20);
    if (!list.length) return;
    if (!id) {
      setMsg({ ok: false, message: "Save the lot first, then add photos." });
      return;
    }
    setUploading(list.length);
    const urls: string[] = [];
    for (const f of list) {
      try {
        const blob = await resize(f);
        const fd = new FormData();
        fd.append("lot", id);
        fd.append("file", blob, "photo.jpg");
        const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const j = await r.json();
        if (r.ok && j.url) urls.push(j.url);
        else setMsg({ ok: false, message: j.error || "Upload failed" });
      } catch {
        setMsg({ ok: false, message: "A photo couldn’t be read. Try a JPEG or PNG." });
      }
      setUploading(n => n - 1);
    }
    if (urls.length) {
      const photos = [...p.photos, ...urls];
      setP("photos", photos);
      run(() => saveLot({ id, auction_id: auctionId, pub: { ...p, photos }, priv: v.priv }));
    }
  }

  function move(i: number, d: number) {
    const a = p.photos.slice();
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setP("photos", a);
  }

  const preview = watchSVG({ id: "prev", ...p }, "f");
  return (
    <form
      className="stack"
      style={{ gap: 20 }}
      onSubmit={e => {
        e.preventDefault();
        run(() => saveLot({ id, auction_id: auctionId, lot_number: Number(num) || null, pub: p, priv: v.priv, consignment_id: consignmentId || null }), r => {
          if (r.ok && !id && r.id) router.push(`/admin/lots/${r.id}`);
        });
      }}
    >
      <div className="adm-head">
        <div>
          <span className="kick"><Link href={`/admin/auctions/${auctionId}`}>{auctionLabel}</Link></span>
          <h1 className="disp">{id ? `Lot ${num || ""}` : "Add a lot"}</h1>
        </div>
        <div className="row">
          <button className="btn pri lg" type="submit" disabled={pending}>{id ? "Save lot" : "Add lot"}</button>
          {id ? <ConfirmButton className="btn danger" label="Delete" confirm={bidCount ? "Has bids: can’t delete" : "Delete this lot?"} disabled={!!bidCount} onConfirm={() => run(() => deleteLot(id), r => r.ok && router.push(`/admin/auctions/${auctionId}`))} /> : null}
        </div>
      </div>
      <Msg r={msg} />

      <div className="panel-card">
        <span className="k">Photos · first photo is the cover</span>
        {p.photos.length ? (
          <div className="photo-grid">
            {p.photos.map((src, i) => (
              <figure key={src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" />
                <figcaption>
                  <button type="button" onClick={() => move(i, -1)} aria-label="Move left">←</button>
                  <button type="button" onClick={() => setP("photos", p.photos.filter(x => x !== src))}>Remove</button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move right">→</button>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        <div
          className={`drop${over ? " over" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        >
          {uploading ? `Uploading ${uploading}…` : id ? "Drop photos here or click to choose. They’re resized automatically." : "Save the lot first, then add photos."}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => e.target.files && upload(e.target.files)} />
        </div>
        {!p.photos.length ? (
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 120, background: "var(--tint)", border: "2px solid var(--line)" }} dangerouslySetInnerHTML={{ __html: preview }} />
            <p className="fine" style={{ flex: 1, minWidth: 200 }}>Until photos are added, the site shows this drawing, made from the dial colour, bezel, shape and bracelet below.</p>
          </div>
        ) : null}
      </div>

      <div className="panel-card">
        <span className="k">The watch · public</span>
        <div className="form-grid">
          <label className="field">Lot number<input value={num} onChange={e => setNum(e.target.value.replace(/\D/g, ""))} placeholder="next" inputMode="numeric" /></label>
          <label className="field">Brand<input required {...text("brand")} /></label>
          <label className="field">Model<input required {...text("model")} /></label>
          <label className="field">Reference<input {...text("reference")} /></label>
          <label className="field">Year<input {...text("year")} /></label>
          <label className="field">Case size (mm)<input {...text("case_size")} /></label>
          <label className="field">Case material<input {...text("case_material")} /></label>
          <label className="field">Dial (as described)<input {...text("dial")} /></label>
          <label className="field">Bracelet / strap<input {...text("bracelet")} placeholder="Oyster bracelet, black leather strap…" /></label>
          <label className="field">Box<select value={p.has_box ? "1" : "0"} onChange={e => setP("has_box", e.target.value === "1")}><option value="1">Yes</option><option value="0">No</option></select></label>
          <label className="field">Papers<select value={p.has_papers ? "1" : "0"} onChange={e => setP("has_papers", e.target.value === "1")}><option value="1">Yes</option><option value="0">No</option></select></label>
          <label className="field">Condition<select {...text("condition")}>{CONDS.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="field">Dial colour (drawing)<select {...text("dial_colour")}>{DIAL_OPTIONS.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></label>
          <label className="field">Bezel (drawing)<select {...text("bezel")}>{BEZEL_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field">Case shape (drawing)<select {...text("shape")}>{SHAPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field">Hands (drawing)<select {...text("hands")}>{HANDS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field wide">Condition report (English)<textarea {...text("notes_en")} placeholder="Short and factual: marks, service history, what’s included." /></label>
          <label className="field wide">Condition report (Arabic, optional)<textarea dir="rtl" {...text("notes_ar")} /></label>
        </div>
      </div>

      <div className="panel-card">
        <span className="k">Auction terms · public</span>
        <div className="form-grid">
          <label className="field">Estimate low (AED, optional)<input inputMode="numeric" placeholder="Leave empty to hide" {...text("estimate_low")} /></label>
          <label className="field">Estimate high (AED, optional)<input inputMode="numeric" placeholder="Leave empty to hide" {...text("estimate_high")} /></label>
          <label className="field">Starting bid (AED)<input inputMode="numeric" placeholder="0" readOnly={bidCount > 0} {...text("start_price")} /></label>
          <label className="check" style={{ alignSelf: "end", paddingBottom: 12 }}>
            <input type="checkbox" checked={p.no_reserve} onChange={e => setP("no_reserve", e.target.checked)} /> No reserve (pure sale from the first bid)
          </label>
        </div>
        <p className="fine">Estimates are optional: leave both empty and no estimate is shown on the website. A starting bid of 0 (or empty) lets bidding open at any amount.</p>
        {bidCount > 0 ? <p className="fine">This lot has bids, so its starting bid is locked.</p> : null}
      </div>

      <div className="panel-card private">
        <span className="k">Private · staff only</span>
        <div className="form-grid">
          <label className="field">Reserve (AED)<input inputMode="numeric" disabled={p.no_reserve} value={p.no_reserve ? "" : v.priv.reserve} onChange={e => setQ("reserve", e.target.value)} placeholder="Confidential minimum" /></label>
          <label className="field">Source<select value={v.priv.source} onChange={e => setQ("source", e.target.value)}><option value="stock">Own stock</option><option value="consign">Consignment</option></select></label>
          <label className="field">Our cost (own stock)<input inputMode="numeric" value={v.priv.cost} onChange={e => setQ("cost", e.target.value)} /></label>
          <label className="field">Consignor name<input value={v.priv.consignor_name} onChange={e => setQ("consignor_name", e.target.value)} /></label>
          <label className="field">Consignor phone<input type="tel" value={v.priv.consignor_phone} onChange={e => setQ("consignor_phone", e.target.value)} /></label>
          <label className="field">Consignor email<input type="email" value={v.priv.consignor_email} onChange={e => setQ("consignor_email", e.target.value)} /></label>
          <label className="field">Seller fee % (blank = {defaultFee}%)<input inputMode="decimal" value={v.priv.seller_fee} onChange={e => setQ("seller_fee", e.target.value)} /></label>
        </div>
        <p className="fine">Never shown on the website. When a bid reaches the reserve, the lot shows “Pure sale”.</p>
      </div>
      <div className="row"><button className="btn pri lg" type="submit" disabled={pending}>{id ? "Save lot" : "Add lot"}</button></div>
    </form>
  );
}
