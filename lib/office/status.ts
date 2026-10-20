/** The pill colour for a lot, invoice or payment status. */
export function statusClass(s: string) {
  if (/^Sold$|^Paid$|Delivered|Collected|^Done$/.test(s)) return "ok";
  if (/missing|add buyer|Overdue|Refund|defaulted|Unpaid|fee to add|Below/.test(s)) return "warn";
  if (/Unsold|Withdrawn|Returned/.test(s)) return "st-unsold";
  return "";
}
