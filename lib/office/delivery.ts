// Delivery for a whole invoice at once: every lot on it gets the same status, so staff don't set each lot by hand.
import { COD } from "./types";

/** "" = not sent yet; "Done" = Delivered (courier) or Collected (pickup), whichever fits the invoice. */
export const DELIVERY_STEPS = ["", "Packed", "With courier", "Done"] as const;
export type DeliveryStep = (typeof DELIVERY_STEPS)[number];

/** Lot-only outcomes (the watch went back): never overwritten from the invoice. */
const LOT_ONLY = new Set(["Returned to seller", "Back in stock", "Relisted"]);

type InvLike = {
  no: string;
  delivery: string;
  paysBy: string;
  balance: number;
  lots: { id: string; delivery_status: string; dispatched_on: string | null }[];
};

export const isDeliveryStep = (v: unknown): v is DeliveryStep => (DELIVERY_STEPS as readonly unknown[]).includes(v);

/** The lot status a step means for this invoice. */
export const stepStatus = (inv: Pick<InvLike, "delivery">, step: DeliveryStep) =>
  step === "Done" ? (inv.delivery === "Pickup" ? "Collected" : "Delivered") : step;

/**
 * What each lot becomes. Handing over (with courier, delivered, collected) keeps a dispatch date already typed,
 * or uses `date`; going back to packed or not sent clears it.
 */
export function deliveryPlan(inv: InvLike, step: DeliveryStep, date: string) {
  const status = stepStatus(inv, step);
  if (step === "With courier" && inv.delivery === "Pickup") return []; // collected in person: no courier
  return inv.lots
    .filter(l => !LOT_ONLY.has(l.delivery_status))
    .map(l => ({ id: l.id, delivery_status: status, dispatched_on: step === "" || step === "Packed" ? null : l.dispatched_on || date }));
}

/** Still to pay before handing over (cash on delivery is collected by the courier, so it doesn't count). */
export const stillOwes = (inv: Pick<InvLike, "paysBy" | "balance">) => (inv.paysBy !== COD && inv.balance > 0.005 ? inv.balance : 0);

/** Words for the result message, e.g. "marked delivered". */
export function stepWords(step: DeliveryStep, pickups: number, couriers: number) {
  switch (step) {
    case "": return "set back to not sent";
    case "Packed": return "marked packed";
    case "With courier": return "marked with the courier";
    default: return pickups && couriers ? "marked delivered or collected" : pickups ? "marked collected" : "marked delivered";
  }
}
