import Link from "next/link";
import { LotForm } from "@/components/admin/LotForm";
import { adminClient } from "@/lib/supabase/admin";
import { IS_PREVIEW } from "@/lib/env";
import { pad2 } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NewLot({ searchParams }: { searchParams: Promise<{ auction?: string; consignment?: string }> }) {
  if (IS_PREVIEW) return <p className="alert info">Connect Supabase to add lots.</p>;
  const sp = await searchParams;
  const db = adminClient();
  let auctionId = sp.auction;
  if (!auctionId) {
    const { data } = await db.from("auctions").select("id").neq("status", "closed").order("number", { ascending: false }).limit(1).maybeSingle();
    auctionId = data?.id;
  }
  if (!auctionId) return <p className="alert">Create an auction first. <Link href="/admin/auctions">Auctions</Link></p>;
  const [{ data: auction }, { data: settings }, { data: c }] = await Promise.all([
    db.from("auctions").select("number").eq("id", auctionId).single(),
    db.from("settings").select("seller_fee").eq("id", 1).single(),
    sp.consignment ? db.from("consignments").select("*").eq("id", sp.consignment).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const box = c?.box_papers || "";
  return (
    <LotForm
      auctionId={auctionId}
      auctionLabel={`Auction Nº ${pad2(auction?.number || 0)}`}
      bidCount={0}
      consignmentId={c?.id}
      defaultFee={Number(settings?.seller_fee ?? 7.5)}
      initial={{
        pub: {
          brand: c?.brand || "", model: c?.model || "", reference: c?.reference || "", year: c?.year || "", case_size: "", case_material: "Steel",
          dial: "", bracelet: "", dial_colour: "black", bezel: "smooth", shape: "round", hands: "three",
          has_box: !c || /box/i.test(box) && !/papers only|watch only/i.test(box), has_papers: !c || /papers/i.test(box),
          condition: c?.condition || "Excellent", notes_en: c?.notes || "", notes_ar: "", estimate_low: "", estimate_high: "", start_price: "", no_reserve: false, photos: []
        },
        priv: {
          reserve: c?.price_in_mind ? String(c.price_in_mind) : "", source: c ? "consign" : "stock", cost: "",
          consignor_name: c?.name || "", consignor_phone: c?.phone || "", consignor_email: c?.email || "", seller_fee: ""
        }
      }}
    />
  );
}
