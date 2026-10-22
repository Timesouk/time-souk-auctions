import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOffice } from "@/lib/office/load";
import { verifyRef } from "@/lib/office/links";
import { ReceiptDoc } from "@/components/office/SellerDocs";
import { PrintButton } from "@/components/office/forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consignment receipt", robots: { index: false, follow: false } };

/** The seller's own copy of their consignment receipt, from the link in their WhatsApp message. */
export default async function SellerReceipt({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { token, locale } = await params;
  const no = verifyRef(token);
  if (!no) notFound();
  const o = await loadOffice().catch(() => null);
  const items = o?.intake.filter(i => i.receipt_no === no) || [];
  if (!o || !items.length) {
    return (
      <div className="wrap narrow" style={{ paddingBlock: 40 }}>
        <p className="alert">{locale === "ar" ? "هذا الإيصال لم يعد متاحاً. تواصل معنا على واتساب." : "This receipt isn't available any more. Please contact us on WhatsApp."}</p>
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBlock: 28 }} dir="ltr">
      <div className="row no-print" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <PrintButton label={locale === "ar" ? "طباعة / حفظ PDF" : "Print / save as PDF"} />
      </div>
      <ReceiptDoc receipt={no} items={items} seller={items[0].seller} s={o.data.settings} />
    </div>
  );
}
