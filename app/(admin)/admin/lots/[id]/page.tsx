import { notFound } from "next/navigation";
import { LotForm } from "@/components/admin/LotForm";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW } from "@/lib/env";
import { pad2 } from "@/lib/format";

export const dynamic = "force-dynamic";
const s = (v: unknown) => (v == null ? "" : String(v));

export default async function EditLot({ params }: { params: Promise<{ id: string }> }) {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to edit lots.</p>;
  const { id } = await params;
  const db = adminClient();
  const { data: lot } = await db.from("lots").select("*").eq("id", id).maybeSingle();
  if (!lot) notFound();
  const [{ data: priv }, { data: auction }, { data: settings }] = await Promise.all([
    db.from("lot_private").select("*").eq("lot_id", id).maybeSingle(),
    db.from("auctions").select("number").eq("id", lot.auction_id).single(),
    db.from("settings").select("seller_fee").eq("id", 1).single()
  ]);
  return (
    <LotForm
      id={lot.id}
      auctionId={lot.auction_id}
      auctionLabel={`Auction Nº ${pad2(auction?.number || 0)}`}
      lotNumber={lot.lot_number}
      bidCount={lot.bid_count}
      defaultFee={Number(settings?.seller_fee ?? 7.5)}
      initial={{
        pub: {
          brand: lot.brand, model: lot.model, reference: lot.reference, year: lot.year, case_size: lot.case_size, case_material: lot.case_material,
          dial: lot.dial, bracelet: lot.bracelet, dial_colour: lot.dial_colour, bezel: lot.bezel, shape: lot.shape, hands: lot.hands,
          has_box: lot.has_box, has_papers: lot.has_papers, condition: lot.condition, notes_en: lot.notes_en, notes_ar: lot.notes_ar,
          estimate_low: s(lot.estimate_low), estimate_high: s(lot.estimate_high), start_price: s(lot.start_price), no_reserve: lot.no_reserve, photos: lot.photos || []
        },
        priv: {
          reserve: s(priv?.reserve), source: priv?.source === "consign" ? "consign" : "stock", cost: s(priv?.cost),
          consignor_name: s(priv?.consignor_name), consignor_phone: s(priv?.consignor_phone), consignor_email: s(priv?.consignor_email), seller_fee: s(priv?.seller_fee)
        }
      }}
    />
  );
}
