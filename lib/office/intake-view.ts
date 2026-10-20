// Intake rows and auction choices for the intake pages.
import type { IntakeView, Office } from "./engine";
import { dateText } from "./messages";
import type { IntakeRow } from "@/components/office/forms2";

const s = (v: number | null) => (v == null ? "" : String(v));

export function intakeRow(i: IntakeView): IntakeRow {
  return {
    id: i.id, item_id: i.item_id, receipt: i.receipt_no, seller: i.seller ? `${i.seller.code} · ${i.seller.name}` : "", watch: `${i.brand} ${i.model}`.trim() + (i.reference ? ` · ${i.reference}` : ""),
    serial: i.serial, reserve: i.reserve, status: i.status, lot: i.lot ? i.lot.key : "", returned_on: i.returned_on || "",
    inStock: i.status === "In stock" || /: in stock$/.test(i.status),
    line: {
      brand: i.brand, model: i.model, reference: i.reference, serial: i.serial, year: i.year, box_papers: i.box_papers, condition: i.condition, notes: i.notes,
      reserve: s(i.reserve), start_price: s(i.start_price), fee_pct: s(i.fee_pct), fee_fixed: s(i.fee_fixed)
    }
  };
}

/** Auctions a watch can go into: the coming ones first. */
export function auctionChoices(o: Office) {
  const list = o.data.auctions.slice().sort((a, b) => b.number - a.number);
  const coming = list.filter(a => a.sale_date >= o.today).reverse();
  const past = list.filter(a => a.sale_date < o.today);
  return [...coming, ...past].map(a => ({ id: a.id, label: `Auction ${a.number} · ${dateText(a.sale_date, "EN")}${a.sale_date < o.today ? " (past)" : ""}` }));
}

